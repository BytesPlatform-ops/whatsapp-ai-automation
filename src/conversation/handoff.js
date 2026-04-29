// Human-handoff helper. Centralizes the "user wants something we don't
// run through this chat — silence the bot and let a human take it from
// here" flow so every call site (salesBot, serviceSelection, router
// redirect for legacy in-flight users) emits the same user-facing
// message and the same admin notification.
//
// Reuses the existing humanTakeover infrastructure (router pipeline
// already gates further bot replies on metadata.humanTakeover === true,
// admin dashboard surfaces these threads under the takeover filter).

const { sendTextMessage } = require('../messages/sender');
const { logMessage } = require('../db/conversations');
const { updateUserMetadata } = require('../db/users');
const { logger } = require('../utils/logger');
const { STATES } = require('./states');
const { findServiceByKey } = require('../config/services');

// English handoff message — user requested keeping this in English even
// when the rest of the conversation is in Roman Urdu / mixed.
function buildHandoffMessage(serviceLabel) {
  const label = serviceLabel && serviceLabel.trim()
    ? serviceLabel.trim()
    : 'that';
  return (
    `Got it — for ${label}, our team handles that directly rather than through this chat. ` +
    `A human from our team will reach out to you here within 24 hours. ` +
    `In the meantime, if you'd also like a website, just let me know.`
  );
}

/**
 * Trigger a human handoff for a non-website (or otherwise disabled)
 * service request.
 *
 * - Sends an English confirmation to the user.
 * - Sets metadata.humanTakeover so the router pipeline silences the bot.
 * - Records handoffService / handoffAt / handoffReason for admin context.
 * - Fires a fire-and-forget admin notification email.
 *
 * Returns STATES.SALES_CHAT so the caller can use it as a state-return
 * value. The router's humanTakeover gate will short-circuit subsequent
 * messages anyway, but returning a sane state keeps downstream code
 * (state-history push, etc.) happy.
 */
async function handoffToHuman(user, { serviceKey, serviceLabel, reason } = {}) {
  // Resolve a friendly label. Prefer the catalogue's shortLabel when the
  // caller passed a known key — keeps copy consistent across triggers.
  const svc = serviceKey ? findServiceByKey(serviceKey) : null;
  const label = svc?.shortLabel || serviceLabel || 'that service';

  // 1. Send the user-facing confirmation BEFORE flipping takeover so they
  //    don't sit in silence wondering what happened.
  try {
    await sendTextMessage(user.phone_number, buildHandoffMessage(label));
  } catch (err) {
    logger.warn(`[HANDOFF] Sending confirmation failed for ${user.phone_number}: ${err.message}`);
  }

  // 2. Persist takeover state + reason on the user.
  const handoffAt = new Date().toISOString();
  try {
    await updateUserMetadata(user.id, {
      humanTakeover: true,
      handoffService: serviceKey || label,
      handoffServiceLabel: label,
      handoffReason: reason || 'service_not_chat_handled',
      handoffAt,
    });
    if (user.metadata) {
      user.metadata.humanTakeover = true;
      user.metadata.handoffService = serviceKey || label;
      user.metadata.handoffServiceLabel = label;
      user.metadata.handoffReason = reason || 'service_not_chat_handled';
      user.metadata.handoffAt = handoffAt;
    }
    logger.info(
      `[HANDOFF] Enabled humanTakeover for ${user.phone_number} (service=${serviceKey || label}, reason=${reason || 'service_not_chat_handled'})`
    );
  } catch (err) {
    logger.error(`[HANDOFF] Failed to enable takeover for ${user.phone_number}: ${err.message}`);
  }

  // 3. Log a marker row so admin transcript shows the moment of handoff.
  try {
    await logMessage(
      user.id,
      `[HANDOFF] Routed to human for: ${label}${reason ? ` (${reason})` : ''}`,
      'system'
    );
  } catch (err) {
    logger.warn(`[HANDOFF] logMessage marker failed: ${err.message}`);
  }

  // 4. Notify admin (fire-and-forget — never block the reply).
  try {
    const { sendHandoffNotification } = require('../notifications/email');
    await sendHandoffNotification({
      userPhone: user.phone_number,
      userName: user.name || null,
      channel: user.channel || 'whatsapp',
      userId: user.id,
      serviceKey: serviceKey || null,
      serviceLabel: label,
      reason: reason || 'service_not_chat_handled',
    });
  } catch (err) {
    logger.warn(`[HANDOFF] Admin notification failed: ${err.message}`);
  }

  return STATES.SALES_CHAT;
}

module.exports = { handoffToHuman, buildHandoffMessage };
