// Localizer — translates hardcoded user-facing strings into the language
// the user is actually chatting in. Our LLM-generated replies already match
// the user's language, but many collection-step prompts (salon booking
// tool, webdev industry question, undo prompts, etc.) are hardcoded English
// strings that bypass the LLM entirely. This module fills that gap.
//
// Flow:
//   1. Detect language cheaply from the user's most recent message.
//      Non-Latin scripts (Arabic, Urdu, Devanagari, CJK) are obvious.
//      Latin-script non-English (Spanish, Roman Urdu, French) gets a
//      quick LLM check with the result cached on user.metadata.
//   2. If user is chatting in English, return the hardcoded string
//      unchanged — zero latency cost for the common case.
//   3. Otherwise run one LLM call to translate the English prompt
//      while preserving formatting markers (*bold*, [tags], URLs).

const { generateResponse } = require('../llm/provider');
const { updateUserMetadata } = require('../db/users');
const { logger } = require('../utils/logger');

// Non-Latin script ranges we recognize instantly as non-English.
const NON_LATIN_RE = /[\u0600-\u06FF\u0750-\u077F\u0900-\u097F\u0A00-\u0A7F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0400-\u04FF]/;

// Common Roman-Urdu / Hindi / Spanish / French / German / Portuguese markers
// that clearly signal non-English even when the script is Latin. Kept small
// and high-precision; the LLM handles the long tail.
const ROMAN_NON_ENGLISH_RE = /\b(?:hai|hain|karein|karna|karo|karenge|chahiye|mujhe|mera|meri|bhai|yaar|acha|thik|theek|nahi|hola|gracias|por\s*favor|bonjour|merci|oui|non|ciao|grazie|danke|bitte|ja|nein|saya|anda|terima|kasih|oi|ol[áa]|obrigad[oa]|tchau|voc[êe]|est[áa]|estou|sou|tenho|quero|queria|tamb[ée]m|porque|n[ãa]o|sim|pra|pro|meu|minha|sal[ãa]o|neg[óo]cio|empresa|fazer|tudo\s*bem|por\s*favor|quanto\s*custa)\b/i;

// Portuguese-specific accent triad: ã/õ/ç almost never appear in Spanish,
// French, Italian, etc. — near-deterministic Portuguese signal.
const PORTUGUESE_ACCENTS_RE = /[ãõç]/i;

// Positive English signal — common function words / sales-bot greetings that
// strongly indicate the message is English. We only fast-path to 'english'
// when one of these matches AND no foreign marker did; otherwise we let the
// LLM decide. "no" / "yes" / "ok" are intentionally omitted because they
// collide with Portuguese, Spanish, and German.
const ENGLISH_MARKER_RE = /\b(?:the|and|you|your|are|was|were|this|that|with|have|has|will|would|could|should|want|need|just|like|what|when|where|how|please|thanks|thank|hello|hey|hi|sure|nope|yeah|yep|alright|okay|today|tomorrow|website|business|name|email|phone|address|appointment|booking)\b/i;

/**
 * Best-effort cheap detection of whether the user's message is English.
 * Returns true = definitely English, false = definitely not, null = unsure.
 * Unsure cases get routed to an LLM detection in resolveLanguage.
 */
function quickDetect(text) {
  if (!text) return null;
  const t = String(text).trim();
  if (!t) return null;
  if (NON_LATIN_RE.test(t)) return false;
  if (PORTUGUESE_ACCENTS_RE.test(t)) return false;
  if (ROMAN_NON_ENGLISH_RE.test(t)) return false;
  if (ENGLISH_MARKER_RE.test(t)) return true;
  // Latin-only and no marker on either side — could be Portuguese without
  // diacritics ("oi quero um site"), Dutch, code-switched, etc. Bail to
  // the LLM rather than guessing English.
  return null;
}

/**
 * Resolve the user's language code ("english", "urdu", "spanish", "arabic",
 * etc.) from their message + any cached metadata. Persists the result on
 * user.metadata.preferredLanguage so subsequent turns don't re-run the LLM.
 *
 * Returns 'english' (no translation needed) or the language name to
 * translate into.
 */
async function resolveLanguage(user, latestUserMessage) {
  const cached = user?.metadata?.preferredLanguage;

  // Safety net: if the current message is clearly English (no non-Latin
  // script, no Roman-Urdu/Spanish/etc. markers), ignore any non-English
  // cache and reply in English for this turn. Protects against:
  //   1. A one-off bad detection (e.g. a business name like "Noman
  //      Plumbing" being mistaken for Urdu on an earlier turn).
  //   2. Users who naturally code-switch back to English mid-conversation.
  // We do NOT clear the cache — the user may switch back on the next turn.
  //
  // If the caller didn't hand us a current message (happens for replies
  // that aren't a direct response to user input — summaries, follow-ups,
  // etc.), fall back to the most recent logged user message so the safety
  // net still applies. Without this, a stale cache silently wins for
  // every such reply even when the user has clearly switched to English.
  let effectiveLatest = latestUserMessage;
  if (!effectiveLatest && user?.id) {
    try {
      const { getConversationHistory } = require('../db/conversations');
      const hist = await getConversationHistory(user.id, 5, {
        afterTimestamp: user?.metadata?.lastResetAt || null,
      });
      if (Array.isArray(hist)) {
        for (let i = hist.length - 1; i >= 0; i--) {
          if (hist[i].role === 'user' && hist[i].message_text) {
            effectiveLatest = hist[i].message_text;
            break;
          }
        }
      }
    } catch {
      // DB hiccup — fall through with undefined; cache-check below handles it.
    }
  }

  const quick = quickDetect(effectiveLatest);

  // Code-switch safety net: current message is clearly English. Reply in
  // English this turn regardless of any cached non-English preference.
  // Cache is left alone — user may switch back next turn.
  if (quick === true) {
    return 'english';
  }

  // Current message is clearly non-English. If the cache agrees (any
  // non-english value), trust it. If the cache is missing or says
  // 'english', re-detect — the cached label is stale or never set.
  if (quick === false) {
    if (cached && cached !== 'english') return cached;
    // fall through to LLM detection
  } else {
    // quick === null (unsure). Trust cache if present, otherwise detect.
    if (cached) return cached;
  }

  // LLM detection. The script matters: "mujhe chahiye" should reply in
  // Roman Urdu, not Devanagari Hindi; "أحتاج" should reply in Arabic
  // script. So the label encodes both the language and the script.
  try {
    const response = await generateResponse(
      "Identify the language of the user's message. Pay attention to the SCRIPT they're using — if Roman/Latin script, prefer 'roman-urdu' / 'roman-hindi' / 'roman-arabic' over the native-script name. Reply with ONE word: the language label in English, lowercase, hyphenated if needed. Examples: english, roman-urdu, urdu, hindi, roman-hindi, spanish, arabic, roman-arabic, french, german, portuguese, italian. If you genuinely can't tell, reply: english.",
      [{ role: 'user', content: String(effectiveLatest || latestUserMessage || '').slice(0, 500) }],
      { userId: user?.id, operation: 'language_detect' }
    );
    const lang = String(response || '').trim().toLowerCase().replace(/[^a-z-]/g, '') || 'english';

    // Persist every detection (including 'english') so we don't re-pay
    // this cost on every turn. The safety-net branches above handle the
    // case where a cached value drifts from reality.
    if (user?.id) {
      try {
        await updateUserMetadata(user.id, { preferredLanguage: lang });
        if (user.metadata) user.metadata.preferredLanguage = lang;
      } catch { /* non-critical */ }
    }
    logger.info(`[LOCALIZER] Detected language "${lang}" for ${user?.phone_number || '?'}`);
    return lang;
  } catch (err) {
    logger.warn(`[LOCALIZER] Language detection failed: ${err.message}`);
    return cached || 'english';
  }
}

/**
 * Translate `englishText` to the user's preferred language. Returns the
 * original text unchanged for English. Preserves *bold*, italic, backtick,
 * URLs, and bracketed tags.
 *
 * `user` must be the current user object (we read cached preferredLanguage
 * and write to it on first detection).
 * `latestUserMessage` is the text we should detect from when no language is
 * cached — usually the message the user just sent this turn.
 */
async function localize(englishText, user, latestUserMessage) {
  if (!englishText) return englishText;

  const lang = await resolveLanguage(user, latestUserMessage);
  if (!lang || lang === 'english') return englishText;

  try {
    const prompt = `Translate the following message from English to ${lang}. Rules:
- Preserve formatting exactly: *bold* markers, _italic_ markers, backticks, URLs, @handles, phone numbers, emails, and any [TAGS_IN_BRACKETS].
- Keep the tone casual and conversational — this is a WhatsApp chat, not a formal letter.
- Do NOT add preambles, quotes, or explanations. Return ONLY the translated message.
- If the message contains placeholder values (e.g. business names, service lists), translate surrounding words but keep the placeholder values as-is.
- If the language label starts with "roman-" (e.g. roman-urdu, roman-hindi, roman-arabic), write the translation using Latin/Roman script, NOT the native script. The user is writing in Latin script and expects replies in Latin script.
- **Never hedge gender with slash forms.** For languages with gendered verb/pronoun forms (Urdu, Roman Urdu, Hindi, Roman Hindi, Arabic, Spanish, French, Portuguese, Italian, etc.), pick ONE form and commit to it. Default to the masculine/neutral form ("karunga", "lunga", "raha hoon", "el usuario", "il cliente") — NEVER write "lunga/lungi", "raha/rahi hoon", "karunga/karungi", "usuario/usuaria", etc. The slash form reads as robotic / AI-generated and is exactly what we want to avoid.`;

    const response = await generateResponse(
      prompt,
      [{ role: 'user', content: englishText }],
      { userId: user?.id, operation: 'localize_translate' }
    );
    const translated = String(response || '').trim();
    return translated || englishText;
  } catch (err) {
    logger.warn(`[LOCALIZER] Translation to ${lang} failed: ${err.message}`);
    return englishText;
  }
}

// Map our internal language labels (as resolved by `resolveLanguage`) to
// BCP-47 codes suitable for `<html lang="...">`, `Intl.DateTimeFormat`,
// and other locale-aware browser APIs. Unknown labels fall back to 'en'
// — the chrome looks right (since the LLM-generated labels block is in
// the right language) but the SEO tag is conservative.
function bcp47From(lang) {
  if (!lang) return 'en';
  const l = String(lang).trim().toLowerCase();
  switch (l) {
    case 'english': return 'en';
    case 'portuguese': return 'pt-BR';
    case 'spanish': return 'es';
    case 'french': return 'fr';
    case 'italian': return 'it';
    case 'german': return 'de';
    case 'dutch': return 'nl';
    case 'urdu':
    case 'roman-urdu': return 'ur';
    case 'hindi':
    case 'roman-hindi': return 'hi';
    case 'arabic':
    case 'roman-arabic': return 'ar';
    case 'turkish': return 'tr';
    case 'indonesian': return 'id';
    case 'malay': return 'ms';
    case 'vietnamese': return 'vi';
    case 'japanese': return 'ja';
    case 'korean': return 'ko';
    case 'chinese': return 'zh';
    case 'russian': return 'ru';
    case 'polish': return 'pl';
    default: return 'en';
  }
}

module.exports = {
  quickDetect,
  resolveLanguage,
  localize,
  bcp47From,
};
