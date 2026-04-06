const { logger } = require('../utils/logger');

/**
 * Parse the incoming webhook payload from Meta's WhatsApp Cloud API.
 * Returns null if the payload doesn't contain a user message.
 */
function parseWebhookPayload(body) {
  try {
    const entry = body.entry?.[0];
    if (!entry) return null;

    const change = entry.changes?.[0];
    if (!change || change.field !== 'messages') return null;

    const value = change.value;
    if (!value) return null;

    // Check for status updates (delivery receipts, read receipts)
    if (value.statuses) {
      logger.debug('Received status update', { statuses: value.statuses });
      return null; // We don't process status updates
    }

    const message = value.messages?.[0];
    if (!message) return null;

    const contact = value.contacts?.[0];

    const parsed = {
      from: message.from, // sender's phone number
      messageId: message.id,
      timestamp: message.timestamp,
      type: message.type, // text, image, document, interactive, etc.
      contactName: contact?.profile?.name || '',
      channel: 'whatsapp',
    };

    // Extract ad referral data (Click-to-WhatsApp ads)
    const referral = message.referral || value.messages?.[0]?.referral;
    if (referral) {
      parsed.referral = {
        sourceId: referral.source_id || '',
        sourceType: referral.source_type || '',
        headline: referral.headline || '',
        body: referral.body || '',
        ctwaClid: referral.ctwa_clid || '',
      };
      logger.info('[AD TRACKING] WhatsApp referral detected', {
        sourceId: parsed.referral.sourceId,
        headline: parsed.referral.headline,
        body: (parsed.referral.body || '').slice(0, 100),
      });
    }

    // Extract content based on message type
    switch (message.type) {
      case 'text':
        parsed.text = message.text?.body || '';
        break;

      case 'interactive':
        // Button replies or list replies
        if (message.interactive?.type === 'button_reply') {
          parsed.text = message.interactive.button_reply.title;
          parsed.buttonId = message.interactive.button_reply.id;
        } else if (message.interactive?.type === 'list_reply') {
          parsed.text = message.interactive.list_reply.title;
          parsed.listId = message.interactive.list_reply.id;
        }
        break;

      case 'image':
        parsed.mediaId = message.image?.id;
        parsed.mimeType = message.image?.mime_type;
        parsed.caption = message.image?.caption || '';
        parsed.text = message.image?.caption || '[Image]';
        break;

      case 'document':
        parsed.mediaId = message.document?.id;
        parsed.mimeType = message.document?.mime_type;
        parsed.filename = message.document?.filename;
        parsed.caption = message.document?.caption || '';
        parsed.text = message.document?.caption || '[Document]';
        break;

      case 'audio':
        parsed.mediaId = message.audio?.id;
        parsed.mimeType = message.audio?.mime_type;
        parsed.text = ''; // Will be filled by transcription in router
        break;

      case 'location':
        parsed.latitude = message.location?.latitude;
        parsed.longitude = message.location?.longitude;
        parsed.text = `[Location: ${message.location?.latitude}, ${message.location?.longitude}]`;
        break;

      default:
        parsed.text = `[Unsupported message type: ${message.type}]`;
        break;
    }

    return parsed;
  } catch (error) {
    logger.error('Error parsing webhook payload:', error);
    return null;
  }
}

module.exports = { parseWebhookPayload };
