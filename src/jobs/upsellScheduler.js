/**
 * Post-Sale Upsell Email Scheduler
 *
 * Sends automated upsell emails to customers at:
 *   Day 7  → Google Business Profile setup
 *   Day 30 → SEO package
 *   Day 60 → WhatsApp chat widget
 *   Day 90 → Site refresh / annual redesign
 *
 * Runs once daily. Tracks sent emails in user metadata to prevent duplicates.
 */

const { supabase } = require('../config/database');
const { sendUpsellEmail } = require('../notifications/email');
const { logger } = require('../utils/logger');

const UPSELL_SCHEDULE = [
  { day: 7, type: 'day7' },
  { day: 30, type: 'day30' },
  { day: 60, type: 'day60' },
  { day: 90, type: 'day90' },
];

async function runUpsellCycle() {
  try {
    // Get all users who have paid and have an email
    const { data: payments, error } = await supabase
      .from('payments')
      .select('user_id, phone_number, paid_at, customer_email, customer_name')
      .eq('status', 'paid')
      .not('paid_at', 'is', null)
      .not('customer_email', 'is', null);

    if (error) {
      logger.error('[UPSELL] Failed to query payments:', error.message);
      return;
    }

    if (!payments || payments.length === 0) return;

    // Deduplicate by user_id (take the earliest paid_at)
    const userMap = {};
    for (const p of payments) {
      if (!p.customer_email) continue;
      if (!userMap[p.user_id] || new Date(p.paid_at) < new Date(userMap[p.user_id].paid_at)) {
        userMap[p.user_id] = p;
      }
    }

    const now = Date.now();

    for (const userId of Object.keys(userMap)) {
      const payment = userMap[userId];
      const daysSincePaid = Math.floor((now - new Date(payment.paid_at).getTime()) / (1000 * 60 * 60 * 24));

      // Get user metadata to check which emails were already sent
      const { data: user } = await supabase
        .from('users')
        .select('metadata')
        .eq('id', userId)
        .single();

      const metadata = user?.metadata || {};
      const sentEmails = metadata.upsellEmailsSent || [];

      for (const upsell of UPSELL_SCHEDULE) {
        // Check if it's time and not already sent
        if (daysSincePaid >= upsell.day && !sentEmails.includes(upsell.type)) {
          try {
            const sent = await sendUpsellEmail({
              toEmail: payment.customer_email,
              userName: payment.customer_name || '',
              type: upsell.type,
            });

            if (sent) {
              // Mark as sent
              await supabase
                .from('users')
                .update({
                  metadata: {
                    ...metadata,
                    upsellEmailsSent: [...sentEmails, upsell.type],
                  },
                })
                .eq('id', userId);

              logger.info(`[UPSELL] Sent ${upsell.type} email to ${payment.customer_email} (${payment.phone_number})`);
            }
          } catch (err) {
            logger.error(`[UPSELL] Failed to send ${upsell.type} to ${payment.customer_email}:`, err.message);
          }
        }
      }
    }
  } catch (err) {
    logger.error('[UPSELL] Cycle error:', err.message);
  }
}

/**
 * Start the upsell scheduler. Runs once daily.
 */
function startUpsellScheduler() {
  const INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

  // Run once on startup (after a short delay)
  setTimeout(() => {
    runUpsellCycle().catch(err => logger.error('[UPSELL] Initial run error:', err.message));
  }, 30000); // 30s delay after server start

  setInterval(() => {
    runUpsellCycle().catch(err => logger.error('[UPSELL] Scheduled run error:', err.message));
  }, INTERVAL);

  logger.info('[UPSELL] Upsell email scheduler started (interval: 24h)');
}

module.exports = { startUpsellScheduler };
