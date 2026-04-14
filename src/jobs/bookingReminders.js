/**
 * Booking Reminders Job
 *
 * Sends a 24h-before email reminder to customers for confirmed salon appointments.
 * Uses the partial index on appointments(reminder_sent_at IS NULL) to scan cheaply.
 *
 * Runs every 15 minutes.
 */

const { supabase } = require('../config/database');
const { listPendingReminders, markReminderSent } = require('../db/appointments');
const { sendCustomerReminder } = require('../notifications/bookingEmails');
const { logger } = require('../utils/logger');

async function runBookingReminders() {
  try {
    // Window: appointments starting within the next 24h that haven't been reminded yet.
    // We want to hit each customer ~24h before, so we pull up to 24h ahead and send now.
    const due = await listPendingReminders(24);
    if (due.length === 0) return;

    // Batch-fetch the distinct sites for these appointments.
    const siteIds = [...new Set(due.map((a) => a.site_id))];
    const { data: sites } = await supabase
      .from('generated_sites')
      .select('id, site_data, booking_settings')
      .in('id', siteIds);
    const siteById = new Map((sites || []).map((s) => [s.id, s]));

    for (const appt of due) {
      const site = siteById.get(appt.site_id);
      if (!site) continue;
      const settings = site.booking_settings || {};
      const sent = await sendCustomerReminder({ appointment: appt, site, settings });
      if (sent) {
        await markReminderSent(appt.id);
      } else {
        // Skip marking so we retry on next run. But guard against endless retries
        // for appts with no email: mark those so we don't re-query forever.
        if (!appt.customer_email) await markReminderSent(appt.id);
      }
    }
    logger.info(`[REMINDERS] Processed ${due.length} pending reminders`);
  } catch (err) {
    logger.error('[REMINDERS] Run failed:', err.message);
  }
}

function startBookingReminders() {
  const INTERVAL = 15 * 60 * 1000; // 15 minutes
  setTimeout(() => {
    runBookingReminders().catch((err) => logger.error('[REMINDERS] Initial run error:', err.message));
  }, 45 * 1000);
  setInterval(() => {
    runBookingReminders().catch((err) => logger.error('[REMINDERS] Scheduled run error:', err.message));
  }, INTERVAL);
  logger.info('[REMINDERS] Booking reminders job started (interval: 15m)');
}

module.exports = { startBookingReminders, runBookingReminders };
