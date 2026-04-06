const { logger } = require('../utils/logger');

// Cache echo message texts keyed by mid — Instagram sends an echo with the text
// right before the message_edit event for the same mid
const echoTextCache = new Map();
const ECHO_CACHE_TTL = 30000; // 30 seconds

function cacheEchoText(mid, text) {
  echoTextCache.set(mid, text);
  setTimeout(() => echoTextCache.delete(mid), ECHO_CACHE_TTL);
}

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

    // Skip messages from the page/bot itself (tester conversations with other users)
    const recipientId = messaging.recipient?.id;
    const PAGE_IDS = ['17841404243186643'];
    if (PAGE_IDS.includes(senderId)) return null;

    // For Instagram echo messages: cache the text keyed by mid so we can
    // use it when the corresponding message_edit arrives
    if (messaging.message?.is_echo && channel === 'instagram') {
      const mid = messaging.message.mid;
      const text = messaging.message.text;
      if (mid && text) {
        cacheEchoText(mid, text);
        logger.debug('[PARSER] Cached echo text for mid', { mid, text: text.slice(0, 50) });
      }
      return null;
    }

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

    // Handle message_edit — Instagram API v25 sends incoming messages as
    // message_edit with num_edit=0. The echo with the actual text arrives
    // right before this event with the same mid.
    if (messaging.message_edit && !messaging.message) {
      const mid = messaging.message_edit.mid;
      const cachedText = echoTextCache.get(mid);
      logger.info('[PARSER] Received message_edit event', {
        mid,
        numEdit: messaging.message_edit.num_edit,
        senderId,
        hasCachedText: !!cachedText,
      });
      if (cachedText) {
        echoTextCache.delete(mid);
        parsed.messageId = mid;
        parsed.text = cachedText;
        parsed.type = 'text';
        return parsed;
      }
      logger.warn('[PARSER] No cached text found for message_edit', { mid });
      return null;
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
