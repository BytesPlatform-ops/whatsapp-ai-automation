const OpenAI = require('openai');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

let client = null;

function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: env.llm.openaiApiKey });
  }
  return client;
}

// Spoken replies shouldn't read markdown punctuation aloud ("asterisk
// asterisk bold"). Strip the formatting characters the LLM emits and the
// WhatsApp-style markers, leaving the words. Emojis are left as-is — TTS
// engines silently skip them.
function plainForSpeech(text) {
  return String(text || '')
    .replace(/\[[^\]]*\]\(([^)]*)\)/g, '$1') // markdown links → just the label
    .replace(/[*_~`#>]/g, '')                // bold/italic/strike/code/heading markers
    .replace(/\n{2,}/g, '. ')                // paragraph breaks → sentence pause
    .replace(/\s+/g, ' ')
    .trim();
}

// Cap input so an unusually long reply can't run up a large TTS bill or
// produce a 2-minute voice note. ~900 chars ≈ a comfortable 30–40s clip.
const MAX_TTS_CHARS = 900;

// Language-agnostic delivery instruction. We do NOT hardcode a language —
// the bot replies in whatever language the user wrote in (detected per-turn
// by the LLM; there's no stored language field), so the safest hint is
// "speak it in the language it's written in." The romanized-script clause
// is the one place this earns its keep: Roman Urdu/Hindi/Arabic is Latin
// text that a TTS engine would otherwise read with an English accent.
const VOICE_INSTRUCTIONS =
  'Read this aloud as an energetic, upbeat voice note — lively and enthusiastic, ' +
  'like a confident, excited salesperson who genuinely loves what they do. Keep ' +
  'the energy high but natural, not over-the-top. Speak it in the same language ' +
  'the text is written in — do not translate or switch languages. If the text is ' +
  'romanized (written in Latin letters) Urdu, Hindi, or Arabic, pronounce it as ' +
  'the natural spoken language, not as English.';

/**
 * Synthesize speech from text using OpenAI TTS.
 *
 * Returns OGG/Opus audio — the format WhatsApp renders as a true voice
 * note (a playable PTT bubble) rather than an audio-file attachment.
 *
 * @param {string} text - the user-facing reply to speak
 * @returns {Promise<{ buffer: Buffer, mimeType: string }>}
 */
async function synthesizeSpeech(text) {
  const spoken = plainForSpeech(text).slice(0, MAX_TTS_CHARS);
  if (!spoken) throw new Error('synthesizeSpeech: empty text');

  const openai = getClient();
  const response = await openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: 'onyx',
    input: spoken,
    instructions: VOICE_INSTRUCTIONS,
    response_format: 'opus',
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  logger.info(`TTS synthesized (${buffer.length} bytes) for "${spoken.slice(0, 60)}..."`);
  return { buffer, mimeType: 'audio/ogg' };
}

module.exports = { synthesizeSpeech, plainForSpeech };
