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
 * No side effects. WhatsApp-only, once per user (flowSentAt).
 *
 * Audience is now EVERYONE (widened from CTWA-only) — ad leads and organic
 * users alike. The guided form is Pixie's flagship website intake, so it's
 * offered to any first-turn WhatsApp user; the chat builder is the fallback
 * if they ignore it. This gate intentionally does NOT decide WHEN to fire —
 * that's scoped by the caller (salesBot.js): explicit website intent triggers
 * the demo-intercept, a neutral first message gets the after-greeting offer,
 * and other product intents (chatbot/seo/logo) suppress it via
 * skipLlmResponse so a website form never lands on a chatbot lead.
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

  // Send once. flowSentAt guards re-sends on subsequent messages (cleared by
  // /reset, so testers get a fresh offer on every reset).
  if (user.metadata?.flowSentAt) return false;

  return true;
}

/**
 * Low-level send: create a fresh per-attempt session + token and send the Flow
 * message, logging it to the transcript. Returns the flowToken on success or
 * null on any failure (caller decides fallback). Shared by the first-turn offer
 * AND the later reminders so both behave identically.
 */
async function _sendFlowForm(user, message, { lang, body, cta }) {
  const phoneNumberId = message.phoneNumberId || user.via_phone_number_id;
  const flowId = flowIdForNumber(phoneNumberId);
  if (!flowId) return null; // no Flow published for this number's WABA

  const ctwaClid = user.metadata?.adReferral?.ctwaClid || message.referral?.ctwaClid || null;
  const flowToken = newFlowToken();
  try {
    await createSession({ flowToken, waId: user.phone_number, phoneNumberId, userId: user.id, lang, ctwaClid });
  } catch (err) {
    logger.warn(`[FLOW-SEND] createSession failed: ${err.message} — falling back to chat`);
    return null;
  }
  try {
    const whatsappSender = require('../messages/whatsappSender');
    await whatsappSender.sendFlowMessage(user.phone_number, body, { flowId, flowToken, cta });
  } catch (err) {
    logger.warn(`[FLOW-SEND] sendFlowMessage failed: ${err.message} — falling back to chat`);
    return null;
  }
  // sendFlowMessage goes through whatsappSender.sendRequest, which — unlike
  // sendTextMessage — is NOT auto-logged, so log the form send explicitly so
  // the admin transcript shows Pixie sent the intake form.
  try {
    const { logMessage } = require('../db/conversations');
    await logMessage(user.id, `${body}\n\n[📋 Website form sent]`, 'assistant');
  } catch (err) {
    logger.warn(`[FLOW-SEND] logMessage failed (non-fatal): ${err.message}`);
  }
  return flowToken;
}

// Resolve the form body + CTA for the user's language (en/pt authored, others
// fall back to en — same precedence the offer always used).
function flowBodyFor(lang) {
  const qb = require('./questionBank');
  return {
    body: (qb.L[lang] && qb.L[lang].flow_offer) || qb.L.en.flow_offer,
    cta: (qb.L[lang] && qb.L[lang].flow_cta) || qb.L.en.flow_cta,
  };
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
  if (!flowIdForNumber(phoneNumberId)) return false;

  const firstText = String(message.text || '').trim();
  const lang = await detectLanguage(firstText, { phoneNumberId, userId: user.id });

  // Pre-warm the runtime translation so the /flow endpoint serves the form
  // in the user's language without paying translation latency mid-screen.
  try {
    const { ensureLanguage } = require('./translate');
    await ensureLanguage(lang);
  } catch (err) {
    logger.warn(`[FLOW-SEND] ensureLanguage(${lang}) failed: ${err.message}`);
  }

  const { body, cta } = flowBodyFor(lang);
  const flowToken = await _sendFlowForm(user, message, { lang, body, cta });
  if (!flowToken) return false;

  // Seed the reminder counters alongside flowSentAt so the later reminder
  // logic has a clean baseline (0 reminders, 0 messages since send).
  const { updateUserMetadata } = require('../db/users');
  const patch = { flowSentAt: new Date().toISOString(), flowToken, flowMsgsSinceSend: 0, flowReminderCount: 0 };
  await updateUserMetadata(user.id, patch);
  user.metadata = { ...(user.metadata || {}), ...patch };

  logger.info(`[FLOW-SEND] sent Flow (${lang}) to ${user.phone_number} token=${flowToken}`);
  return true;
}

// ── Reminders ───────────────────────────────────────────────────────────────
// After the greeting offer, a user often asks a few chat questions and forgets
// the form. So we re-send it as a gentle reminder once they've sent a few more
// messages without submitting. To stay non-annoying: after reminder #1 we ASK
// whether to keep reminding — reminder #2 only fires if they say yes. Hard cap
// of 2 reminders (3 form sends total, incl. the offer).
const REMINDER_AFTER_MSGS = 3; // user messages since last send before a reminder
const MAX_REMINDERS = 2;       // reminder #1 (asks) + reminder #2 (opt-in only)

const REMINDER_ASK = {
  en: "No rush 🙂 Want me to give you one more nudge about the form later — or should I stop reminding?",
  pt: 'Sem pressa 🙂 Quer que eu te lembre do formulário mais uma vez depois — ou paro de lembrar?',
};

// Pure gate: is this user eligible for ANOTHER Flow reminder right now (ignoring
// the message-count threshold, which the caller checks)? No side effects.
function shouldRemindAboutFlow(user) {
  if (user.channel && user.channel !== 'whatsapp') return false;
  if (!user.metadata?.flowSentAt) return false;        // greeting offer never went out
  if (user.metadata?.flowSubmitted) return false;      // already built via the form
  if (user.metadata?.flowRemindersOptOut) return false;
  const count = Number(user.metadata?.flowReminderCount || 0);
  if (count >= MAX_REMINDERS) return false;
  if (count >= 1 && !user.metadata?.flowRemindersOptIn) return false; // #2 needs opt-in
  return true;
}

/**
 * Count a SALES_CHAT turn and, once REMINDER_AFTER_MSGS messages have passed
 * since the last Flow send, re-send the form as a reminder. After reminder #1
 * it also asks whether to keep reminding (sets awaitingReminderOptIn, which the
 * caller resolves on the next turn via handleReminderOptInReply). Call once per
 * SALES_CHAT turn, AFTER the bot's reply. No-op unless the gate + threshold
 * pass. Returns true when a reminder was sent.
 */
async function maybeSendWebsiteFlowReminder(user, message) {
  if (!flowEnabled(message.phoneNumberId || user.via_phone_number_id)) return false;
  if (!user.metadata?.flowSentAt) return false;
  // Don't stack a reminder while we're waiting for the opt-in answer.
  if (user.metadata?.awaitingReminderOptIn) return false;

  const { updateUserMetadata } = require('../db/users');
  const since = Number(user.metadata?.flowMsgsSinceSend || 0) + 1;

  // Not time yet, or not eligible → just advance the counter.
  if (since < REMINDER_AFTER_MSGS || !shouldRemindAboutFlow(user)) {
    await updateUserMetadata(user.id, { flowMsgsSinceSend: since });
    user.metadata = { ...(user.metadata || {}), flowMsgsSinceSend: since };
    return false;
  }

  const phoneNumberId = message.phoneNumberId || user.via_phone_number_id;
  const lang = await detectLanguage(String(message.text || '').trim(), { phoneNumberId, userId: user.id });
  const { body, cta } = flowBodyFor(lang);
  const flowToken = await _sendFlowForm(user, message, { lang, body, cta });
  if (!flowToken) {
    // Send failed — keep the counter so we try again next threshold.
    await updateUserMetadata(user.id, { flowMsgsSinceSend: since });
    user.metadata = { ...(user.metadata || {}), flowMsgsSinceSend: since };
    return false;
  }

  const count = Number(user.metadata?.flowReminderCount || 0) + 1;
  const patch = { flowToken, flowReminderCount: count, flowMsgsSinceSend: 0 };

  // After the FIRST reminder, ask whether to keep reminding — reminder #2 only
  // fires if they opt in (handled next turn by handleReminderOptInReply).
  if (count === 1) {
    patch.awaitingReminderOptIn = true;
    try {
      const { sendTextMessage } = require('../messages/sender');
      await sendTextMessage(user.phone_number, REMINDER_ASK[lang] || REMINDER_ASK.en);
    } catch (err) {
      logger.warn(`[FLOW-REMIND] opt-in ask failed: ${err.message}`);
    }
  }

  await updateUserMetadata(user.id, patch);
  user.metadata = { ...(user.metadata || {}), ...patch };
  logger.info(`[FLOW-REMIND] reminder #${count} sent to ${user.phone_number} token=${flowToken}`);
  return true;
}

/**
 * Resolve the user's reply to the "want more reminders?" question. Classifies
 * yes / no / neither (LLM), records the decision, and ALWAYS clears the
 * awaiting flag so we never re-ask. Returns a short ack string when they
 * clearly answered (caller sends it + ends the turn), or null when they didn't
 * answer (caller continues the normal sales turn).
 */
async function handleReminderOptInReply(user, text) {
  const { updateUserMetadata } = require('../db/users');
  let decision = 'neither';
  try {
    const { generateResponse } = require('../llm/provider');
    const resp = await generateResponse(
      `The user was just asked whether they'd like one more reminder later to fill out a website form. Classify their reply as EXACTLY one lowercase word: ` +
      `"yes" (they want the reminder / sure / okay), "no" (they don't / stop / not interested), or "neither" (they ignored the question and said something unrelated). Output only the word.`,
      [{ role: 'user', content: String(text || '').slice(0, 200) }],
      { userId: user.id, operation: 'flow_reminder_optin', timeoutMs: 8000 }
    );
    const m = String(resp || '').toLowerCase().match(/yes|no|neither/);
    if (m) decision = m[0];
  } catch (err) {
    logger.warn(`[FLOW-REMIND] opt-in classify failed: ${err.message}`);
  }

  const patch = { awaitingReminderOptIn: false };
  let ack = null;
  if (decision === 'yes') {
    patch.flowRemindersOptIn = true;
    patch.flowMsgsSinceSend = 0; // restart the count toward the final reminder
    ack = "Got it — I'll give you one more nudge later. 👍";
  } else if (decision === 'no') {
    patch.flowRemindersOptOut = true;
    ack = "No problem — I won't remind you again. Just say the word whenever you're ready to build it.";
  }
  await updateUserMetadata(user.id, patch);
  user.metadata = { ...(user.metadata || {}), ...patch };
  return ack;
}

// maybeSendWebsiteFlow kept as a back-compat alias for sendWebsiteFlowOffer.
const maybeSendWebsiteFlow = sendWebsiteFlowOffer;

module.exports = {
  shouldOfferWebsiteFlow,
  sendWebsiteFlowOffer,
  maybeSendWebsiteFlow,
  maybeSendWebsiteFlowReminder,
  handleReminderOptInReply,
  shouldRemindAboutFlow,
  flowEnabled,
  flowIdForNumber,
  newFlowToken,
};
