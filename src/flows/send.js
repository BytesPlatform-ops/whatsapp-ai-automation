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

// Resolve the Flow id for the number we're sending FROM. Flows are WABA-
// scoped, so a number on a different WABA needs its OWN published Flow.
// PIXIE_FLOW_ID_MAP maps "phoneNumberId:flowId,phoneNumberId:flowId";
// PIXIE_FLOW_ID is the default for any number not in the map (the primary
// number). Returns null when neither resolves → the offer is skipped.
function flowIdForNumber(phoneNumberId) {
  const id = String(phoneNumberId || '');
  for (const pair of (process.env.PIXIE_FLOW_ID_MAP || '').split(',')) {
    const [n, f] = pair.split(':').map((s) => (s || '').trim());
    if (n && f && n === id) return f;
  }
  return process.env.PIXIE_FLOW_ID || null;
}

function flowEnabled(phoneNumberId) {
  return !!flowIdForNumber(phoneNumberId);
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
  // Flow is per-sending-number (WABA-scoped). Skip if the number we'd send
  // from has no published Flow configured.
  if (!flowEnabled(message.phoneNumberId || user.via_phone_number_id)) return false;
  if (user.channel && user.channel !== 'whatsapp') return false; // Flows are WhatsApp-only

  // CTWA-only gate: the user must have arrived via a Click-to-WhatsApp ad.
  // adReferral is set on user.metadata by the router before salesBot runs,
  // so the metadata branch covers the case where message.referral isn't
  // threaded through to the handler.
  //
  // Testers (TESTER_PHONES) bypass the CTWA gate so the Flow can be exercised
  // without clicking a real ad. Combined with /reset clearing flowSentAt, a
  // tester can re-trigger the offer on every reset (unlimited test runs).
  const ctwaClid = user.metadata?.adReferral?.ctwaClid || message.referral?.ctwaClid || null;
  let tester = false;
  try {
    const { isTester } = require('../feedback/feedback');
    tester = isTester(user);
  } catch { /* feedback module optional — fall back to CTWA-only */ }
  if (!ctwaClid && !tester) return false;

  // Send once. flowSentAt guards re-sends on subsequent messages (cleared by
  // /reset, so testers get a fresh offer each reset).
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

  const phoneNumberId = message.phoneNumberId || user.via_phone_number_id;
  const flowId = flowIdForNumber(phoneNumberId);
  if (!flowId) return false; // no Flow published for this number's WABA

  const ctwaClid = user.metadata?.adReferral?.ctwaClid || message.referral?.ctwaClid || null;
  const firstText = String(message.text || '').trim();
  const lang = await detectLanguage(firstText, { phoneNumberId, userId: user.id });

  // Pre-warm the runtime translation so the /flow endpoint serves the form
  // in the user's language without paying translation latency mid-screen.
  // Non-blocking for en/pt (already authored); ~one LLM call for new langs.
  try {
    const { ensureLanguage } = require('./translate');
    await ensureLanguage(lang);
  } catch (err) {
    logger.warn(`[FLOW-SEND] ensureLanguage(${lang}) failed: ${err.message}`);
  }

  const flowToken = newFlowToken();
  try {
    await createSession({
      flowToken,
      waId: user.phone_number,
      phoneNumberId,
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
  // flow_offer is part of the translatable bundle (ensureLanguage ran
  // above), so it follows the user's language. Fall back to EN if missing.
  const qb = require('./questionBank');
  const body = (qb.L[lang] && qb.L[lang].flow_offer) || qb.L.en.flow_offer;
  // The CTA is BOTH the button label AND the title WhatsApp echoes in the
  // user's "Response sent" bubble — so it must read as an action, not "Next"
  // (which is the form's internal screen-nav label). Dedicated flow_cta.
  const cta = (qb.L[lang] && qb.L[lang].flow_cta) || qb.L.en.flow_cta;

  try {
    const whatsappSender = require('../messages/whatsappSender');
    await whatsappSender.sendFlowMessage(user.phone_number, body, {
      flowId,
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
  flowIdForNumber,
  newFlowToken,
};
