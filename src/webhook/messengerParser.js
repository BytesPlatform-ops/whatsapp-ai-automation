const axios = require('axios');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

/**
 * Fetch message text from Instagram Graph API using the message mid.
 */
async function fetchMessageText(mid) {
  try {
    const token = env.messenger.pageAccessToken;
    if (!token) return null;
    const url = `https://graph.facebook.com/v25.0/${mid}?fields=message&access_token=${token}`;
    const res = await axios.get(url);
    return res.data?.message || null;
  } catch (error) {
    logger.error('[PARSER] Failed to fetch message text from Graph API', {
      mid,
      error: error.response?.data || error.message,
    });
    return null;
  }
}

/**
 * Parse incoming webhook payload from Meta's Messenger / Instagram API.
 * Returns null if the payload doesn't contain a user message.
 *
 * Messenger: body.object === 'page'
 * Instagram: body.object === 'instagram'
 */
async function parseMessengerPayload(body) {
  try {
    const objectType = body.object; // 'page' or 'instagram'
    if (objectType !== 'page' && objectType !== 'instagram') return null;

    const channel = objectType === 'instagram' ? 'instagram' : 'messenger';

    const entry = body.entry?.[0];
    if (!entry) return null;

    // Instagram API can send webhooks in two formats:
    // 1. "messaging" format (Messenger-style)
    // 2. "changes" format (Instagram API v25+)
    let messaging = entry.messaging?.[0];

    // Handle "changes" format — convert to messaging-style object
    if (!messaging && entry.changes) {
      const change = entry.changes.find(c => c.field === 'messages');
      if (change?.value) {
        const v = change.value;
        messaging = {
          sender: v.sender,
          recipient: v.recipient,
          timestamp: v.timestamp,
          message: v.message,
        };
      }
    }

    if (!messaging) return null;

    const senderId = messaging.sender?.id;
    if (!senderId) return null;

    // Skip echo messages (messages sent by the page itself)
    if (messaging.message?.is_echo) return null;

    // Skip delivery/read receipts
    if (messaging.delivery || messaging.read) return null;

    const parsed = {
      from: senderId,
      messageId: messaging.message?.mid || `${Date.now()}`,
      timestamp: messaging.timestamp ? String(messaging.timestamp) : String(Date.now()),
      type: 'text',
      contactName: '',
      channel,
    };

    // Handle postback (button clicks)
    if (messaging.postback) {
      parsed.text = messaging.postback.title || '';
      parsed.buttonId = messaging.postback.payload || '';
      parsed.type = 'text';
      return parsed;
    }

    // Handle message_edit as original message (Instagram API v25 sends incoming
    // messages as message_edit with num_edit=0 instead of a regular message event)
    if (messaging.message_edit && !messaging.message) {
      const mid = messaging.message_edit.mid;
      logger.info('[PARSER] Received message_edit event — fetching text from Graph API', {
        mid,
        numEdit: messaging.message_edit.num_edit,
        senderId,
      });
      const text = await fetchMessageText(mid);
      if (!text) {
        logger.warn('[PARSER] Could not fetch message text for message_edit', { mid });
        return null;
      }
      parsed.messageId = mid;
      parsed.text = text;
      parsed.type = 'text';
      return parsed;
    }

    const message = messaging.message;
    if (!message) return null;

    // Handle quick reply
    if (message.quick_reply) {
      parsed.text = message.text || '';
      parsed.buttonId = message.quick_reply.payload || '';
      parsed.type = 'text';
      return parsed;
    }

    // Handle text message
    if (message.text) {
      parsed.text = message.text;
      parsed.type = 'text';
      return parsed;
    }

    // Handle attachments (images, files, audio, etc.)
    if (message.attachments && message.attachments.length > 0) {
      const attachment = message.attachments[0];

      switch (attachment.type) {
        case 'image':
          parsed.type = 'image';
          parsed.mediaUrl = attachment.payload?.url;
          parsed.text = '[Image]';
          break;

        case 'audio':
          parsed.type = 'audio';
          parsed.mediaUrl = attachment.payload?.url;
          parsed.text = '';
          break;

        case 'video':
          parsed.type = 'video';
          parsed.mediaUrl = attachment.payload?.url;
          parsed.text = '[Video]';
          break;

        case 'file':
          parsed.type = 'document';
          parsed.mediaUrl = attachment.payload?.url;
          parsed.text = '[Document]';
          break;

        case 'location':
          parsed.type = 'location';
          parsed.latitude = attachment.payload?.coordinates?.lat;
          parsed.longitude = attachment.payload?.coordinates?.long;
          parsed.text = `[Location: ${parsed.latitude}, ${parsed.longitude}]`;
          break;

        default:
          parsed.text = `[Unsupported attachment type: ${attachment.type}]`;
          break;
      }

      return parsed;
    }

    return null;
  } catch (error) {
    logger.error('Error parsing Messenger/IG webhook payload:', error);
    return null;
  }
}

module.exports = { parseMessengerPayload };
