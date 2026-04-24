/**
 * Channel-aware sender facade.
 *
 * All handlers import from this file (unchanged). It reads the current
 * channel from AsyncLocalStorage and delegates to the correct platform sender.
 */

const { getCurrentChannel, noteSendSucceeded, getUserId } = require('./channelContext');
const whatsappSender = require('./whatsappSender');
const messengerSender = require('./messengerSender');
const { rememberInteractive, maybeAppendHint } = require('./interactiveReplyMatcher');
const { logger } = require('../utils/logger');

function getSender() {
  const channel = getCurrentChannel();
  return channel === 'whatsapp' ? whatsappSender : messengerSender;
}

/**
 * Pull the platform message id out of a send-result. Both WhatsApp and
 * Messenger return it but in different shapes:
 *   - WhatsApp Cloud API: { messages: [{ id: 'wamid.xxx' }] }
 *   - Messenger / Instagram: { recipient_id, message_id }
 * We persist it on the outbound conversations row so a future inbound
 * reply (which carries `context.id` / `reply_to.mid`) can be resolved
 * back to the bot message it points at.
 */
function extractPlatformMessageId(result) {
  if (!result) return null;
  return result?.messages?.[0]?.id || result?.message_id || null;
}

/**
 * Auto-log an outbound bot message against the current turn's user.
 * No-op when there's no userId in context (background jobs, admin-
 * initiated sends that already log manually). Errors are swallowed
 * so a DB hiccup never fails a send.
 */
async function autoLogOutbound(text, messageType = 'text', platformMessageId = null) {
  const userId = getUserId();
  if (!userId || !text) return;
  try {
    const { logMessage } = require('../db/conversations');
    await logMessage(userId, text, 'assistant', messageType, platformMessageId);
  } catch (err) {
    logger.debug(`[SENDER] Auto-log failed: ${err.message}`);
  }
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
  autoLogOutbound(text, 'text', extractPlatformMessageId(result)).catch(() => {});
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
  const btnLabels = (buttons || []).map((b) => b?.title || b?.text || '').filter(Boolean).join(' | ');
  autoLogOutbound(btnLabels ? `${bodyWithHint}\n[Buttons: ${btnLabels}]` : bodyWithHint, 'text', extractPlatformMessageId(result)).catch(() => {});
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
  const rowLabels = flatRows.map((r) => r?.title || '').filter(Boolean).join(' | ');
  autoLogOutbound(rowLabels ? `${bodyWithHint}\n[List: ${rowLabels}]` : bodyWithHint, 'text', extractPlatformMessageId(result)).catch(() => {});
  try { rememberInteractive(to, flatRows, 'list'); } catch {}
  return result;
}

async function sendWithMenuButton(to, text, extraButtons = []) {
  const result = await getSender().sendWithMenuButton(to, text, extraButtons);
  noteSendSucceeded();
  autoLogOutbound(text, 'text', extractPlatformMessageId(result)).catch(() => {});
  return result;
}

async function sendCTAButton(to, bodyText, buttonText, url, headerText = null) {
  const result = await getSender().sendCTAButton(to, bodyText, buttonText, url, headerText);
  noteSendSucceeded();
  autoLogOutbound(`${bodyText}\n[CTA: ${buttonText} → ${url}]`, 'text', extractPlatformMessageId(result)).catch(() => {});
  return result;
}

async function sendDocument(to, documentUrl, caption = '', filename = 'report.pdf') {
  const result = await getSender().sendDocument(to, documentUrl, caption, filename);
  noteSendSucceeded();
  autoLogOutbound(`[Document: ${filename}]${caption ? ` — ${caption}` : ''}`, 'document', extractPlatformMessageId(result)).catch(() => {});
  return result;
}

async function sendDocumentBuffer(to, buffer, caption = '', filename = 'report.pdf', mimeType = 'application/pdf') {
  const result = await getSender().sendDocumentBuffer(to, buffer, caption, filename, mimeType);
  noteSendSucceeded();
  autoLogOutbound(`[Document: ${filename}]${caption ? ` — ${caption}` : ''}`, 'document', extractPlatformMessageId(result)).catch(() => {});
  return result;
}

async function sendImage(to, imageUrl, caption = '') {
  const result = await getSender().sendImage(to, imageUrl, caption);
  noteSendSucceeded();
  autoLogOutbound(`[Image sent]${caption ? ` — ${caption}` : ''}`, 'image', extractPlatformMessageId(result)).catch(() => {});
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
