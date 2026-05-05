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
    captured.push({ kind: 'text', to, text: String(text || '') });
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

  sender.markAsRead = async () => ({ success: true, mocked: true });
  sender.showTyping = async () => ({ success: true, mocked: true });
  sender.setLastMessageId = () => {};
  sender.downloadMedia = async () => null;
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
