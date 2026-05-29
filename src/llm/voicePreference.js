// Global voice-reply preference detection.
//
// Voice replies are a sticky, cross-flow user preference (user.metadata
// .voiceReplies), NOT a salesbot-only trigger tag. The router runs this on
// every turn, but only spends an LLM call when a cheap multilingual
// prefilter matches — so normal turns pay nothing. The prefilter only GATES
// the call; the LLM makes the actual decision (so "I run a voice-over
// studio" is correctly NOT read as a toggle request).

const { classifyIntent } = require('./intentClassifier');
const { generateResponse } = require('./provider');
const { logger } = require('../utils/logger');

// Broad, intentionally over-eager gate. Latin + Urdu/Arabic script + a few
// other languages we see. A match just means "worth asking the LLM."
const VOICE_PREFILTER =
  /\b(voice|audio|vn|voicenote|voz|áudio|audios?)\b|voice\s*note|\baaw?az\b|آواز|صوت|صوتي|بول|بولو|\bbol\s*(ke|kar|kr)\b|\bsun(a|ao|na)?\b|\blikh\b|\btype\b|\btext\s*(me|mein|mai|pe|par|karo|kro|reply|message|back|only|please)|\b(on|in|via|through|by|to)\s+text\b/i;

function prefilterMatches(text) {
  return VOICE_PREFILTER.test(String(text || ''));
}

/**
 * Decide whether the user is asking to switch reply mode.
 * Returns { wantsVoice, wantsText } — both false when it's not a toggle.
 * Caller should only invoke this after prefilterMatches() is true.
 */
async function classifyVoicePreference(text, userId) {
  const result = await classifyIntent(
    text,
    {
      wantsVoice:
        'User is asking to RECEIVE replies as a voice note / audio / spoken message instead of text ("voice note bhejo", "reply in audio", "bol ke batao", "send it as a voice message", "talk to me in voice notes"). NOT a request for a phone call, and NOT merely mentioning the word voice/audio about their own business.',
      wantsText:
        'User is asking to switch back to TEXT replies / stop the voice notes ("text mein bolo", "type karo", "stop voice notes", "no more audio", "likh ke bhejo").',
    },
    { userId, operation: 'voice_pref' }
  );
  return { wantsVoice: !!result.wantsVoice, wantsText: !!result.wantsText };
}

// One short, in-language confirmation line. The user just wrote `userText`,
// so echoing it as the conversational context makes the model reply in the
// same language without us having to detect/plumb the language explicitly.
async function generateAck(userText, direction) {
  const instruction =
    direction === 'on'
      ? 'The user just asked to receive your replies as voice notes. Reply with ONE short, warm line confirming that you will now reply with voice notes. Match their language exactly.'
      : 'The user just asked to switch back to text replies. Reply with ONE short, warm line confirming you will now reply in text. Match their language exactly.';
  const systemPrompt = `You are Pixie, a friendly assistant. ${instruction} No emojis spam, no extra questions, just the one-line confirmation.`;
  try {
    const text = await generateResponse(
      systemPrompt,
      [{ role: 'user', content: String(userText || '').slice(0, 300) }],
      { operation: 'voice_pref_ack', timeoutMs: 8000 }
    );
    const line = String(text || '').trim();
    if (line) return line;
  } catch (err) {
    logger.warn(`[VOICE] ack generation failed: ${err.message}`);
  }
  // Language-neutral fallback if the LLM is unavailable.
  return direction === 'on' ? 'Done — switching to voice notes 🎤' : 'Done — back to text replies 👍';
}

function ackVoiceOn(userText) {
  return generateAck(userText, 'on');
}
function ackVoiceOff(userText) {
  return generateAck(userText, 'off');
}

module.exports = {
  VOICE_PREFILTER,
  prefilterMatches,
  classifyVoicePreference,
  ackVoiceOn,
  ackVoiceOff,
};
