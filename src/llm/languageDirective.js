/**
 * languageDirective.js
 *
 * Language preference tracking + prompt-directive builder.
 *
 * The message analyzer already returns an ISO-639-1 `language` tag for each
 * user message. This module:
 *
 * 1. `persistIfConfident(user, analysis)` — on two consecutive turns in the
 *    same non-English language, writes `metadata.preferredLanguage` to the
 *    user record so future replies stay in that language. The 2-turn
 *    threshold avoids false positives from a single loanword ("no gracias
 *    I want a website" shouldn't flip the whole session to Spanish).
 *
 * 2. `buildDirective(user)` — returns a short system-prompt suffix that
 *    tells the LLM to reply in the stored language. Handlers that produce
 *    user-facing text (salesBot, objectionHandler, generalChat, revision
 *    asker) call this and append it to their system prompt. Extractors
 *    and JSON parsers do NOT — those must stay in English to keep parsing
 *    reliable.
 */

'use strict';

const { updateUserMetadata } = require('../db/users');
const { logger } = require('../utils/logger');

// ISO-639-1 → human label. Kept small on purpose — we only list languages
// the underlying LLMs handle reliably for conversational replies. Anything
// outside this map stays in English with a short note acknowledging the
// user's language (handled by the GENERAL_CHAT_PROMPT's fallback copy).
const SUPPORTED_LANGUAGES = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  ar: 'Arabic',
  ur: 'Urdu',          // incl. Roman Urdu — analyzer tags both as "ur"
  hi: 'Hindi',
  tr: 'Turkish',
  id: 'Indonesian',
  fil: 'Filipino',
  bn: 'Bengali',
  fa: 'Farsi',
  ru: 'Russian',
  nl: 'Dutch',
  pl: 'Polish',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  vi: 'Vietnamese',
  th: 'Thai',
  sw: 'Swahili',
};

function isSupported(lang) {
  return typeof lang === 'string' && Object.prototype.hasOwnProperty.call(SUPPORTED_LANGUAGES, lang);
}

/**
 * Called from router.js right after `analyzeMessage` resolves. Updates the
 * user's `preferredLanguage` in metadata if we're confident.
 *
 * Confidence rules:
 *   - Detected language must be in SUPPORTED_LANGUAGES and NOT "en".
 *   - The previous analyzer result (stored as lastAnalyzedLanguage) must
 *     match — i.e. two-in-a-row signal.
 *   - If preferredLanguage already equals the detected language, we still
 *     rewrite `lastAnalyzedLanguage` but skip the redundant write.
 *
 * Always stores `lastAnalyzedLanguage` so the next turn can check the
 * streak.
 */
async function persistIfConfident(user, analysis) {
  if (!analysis || typeof analysis !== 'object') return;
  const detected = analysis.language;
  if (!detected) return;

  const meta = user.metadata || {};
  const prevDetected = meta.lastAnalyzedLanguage || null;
  const current = meta.preferredLanguage || null;

  const updates = {};
  if (prevDetected !== detected) {
    updates.lastAnalyzedLanguage = detected;
  }

  // Only promote to preferredLanguage when:
  //   - the language is non-English AND supported
  //   - previous turn matched
  //   - differs from what we already store
  if (
    detected !== 'en' &&
    isSupported(detected) &&
    prevDetected === detected &&
    current !== detected
  ) {
    updates.preferredLanguage = detected;
    logger.info(`[LANG] ${user.phone_number}: preferredLanguage → ${detected} (was ${current || 'none'})`);
  }

  if (Object.keys(updates).length === 0) return;
  await updateUserMetadata(user.id, updates);
  user.metadata = { ...(user.metadata || {}), ...updates };
}

/**
 * Build a short prompt suffix to force responses into the user's preferred
 * language. Returns '' when English (the default). Prepended to the handler's
 * system prompt by the caller.
 */
function buildDirective(user) {
  const lang = user?.metadata?.preferredLanguage;
  if (!lang || lang === 'en' || !isSupported(lang)) return '';
  const label = SUPPORTED_LANGUAGES[lang];
  return `\n\n## HARD LANGUAGE OVERRIDE\nThe user has been replying in ${label}. Your ENTIRE response must be in ${label}. Do NOT mix English. Do NOT translate. Match the user's tone and formality in ${label}. This overrides any English examples above.`;
}

/**
 * Convenience: for code that builds messages for the LLM, get back the
 * language label (e.g. "Urdu") for logging/acknowledgment purposes.
 * Returns null when no preference is set.
 */
function preferredLanguageLabel(user) {
  const lang = user?.metadata?.preferredLanguage;
  if (!lang || !isSupported(lang)) return null;
  return SUPPORTED_LANGUAGES[lang];
}

module.exports = {
  persistIfConfident,
  buildDirective,
  preferredLanguageLabel,
  SUPPORTED_LANGUAGES,
};
