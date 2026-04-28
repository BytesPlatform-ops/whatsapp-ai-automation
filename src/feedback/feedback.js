// Feedback system — explicit post-delivery prompts + implicit friction
// detection. Writes land in the `feedback` table (see migration 018);
// admin surfaces them under /admin/feedback.
//
// Two sources of rows:
//
//   1. EXPLICIT — 30s after a project delivers (webdev live, logo image
//      sent, ad image sent, chatbot activated, SEO report sent), the
//      bot sends a 3-button emoji row. User taps one of them
//      (loved / good / issues). If "issues", a follow-up asks for a
//      one-liner and captures the free-text reply.
//
//   2. IMPLICIT — hooks in the router fire when we detect friction:
//      frustrated phrasing ("this is annoying"), correction loops
//      (3+ "no X" replies to the same state), rapid /reset (twice in
//      one hour), and help-escape phrasing ("talk to a human").
//      Implicit rows get written silently for admin review; for
//      help-escape specifically we ALSO proactively flip
//      humanTakeover so the bot stops replying.
//
// Tester phones listed in env.testerPhones (TESTER_PHONES=...) bypass
// the whole system — no prompts, no implicit logging, no table writes.
// Lets the developer /reset spam during testing without poisoning
// the metrics.

const { supabase } = require('../config/database');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { sendInteractiveButtons, sendTextMessage } = require('../messages/sender');
const { runWithContext } = require('../messages/channelContext');
const { logMessage, getConversationHistory } = require('../db/conversations');
const { updateUserMetadata } = require('../db/users');

// Button IDs for the post-delivery prompt. Match on these in the router
// to route the user's tap into the feedback-response handler.
const FEEDBACK_BUTTON_IDS = {
  LOVED: 'fb_loved',
  GOOD: 'fb_good',
  ISSUES: 'fb_issues',
};

// Trigger types — must match the CHECK-able values expected by the
// admin filters. Keep in sync with TESTS_PENDING.md docs.
const TRIGGER = {
  DELIVERY_PROMPT: 'delivery-prompt',
  FRUSTRATED_PHRASING: 'frustrated-phrasing',
  CORRECTION_LOOP: 'correction-loop',
  RAPID_RESET: 'rapid-reset',
  HELP_ESCAPE: 'help-escape',
  ADMIN_REQUESTED: 'admin-requested',
};

const SOURCE = { EXPLICIT: 'explicit', IMPLICIT: 'implicit' };
const RATING = { LOVED: 'loved', GOOD: 'good', ISSUES: 'issues' };

const FLOW = {
  WEBSITE: 'website',
  LOGO: 'logo',
  AD: 'ad',
  CHATBOT: 'chatbot',
  SEO: 'seo',
  GENERAL: 'general',
};

// Post-delivery prompt delay — user sees the delivery ack first, then
// the 3-button row 30s later so the two messages don't stack.
const DELIVERY_PROMPT_DELAY_MS = 30_000;

// Correction-loop threshold: 3 consecutive "no"/"wrong"/"not that"-
// shaped replies to the same collection state triggers a friction log
// + a proactive human-handoff offer.
const CORRECTION_LOOP_THRESHOLD = 3;

// Rapid-reset window: if the user issues /reset twice within this
// window, log a rapid-reset event.
const RAPID_RESET_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Is this user a developer tester? Compares against env.testerPhones.
 * Short-circuits the whole feedback system for these numbers so
 * development traffic doesn't pollute real metrics.
 *
 * Accepts either a user object (reads .phone_number) or a raw phone
 * string. Normalization strips everything that isn't a digit.
 */
function isTester(userOrPhone) {
  if (!userOrPhone) return false;
  const raw = typeof userOrPhone === 'string'
    ? userOrPhone
    : (userOrPhone.phone_number || '');
  const normalized = String(raw || '').replace(/[^\d]/g, '');
  if (!normalized) return false;
  const list = Array.isArray(env.testerPhones) ? env.testerPhones : [];
  return list.includes(normalized);
}

/**
 * Insert a feedback row. Called from all feedback trigger paths.
 * Testers short-circuit here — nothing is written for them.
 */
async function logFeedback({
  user,
  source,
  triggerType,
  flow = FLOW.GENERAL,
  rating = null,
  comment = null,
  excerpt = null,
  state = null,
}) {
  if (!user?.id) return null;
  if (isTester(user)) {
    logger.debug(`[FEEDBACK] Tester bypass for ${user.phone_number} — not writing ${triggerType}`);
    return null;
  }
  try {
    const row = {
      user_id: user.id,
      phone_number: user.phone_number || null,
      channel: user.channel || 'whatsapp',
      flow: flow || FLOW.GENERAL,
      source,
      trigger_type: triggerType,
      rating,
      comment,
      excerpt: Array.isArray(excerpt) ? excerpt : [],
      state: state || user.state || null,
    };
    const { data, error } = await supabase.from('feedback').insert(row).select('id').single();
    if (error) {
      logger.warn(`[FEEDBACK] Insert failed: ${error.message}`);
      return null;
    }
    logger.info(`[FEEDBACK] Logged ${source}/${triggerType} (rating=${rating || '-'}) for ${user.phone_number}`);
    return data?.id || null;
  } catch (err) {
    logger.warn(`[FEEDBACK] logFeedback threw: ${err.message}`);
    return null;
  }
}

/**
 * Build a compact conversation excerpt for the feedback row — last N
 * messages with role + short text preview. Used for implicit triggers
 * so admin has context when reviewing the row.
 */
async function buildConversationExcerpt(userId, n = 8, afterTimestamp = null) {
  try {
    const history = await getConversationHistory(userId, n, {
      afterTimestamp: afterTimestamp || null,
    });
    return (history || []).map((m) => ({
      role: m.role,
      text: String(m.content || m.message_text || '').slice(0, 200),
      at: m.created_at || null,
    }));
  } catch {
    return [];
  }
}

/**
 * Send the 3-button post-delivery prompt. Called AFTER the delivery
 * ack, wrapped in a setTimeout so the two messages don't stack.
 *
 * `flow` names the service that just delivered ("website" / "logo" /
 * etc.) — stored on the feedback row created when the user taps a
 * button later.
 *
 * Only fires when:
 *   - user isn't a tester
 *   - user isn't in humanTakeover (operator is driving the thread)
 *   - there's no queued follow-up service pending (avoid prompting
 *     mid-stack when Phase 12 queue will start another service next)
 */
async function scheduleDeliveryPrompt(user, flow) {
  if (!user?.id) {
    logger.warn(`[FEEDBACK] scheduleDeliveryPrompt called without user.id — skipping`);
    return;
  }
  if (isTester(user)) {
    logger.info(
      `[FEEDBACK] Skipping prompt for ${user.phone_number} (flow=${flow}) — phone matches TESTER_PHONES. ` +
        `If you changed .env, restart the Node process — tester list is snapshotted at startup.`
    );
    return;
  }
  if (user.metadata?.humanTakeover) {
    logger.info(`[FEEDBACK] Skipping prompt for ${user.phone_number} (flow=${flow}) — humanTakeover is active`);
    return;
  }

  // Queue-aware: if the user has more services queued, don't fire the
  // prompt yet — the next service will start any second. Each flow
  // just completed can try again; the LAST one in the queue will see
  // an empty queue and fire.
  const queue = Array.isArray(user.metadata?.serviceQueue) ? user.metadata.serviceQueue : [];
  if (queue.length > 0) {
    logger.info(
      `[FEEDBACK] Skipping prompt for ${user.phone_number} (flow=${flow}) — ${queue.length} more queued service(s): ` +
        queue.map((q) => q.service || q).join(', ')
    );
    return;
  }
  logger.info(`[FEEDBACK] Scheduling prompt for ${user.phone_number} (flow=${flow}) in ${DELIVERY_PROMPT_DELAY_MS / 1000}s`);

  // Capture channel context NOW so the delayed send still routes to
  // the right WhatsApp business number. setTimeout loses async
  // context, so we snapshot + restore it in the callback.
  const channel = user.channel || 'whatsapp';
  const phoneNumberId = user.via_phone_number_id || null;
  const to = user.phone_number;
  const userId = user.id;

  setTimeout(() => {
    runWithContext({ channel, phoneNumberId }, async () => {
      try {
        // Track which flow this prompt was for so the button-tap
        // handler knows what to store. Also a timestamp so we can
        // detect "prompted but no response" later.
        await updateUserMetadata(userId, {
          lastFeedbackPromptFlow: flow,
          lastFeedbackPromptAt: new Date().toISOString(),
        });
        await sendInteractiveButtons(
          to,
          "quick question — how was that whole experience for you?",
          [
            { id: FEEDBACK_BUTTON_IDS.LOVED, title: '🔥 Loved it' },
            { id: FEEDBACK_BUTTON_IDS.GOOD, title: '👍 Good' },
            { id: FEEDBACK_BUTTON_IDS.ISSUES, title: '🤔 Had issues' },
          ]
        );
        await logMessage(userId, "quick question — how was that whole experience for you?", 'assistant');
        logger.info(`[FEEDBACK] Sent delivery prompt to ${to} (flow=${flow})`);
      } catch (err) {
        logger.warn(`[FEEDBACK] Delivery prompt failed for ${to}: ${err.message}`);
      }
    });
  }, DELIVERY_PROMPT_DELAY_MS);
}

/**
 * Handle a user's tap on one of the feedback buttons. Returns
 * { handled: true } if the buttonId matched — caller should return
 * immediately after (the prompt handler wrote the feedback row and
 * maybe transitioned the user to a follow-up free-text state).
 *
 * For "loved" / "good" → thank-you message, no follow-up.
 * For "issues" → store the rating with null comment, then ask for a
 * one-liner. Sets metadata.awaitingFeedbackComment=true so the next
 * text message from the user gets captured as the comment.
 */
async function handleFeedbackButton(user, message) {
  const btnId = message?.buttonId || message?.listId || '';
  if (!btnId || !Object.values(FEEDBACK_BUTTON_IDS).includes(btnId)) {
    return { handled: false };
  }

  const flow = user.metadata?.lastFeedbackPromptFlow || FLOW.GENERAL;
  let rating = null;
  if (btnId === FEEDBACK_BUTTON_IDS.LOVED) rating = RATING.LOVED;
  else if (btnId === FEEDBACK_BUTTON_IDS.GOOD) rating = RATING.GOOD;
  else if (btnId === FEEDBACK_BUTTON_IDS.ISSUES) rating = RATING.ISSUES;

  const feedbackId = await logFeedback({
    user,
    source: SOURCE.EXPLICIT,
    triggerType: TRIGGER.DELIVERY_PROMPT,
    flow,
    rating,
    comment: null,
    state: user.state,
  });

  // Clear the prompt flag now — we captured the rating.
  await updateUserMetadata(user.id, {
    lastFeedbackPromptFlow: null,
    lastFeedbackPromptAt: null,
  });

  if (rating === RATING.ISSUES) {
    // Store the pending-feedback-id so when the user's next text
    // lands, we can attach it as the comment to this row.
    await updateUserMetadata(user.id, {
      awaitingFeedbackComment: feedbackId || true,
    });
    await sendTextMessage(
      user.phone_number,
      "appreciate the honesty — what happened? one line is fine, just so we can fix it.",
    );
    await logMessage(user.id, "appreciate the honesty — what happened? one line is fine, just so we can fix it.", 'assistant');
    return { handled: true };
  }

  // loved / good — just thank them and move on.
  const thanks = rating === RATING.LOVED
    ? "love to hear it 🙌 appreciate you taking the second."
    : "glad it went well — thanks for the feedback!";
  await sendTextMessage(user.phone_number, thanks);
  await logMessage(user.id, thanks, 'assistant');
  return { handled: true };
}

/**
 * If the user was asked for a "what happened?" follow-up after tapping
 * "Had issues" on the previous prompt, capture their next message as
 * the comment on the pending feedback row. Returns { handled: true }
 * if we consumed the message.
 */
async function handlePendingComment(user, message) {
  const pendingId = user.metadata?.awaitingFeedbackComment;
  if (!pendingId) return { handled: false };

  const text = String(message?.text || '').trim();
  if (!text) return { handled: false };

  // Slash commands short-circuit — user wants out, clear the flag
  // and let normal routing handle the command.
  if (text.startsWith('/')) {
    await updateUserMetadata(user.id, { awaitingFeedbackComment: null });
    return { handled: false };
  }

  try {
    if (typeof pendingId === 'string') {
      await supabase
        .from('feedback')
        .update({ comment: text.slice(0, 2000), updated_at: new Date().toISOString() })
        .eq('id', pendingId);
    }
  } catch (err) {
    logger.warn(`[FEEDBACK] Failed to attach comment to ${pendingId}: ${err.message}`);
  }

  await updateUserMetadata(user.id, { awaitingFeedbackComment: null });

  const ack = "got it, logged. we'll take a look and follow up if needed 🙏";
  await sendTextMessage(user.phone_number, ack);
  await logMessage(user.id, ack, 'assistant');
  logger.info(`[FEEDBACK] Captured issues comment for ${user.phone_number}: "${text.slice(0, 80)}"`);
  return { handled: true };
}

// ── Manual feedback trigger ─────────────────────────────────────────
// User-typed entry point so customers can leave feedback any time, not
// just at the post-delivery 3-button prompt. Detected on the WHOLE
// message so a customer name "Feedback Cafe" or a sentence containing
// the word "feedback" doesn't accidentally trip it. Also accepts the
// /feedback slash command for admin / dev convenience.
const MANUAL_FEEDBACK_RX = /^\/?(?:feedback|give\s+feedback|i\s+(?:have|got|wanna\s+leave|want\s+to\s+leave)\s+feedback|leave\s+feedback|share\s+(?:some\s+)?feedback)\s*[!.?]?$/i;

function isFeedbackTrigger(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 40) return false;
  return MANUAL_FEEDBACK_RX.test(t);
}

/**
 * Entry handler for a user-typed feedback request. Creates a pending
 * feedback row (no rating yet — they're being proactive, not rating a
 * specific delivery), sets `awaitingFeedbackComment` so the existing
 * `handlePendingComment` path captures their next message as the body.
 * Returns { handled: true } so the router stops processing this turn.
 */
async function startManualFeedback(user) {
  if (!user?.id) return { handled: false };
  // Tester bypass — same as every other feedback path. Don't pollute
  // metrics with dev traffic.
  if (isTester(user)) {
    await sendTextMessage(
      user.phone_number,
      "noted — but you're on the tester list so this won't get logged. just so you know."
    );
    return { handled: true };
  }

  // humanTakeover — operator is driving; don't capture feedback automatically.
  if (user.metadata?.humanTakeover) {
    return { handled: false };
  }

  // Create a pending row so the comment can attach when the user's
  // next message lands. Use 'admin-requested' trigger type — closest
  // existing fit for "user proactively volunteered feedback"; keeps
  // the admin filters consistent without adding a new enum value.
  const flow = user.metadata?.lastCompletedProjectType || FLOW.GENERAL;
  const feedbackId = await logFeedback({
    user,
    source: SOURCE.EXPLICIT,
    triggerType: TRIGGER.ADMIN_REQUESTED,
    flow,
    rating: null,
    comment: null,
    state: user.state,
  });

  await updateUserMetadata(user.id, {
    awaitingFeedbackComment: feedbackId || true,
  });

  await sendTextMessage(
    user.phone_number,
    "go for it — what's on your mind? a sentence or two is plenty. i'll pass it to the team."
  );
  logger.info(`[FEEDBACK] Manual feedback initiated by ${user.phone_number} (flow=${flow})`);
  return { handled: true };
}

// ── Implicit detectors ──────────────────────────────────────────────

const { classifyIntent } = require('../llm/intentClassifier');

// Trivially-not-a-feedback-signal pre-filter. Skips the LLM round-trip on
// messages that obviously aren't frustration, help-escape, or corrections —
// short greetings, plain affirmations, single emojis, etc. ~30% of inbound
// traffic falls in this bucket, so the saving is real.
const TRIVIAL_RX = /^(hi|hello|hey|yo|yes|yeah|yep|yup|sure|ok|okay|k|no|nope|thanks|thank you|ty|cool|nice|great|good|fine|done|👍|👌|🙏|😊)[\s.!?]*$/i;

function isTrivialMessage(text) {
  const t = String(text || '').trim();
  if (!t || t.length < 3) return true;
  if (TRIVIAL_RX.test(t)) return true;
  return false;
}

/**
 * One LLM round-trip that classifies all three implicit feedback signals
 * at once. The router calls this once per inbound message and passes the
 * results down to the individual handlers — three separate classifier
 * calls per message would triple the latency on the hot path.
 *
 * Returns { frustrated, helpEscape, correction } booleans. Always returns
 * all-false on trivial messages or on classifier failure (fail-closed).
 */
async function classifyFeedbackSignals(text) {
  if (isTrivialMessage(text)) {
    return { frustrated: false, helpEscape: false, correction: false };
  }
  return classifyIntent(text, {
    frustrated: 'User sounds frustrated, irritated, fed up, or angry at the bot/conversation. Includes: complaints about the bot being broken/useless/stupid/dumb, profanity directed at the situation, "ugh", "wtf", "come on", "are you serious", "this isn\'t working", repeating that they already answered, or expressing exhaustion ("I\'m tired of this", "this is pointless"). Do NOT match neutral disagreement or polite "no thanks".',
    helpEscape: 'User is explicitly asking to be connected to a human, real person, agent, or to stop talking to the bot. Includes: "talk to a human", "speak to someone", "real person", "connect me to an agent", "I need actual help", "get me a real person", "stop the bot", "is there a human I can talk to". Match liberally — any indirect request to escalate to a person counts.',
    correction: 'User is correcting or rejecting the previous bot turn — saying the bot got something wrong, misheard, or used the wrong value. Includes: "no", "nope", "nah", "wrong", "that\'s not it", "that\'s incorrect", "actually it\'s X", "I said Y not Z". Do NOT match a "no" that\'s declining a new offer (e.g. "no I don\'t need that") — only when the user is fixing/rejecting what the bot just produced.',
  }, { operation: 'feedback_signals' });
}

async function detectFrustratedPhrasing(text) {
  const { frustrated } = await classifyFeedbackSignals(text);
  return frustrated;
}

async function detectHelpEscape(text) {
  const { helpEscape } = await classifyFeedbackSignals(text);
  return helpEscape;
}

async function looksLikeCorrection(text) {
  const { correction } = await classifyFeedbackSignals(text);
  return correction;
}

/**
 * Track correction-loop count. Called when the user sends a text in a
 * COLLECTION state. Returns the new count (0 if the message wasn't a
 * correction, or state changed since last correction).
 *
 * `isCorrection` may be passed in by the caller (the router does this so
 * the four feedback signals share a single classifier call). If omitted,
 * we'll classify here ourselves — useful for ad-hoc callers.
 */
async function bumpCorrectionLoop(user, text, isCorrection) {
  const flag = typeof isCorrection === 'boolean' ? isCorrection : await looksLikeCorrection(text);
  if (!flag) {
    // Reset counter on non-correction replies — user is making forward
    // progress, no loop active.
    if (user.metadata?.correctionLoopCount) {
      await updateUserMetadata(user.id, {
        correctionLoopCount: 0,
        correctionLoopState: null,
      });
    }
    return 0;
  }

  // If we're in a different state than the last correction, reset.
  // Otherwise increment.
  const sameState = user.metadata?.correctionLoopState === user.state;
  const nextCount = sameState ? (user.metadata?.correctionLoopCount || 0) + 1 : 1;

  await updateUserMetadata(user.id, {
    correctionLoopCount: nextCount,
    correctionLoopState: user.state,
  });
  return nextCount;
}

/**
 * Log a rapid-reset feedback row if the user has /reset'd 2+ times
 * within RAPID_RESET_WINDOW_MS. Called from the /reset handler BEFORE
 * the reset actually clears metadata.
 */
async function recordResetAndMaybeFlag(user) {
  if (!user?.id) return;
  if (isTester(user)) return;
  const now = Date.now();
  const windowStart = now - RAPID_RESET_WINDOW_MS;
  const prevResetAt = user.metadata?.lastResetAt
    ? new Date(user.metadata.lastResetAt).getTime()
    : null;

  if (prevResetAt && prevResetAt >= windowStart) {
    // Second reset within the window — log the event with a
    // conversation excerpt so admin can see what happened.
    const excerpt = await buildConversationExcerpt(user.id, 10);
    await logFeedback({
      user,
      source: SOURCE.IMPLICIT,
      triggerType: TRIGGER.RAPID_RESET,
      flow: FLOW.GENERAL,
      rating: RATING.ISSUES,
      comment: `User reset twice within ${Math.round((now - prevResetAt) / 60000)} minutes`,
      excerpt,
      state: user.state,
    });
  }

  // Record this reset's timestamp for the next check. We can't write
  // it alongside /reset's clear (because the clear wipes everything);
  // caller is expected to preserve lastResetAt across /reset.
  return now;
}

/**
 * Detect and log frustrated phrasing. Call from the router's early
 * text-message path. Silent (no user-visible action) — just records.
 *
 * `isFrustrated` may be passed in by the caller (the router uses a single
 * classifier call to populate frustration / help-escape / correction
 * flags at once). If omitted, we classify here.
 */
async function maybeLogFrustration(user, text, isFrustrated) {
  if (!user?.id || !text) return false;
  if (isTester(user)) return false;
  const flag = typeof isFrustrated === 'boolean' ? isFrustrated : await detectFrustratedPhrasing(text);
  if (!flag) return false;

  const excerpt = await buildConversationExcerpt(user.id, 6);
  await logFeedback({
    user,
    source: SOURCE.IMPLICIT,
    triggerType: TRIGGER.FRUSTRATED_PHRASING,
    flow: FLOW.GENERAL,
    rating: RATING.ISSUES,
    comment: text.slice(0, 500),
    excerpt,
    state: user.state,
  });
  return true;
}

/**
 * Proactive human-handoff offer. Called when correction-loop threshold
 * is hit OR help-escape phrasing is detected. Sends the 2-button row
 * "get a human" / "keep trying". Tap handler at the router level
 * flips humanTakeover=true on "yes".
 */
async function offerHumanHandoff(user, reason) {
  if (!user?.id) return;
  // Don't spam — if we already offered in the last 5 min, skip.
  const lastOffer = user.metadata?.lastHandoffOfferAt
    ? new Date(user.metadata.lastHandoffOfferAt).getTime()
    : 0;
  if (Date.now() - lastOffer < 5 * 60 * 1000) return;

  await updateUserMetadata(user.id, {
    lastHandoffOfferAt: new Date().toISOString(),
    handoffOfferReason: reason,
  });

  const body = reason === TRIGGER.HELP_ESCAPE
    ? "got it — want me to loop in a human? they'll jump in on this same thread."
    : "looks like I'm not getting this right — want me to loop in a human to help?";

  try {
    await sendInteractiveButtons(
      user.phone_number,
      body,
      [
        { id: 'fb_handoff_yes', title: "👋 Get a human" },
        { id: 'fb_handoff_no', title: "🔄 Keep trying" },
      ]
    );
    await logMessage(user.id, body, 'assistant');
  } catch (err) {
    logger.warn(`[FEEDBACK] Handoff offer failed: ${err.message}`);
  }
}

/**
 * Handle the handoff button taps. Returns { handled: true } if we
 * consumed the interaction.
 */
async function handleHandoffButton(user, message) {
  const btnId = message?.buttonId || message?.listId || '';
  if (btnId !== 'fb_handoff_yes' && btnId !== 'fb_handoff_no') {
    return { handled: false };
  }

  const reason = user.metadata?.handoffOfferReason || null;

  if (btnId === 'fb_handoff_yes') {
    // Enable takeover so the bot stops replying, surface in admin.
    await updateUserMetadata(user.id, {
      humanTakeover: true,
      handoffOfferReason: null,
      handoffAcceptedAt: new Date().toISOString(),
    });
    const body = "done — i've pinged the team, they'll reach out from this same chat soon. thanks for your patience 🙏";
    await sendTextMessage(user.phone_number, body);
    await logMessage(user.id, body, 'assistant');
    // Upgrade the existing handoff-offer feedback row to mark accepted.
    if (!isTester(user)) {
      const excerpt = await buildConversationExcerpt(user.id, 10);
      await logFeedback({
        user,
        source: SOURCE.IMPLICIT,
        triggerType: reason || TRIGGER.HELP_ESCAPE,
        flow: FLOW.GENERAL,
        rating: RATING.ISSUES,
        comment: 'User accepted human handoff',
        excerpt,
        state: user.state,
      });
    }
    logger.info(`[FEEDBACK] Human handoff accepted by ${user.phone_number} (reason=${reason || 'unknown'})`);
    return { handled: true };
  }

  // fb_handoff_no — user opted to keep going with the bot
  await updateUserMetadata(user.id, {
    handoffOfferReason: null,
    correctionLoopCount: 0, // reset — give the flow another chance
  });
  const body = "no worries, i'll keep at it. just tell me what to do differently.";
  await sendTextMessage(user.phone_number, body);
  await logMessage(user.id, body, 'assistant');
  return { handled: true };
}

module.exports = {
  isTester,
  logFeedback,
  scheduleDeliveryPrompt,
  handleFeedbackButton,
  handlePendingComment,
  maybeLogFrustration,
  bumpCorrectionLoop,
  recordResetAndMaybeFlag,
  offerHumanHandoff,
  handleHandoffButton,
  detectFrustratedPhrasing,
  detectHelpEscape,
  looksLikeCorrection,
  classifyFeedbackSignals,
  isFeedbackTrigger,
  startManualFeedback,
  FEEDBACK_BUTTON_IDS,
  TRIGGER,
  SOURCE,
  RATING,
  FLOW,
  CORRECTION_LOOP_THRESHOLD,
};
