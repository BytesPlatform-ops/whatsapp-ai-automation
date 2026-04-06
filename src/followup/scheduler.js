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
const { runWithChannel } = require('../messages/channelContext');
const { logMessage } = require('../db/conversations');
const { updateUserMetadata } = require('../db/users');
const { logger } = require('../utils/logger');
const { env } = require('../config/env');
const { STATES } = require('../conversation/states');

// Follow-up ladder keyed by step name → hours since last message (capped at 24h window)
const FOLLOWUP_LADDER = [
  { step: 'followup_2h', afterHours: 2 },
  { step: 'followup_6h', afterHours: 6 },
  { step: 'followup_12h', afterHours: 12 },
  { step: 'followup_24h', afterHours: 24 },
];

// Messages per step × personality mode
// Each step escalates in VALUE, not urgency (anti-pattern: chasing silence)
const FOLLOWUP_MESSAGES = {
  followup_2h: {
    COOL: "yo - just making sure you saw that last msg 👀",
    PROFESSIONAL: "Just following up on my last message. I'm here when you're ready.",
    UNSURE: "hey! just checking in - no rush at all, take your time 😊",
    NEGOTIATOR: "sent you the details. let me know.",
    DEFAULT: "Hey! Just checking in - I'm here whenever you're ready.",
  },
  followup_6h: {
    COOL: `hey! put together some examples i think you'd vibe with - ${env.portfolio?.website1 || ''} check it out and lmk what you think 🔥`,
    PROFESSIONAL: `I've prepared a few relevant examples for you: ${env.portfolio?.website1 || ''} - this is similar to what we'd build for your business. Shall I walk you through the approach?`,
    UNSURE: `hey! i found some examples that might help you picture what we'd build - ${env.portfolio?.website1 || ''} - no pressure, just wanted to share so you have a better idea 😊`,
    NEGOTIATOR: `got some examples ready. here's one: ${env.portfolio?.website1 || ''} - similar scope to what we discussed.`,
    DEFAULT: `I've got some examples from similar projects: ${env.portfolio?.website1 || ''} - want me to walk you through them?`,
  },
  followup_12h: {
    COOL: "hey just circling back - got some cool ideas for your project if you're still down 🤙",
    PROFESSIONAL: "Following up once more - I have some additional insights for your project when you have a moment.",
    UNSURE: "hey! no rush at all, just wanted to make sure you know I'm still here if you have any questions 😊",
    NEGOTIATOR: "circling back. let me know if you want to move forward.",
    DEFAULT: "Just wanted to follow up - I have some ideas that might interest you. Let me know when you're free!",
  },
  followup_24h: {
    COOL: "last one from me - if the project thing comes back up just hit me anytime 🤙",
    PROFESSIONAL: "Last message from me - if the project timeline changes, feel free to reach out anytime.",
    UNSURE: "hey! just my last check-in - whenever you're ready, just send a message and we'll pick right up where we left off 💛",
    NEGOTIATOR: "final follow-up. you know where to find me.",
    DEFAULT: "Last check-in from me - whenever you're ready, just message and we'll pick up where we left off.",
  },
};

/**
 * Determine which follow-up step (if any) a user is due for.
 * HOT leads get follow-ups sooner (first check at 1h instead of 2h).
 * COLD leads get follow-ups later (first check at 4h instead of 2h).
 * Returns the step object or null.
 */
function getNextFollowup(lastMessageAt, completedSteps, leadTemp = 'WARM') {
  const now = Date.now();
  const elapsedHours = (now - new Date(lastMessageAt).getTime()) / (1000 * 60 * 60);

  // Adjust timing based on lead temperature
  const timeMultiplier = leadTemp === 'HOT' ? 0.5 : leadTemp === 'COLD' ? 2 : 1;

  for (const rung of FOLLOWUP_LADDER) {
    const adjustedHours = rung.afterHours * timeMultiplier;
    if (elapsedHours >= adjustedHours && !completedSteps.includes(rung.step)) {
      return rung;
    }
  }
  return null;
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
      .select('id, phone_number, metadata, channel')
      .eq('state', STATES.SALES_CHAT);

    if (userErr) {
      logger.error('Followup: failed to query users', userErr);
      return;
    }

    if (!users || users.length === 0) return;

    for (const user of users) {
      const channel = user.channel || 'whatsapp';
      try {
        await runWithChannel(channel, () => processUserFollowup(user));
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
  const completedSteps = metadata.followupSteps || [];

  // Skip closed leads, converted customers, or opted-out users
  if (metadata.leadClosed) return;
  if (metadata.meetingBooked) return;
  if (metadata.paymentConfirmed) return;
  if (metadata.followupOptOut) return;

  // If all steps are done, skip
  if (completedSteps.length >= FOLLOWUP_LADDER.length) return;

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
          // Check if we already sent a reminder for this meeting
          const { data: user } = await supabase
            .from('users')
            .select('metadata')
            .eq('id', meeting.user_id)
            .single();

          const sentReminders = user?.metadata?.meetingRemindersSent || [];
          if (sentReminders.includes(meeting.id)) continue;

          // Send the reminder
          const displayTime = meeting.preferred_time;
          const displayDate = meeting.preferred_date;
          const topic = meeting.topic || 'your upcoming call';

          await runWithChannel(meeting.channel || 'whatsapp', () => sendTextMessage(
            meeting.phone_number,
            `Hey${meeting.name ? ' ' + meeting.name : ''}! Just a quick reminder - you have a call about *${topic}* in about 30 minutes (${displayTime}, ${displayDate}). Talk soon!`
          ));
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
 */
async function runPaymentPolling() {
  try {
    const { data: pending, error } = await supabase
      .from('payments')
      .select('id, user_id, phone_number, stripe_payment_link_id, amount, currency, service_type, package_tier, description, channel')
      .eq('status', 'pending')
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
        // Check Stripe for completed sessions on this payment link
        const sessions = await stripe.checkout.sessions.list({
          payment_link: payment.stripe_payment_link_id,
          limit: 5,
        });

        const paidSession = sessions.data.find(
          s => s.payment_status === 'paid' || s.status === 'complete'
        );

        if (!paidSession) continue;

        // Update DB
        await supabase.from('payments').update({
          status: 'paid',
          stripe_session_id: paidSession.id,
          stripe_payment_intent_id: paidSession.payment_intent,
          customer_email: paidSession.customer_details?.email || null,
          customer_name: paidSession.customer_details?.name || null,
          paid_at: new Date().toISOString(),
        }).eq('id', payment.id);

        // Send payment confirmation
        const amountDisplay = `$${(payment.amount / 100).toLocaleString()}`;
        await runWithChannel(payment.channel || 'whatsapp', () => sendTextMessage(
          payment.phone_number,
          `Payment of *${amountDisplay}* received! Thank you for choosing Bytes Platform.\n\n` +
            `*Package:* ${payment.description || payment.service_type}\n\n` +
            `Our team will be in touch shortly to kick things off. If you have any questions in the meantime, just message here.`
        ));
        await logMessage(payment.user_id, `Payment confirmed: ${amountDisplay} for ${payment.service_type}`, 'assistant');

        // Update user metadata
        await updateUserMetadata(payment.user_id, {
          paymentConfirmed: true,
          lastPaymentAmount: payment.amount,
          lastPaymentService: payment.service_type,
        });

        logger.info(`[PAYMENT] Confirmed payment from ${payment.phone_number}: ${amountDisplay} for ${payment.service_type}`);
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
  const paymentTimer = setInterval(runPaymentPolling, 2 * 60 * 1000);

  return { followupTimer, reminderTimer, paymentTimer };
}

module.exports = { startFollowupScheduler, runFollowupCycle, runMeetingReminders, runPaymentPolling };
