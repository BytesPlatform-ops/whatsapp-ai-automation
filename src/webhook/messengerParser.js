const { logger } = require('../utils/logger');

/**
 * Parse incoming webhook payload from Meta's Messenger / Instagram API.
 * Returns null if the payload doesn't contain a user message.
 *
 * Messenger: body.object === 'page'
 * Instagram: body.object === 'instagram'
 */
function parseMessengerPayload(body) {
  try {
    const objectType = body.object; // 'page' or 'instagram'
    if (objectType !== 'page' && objectType !== 'instagram') return null;

    const channel = objectType === 'instagram' ? 'instagram' : 'messenger';

    const entry = body.entry?.[0];
    if (!entry) return null;

    const messaging = entry.messaging?.[0];
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
