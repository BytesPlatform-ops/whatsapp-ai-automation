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
 * Decide whether this turn should be answered with the Flow, and if so
 * send it. Returns true when the Flow was sent (caller should stop normal
 * handling for this turn), false otherwise.
 *
 * @param {object} user      the resolved user row (has metadata, channel, phone_number)
 * @param {object} message   parsed inbound (text, phoneNumberId, referral...)
 */
async function maybeSendWebsiteFlow(user, message) {
  if (!flowEnabled()) return false;
  if (user.channel && user.channel !== 'whatsapp') return false; // Flows are WhatsApp-only

  // CTWA-only gate: the user must have arrived via a Click-to-WhatsApp ad.
  const ctwaClid = user.metadata?.adReferral?.ctwaClid || message.referral?.ctwaClid || null;
  if (!ctwaClid) return false;

  // Send once. flowSentAt guards re-sends on subsequent messages.
  if (user.metadata?.flowSentAt) return false;

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

  const body = lang === 'pt'
    ? 'Responda algumas perguntas rápidas e eu crio seu site em ~60 segundos 💚'
    : "Answer a few quick questions and I'll build your site in ~60 seconds 💚";
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

module.exports = { maybeSendWebsiteFlow, flowEnabled, newFlowToken };
