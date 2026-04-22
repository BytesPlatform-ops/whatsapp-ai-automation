/**
 * Follow-Up Scheduler
 *
 * Periodically checks for stale sales conversations and sends
 * personality-appropriate follow-up messages per the v2 sales playbook.
 *
 * Timing ladder:
 *   2 hours  → gentle check-in
 *   24 hours → offer examples
 *   72 hours → final outreach
 *   7 days   → share recent project
 *
 * Each step is sent at most once (tracked in user metadata).
 */

const { supabase } = require('../config/database');
const { sendTextMessage } = require('../messages/sender');
const { runWithChannel, runWithContext } = require('../messages/channelContext');
const { logMessage } = require('../db/conversations');
const { updateUserMetadata } = require('../db/users');
const { handleConfirmedPayment } = require('../payments/postPayment');
const { logger } = require('../utils/logger');
const { STATES } = require('../conversation/states');

// Follow-up ladder keyed by step name → hours since last message (capped at 24h window)
const FOLLOWUP_LADDER = [
  { step: 'followup_2h', afterHours: 2 },
  { step: 'followup_12h', afterHours: 12 },
  { step: 'followup_23h', afterHours: 23 },
];

// SEO-audit leads get their own ladder. The existing website ladder pitches a
// $100 payment / domain — wrong message for someone who only ran an audit.
// One gentle nudge at ~24h quoting their biggest-opportunity item, then we
// stop. Kept short on purpose: SEO buyers tend to be comparison-shoppers and
// a heavy follow-up cascade reads as desperate.
const SEO_FOLLOWUP_LADDER = [
  { step: 'seo_followup_24h', afterHours: 24 },
];

// Messages per step × personality mode
const FOLLOWUP_MESSAGES = {
  followup_2h: {
    COOL: "hey! just checking — did you get a chance to look at the payment link? your site is ready to go live whenever you are 🔥",
    PROFESSIONAL: "Just checking in — did you have any questions about getting your website live? Happy to help.",
    UNSURE: "hey! just wanted to check — everything good? your website is ready to go live whenever you want 😊",
    NEGOTIATOR: "payment link still open. your site is ready. let me know.",
    DEFAULT: "Hey! Just checking in — did you get a chance to look at the payment link? Your site is ready to go live!",
  },
  followup_12h: {
    COOL: "yo your preview site is still up — $100 gets it live on your own domain, everything included. or i can split it if that helps 🤙",
    PROFESSIONAL: "Your website preview is still available. It's $100 total including your custom domain. We can also split the payment if that works better.",
    UNSURE: "hey! your website is still saved — just $100 to get it live with your own domain, everything included. we can split the payment too! 😊",
    NEGOTIATOR: "site's still up. $100 total, domain included. can split if needed. want the link?",
    DEFAULT: "Your preview site is still up — $100 gets it live on your own domain, everything included!",
  },
  followup_23h: {
    COOL: "last call — i can do $80 total instead of $100. domain still included. want me to send a new link? 👀",
    PROFESSIONAL: "Final follow-up — I can offer $80 total (normally $100), domain included. Shall I send a new payment link?",
    UNSURE: "hey! last message from me — got approval to do $80 total (normally $100), domain included. want the link? 😊",
    NEGOTIATOR: "last offer — $80 total. domain included. can't go lower. link?",
    DEFAULT: "Last chance — $80 total instead of $100, domain included. Want a new payment link?",
  },
};

/**
 * Determine which follow-up step (if any) a user is due for.
 * HOT leads get follow-ups sooner (first check at 1h instead of 2h).
 * COLD leads get follow-ups later (first check at 4h instead of 2h).
 * Returns the step object or null.
 */
function getNextFollowup(lastMessageAt, completedSteps, leadTemp = 'WARM', ladder = FOLLOWUP_LADDER) {
  const now = Date.now();
  const elapsedHours = (now - new Date(lastMessageAt).getTime()) / (1000 * 60 * 60);

  // Adjust timing based on lead temperature
  const timeMultiplier = leadTemp === 'HOT' ? 0.5 : leadTemp === 'COLD' ? 2 : 1;

  for (const rung of ladder) {
    const adjustedHours = rung.afterHours * timeMultiplier;
    if (elapsedHours >= adjustedHours && !completedSteps.includes(rung.step)) {
      return rung;
    }
  }
  return null;
}

/**
 * Render the SEO-silence follow-up for a given personality, quoting the
 * audit's top-fix item if we have one on file. When the top fix is missing
 * (older audits, extraction failure) we fall back to a generic pitch.
 */
function renderSeoFollowupMessage(personalityMode, topFix, url) {
  const mode = (personalityMode || '').toUpperCase();
  const hasFix = Boolean(topFix && topFix.trim());
  const fix = hasFix ? topFix.trim() : '';
  const site = url ? ` for ${url}` : '';

  if (mode === 'COOL') {
    return hasFix
      ? `yo — you saw that audit${site} right? biggest thing was *${fix}*. i can knock out the top 5 fixes from the report for $200 if you wanna ship them fast 🔧`
      : `yo — you saw that audit${site} right? i can handle the top 5 fixes from the report for $200 if you wanna ship them fast 🔧`;
  }
  if (mode === 'PROFESSIONAL') {
    return hasFix
      ? `Quick follow-up on your SEO audit${site}. The biggest opportunity I flagged was *${fix}*. I can handle the top 5 fixes from the report for $200 — want me to put the details together?`
      : `Quick follow-up on your SEO audit${site}. I can handle the top 5 fixes from the report for $200 — want me to put the details together?`;
  }
  if (mode === 'UNSURE') {
    return hasFix
      ? `hey! following up on your audit${site} — the main thing that stood out was *${fix}*. happy to handle the top 5 fixes for $200 if you'd like. no pressure at all 😊`
      : `hey! following up on your audit${site} — happy to handle the top 5 fixes from the report for $200 if you'd like. no pressure at all 😊`;
  }
  if (mode === 'NEGOTIATOR') {
    return hasFix
      ? `audit follow-up${site}. biggest fix: *${fix}*. $200 for the top 5 from the report. yes or no?`
      : `audit follow-up${site}. $200 for the top 5 fixes from the report. yes or no?`;
  }
  return hasFix
    ? `Following up on your SEO audit${site} — *${fix}* was the biggest opportunity I flagged. Want me to handle the top 5 fixes from the report for $200?`
    : `Following up on your SEO audit${site} — want me to handle the top 5 fixes from the report for $200?`;
}

/**
 * Pick the right message variant for this user's detected personality.
 */
function pickMessage(step, personalityMode) {
  const variants = FOLLOWUP_MESSAGES[step];
  if (!variants) return null;
  const mode = (personalityMode || '').toUpperCase();
  return variants[mode] || variants.DEFAULT;
}

/**
 * Run one pass of the follow-up check.
 * Queries all users in SALES_CHAT state, finds the most recent assistant
 * message timestamp, and sends the appropriate follow-up if due.
 */
async function runFollowupCycle() {
  try {
    // Get all users currently in the sales chat state
    const { data: users, error: userErr } = await supabase
      .from('users')
      .select('id, phone_number, metadata, channel, via_phone_number_id')
      .eq('state', STATES.SALES_CHAT);

    if (userErr) {
      logger.error('Followup: failed to query users', userErr);
      return;
    }

    if (!users || users.length === 0) return;

    for (const user of users) {
      // Skip Messenger/Instagram — Meta blocks messages outside the 24h interaction window
      const channel = user.channel || 'whatsapp';
      if (channel === 'messenger' || channel === 'instagram') continue;

      try {
        // Reply on whichever of our WhatsApp numbers the user originally
        // messaged, not the env default — avoids surfacing a brand-new thread
        // from an unfamiliar business number.
        await runWithContext(
          { channel, phoneNumberId: user.via_phone_number_id || null },
          () => processUserFollowup(user)
        );
      } catch (err) {
        logger.error(`Followup: error processing user ${user.phone_number}`, err.response?.data || err.message);
      }
    }
  } catch (err) {
    logger.error('Followup: cycle error', err);
  }
}

async function processUserFollowup(user) {
  const metadata = user.metadata || {};

  // Skip closed leads, converted customers, or opted-out users
  if (metadata.leadClosed) return;
  if (metadata.meetingBooked) return;
  if (metadata.paymentConfirmed) return;
  if (metadata.followupOptOut) return;
  if (metadata.humanTakeover) return;

  // HOT leads that went silent get faster follow-up (check at 1h instead of 2h)
  const leadTemp = metadata.leadTemperature || 'WARM';

  // Get the timestamp of the last message from the user (not bot)
  const { data: lastMsg, error: msgErr } = await supabase
    .from('conversations')
    .select('created_at')
    .eq('user_id', user.id)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (msgErr || !lastMsg) return;

  // SEO-audit branch: a user who ran an audit but didn't cross over into the
  // website/domain purchase flow gets the SEO ladder, not the website one.
  // We use `selectedDomain` as the signal that they've moved to the website
  // track — once they pick a domain the normal website ladder takes over.
  const isSeoLead = metadata.seoAuditTriggered && !metadata.selectedDomain;
  if (isSeoLead) {
    const seoCompleted = metadata.seoFollowupSteps || [];
    if (seoCompleted.length >= SEO_FOLLOWUP_LADDER.length) return;

    const nextSeoStep = getNextFollowup(lastMsg.created_at, seoCompleted, leadTemp, SEO_FOLLOWUP_LADDER);
    if (!nextSeoStep) return;

    const personality = metadata.leadBrief
      ? extractPersonalityFromBrief(metadata.leadBrief)
      : (metadata.personalityMode || 'DEFAULT');

    const message = renderSeoFollowupMessage(personality, metadata.seoTopFix, metadata.lastSeoUrl);

    logger.info(`Followup: sending ${nextSeoStep.step} to ${user.phone_number} (mode: ${personality}, temp: ${leadTemp}, topFix: "${metadata.seoTopFix || ''}")`);

    await sendTextMessage(user.phone_number, message);
    await logMessage(user.id, message, 'assistant');

    await updateUserMetadata(user.id, {
      seoFollowupSteps: [...seoCompleted, nextSeoStep.step],
    });
    return;
  }

  const completedSteps = metadata.followupSteps || [];

  // If all steps are done, skip
  if (completedSteps.length >= FOLLOWUP_LADDER.length) return;

  const nextStep = getNextFollowup(lastMsg.created_at, completedSteps, leadTemp);
  if (!nextStep) return;

  // Detect personality from lead brief or metadata
  const personality = metadata.leadBrief
    ? extractPersonalityFromBrief(metadata.leadBrief)
    : (metadata.personalityMode || 'DEFAULT');

  const message = pickMessage(nextStep.step, personality);
  if (!message) return;

  logger.info(`Followup: sending ${nextStep.step} to ${user.phone_number} (mode: ${personality}, temp: ${leadTemp})`);

  await sendTextMessage(user.phone_number, message);
  await logMessage(user.id, message, 'assistant');

  // For the 23h step, also send a discounted payment link
  if (nextStep.step === 'followup_23h' && !metadata.paymentConfirmed) {
    try {
      const { createPaymentLink } = require('../payments/stripe');
      const { sendCTAButton } = require('../messages/sender');
      const { env: appEnv } = require('../config/env');
      // $50 upfront (discounted from $60) — domain included
      const discountUpfront = metadata.selectedDomain ? 50 : 80;
      const description = metadata.selectedDomain
        ? `Website + domain (${metadata.selectedDomain}) — discount`
        : 'Website — limited time discount';
      if (appEnv.stripe.secretKey) {
        const result = await createPaymentLink({
          userId: user.id,
          phoneNumber: user.phone_number,
          amount: discountUpfront,
          serviceType: 'website',
          packageTier: 'discount',
          description,
          customerName: user.name || '',
        });
        await sendCTAButton(user.phone_number, `Tap below to pay $${discountUpfront}`, `💳 Pay $${discountUpfront}`, result.url);
        await logMessage(user.id, `Discount payment link sent: $${discountUpfront}`, 'assistant');
        logger.info(`[FOLLOWUP] $${discountUpfront} discount payment link sent to ${user.phone_number}`);
      }
    } catch (err) {
      logger.error(`[FOLLOWUP] Failed to send $80 payment link:`, err.message);
    }
  }

  // Mark this step as completed
  await updateUserMetadata(user.id, {
    followupSteps: [...completedSteps, nextStep.step],
  });
}

/**
 * Extract personality mode from the lead brief string.
 */
function extractPersonalityFromBrief(brief) {
  const match = brief.match(/Personality mode:\s*(COOL|PROFESSIONAL|UNSURE|NEGOTIATOR)/i);
  return match ? match[1].toUpperCase() : 'DEFAULT';
}

/**
 * Meeting Reminder System
 *
 * Checks for confirmed meetings happening within the next 30-60 minutes
 * and sends a WhatsApp reminder to the user.
 * Tracked via metadata.meetingRemindersSent to avoid duplicates.
 */
async function runMeetingReminders() {
  try {
    const { data: meetings, error } = await supabase
      .from('meetings')
      .select('id, user_id, phone_number, name, preferred_date, preferred_time, preferred_timezone, topic, channel')
      .eq('status', 'confirmed');

    if (error || !meetings || meetings.length === 0) return;

    const now = new Date();

    for (const meeting of meetings) {
      try {
        if (!meeting.preferred_date || !meeting.preferred_time) continue;

        // Parse the meeting datetime
        const timeStr = meeting.preferred_time.replace(/\s*(AM|PM)/i, ' $1').trim();
        const meetingDateStr = `${meeting.preferred_date} ${timeStr}`;
        const meetingDate = new Date(meetingDateStr);

        // If parsing failed, try alternative format
        if (isNaN(meetingDate.getTime())) continue;

        const diffMs = meetingDate.getTime() - now.getTime();
        const diffMins = diffMs / (1000 * 60);

        // Send reminder if meeting is 25-35 minutes away (catches the 30-min window)
        if (diffMins >= 25 && diffMins <= 35) {
          // Check if we already sent a reminder for this meeting + pick up
          // the line this user messages on so the reminder goes back there.
          const { data: user } = await supabase
            .from('users')
            .select('metadata, via_phone_number_id')
            .eq('id', meeting.user_id)
            .single();

          const sentReminders = user?.metadata?.meetingRemindersSent || [];
          if (sentReminders.includes(meeting.id)) continue;

          // Send the reminder
          const displayTime = meeting.preferred_time;
          const displayDate = meeting.preferred_date;
          const topic = meeting.topic || 'your upcoming call';

          await runWithContext(
            { channel: meeting.channel || 'whatsapp', phoneNumberId: user?.via_phone_number_id || null },
            () => sendTextMessage(
              meeting.phone_number,
              `Hey${meeting.name ? ' ' + meeting.name : ''}! Just a quick reminder - you have a call about *${topic}* in about 30 minutes (${displayTime}, ${displayDate}). Talk soon!`
            )
          );
          await logMessage(meeting.user_id, `Meeting reminder sent for ${displayDate} at ${displayTime}`, 'assistant');

          // Mark as sent
          await updateUserMetadata(meeting.user_id, {
            meetingRemindersSent: [...sentReminders, meeting.id],
          });

          logger.info(`[REMINDER] Sent meeting reminder to ${meeting.phone_number} for ${displayDate} at ${displayTime}`);
        }
      } catch (err) {
        logger.error(`[REMINDER] Error processing meeting ${meeting.id}:`, err.message);
      }
    }
  } catch (err) {
    logger.error('[REMINDER] Meeting reminder cycle error:', err.message);
  }
}

/**
 * Payment Confirmation System
 *
 * Polls Stripe for pending payments every 2 minutes.
 * When a payment is detected as paid, sends a WhatsApp confirmation
 * and updates the DB record.
 *
 * Two safety rails to prevent ghost receipts from stale dev/test payments:
 *   1. Only poll payments created in the last PAYMENT_POLL_MAX_AGE_HOURS hours.
 *   2. Auto-expire anything older so it stops getting polled forever.
 */
const PAYMENT_POLL_MAX_AGE_HOURS = 48;

async function runPaymentPolling() {
  try {
    // STEP 1: Auto-expire pending rows that are too old to still be legitimate.
    // If a user was going to pay, they would have done it within 48 hours.
    // Leaving them as 'pending' means the poller keeps pinging Stripe forever
    // and ghost confirmations can fire if the link gets paid much later (e.g.
    // during unrelated dev testing on another account).
    const ageCutoff = new Date(Date.now() - PAYMENT_POLL_MAX_AGE_HOURS * 60 * 60 * 1000).toISOString();
    const { error: expireError, count: expiredCount } = await supabase
      .from('payments')
      .update({ status: 'expired' }, { count: 'exact' })
      .eq('status', 'pending')
      .lt('created_at', ageCutoff);
    if (expireError) {
      logger.warn(`[PAYMENT] Failed to auto-expire stale pending payments: ${expireError.message}`);
    } else if (expiredCount && expiredCount > 0) {
      logger.info(`[PAYMENT] Auto-expired ${expiredCount} stale pending payment(s) older than ${PAYMENT_POLL_MAX_AGE_HOURS}h`);
    }

    // STEP 2: Only look at FRESH pending payments.
    const { data: pending, error } = await supabase
      .from('payments')
      .select('id, user_id, phone_number, stripe_payment_link_id, amount, currency, service_type, package_tier, description, channel, created_at')
      .eq('status', 'pending')
      .gte('created_at', ageCutoff)
      .not('stripe_payment_link_id', 'is', null);

    if (error || !pending || pending.length === 0) return;

    let stripe;
    try {
      const { env: envConfig } = require('../config/env');
      if (!envConfig.stripe.secretKey) return;
      const Stripe = require('stripe');
      stripe = new Stripe(envConfig.stripe.secretKey);
    } catch {
      return; // Stripe not configured
    }

    for (const payment of pending) {
      try {
        // Safety rail: if the Stripe payment link has already been deactivated
        // (e.g. by cancelPendingPaymentsForUser when a new link was issued),
        // treat this row as superseded and stop polling it. This prevents a
        // ghost receipt firing from a stale dev test link that someone paid
        // long ago.
        try {
          const linkObj = await stripe.paymentLinks.retrieve(payment.stripe_payment_link_id);
          if (linkObj && linkObj.active === false) {
            await supabase
              .from('payments')
              .update({ status: 'superseded' })
              .eq('id', payment.id);
            logger.info(`[PAYMENT] Skipping inactive Stripe link ${payment.stripe_payment_link_id} (row ${payment.id}) — marked superseded`);
            continue;
          }
        } catch (linkErr) {
          // Only mark superseded when Stripe EXPLICITLY says the link is
          // gone (resource_missing). Rate limits, transient 503s, or
          // network blips during a deploy restart should not flip the
          // payment to a terminal state — we'll retry next cycle. A prior
          // version of this handler marked any error as superseded, which
          // killed perfectly valid pending payments whenever Stripe or the
          // network hiccupped.
          const isGone =
            linkErr?.statusCode === 404 ||
            linkErr?.code === 'resource_missing' ||
            linkErr?.raw?.code === 'resource_missing';
          if (isGone) {
            logger.warn(`[PAYMENT] Link ${payment.stripe_payment_link_id} gone at Stripe (${linkErr.message}) — marking row ${payment.id} superseded`);
            await supabase
              .from('payments')
              .update({ status: 'superseded' })
              .eq('id', payment.id);
            continue;
          }
          logger.warn(`[PAYMENT] Transient error retrieving link ${payment.stripe_payment_link_id}: ${linkErr.message} — leaving pending, will retry`);
          continue;
        }

        // Check Stripe for completed sessions on this payment link
        const sessions = await stripe.checkout.sessions.list({
          payment_link: payment.stripe_payment_link_id,
          limit: 5,
        });

        const paidSession = sessions.data.find(
          s => s.payment_status === 'paid' || s.status === 'complete'
        );

        if (!paidSession) continue;

        // Hand off to the shared post-payment handler (same code path the
        // Stripe webhook uses). Idempotent — if the webhook already fired
        // for this same session and processed it, handleConfirmedPayment
        // detects payment.status === 'paid' and short-circuits.
        await handleConfirmedPayment(payment, paidSession);
      } catch (err) {
        logger.error(`[PAYMENT] Error checking payment ${payment.id}:`, err.message);
      }
    }
  } catch (err) {
    logger.error('[PAYMENT] Payment polling cycle error:', err.message);
  }
}

/**
 * Start the follow-up scheduler. Runs every `intervalMs` (default 30 minutes).
 * Also runs meeting reminders every 5 minutes and payment polling every 2 minutes.
 */
function startFollowupScheduler(intervalMs = 30 * 60 * 1000) {
  logger.info(`Follow-up scheduler started (interval: ${intervalMs / 60000} min)`);
  logger.info('Meeting reminder checker started (interval: 5 min)');
  logger.info('Payment polling started (interval: 2 min)');

  // Run once immediately, then on interval
  runFollowupCycle();
  runMeetingReminders();
  runPaymentPolling();

  const followupTimer = setInterval(runFollowupCycle, intervalMs);
  const reminderTimer = setInterval(runMeetingReminders, 5 * 60 * 1000);
  // Payment polling is now a FALLBACK — the primary path is the Stripe
  // webhook (src/payments/stripeWebhook.js) which confirms payments in
  // ~1-2 seconds. We still poll every 15 minutes to catch anything the
  // webhook missed (Render briefly down during a deploy, Stripe
  // temporary delivery failure). handleConfirmedPayment is idempotent,
  // so running both is safe — whichever fires second is a no-op.
  const paymentTimer = setInterval(runPaymentPolling, 15 * 60 * 1000);

  return { followupTimer, reminderTimer, paymentTimer };
}

module.exports = { startFollowupScheduler, runFollowupCycle, runMeetingReminders, runPaymentPolling };
