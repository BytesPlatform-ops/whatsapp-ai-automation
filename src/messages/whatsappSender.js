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
    const status = error.response?.status;
    const code = error.response?.data?.error?.code;
    const fallbackPnid = env.whatsapp.phoneNumberId;
    // Retry-once-on-fallback triggers:
    //   - 100 (Unsupported request): phone_number_id is revoked /
    //     decommissioned — Meta returns "method type: post" not allowed.
    //   - 131005 (Access denied): our token doesn't have messaging
    //     permission for this specific phone_number_id. Could be a
    //     cross-WABA mismatch or a phone number that was removed from
    //     the app's scope.
    // In both cases, the stored via_phone_number_id is the problem;
    // the env default may still work.
    const retryableCodes = new Set([100, 131005]);
    if (
      retryableCodes.has(code) &&
      fallbackPnid &&
      pnid &&
      pnid !== fallbackPnid
    ) {
      logger.warn(`[WA-SEND] Got error ${code} via stale pnid=${pnid}, retrying via default ${fallbackPnid}`);
      try {
        const response = await axios.post(messagesUrl(fallbackPnid), payload, { headers });
        logger.info(`[WA-SEND] Fallback succeeded via ${fallbackPnid} after error ${code} on ${pnid}`);
        return response.data;
      } catch (retryErr) {
        logger.error('WhatsApp API error (retry also failed):', {
          status: retryErr.response?.status,
          data: retryErr.response?.data,
          via: fallbackPnid,
        });
        throw retryErr;
      }
    }
    logger.error('WhatsApp API error:', {
      status,
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
 * Send an approved WhatsApp Message Template — the ONLY Meta-compliant way to
 * message a user OUTSIDE the 24h customer-service window. `templateName` +
 * `languageCode` must match a template APPROVED on the WABA the sending number
 * (resolved from context inside sendRequest) belongs to. `bodyParams` fills the
 * body {{1}}, {{2}}… in order (pass [] when the template has no variables).
 * `extraComponents` lets a caller append header/button components verbatim.
 */
async function sendTemplateMessage(to, templateName, languageCode = 'en', bodyParams = [], extraComponents = []) {
  const components = [];
  if (Array.isArray(bodyParams) && bodyParams.length) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((v) => ({ type: 'text', text: String(v) })),
    });
  }
  if (Array.isArray(extraComponents) && extraComponents.length) components.push(...extraComponents);
  return sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length ? { components } : {}),
    },
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
 * Send an audio message via public URL (renders as a voice note in WhatsApp
 * when the file is OGG/Opus).
 */
async function sendAudioMessage(to, audioUrl) {
  return sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'audio',
    audio: { link: audioUrl },
  });
}

/**
 * Upload an audio buffer (e.g. TTS output) as media and send it. OGG/Opus
 * shows up as a true voice note. Mirrors sendDocumentBuffer's two-step
 * upload-then-send so we don't need to host the file anywhere.
 */
async function sendAudioBuffer(to, buffer, mimeType = 'audio/ogg') {
  const FormData = require('form-data');
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', buffer, { filename: 'voice.ogg', contentType: mimeType });

  const uploadUrl = `https://graph.facebook.com/v21.0/${activePhoneNumberId()}/media`;
  const uploadRes = await axios.post(uploadUrl, form, {
    headers: {
      Authorization: `Bearer ${env.whatsapp.accessToken}`,
      ...form.getHeaders(),
    },
  });

  const mediaId = uploadRes.data.id;
  logger.debug(`Audio media uploaded: ${mediaId}`);

  return sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'audio',
    audio: { id: mediaId },
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
 * Send an interactive Flow message (the "Get Started" CTA that opens a
 * native WhatsApp Flow). flowToken must be unique per user per send — we
 * store the user's ctwa_clid + resolved language against it (see
 * flows/store.js) so the endpoint and the final build stay attributed.
 *
 * Uses flow_action 'data_exchange' so the endpoint receives an INIT
 * request on open and supplies the first screen's labels + dropdown
 * options (in the resolved language). 'navigate' would skip INIT and the
 * first screen's dynamic labels would render as "undefined".
 *
 * @param {string} to             user's wa number
 * @param {string} bodyText       message body shown above the button
 * @param {object} opts
 * @param {string} opts.flowId    published Flow id
 * @param {string} opts.flowToken unique-per-user token
 * @param {string} [opts.cta]     button label (default "Get Started")
 */
async function sendFlowMessage(to, bodyText, { flowId, flowToken, cta = 'Get Started' } = {}) {
  return sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      body: { text: bodyText },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: flowToken,
          flow_id: flowId,
          flow_cta: cta,
          flow_action: 'data_exchange',
        },
      },
    },
  });
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
 * Sentinel error class so callers can distinguish "user uploaded a
 * disallowed file" from "the network broke." Handlers catch this to send
 * a friendly explanation instead of crashing or swallowing the failure.
 */
class UnsafeMediaError extends Error {
  constructor(reason, mimeType) {
    super(`Unsafe media rejected (${reason}, mime=${mimeType || 'unknown'})`);
    this.name = 'UnsafeMediaError';
    this.reason = reason;
    this.mimeType = mimeType || null;
  }
}

/**
 * Download media from WhatsApp (for receiving images/documents from users).
 *
 * For image MIME types we hard-block SVG (real or spoofed) at this boundary
 * so a malicious upload never reaches any of our Supabase buckets. Audio,
 * voice, and other non-image media pass through unchanged — they're
 * consumed by the transcription path, not embedded into deployed sites.
 */
async function downloadMedia(mediaId) {
  let urlResponse, mediaResponse;
  try {
    // First get the media URL
    urlResponse = await axios.get(
      `https://graph.facebook.com/v21.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${env.whatsapp.accessToken}` } }
    );

    // Then download the actual file
    mediaResponse = await axios.get(urlResponse.data.url, {
      headers: { Authorization: `Bearer ${env.whatsapp.accessToken}` },
      responseType: 'arraybuffer',
    });
  } catch (error) {
    logger.error('Media download error:', error);
    throw error;
  }

  const buffer = Buffer.from(mediaResponse.data);
  const mimeType = urlResponse.data.mime_type;
  const mime = String(mimeType || '').toLowerCase();

  // Image-class media: reject SVG by MIME, and reject any payload whose
  // first non-whitespace byte is `<` (catches spoofed-MIME SVG/HTML/XML).
  if (mime.startsWith('image/')) {
    if (/\bsvg\b/.test(mime) || mime.includes('svg+xml')) {
      logger.warn(`[MEDIA] Rejected SVG upload mediaId=${mediaId} mime=${mime}`);
      throw new UnsafeMediaError('svg_blocked', mimeType);
    }
    let i = 0;
    while (i < buffer.length && i < 8 && buffer[i] <= 0x20) i++;
    if (i < buffer.length && buffer[i] === 0x3C /* '<' */) {
      logger.warn(`[MEDIA] Rejected text-payload-as-image mediaId=${mediaId} mime=${mime}`);
      throw new UnsafeMediaError('svg_blocked', mimeType);
    }
  }

  return { buffer, mimeType };
}

module.exports = {
  sendTextMessage,
  sendTemplateMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  sendWithMenuButton,
  sendCTAButton,
  sendDocument,
  sendDocumentBuffer,
  sendImage,
  sendAudioMessage,
  sendAudioBuffer,
  sendFlowMessage,
  markAsRead,
  downloadMedia,
  showTyping,
  setLastMessageId,
  UnsafeMediaError,
};
