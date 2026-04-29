// Human-handoff helper. Centralizes the "user wants something we don't
// run through this chat — tell them a human will follow up by email,
// and let the bot keep chatting" flow so every call site (salesBot,
// serviceSelection, router redirect for legacy in-flight users) emits
// the same user-facing message and the same admin notification.
//
// IMPORTANT: handoff does NOT silence the bot. Earlier we set
// metadata.humanTakeover=true here, but that meant subsequent user
// messages went unanswered AND the conversation disappeared from the
// admin dashboard's "AI Only" tab — both bad UX. Now the only side
// effects are: send a single English confirmation, fire an admin email
// (deduplicated per service per conversation), and record the service
// so we don't re-email if the user keeps mentioning the same service.

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
 * - Fires a fire-and-forget admin notification email.
 * - Records the service in metadata.handoffFiredFor so subsequent calls
 *   for the same service in the same conversation are no-ops (the user
 *   keeps mentioning "SEO" — they get told once, the team gets emailed
 *   once, the bot keeps chatting normally afterward).
 *
 * Does NOT set humanTakeover. The bot stays active so the user isn't
 * left in silence after the handoff message. If the user starts asking
 * about a website (or anything else the bot can handle), the bot
 * responds normally.
 *
 * Returns STATES.SALES_CHAT so the caller can use it as a state-return
 * value when called as the terminal action of a handler.
 */
async function handoffToHuman(user, { serviceKey, serviceLabel, reason } = {}) {
  // Resolve a friendly label. Prefer the catalogue's shortLabel when the
  // caller passed a known key — keeps copy consistent across triggers.
  const svc = serviceKey ? findServiceByKey(serviceKey) : null;
  const label = svc?.shortLabel || serviceLabel || 'that service';

  // Dedup key: prefer canonical service key when available, else the
  // free-form label. Lower-cased so "SEO"/"seo" are the same fingerprint.
  const dedupKey = String(serviceKey || label).toLowerCase().trim();
  const alreadyFired = (Array.isArray(user.metadata?.handoffFiredFor) ? user.metadata.handoffFiredFor : [])
    .some((k) => String(k).toLowerCase().trim() === dedupKey);

  if (alreadyFired) {
    logger.info(
      `[HANDOFF] Skipping duplicate fire for ${user.phone_number} (service=${dedupKey}) — already handed off this conversation`
    );
    return STATES.SALES_CHAT;
  }

  // 1. Send the user-facing English confirmation.
  try {
    await sendTextMessage(user.phone_number, buildHandoffMessage(label));
  } catch (err) {
    logger.warn(`[HANDOFF] Sending confirmation failed for ${user.phone_number}: ${err.message}`);
  }

  // 2. Persist a marker so we don't re-fire for the same service. Bot
  //    stays active; humanTakeover is intentionally NOT touched.
  const handoffAt = new Date().toISOString();
  const existing = Array.isArray(user.metadata?.handoffFiredFor) ? user.metadata.handoffFiredFor : [];
  const merged = existing.includes(dedupKey) ? existing : [...existing, dedupKey];
  try {
    await updateUserMetadata(user.id, {
      handoffFiredFor: merged,
      lastHandoffService: serviceKey || label,
      lastHandoffLabel: label,
      lastHandoffReason: reason || 'service_not_chat_handled',
      lastHandoffAt: handoffAt,
    });
    if (user.metadata) {
      user.metadata.handoffFiredFor = merged;
      user.metadata.lastHandoffService = serviceKey || label;
      user.metadata.lastHandoffLabel = label;
      user.metadata.lastHandoffReason = reason || 'service_not_chat_handled';
      user.metadata.lastHandoffAt = handoffAt;
    }
    logger.info(
      `[HANDOFF] Recorded handoff for ${user.phone_number} (service=${serviceKey || label}, reason=${reason || 'service_not_chat_handled'})`
    );
  } catch (err) {
    logger.error(`[HANDOFF] Failed to persist handoff marker for ${user.phone_number}: ${err.message}`);
  }

  // 3. Log a marker row so admin transcript shows the moment of handoff.
  try {
    await logMessage(
      user.id,
      `[HANDOFF] Notified team about: ${label}${reason ? ` (${reason})` : ''}`,
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
