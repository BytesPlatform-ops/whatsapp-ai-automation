'use strict';

// Language resolution for the WhatsApp Flow.
//
// PRIMARY: detect the language from the user's first inbound message —
// more accurate than a phone-number map, since a user can reach either
// number from an ad in any language ("Oi Pixie, quero um site" on the EN
// number should still get PT).
//
// FALLBACK: when the message is too short / low-signal to detect (a bare
// "hi", an emoji, a sticker), fall back to the phone-number map.
//
// Supported now: en | pt. Extendable — add the lang to SUPPORTED_LANGS in
// questionBank.js and the question bank, plus a PHONE_LANG entry.

const { generateResponse } = require('../llm/provider');
const { logger } = require('../utils/logger');
const { SUPPORTED_LANGS } = require('./questionBank');

const DEFAULT_LANG = 'en';

// Fallback map: phone_number_id → language. Used ONLY when first-message
// detection is low-confidence. Configure via env so it's not hard-coded:
//   FLOW_PHONE_LANG="1047147548486010:en,1036767402856038:pt"
function phoneLangMap() {
  const raw = process.env.FLOW_PHONE_LANG || '';
  const map = {};
  for (const pair of raw.split(',')) {
    const [id, lang] = pair.split(':').map((x) => (x || '').trim());
    if (id && SUPPORTED_LANGS.includes(lang)) map[id] = lang;
  }
  return map;
}

/**
 * Resolve language from the phone number id alone (the fallback path).
 */
function langFromPhone(phoneNumberId) {
  const map = phoneLangMap();
  return map[String(phoneNumberId || '')] || DEFAULT_LANG;
}

// A message is "low-signal" if it's too short or has no real letters for
// the detector to work with. We skip the LLM call and use the fallback.
function isLowSignal(text) {
  const t = String(text || '').trim();
  if (t.length < 4) return true;
  // Strip emoji / punctuation / digits — need a few actual letters.
  const letters = t.replace(/[^\p{L}]/gu, '');
  return letters.length < 3;
}

/**
 * Detect the language of the user's first message.
 *
 * @param {string} firstMessage
 * @param {object} [opts]
 * @param {string} [opts.phoneNumberId] for the low-signal fallback
 * @param {string} [opts.userId] for LLM usage logging
 * @returns {Promise<'en'|'pt'>}
 */
async function detectLanguage(firstMessage, opts = {}) {
  const { phoneNumberId, userId } = opts;
  const text = String(firstMessage || '').trim();

  // Low-signal → don't waste an LLM call; use the phone fallback.
  if (isLowSignal(text)) {
    const lang = langFromPhone(phoneNumberId);
    logger.info(`[FLOW-LANG] low-signal "${text.slice(0, 30)}" → fallback ${lang} (phone ${phoneNumberId || '?'})`);
    return lang;
  }

  try {
    // Detect ANY language — the form is translated at runtime, so we're not
    // restricted to the hand-authored en/pt. Return the ISO 639-1 code.
    const systemPrompt =
      `You are a language detector. The user sent their first message to a website-builder bot. ` +
      `Reply with ONLY the 2-letter lowercase ISO 639-1 code of the language they wrote in ` +
      `(e.g. en, pt, es, fr, ar, hi, ur, de, it, tr, id, ru, zh). ` +
      `Roman-script Urdu/Hindi count as ur/hi respectively. Output just the code, nothing else.`;

    const response = await generateResponse(
      systemPrompt,
      [{ role: 'user', content: text.slice(0, 300) }],
      { userId, operation: 'flow_lang_detect', model: 'gpt-5.4-nano', timeoutMs: 6000 }
    );

    const code = String(response || '').trim().toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
    if (code.length === 2) {
      logger.info(`[FLOW-LANG] detected "${code}" from "${text.slice(0, 30)}"`);
      return code;
    }
    // Couldn't parse a code → fallback.
    const fb = langFromPhone(phoneNumberId);
    logger.info(`[FLOW-LANG] LLM gave "${code}" (unparseable) → fallback ${fb}`);
    return fb;
  } catch (err) {
    const fb = langFromPhone(phoneNumberId);
    logger.warn(`[FLOW-LANG] detection failed (${err.message}) → fallback ${fb}`);
    return fb;
  }
}

module.exports = { detectLanguage, langFromPhone, DEFAULT_LANG, isLowSignal };
