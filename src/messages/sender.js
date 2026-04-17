/**
 * Channel-aware sender facade.
 *
 * All handlers import from this file (unchanged). It reads the current
 * channel from AsyncLocalStorage and delegates to the correct platform sender.
 *
 * Every outbound call emits a uniform `Outgoing message` log mirroring the
 * inbound `Incoming message` log from webhook/routes.js, so logs show the
 * full bidirectional conversation (human → bot AND bot → human).
 */

const { getCurrentChannel } = require('./channelContext');
const whatsappSender = require('./whatsappSender');
const messengerSender = require('./messengerSender');
const { logger } = require('../utils/logger');

function getSender() {
  const channel = getCurrentChannel();
  return channel === 'whatsapp' ? whatsappSender : messengerSender;
}

// ── Last-buttons cache for text-fallback digit mapping ──────────────────
// When we send interactive buttons, we store the button list keyed by
// recipient phone so the router can map a bare digit reply ("2") to the
// corresponding button ID. Entries auto-expire after 10 minutes.
const _lastButtons = new Map();
const LAST_BUTTONS_TTL = 10 * 60 * 1000;

function storeLastButtons(to, buttons) {
  if (!Array.isArray(buttons) || buttons.length === 0) return;
  _lastButtons.set(to, { buttons, at: Date.now() });
  // Lazy prune: cap size at 5000 by dropping oldest.
  if (_lastButtons.size > 5000) {
    const oldest = _lastButtons.keys().next().value;
    _lastButtons.delete(oldest);
  }
}

function getLastButtons(to) {
  const entry = _lastButtons.get(to);
  if (!entry) return null;
  if (Date.now() - entry.at > LAST_BUTTONS_TTL) {
    _lastButtons.delete(to);
    return null;
  }
  return entry.buttons;
}

// Shared logger for every bot-side send. Mirrors the shape of the inbound
// log: `{ from, type, text }` → `{ to, type, text, ...extras }`.
function logOutgoing(type, to, text, extras = {}) {
  const channel = getCurrentChannel();
  logger.info('Outgoing message', {
    to,
    channel,
    type,
    text: typeof text === 'string' ? text.slice(0, 100) : undefined,
    ...extras,
  });
}

async function sendTextMessage(to, text) {
  logOutgoing('text', to, text);
  // Show typing indicator and wait 4-8 seconds to simulate human response time
  try { await getSender().showTyping(to); } catch {}
  const delay = 4000 + Math.floor(Math.random() * 4000);
  await new Promise(r => setTimeout(r, delay));
  return getSender().sendTextMessage(to, text);
}

async function sendInteractiveButtons(to, bodyText, buttons, headerText = null) {
  logOutgoing('interactive_buttons', to, bodyText, {
    buttons: (buttons || []).map((b) => `${b.id || '?'}:${b.title || ''}`),
  });
  storeLastButtons(to, buttons);
  // Append a text-fallback hint so users who can't tap buttons can type a
  // number instead: "Or type 1, 2, 3 to choose."
  const hint = (buttons || []).length > 0
    ? `\n\n_Or type ${buttons.map((_, i) => i + 1).join(', ')} to choose._`
    : '';
  return getSender().sendInteractiveButtons(to, bodyText + hint, buttons, headerText);
}

async function sendInteractiveList(to, bodyText, buttonText, sections, headerText = null) {
  const optionCount = (sections || []).reduce(
    (n, s) => n + ((s.rows || []).length),
    0
  );
  logOutgoing('interactive_list', to, bodyText, { buttonText, optionCount });
  return getSender().sendInteractiveList(to, bodyText, buttonText, sections, headerText);
}

async function sendWithMenuButton(to, text, extraButtons = []) {
  logOutgoing('with_menu_button', to, text, {
    extraButtons: (extraButtons || []).map((b) => `${b.id || '?'}:${b.title || ''}`),
  });
  return getSender().sendWithMenuButton(to, text, extraButtons);
}

async function sendCTAButton(to, bodyText, buttonText, url, headerText = null) {
  logOutgoing('cta_button', to, bodyText, { buttonText, url });
  return getSender().sendCTAButton(to, bodyText, buttonText, url, headerText);
}

async function sendDocument(to, documentUrl, caption = '', filename = 'report.pdf') {
  logOutgoing('document', to, caption, { filename, documentUrl });
  return getSender().sendDocument(to, documentUrl, caption, filename);
}

async function sendDocumentBuffer(to, buffer, caption = '', filename = 'report.pdf', mimeType = 'application/pdf') {
  logOutgoing('document_buffer', to, caption, {
    filename,
    mimeType,
    bytes: buffer?.length || 0,
  });
  return getSender().sendDocumentBuffer(to, buffer, caption, filename, mimeType);
}

async function sendImage(to, imageUrl, caption = '') {
  logOutgoing('image', to, caption, { imageUrl });
  return getSender().sendImage(to, imageUrl, caption);
}

async function markAsRead(messageId) {
  return getSender().markAsRead(messageId);
}

async function downloadMedia(mediaIdOrUrl) {
  return getSender().downloadMedia(mediaIdOrUrl);
}

async function showTyping(to) {
  return getSender().showTyping(to);
}

function setLastMessageId(phoneNumber, messageId) {
  return getSender().setLastMessageId(phoneNumber, messageId);
}

module.exports = {
  sendTextMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  sendWithMenuButton,
  sendCTAButton,
  sendDocument,
  sendDocumentBuffer,
  sendImage,
  markAsRead,
  downloadMedia,
  showTyping,
  setLastMessageId,
  getLastButtons,
};
