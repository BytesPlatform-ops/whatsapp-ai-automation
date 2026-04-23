/**
 * Channel-aware sender facade.
 *
 * All handlers import from this file (unchanged). It reads the current
 * channel from AsyncLocalStorage and delegates to the correct platform sender.
 */

const { getCurrentChannel, noteSendSucceeded } = require('./channelContext');
const whatsappSender = require('./whatsappSender');
const messengerSender = require('./messengerSender');
const { rememberInteractive, maybeAppendHint } = require('./interactiveReplyMatcher');

function getSender() {
  const channel = getCurrentChannel();
  return channel === 'whatsapp' ? whatsappSender : messengerSender;
}

async function sendTextMessage(to, text, options = {}) {
  // The 2-4s "human typing" delay is great for AI replies, but useless for
  // operator-sent messages from the admin dashboard — the operator clicks
  // Send and expects it to go out immediately. Pass `{ instant: true }` to
  // bypass the typing indicator + delay entirely.
  if (!options.instant) {
    try { await getSender().showTyping(to); } catch {}
    const delay = 2000 + Math.floor(Math.random() * 2000);
    await new Promise(r => setTimeout(r, delay));
  }
  const result = await getSender().sendTextMessage(to, text);
  noteSendSucceeded();
  return result;
}

async function sendInteractiveButtons(to, bodyText, buttons, headerText = null) {
  // Phase 10: append a "Or type 1, 2, 3" hint and remember this button set
  // so the next inbound text reply can be matched back to a button — lets
  // users who prefer typing (or whose client doesn't render buttons as
  // interactive) still pick an option without the bot fumbling.
  const bodyWithHint = maybeAppendHint(bodyText, buttons);
  const result = await getSender().sendInteractiveButtons(to, bodyWithHint, buttons, headerText);
  noteSendSucceeded();
  try { rememberInteractive(to, buttons, 'buttons'); } catch {}
  return result;
}

async function sendInteractiveList(to, bodyText, buttonText, sections, headerText = null) {
  // Flatten all rows across sections into one id/title list so the matcher
  // can treat a list the same way as buttons for the "type a number" path.
  const flatRows = Array.isArray(sections)
    ? sections.flatMap((s) => Array.isArray(s?.rows) ? s.rows : [])
    : [];
  const bodyWithHint = maybeAppendHint(bodyText, flatRows);
  const result = await getSender().sendInteractiveList(to, bodyWithHint, buttonText, sections, headerText);
  noteSendSucceeded();
  try { rememberInteractive(to, flatRows, 'list'); } catch {}
  return result;
}

async function sendWithMenuButton(to, text, extraButtons = []) {
  const result = await getSender().sendWithMenuButton(to, text, extraButtons);
  noteSendSucceeded();
  return result;
}

async function sendCTAButton(to, bodyText, buttonText, url, headerText = null) {
  const result = await getSender().sendCTAButton(to, bodyText, buttonText, url, headerText);
  noteSendSucceeded();
  return result;
}

async function sendDocument(to, documentUrl, caption = '', filename = 'report.pdf') {
  const result = await getSender().sendDocument(to, documentUrl, caption, filename);
  noteSendSucceeded();
  return result;
}

async function sendDocumentBuffer(to, buffer, caption = '', filename = 'report.pdf', mimeType = 'application/pdf') {
  const result = await getSender().sendDocumentBuffer(to, buffer, caption, filename, mimeType);
  noteSendSucceeded();
  return result;
}

async function sendImage(to, imageUrl, caption = '') {
  const result = await getSender().sendImage(to, imageUrl, caption);
  noteSendSucceeded();
  return result;
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
};
