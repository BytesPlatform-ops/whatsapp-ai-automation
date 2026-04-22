/**
 * Channel-aware sender facade.
 *
 * All handlers import from this file (unchanged). It reads the current
 * channel from AsyncLocalStorage and delegates to the correct platform sender.
 */

const { getCurrentChannel, noteSendSucceeded } = require('./channelContext');
const whatsappSender = require('./whatsappSender');
const messengerSender = require('./messengerSender');

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
  const result = await getSender().sendInteractiveButtons(to, bodyText, buttons, headerText);
  noteSendSucceeded();
  return result;
}

async function sendInteractiveList(to, bodyText, buttonText, sections, headerText = null) {
  const result = await getSender().sendInteractiveList(to, bodyText, buttonText, sections, headerText);
  noteSendSucceeded();
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
