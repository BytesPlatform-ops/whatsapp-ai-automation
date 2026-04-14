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
const { logger } = require('../utils/logger');
const { STATES } = require('../conversation/states');

// Follow-up ladder keyed by step name → hours since last message (capped at 24h window)
const FOLLOWUP_LADDER = [
  { step: 'followup_2h', afterHours: 2 },
  { step: 'followup_12h', afterHours: 12 },
  { step: 'followup_23h', afterHours: 23 },
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
  const completedSteps = metadata.followupSteps || [];

  // Skip closed leads, converted customers, or opted-out users
  if (metadata.leadClosed) return;
  if (metadata.meetingBooked) return;
  if (metadata.paymentConfirmed) return;
  if (metadata.followupOptOut) return;
  if (metadata.humanTakeover) return;

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
          // If the link can't be retrieved (deleted, etc.), mark the row as
          // superseded so we don't keep retrying forever.
          logger.warn(`[PAYMENT] Could not retrieve link ${payment.stripe_payment_link_id}: ${linkErr.message} — marking superseded`);
          await supabase
            .from('payments')
            .update({ status: 'superseded' })
            .eq('id', payment.id);
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

        // Update DB
        await supabase.from('payments').update({
          status: 'paid',
          stripe_session_id: paidSession.id,
          stripe_payment_intent_id: paidSession.payment_intent,
          customer_email: paidSession.customer_details?.email || null,
          customer_name: paidSession.customer_details?.name || null,
          paid_at: new Date().toISOString(),
        }).eq('id', payment.id);

        // SOURCE OF TRUTH for where to send the confirmation: the user record, NOT the
        // payment row. The payment.phone_number field can be stale (old test sessions,
        // prior number, etc.), and in some cases the scheduler would end up sending the
        // receipt to a different phone than the one currently having the conversation.
        const { data: paidUserRecord } = await supabase
          .from('users')
          .select('phone_number, channel, metadata, via_phone_number_id')
          .eq('id', payment.user_id)
          .single();
        const targetPhone = paidUserRecord?.phone_number || payment.phone_number;
        const targetChannel = paidUserRecord?.channel || payment.channel || 'whatsapp';
        const targetVia = paidUserRecord?.via_phone_number_id || null;
        if (paidUserRecord?.phone_number && paidUserRecord.phone_number !== payment.phone_number) {
          logger.warn(`[PAYMENT] Phone mismatch for payment ${payment.id}: payment row=${payment.phone_number}, user record=${paidUserRecord.phone_number}. Sending to user record.`);
        }

        // Send payment confirmation
        const amountDisplay = `$${(payment.amount / 100).toLocaleString()}`;
        const isWebsitePayment = /website|web/i.test(payment.service_type || '') || /website|web/i.test(payment.description || '');

        if (isWebsitePayment) {
          // Check if this is a domain payment (user already selected a domain)
          const meta = paidUserRecord?.metadata || {};
          const selectedDomain = meta.selectedDomain;
          const { getLatestSite: getSite } = require('../db/sites');
          const { updateSite } = require('../db/sites');

          await updateUserMetadata(payment.user_id, {
            paymentConfirmed: true,
            lastPaymentAmount: payment.amount,
            lastPaymentService: payment.service_type,
            paidAt: new Date().toISOString(),
          });

          if (selectedDomain && meta.domainPaymentPending) {
            // Domain payment confirmed — start auto-purchase flow
            await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, async () => {
              await sendTextMessage(
                targetPhone,
                `Payment of *${amountDisplay}* received! 🎉\n\n` +
                `Now setting up *${selectedDomain}* for your website — this usually takes a few minutes. I'll keep you updated!`
              );
            });
            await logMessage(payment.user_id, `Payment confirmed: ${amountDisplay} — starting domain setup for ${selectedDomain}`, 'assistant');

            // Auto-purchase domain
            const site = await getSite(payment.user_id);
            const netlifySubdomain = site?.netlify_subdomain || '';
            const netlifySiteId = site?.netlify_site_id || '';

            if (env.namecheap?.apiKey) {
              try {
                const { purchaseAndConfigureDomain } = require('../integrations/namecheap');
                const { addCustomDomainToNetlify } = require('../website-gen/deployer');

                // Progress update 1
                await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
                  sendTextMessage(targetPhone, `⏳ Registering *${selectedDomain}*...`)
                );

                const result = await purchaseAndConfigureDomain(selectedDomain, netlifySubdomain);

                if (result.success) {
                  // Add to Netlify
                  if (netlifySiteId) {
                    await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
                      sendTextMessage(targetPhone, `⏳ Configuring your website on *${selectedDomain}*...`)
                    );
                    try { await addCustomDomainToNetlify(netlifySiteId, selectedDomain); } catch (e) {
                      logger.error('[PAYMENT] Netlify domain add failed:', e.message);
                    }
                  }

                  if (site) await updateSite(site.id, { custom_domain: selectedDomain, status: 'domain_setup_complete' });
                  await updateUserMetadata(payment.user_id, {
                    domainPaymentPending: false,
                    domainStatus: 'purchased',
                    domainPurchasedAt: new Date().toISOString(),
                  });

                  await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
                    sendTextMessage(
                      targetPhone,
                      `✅ *${selectedDomain}* is registered and configured!\n\n` +
                      `DNS is propagating now — your site will be live at *${selectedDomain}* within 5-60 minutes. ` +
                      `HTTPS is set up automatically.\n\n` +
                      `I'll send you a message once it's fully live! 🚀`
                    )
                  );
                  await logMessage(payment.user_id, `Domain purchased and configured: ${selectedDomain}`, 'assistant');
                } else {
                  // Auto-purchase failed — fallback to manual
                  if (site) await updateSite(site.id, { custom_domain: selectedDomain, status: 'domain_setup_pending' });
                  await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
                    sendTextMessage(
                      targetPhone,
                      `Domain registration for *${selectedDomain}* needs manual setup (${result.error}). Our team will handle it within 2 business days — we'll keep you posted!`
                    )
                  );
                  await logMessage(payment.user_id, `Domain auto-purchase failed: ${result.error} — manual setup needed`, 'assistant');
                }
              } catch (err) {
                logger.error('[PAYMENT] Domain auto-purchase error:', err.message);
                if (site) await updateSite(site.id, { custom_domain: selectedDomain, status: 'domain_setup_pending' });
                await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
                  sendTextMessage(targetPhone, `Domain setup for *${selectedDomain}* is being handled by our team. We'll update you within 2 business days!`)
                );
              }
            } else {
              // No Namecheap API — manual flow
              if (site) await updateSite(site.id, { custom_domain: selectedDomain, status: 'domain_setup_pending' });
              await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
                sendTextMessage(
                  targetPhone,
                  `Payment received! Our team will set up *${selectedDomain}* for your website within 2 business days. We'll send you the live link once it's ready!`
                )
              );
            }
          } else {
            // Regular website payment (no domain selected)
            await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () => sendTextMessage(
              targetPhone,
              `Payment of *${amountDisplay}* received! Thank you for choosing Bytes Platform.\n\n` +
                `*Package:* ${payment.description || payment.service_type}\n\n` +
                `Your website is all set! Would you like to put it on your own custom domain?\n\n` +
                `Just say *"yes"* and I'll help you find one, or *"no"* if you're good for now.`
            ));
            await logMessage(payment.user_id, `Payment confirmed: ${amountDisplay}`, 'assistant');
            const { updateUserState } = require('../db/users');
            await updateUserState(payment.user_id, 'DOMAIN_OFFER');
          }
        } else {
          // Non-website payment — generic confirmation
          await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () => sendTextMessage(
            targetPhone,
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
        }

        // Send email notification to team
        try {
          const { sendPaymentNotification } = require('../notifications/email');
          const { getLatestSite } = require('../db/sites');
          const site = await getLatestSite(payment.user_id);
          await sendPaymentNotification({
            userName: paidSession.customer_details?.name || targetPhone,
            userPhone: targetPhone,
            userEmail: paidSession.customer_details?.email || '',
            amount: payment.amount / 100,
            serviceType: payment.service_type,
            description: payment.description,
            sitePreviewUrl: site?.preview_url || '',
            channel: targetChannel,
          });
        } catch (emailErr) {
          logger.error('[PAYMENT] Email notification failed:', emailErr.message);
        }

        logger.info(`[PAYMENT] Confirmed payment from ${targetPhone}: ${amountDisplay} for ${payment.service_type}`);
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
