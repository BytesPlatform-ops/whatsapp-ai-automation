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

// Common Roman-Urdu / Hindi / Spanish / French / German markers that
// clearly signal non-English even when the script is Latin. Kept small
// and high-precision; the LLM handles the long tail.
const ROMAN_NON_ENGLISH_RE = /\b(?:hai|hain|karein|karna|karo|karenge|chahiye|mujhe|mera|meri|bhai|yaar|acha|thik|theek|nahi|hola|gracias|por\s*favor|bonjour|merci|oui|non|ciao|grazie|danke|bitte|ja|nein|saya|anda|terima|kasih)\b/i;

/**
 * Best-effort cheap detection of whether the user's message is English.
 * Returns true = definitely English, false = definitely not, null = unsure.
 */
function quickDetect(text) {
  if (!text) return null;
  const t = String(text).trim();
  if (!t) return null;
  if (NON_LATIN_RE.test(t)) return false;
  if (ROMAN_NON_ENGLISH_RE.test(t)) return false;
  // Latin-only, no non-English markers — could still be e.g. Dutch, but
  // for a WhatsApp sales bot those users typically still prefer English
  // replies. Treat as English by default.
  return true;
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
  // Cached value wins.
  const cached = user?.metadata?.preferredLanguage;
  if (cached) return cached;

  // Heuristic first — free for English.
  const quick = quickDetect(latestUserMessage);
  if (quick === true) {
    // Don't persist "english" on first turn — user might switch later.
    return 'english';
  }

  // Non-English signal — ask the LLM to name the language so we can use
  // it in a translation prompt later. The script matters: "mujhe chahiye"
  // should reply in Roman Urdu, not Devanagari Hindi; "أحتاج" should reply
  // in Arabic script. So the label encodes both the language and the
  // script the user is using.
  try {
    const response = await generateResponse(
      "Identify the language of the user's message. Pay attention to the SCRIPT they're using — if Roman/Latin script, prefer 'roman-urdu' / 'roman-hindi' / 'roman-arabic' over the native-script name. Reply with ONE word: the language label in English, lowercase, hyphenated if needed. Examples: english, roman-urdu, urdu, hindi, roman-hindi, spanish, arabic, roman-arabic, french, german, portuguese, italian. If you genuinely can't tell, reply: english.",
      [{ role: 'user', content: String(latestUserMessage || '').slice(0, 500) }],
      { userId: user?.id, operation: 'language_detect' }
    );
    const lang = String(response || '').trim().toLowerCase().replace(/[^a-z-]/g, '');
    if (!lang || lang === 'english') return 'english';

    // Persist so we don't re-detect every turn.
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
    return 'english';
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

module.exports = {
  quickDetect,
  resolveLanguage,
  localize,
};
