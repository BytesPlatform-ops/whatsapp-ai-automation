const axios = require('axios');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { getCurrentChannel } = require('./channelContext');

const MESSENGER_API_BASE = 'https://graph.facebook.com/v25.0/me/messages';

function getApiBase() {
  if (getCurrentChannel() === 'instagram') {
    const igUserId = env.messenger.instagramUserId;
    return `https://graph.facebook.com/v25.0/${igUserId}/messages`;
  }
  return MESSENGER_API_BASE;
}

function getHeaders() {
  return {
    Authorization: `Bearer ${env.messenger.pageAccessToken}`,
    'Content-Type': 'application/json',
  };
}

async function sendRequest(payload) {
  const apiBase = getApiBase();
  try {
    const response = await axios.post(apiBase, payload, { headers: getHeaders() });
    logger.debug('Messenger message sent', { to: payload.recipient?.id, api: apiBase });
    return response.data;
  } catch (error) {
    logger.error('Messenger API error:', {
      status: error.response?.status,
      data: error.response?.data,
      api: apiBase,
    });
    throw error;
  }
}

/**
 * Send a sender action (typing_on, typing_off, mark_seen).
 */
async function sendAction(recipientId, action) {
  try {
    await sendRequest({
      recipient: { id: recipientId },
      sender_action: action,
    });
  } catch {
    // Non-critical
  }
}

// Store last message IDs (not used for Messenger but keeps the interface consistent)
const lastMessageIds = new Map();

function setLastMessageId(recipientId, messageId) {
  if (recipientId && messageId) {
    lastMessageIds.set(recipientId, messageId);
  }
}

async function showTyping(recipientId) {
  return sendAction(recipientId, 'typing_on');
}

async function sendTextMessage(to, text) {
  await showTyping(to);
  return sendRequest({
    recipient: { id: to },
    message: { text },
  });
}

/**
 * Map WhatsApp interactive buttons to Messenger Quick Replies.
 */
async function sendInteractiveButtons(to, bodyText, buttons, headerText = null) {
  const text = headerText ? `*${headerText}*\n\n${bodyText}` : bodyText;
  return sendRequest({
    recipient: { id: to },
    message: {
      text,
      quick_replies: buttons.slice(0, 13).map((btn) => ({
        content_type: 'text',
        title: btn.title.slice(0, 20),
        payload: btn.id,
      })),
    },
  });
}

/**
 * Messenger has no list message — fall back to numbered text with quick replies.
 */
async function sendInteractiveList(to, bodyText, buttonText, sections, headerText = null) {
  let text = headerText ? `*${headerText}*\n\n${bodyText}\n\n` : `${bodyText}\n\n`;
  const quickReplies = [];

  for (const section of sections) {
    if (section.title) text += `${section.title}:\n`;
    for (const row of section.rows) {
      text += `• ${row.title}${row.description ? ` - ${row.description}` : ''}\n`;
      if (quickReplies.length < 13) {
        quickReplies.push({
          content_type: 'text',
          title: row.title.slice(0, 20),
          payload: row.id,
        });
      }
    }
    text += '\n';
  }

  return sendRequest({
    recipient: { id: to },
    message: { text: text.trim(), quick_replies: quickReplies },
  });
}

/**
 * Map CTA URL button to Messenger Button Template.
 */
async function sendCTAButton(to, bodyText, buttonText, url, headerText = null) {
  const text = headerText ? `*${headerText}*\n\n${bodyText}` : bodyText;
  return sendRequest({
    recipient: { id: to },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: text.slice(0, 640),
          buttons: [
            {
              type: 'web_url',
              url,
              title: buttonText.slice(0, 20),
            },
          ],
        },
      },
    },
  });
}

async function sendDocument(to, documentUrl, caption = '', filename = 'report.pdf') {
  if (caption) await sendTextMessage(to, caption);
  return sendRequest({
    recipient: { id: to },
    message: {
      attachment: {
        type: 'file',
        payload: { url: documentUrl, is_reusable: true },
      },
    },
  });
}

async function sendDocumentBuffer(to, buffer, caption = '', filename = 'report.pdf', mimeType = 'application/pdf') {
  // Upload via Messenger Attachment Upload API
  const FormData = require('form-data');
  const form = new FormData();
  form.append('recipient', JSON.stringify({ id: to }));
  form.append('message', JSON.stringify({
    attachment: { type: 'file', payload: { is_reusable: true } },
  }));
  form.append('filedata', buffer, { filename, contentType: mimeType });

  try {
    if (caption) await sendTextMessage(to, caption);

    const response = await axios.post(getApiBase(), form, {
      headers: {
        Authorization: `Bearer ${env.messenger.pageAccessToken}`,
        ...form.getHeaders(),
      },
    });
    return response.data;
  } catch (error) {
    logger.error('Messenger file upload error:', error.response?.data);
    // Fallback: just send the caption
    if (caption) return;
    await sendTextMessage(to, `[File: ${filename}]`);
  }
}

async function sendImage(to, imageUrl, caption = '') {
  if (caption) await sendTextMessage(to, caption);
  return sendRequest({
    recipient: { id: to },
    message: {
      attachment: {
        type: 'image',
        payload: { url: imageUrl, is_reusable: true },
      },
    },
  });
}

async function sendWithMenuButton(to, text, extraButtons = []) {
  return sendTextMessage(to, text);
}

async function markAsRead(messageId) {
  // Messenger uses sender_action: mark_seen but needs recipient ID, not message ID.
  // We'll handle this in the router level instead.
  return;
}

/**
 * Download media from a Messenger URL (direct download, no media ID lookup needed).
 */
async function downloadMedia(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
    });
    return {
      buffer: Buffer.from(response.data),
      mimeType: response.headers['content-type'],
    };
  } catch (error) {
    logger.error('Messenger media download error:', error);
    throw error;
  }
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
