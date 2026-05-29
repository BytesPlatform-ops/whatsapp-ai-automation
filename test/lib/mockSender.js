// Test-only sender mock. Replaces every outbound function on
// src/messages/sender.js with a capture-only stub so fixtures don't
// hit Meta's API while running. Each captured send is pushed onto an
// in-memory buffer that the test runner clears between turns and
// reads after each turn to assert reply-shape expectations.
//
// CRITICAL: installMocks() must be called BEFORE requiring router.js
// (or anything that destructures sender exports at load time). Node
// caches modules, so the destructured locals in router.js will hold a
// reference to whatever the function was AT IMPORT TIME. Patching
// sender's module.exports first means the destructure picks up the
// stub. See test/replay.js for the correct require ordering.

let captured = [];

function getCaptured() {
  return captured.slice();
}

function clearCaptured() {
  captured = [];
}

function installMocks() {
  // Load the real sender first so its module.exports object exists.
  // We mutate the exports IN PLACE so any subsequent destructure picks
  // up the patched functions.
  const sender = require('../../src/messages/sender');

  sender.sendTextMessage = async (to, text) => {
    // Mirror the real sender's voice-mode fork: when the per-turn context
    // has voiceMode on, a plain-text reply goes out as a voice note instead
    // of text. The mock replaces the real fn, so it must replicate this or
    // voice-reply fixtures would never see an 'audio' capture.
    let voiceMode = false;
    try { voiceMode = require('../../src/messages/channelContext').getVoiceMode(); } catch {}
    if (voiceMode && text) {
      captured.push({ kind: 'audio', to, text: String(text || '') });
    } else {
      captured.push({ kind: 'text', to, text: String(text || '') });
    }
    return { success: true, mocked: true };
  };

  sender.sendInteractiveButtons = async (to, body, buttons) => {
    captured.push({ kind: 'buttons', to, text: String(body || ''), buttons: buttons || [] });
    return { success: true, mocked: true };
  };

  sender.sendInteractiveList = async (to, body, buttonText, sections) => {
    captured.push({ kind: 'list', to, text: String(body || ''), buttonText, sections: sections || [] });
    return { success: true, mocked: true };
  };

  sender.sendWithMenuButton = async (to, text, opts) => {
    captured.push({ kind: 'menubtn', to, text: String(text || ''), opts: opts || null });
    return { success: true, mocked: true };
  };

  sender.sendCTAButton = async (to, body, buttonText, url) => {
    captured.push({ kind: 'cta', to, text: String(body || ''), buttonText, url });
    return { success: true, mocked: true };
  };

  sender.sendDocument = async (to, ...args) => {
    captured.push({ kind: 'doc', to, args });
    return { success: true, mocked: true };
  };

  if (typeof sender.sendDocumentBuffer === 'function') {
    sender.sendDocumentBuffer = async (to, ...args) => {
      captured.push({ kind: 'docbuf', to, args });
      return { success: true, mocked: true };
    };
  }

  sender.sendImage = async (to, url, caption) => {
    captured.push({ kind: 'image', to, url, text: String(caption || '') });
    return { success: true, mocked: true };
  };

  // Audio sends must be stubbed too — otherwise a voice-note flow would
  // hit Meta's media-upload endpoint (and, upstream, OpenAI TTS) during a
  // replay. We capture without generating real audio.
  sender.sendAudioMessage = async (to, audioUrl) => {
    captured.push({ kind: 'audio', to, url: audioUrl || null });
    return { success: true, mocked: true };
  };

  if (typeof sender.sendAudioBuffer === 'function') {
    sender.sendAudioBuffer = async (to, ...args) => {
      captured.push({ kind: 'audio', to, args });
      return { success: true, mocked: true };
    };
  }

  sender.markAsRead = async () => ({ success: true, mocked: true });
  sender.showTyping = async () => ({ success: true, mocked: true });
  sender.setLastMessageId = () => {};
  sender.downloadMedia = async () => null;

  // Stub TTS so a voice-note flow doesn't call OpenAI's speech endpoint
  // during a replay. salesBot requires this lazily, so mutating the
  // exports in place (same trick as the senders) is enough.
  const tts = require('../../src/llm/tts');
  tts.synthesizeSpeech = async () => ({ buffer: Buffer.from('mock-audio'), mimeType: 'audio/ogg' });
}

/**
 * Concatenate the text body of every captured send for the current
 * turn into one big string. Used by reply_contains / reply_not_contains
 * assertions so they don't have to know which kind of send carried
 * the text (interactive button body, CTA caption, plain text, etc.).
 */
function capturedReplyText() {
  return captured
    .map((s) => s.text || '')
    .filter(Boolean)
    .join('\n');
}

module.exports = {
  installMocks,
  getCaptured,
  clearCaptured,
  capturedReplyText,
};
