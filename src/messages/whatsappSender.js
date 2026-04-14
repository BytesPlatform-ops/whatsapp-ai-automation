const axios = require('axios');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { getCurrentPhoneNumberId } = require('./channelContext');

// Pick the outbound phone_number_id per request:
//   1. The inbound phone_number_id from the current turn's context (so a user
//      who messaged number B gets a reply from number B).
//   2. Fall back to env.whatsapp.phoneNumberId for proactive/background
//      sends (followups, scheduled messages) where there's no inbound turn.
function activePhoneNumberId() {
  return getCurrentPhoneNumberId() || env.whatsapp.phoneNumberId;
}
function messagesUrl(phoneNumberId) {
  return `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
}

const headers = {
  Authorization: `Bearer ${env.whatsapp.accessToken}`,
  'Content-Type': 'application/json',
};

async function sendRequest(payload) {
  const pnid = activePhoneNumberId();
  try {
    const response = await axios.post(messagesUrl(pnid), payload, { headers });
    logger.debug('Message sent successfully', { to: payload.to, via: pnid });
    return response.data;
  } catch (error) {
    logger.error('WhatsApp API error:', {
      status: error.response?.status,
      data: error.response?.data,
      via: pnid,
    });
    throw error;
  }
}

// Store the last incoming message ID per phone number for typing indicators
const lastMessageIds = new Map();

/**
 * Track the latest incoming message ID for a user.
 * Called from the router on every incoming message.
 */
function setLastMessageId(phoneNumber, messageId) {
  if (phoneNumber && messageId) {
    lastMessageIds.set(phoneNumber, messageId);
  }
}

/**
 * Show "typing..." indicator to the user (lasts up to 25s or until a message is sent).
 */
async function showTyping(phoneNumber) {
  const messageId = lastMessageIds.get(phoneNumber);
  if (!messageId) return;
  try {
    await sendRequest({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
      typing_indicator: { type: 'text' },
    });
  } catch {
    // Non-critical - don't block message flow
  }
}

/**
 * Send a plain text message. Automatically shows typing indicator first.
 */
async function sendTextMessage(to, text) {
  return sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { preview_url: true, body: text },
  });
}

/**
 * Send an interactive message with reply buttons (max 3 buttons).
 */
async function sendInteractiveButtons(to, bodyText, buttons, headerText = null) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map((btn) => ({
          type: 'reply',
          reply: { id: btn.id, title: btn.title.slice(0, 20) },
        })),
      },
    },
  };

  if (headerText) {
    payload.interactive.header = { type: 'text', text: headerText };
  }

  return sendRequest(payload);
}

/**
 * Send an interactive list message (max 10 items, organized in sections).
 */
async function sendInteractiveList(to, bodyText, buttonText, sections, headerText = null) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonText.slice(0, 20),
        sections: sections.map((section) => ({
          title: section.title,
          rows: section.rows.map((row) => ({
            id: row.id,
            title: row.title.slice(0, 24),
            description: row.description ? row.description.slice(0, 72) : undefined,
          })),
        })),
      },
    },
  };

  if (headerText) {
    payload.interactive.header = { type: 'text', text: headerText };
  }

  return sendRequest(payload);
}

/**
 * Send a CTA URL button message.
 */
async function sendCTAButton(to, bodyText, buttonText, url, headerText = null) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: bodyText },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: buttonText,
          url: url,
        },
      },
    },
  };

  if (headerText) {
    payload.interactive.header = { type: 'text', text: headerText };
  }

  return sendRequest(payload);
}

/**
 * Send a document via public URL.
 */
async function sendDocument(to, documentUrl, caption = '', filename = 'report.pdf') {
  return sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'document',
    document: {
      link: documentUrl,
      caption,
      filename,
    },
  });
}

/**
 * Upload a buffer as media to WhatsApp and send it as a document.
 */
async function sendDocumentBuffer(to, buffer, caption = '', filename = 'report.pdf', mimeType = 'application/pdf') {
  const FormData = require('form-data');
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', buffer, { filename, contentType: mimeType });

  // 1. Upload media (under whichever phone_number_id is handling this turn).
  const uploadUrl = `https://graph.facebook.com/v21.0/${activePhoneNumberId()}/media`;
  const uploadRes = await axios.post(uploadUrl, form, {
    headers: {
      Authorization: `Bearer ${env.whatsapp.accessToken}`,
      ...form.getHeaders(),
    },
  });

  const mediaId = uploadRes.data.id;
  logger.debug(`Media uploaded: ${mediaId}`);

  // 2. Send document using media ID
  return sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'document',
    document: {
      id: mediaId,
      caption,
      filename,
    },
  });
}

/**
 * Send an image message.
 */
async function sendImage(to, imageUrl, caption = '') {
  return sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: {
      link: imageUrl,
      caption,
    },
  });
}

/**
 * Send a plain text message (menu button removed).
 * Kept the same signature so all callers continue to work.
 */
async function sendWithMenuButton(to, text, extraButtons = []) {
  return sendTextMessage(to, text);
}

/**
 * Mark a message as read.
 */
async function markAsRead(messageId) {
  return sendRequest({
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  });
}

/**
 * Download media from WhatsApp (for receiving images/documents from users).
 */
async function downloadMedia(mediaId) {
  try {
    // First get the media URL
    const urlResponse = await axios.get(
      `https://graph.facebook.com/v21.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${env.whatsapp.accessToken}` } }
    );

    // Then download the actual file
    const mediaResponse = await axios.get(urlResponse.data.url, {
      headers: { Authorization: `Bearer ${env.whatsapp.accessToken}` },
      responseType: 'arraybuffer',
    });

    return {
      buffer: Buffer.from(mediaResponse.data),
      mimeType: urlResponse.data.mime_type,
    };
  } catch (error) {
    logger.error('Media download error:', error);
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
