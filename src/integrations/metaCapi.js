'use strict';

const axios = require('axios');
const crypto = require('crypto');
const { logger } = require('../utils/logger');

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const META_PAGE_ID = process.env.META_WHATSAPP_PAGE_ID || process.env.META_PAGE_ID_CAPI;

function sha256(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(String(value).toLowerCase().trim()).digest('hex');
}

// Map our internal channel names to Meta's messaging_channel values
function resolveMessagingChannel(channel) {
  if (!channel) return 'whatsapp';
  const c = channel.toLowerCase();
  if (c === 'messenger') return 'messenger';
  if (c === 'instagram') return 'instagram';
  return 'whatsapp';
}

/**
 * Send one or more events to Meta Conversions API.
 * Silently no-ops when META_DATASET_ID / META_CAPI_ACCESS_TOKEN are not set.
 *
 * @param {Array<{eventName, eventTime?, userData?, customData?, eventId?, ctwaClid?, channel?}>} events
 */
async function sendCapiEvents(events) {
  const datasetId = process.env.META_DATASET_ID;
  const token     = process.env.META_CAPI_ACCESS_TOKEN;

  if (!datasetId || !token) return;

  const payload = {
    data: events.map((e) => {
      const hasCtwa = !!e.ctwaClid;
      const eventObj = {
        event_name:  e.eventName,
        event_time:  e.eventTime || Math.floor(Date.now() / 1000),
        event_id:    e.eventId   || undefined,
        user_data:   e.userData  || {},
        custom_data: e.customData || undefined,
      };

      if (hasCtwa) {
        // CTWA ad click — use business_messaging for proper attribution
        eventObj.action_source    = 'business_messaging';
        eventObj.messaging_channel = resolveMessagingChannel(e.channel);
        eventObj.user_data.ctwa_clid = e.ctwaClid;
        if (META_PAGE_ID) eventObj.user_data.page_id = META_PAGE_ID;
      } else {
        eventObj.action_source = 'other';
      }

      return eventObj;
    }),
  };

  // When META_CAPI_TEST_EVENT_CODE is set, events route to the Events
  // Manager → Test Events tab instead of counting as production data.
  // Leave it UNSET in prod. Grab the code from Events Manager → your
  // dataset → Test Events (it looks like "TEST12345").
  const testEventCode = process.env.META_CAPI_TEST_EVENT_CODE;
  if (testEventCode) {
    payload.test_event_code = testEventCode;
  }

  try {
    const res = await axios.post(
      `${GRAPH_BASE}/${datasetId}/events`,
      payload,
      { params: { access_token: token }, timeout: 5000 }
    );
    if (testEventCode) {
      logger.info(`[CAPI] Sent ${events.length} test event(s) [${events.map((e) => e.eventName).join(', ')}]: ${JSON.stringify(res.data)}`);
    }
    return res.data;
  } catch (err) {
    // Non-fatal — CAPI failure must never break bot flow
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    logger.warn(`[CAPI] Failed to send event(s): ${detail}`);
    return null;
  }
}

/**
 * Fire a LeadSubmitted event (CTWA) or Lead event (organic) when the bot
 * sends a generated website preview.
 */
async function trackWebsitePreview({ phone, email, previewUrl, ctwaClid, channel } = {}) {
  await sendCapiEvents([{
    eventName:  ctwaClid ? 'LeadSubmitted' : 'Lead',
    eventId:    `preview_${sha256(phone || '')}_${Date.now()}`,
    ctwaClid,
    channel,
    userData: {
      ph: sha256(phone),
      em: sha256(email),
    },
    customData: {
      content_name:     'Website Preview',
      content_category: 'website_builder',
      content_url:      previewUrl || undefined,
    },
  }]);
}

/**
 * Fire a Purchase event when a Stripe payment is confirmed.
 */
async function trackPurchase({ phone, email, value, currency = 'usd', contentName, orderId, ctwaClid, channel } = {}) {
  await sendCapiEvents([{
    eventName: 'Purchase',
    eventId:   `purchase_${orderId || sha256(phone || '')}_${Date.now()}`,
    ctwaClid,
    channel,
    userData: {
      ph: sha256(phone),
      em: sha256(email),
    },
    customData: {
      value,
      currency: currency.toLowerCase(),
      content_name: contentName || 'Website Package',
      order_id:     orderId ? String(orderId) : undefined,
    },
  }]);
}

module.exports = { sendCapiEvents, trackWebsitePreview, trackPurchase };
