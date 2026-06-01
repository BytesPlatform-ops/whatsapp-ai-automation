'use strict';

// Sends the website-builder Flow to a user. v1 scope: CTWA (ad) users
// only — the spec's "when a CTWA user first messages, Pixie replies with
// the Flow." Organic users keep the existing chat intake untouched.
//
// Entirely inert until PIXIE_FLOW_ID is set (i.e. until the Flow is
// provisioned on Meta), so merging this changes nothing in production
// before go-live.

const crypto = require('crypto');
const { logger } = require('../utils/logger');
const { detectLanguage } = require('./lang');
const { createSession } = require('./store');
const { L } = require('./questionBank');

function flowEnabled() {
  return !!process.env.PIXIE_FLOW_ID;
}

// Unique-per-user flow token. The session row is keyed by this; the
// ctwa_clid is stored against it so the post-build CAPI event stays
// attributed even though attribution actually rides on the user's
// adReferral metadata.
function newFlowToken() {
  return 'ft_' + crypto.randomBytes(12).toString('hex');
}

/**
 * Pure gate: should we offer the website Flow to this user this turn?
 * No side effects. CTWA-only, WhatsApp-only, once per user (flowSentAt).
 *
 * @param {object} user      the resolved user row (has metadata, channel)
 * @param {object} message   parsed inbound (referral...)
 * @returns {boolean}
 */
function shouldOfferWebsiteFlow(user, message) {
  if (!flowEnabled()) return false;
  if (user.channel && user.channel !== 'whatsapp') return false; // Flows are WhatsApp-only

  // CTWA-only gate: the user must have arrived via a Click-to-WhatsApp ad.
  // adReferral is set on user.metadata by the router before salesBot runs,
  // so the metadata branch covers the case where message.referral isn't
  // threaded through to the handler.
  const ctwaClid = user.metadata?.adReferral?.ctwaClid || message.referral?.ctwaClid || null;
  if (!ctwaClid) return false;

  // Send once. flowSentAt guards re-sends on subsequent messages.
  if (user.metadata?.flowSentAt) return false;

  return true;
}

/**
 * Offer the website Flow as an alternative to chatting. Sends the Flow
 * message (after the chat greeting, from salesBot) so the user can pick:
 * type to keep chatting, or tap to fill the form. One-time per user.
 * Returns true when the Flow was sent, false otherwise (no-op if the
 * gate fails or the send errors — caller continues normal chat handling).
 *
 * @param {object} user      the resolved user row (has metadata, channel, phone_number)
 * @param {object} message   parsed inbound (text, phoneNumberId, referral...)
 */
async function sendWebsiteFlowOffer(user, message) {
  if (!shouldOfferWebsiteFlow(user, message)) return false;

  const ctwaClid = user.metadata?.adReferral?.ctwaClid || message.referral?.ctwaClid || null;
  const firstText = String(message.text || '').trim();
  const lang = await detectLanguage(firstText, {
    phoneNumberId: message.phoneNumberId || user.via_phone_number_id,
    userId: user.id,
  });

  const flowToken = newFlowToken();
  try {
    await createSession({
      flowToken,
      waId: user.phone_number,
      phoneNumberId: message.phoneNumberId || user.via_phone_number_id,
      userId: user.id,
      lang,
      ctwaClid,
    });
  } catch (err) {
    logger.warn(`[FLOW-SEND] createSession failed: ${err.message} — falling back to chat`);
    return false;
  }

  // Framed as a secondary option: the chat greeting (sent just before this
  // by salesBot) already invited the user to chat, so this offers the form
  // as the "or, if it's easier" alternative rather than the only path.
  const body = lang === 'pt'
    ? 'Ou, se preferir — toque abaixo e eu crio seu site a partir de um formulário rápido 👇'
    : "Or, if it's easier — tap below and I'll build your site from a quick form instead 👇";
  const cta = L[lang]?.build && lang === 'pt' ? 'Começar' : 'Get Started';

  try {
    const whatsappSender = require('../messages/whatsappSender');
    await whatsappSender.sendFlowMessage(user.phone_number, body, {
      flowId: process.env.PIXIE_FLOW_ID,
      flowToken,
      cta,
    });
  } catch (err) {
    logger.warn(`[FLOW-SEND] sendFlowMessage failed: ${err.message} — falling back to chat`);
    return false;
  }

  const { updateUserMetadata } = require('../db/users');
  await updateUserMetadata(user.id, { flowSentAt: new Date().toISOString(), flowToken });
  user.metadata = { ...(user.metadata || {}), flowSentAt: new Date().toISOString(), flowToken };

  logger.info(`[FLOW-SEND] sent Flow (${lang}) to CTWA user ${user.phone_number} token=${flowToken}`);
  return true;
}

// maybeSendWebsiteFlow kept as a back-compat alias for sendWebsiteFlowOffer.
const maybeSendWebsiteFlow = sendWebsiteFlowOffer;

module.exports = {
  shouldOfferWebsiteFlow,
  sendWebsiteFlowOffer,
  maybeSendWebsiteFlow,
  flowEnabled,
  newFlowToken,
};
