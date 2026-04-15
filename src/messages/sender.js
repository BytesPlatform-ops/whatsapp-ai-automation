/**
 * Channel-aware sender facade.
 *
 * All handlers import from this file (unchanged). It reads the current
 * channel from AsyncLocalStorage and delegates to the correct platform sender.
 */

const { getCurrentChannel } = require('./channelContext');
const whatsappSender = require('./whatsappSender');
const messengerSender = require('./messengerSender');

function getSender() {
  const channel = getCurrentChannel();
  return channel === 'whatsapp' ? whatsappSender : messengerSender;
}

async function sendTextMessage(to, text, options = {}) {
  // The 4-8s "human typing" delay is great for AI replies, but useless for
  // operator-sent messages from the admin dashboard — the operator clicks
  // Send and expects it to go out immediately. Pass `{ instant: true }` to
  // bypass the typing indicator + delay entirely.
  if (!options.instant) {
    try { await getSender().showTyping(to); } catch {}
    const delay = 4000 + Math.floor(Math.random() * 4000);
    await new Promise(r => setTimeout(r, delay));
  }
  return getSender().sendTextMessage(to, text);
}

async function sendInteractiveButtons(to, bodyText, buttons, headerText = null) {
  return getSender().sendInteractiveButtons(to, bodyText, buttons, headerText);
}

async function sendInteractiveList(to, bodyText, buttonText, sections, headerText = null) {
  return getSender().sendInteractiveList(to, bodyText, buttonText, sections, headerText);
}

async function sendWithMenuButton(to, text, extraButtons = []) {
  return getSender().sendWithMenuButton(to, text, extraButtons);
}

async function sendCTAButton(to, bodyText, buttonText, url, headerText = null) {
  return getSender().sendCTAButton(to, bodyText, buttonText, url, headerText);
}

async function sendDocument(to, documentUrl, caption = '', filename = 'report.pdf') {
  return getSender().sendDocument(to, documentUrl, caption, filename);
}

async function sendDocumentBuffer(to, buffer, caption = '', filename = 'report.pdf', mimeType = 'application/pdf') {
  return getSender().sendDocumentBuffer(to, buffer, caption, filename, mimeType);
}

async function sendImage(to, imageUrl, caption = '') {
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
};
