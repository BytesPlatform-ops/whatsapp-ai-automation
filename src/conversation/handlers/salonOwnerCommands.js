const { sendTextMessage } = require('../../messages/sender');
const { logMessage } = require('../../db/conversations');
const { getLatestSite } = require('../../db/sites');
const {
  getAppointmentsForSiteInRange,
  getAppointmentById,
  cancelAppointment,
} = require('../../db/appointments');
const { renderLocalDateTime } = require('../../booking/slots');
const {
  sendCustomerCancellation,
  sendOwnerCancellationAlert,
} = require('../../notifications/bookingEmails');
const { logger } = require('../../utils/logger');

// Matchers for the three v1 commands. Loose so users can type naturally.
const RE_BOOKINGS_TODAY = /^\s*(?:bookings?\s+today|today'?s?\s+bookings?)\s*$/i;
const RE_BOOKINGS = /^\s*bookings?\s*$/i;
const RE_CANCEL = /^\s*cancel\s+#?(\d+)\s*$/i;

function isSalonOwnerCommand(text) {
  if (!text || typeof text !== 'string') return false;
  return RE_BOOKINGS_TODAY.test(text) || RE_BOOKINGS.test(text) || RE_CANCEL.test(text);
}

async function loadOwnerSalonSite(user) {
  const site = await getLatestSite(user.id);
  if (!site || site.template_id !== 'salon') return null;
  if (site.booking_mode !== 'native') return null;
  return site;
}

function timezoneOf(site) {
  return site?.booking_settings?.timezone || 'Europe/Dublin';
}

function fmtAppointmentLine(a, tz) {
  const when = renderLocalDateTime(new Date(a.start_at), tz);
  const email = a.customer_email ? ` · ${a.customer_email}` : '';
  const phone = a.customer_phone ? ` · ${a.customer_phone}` : '';
  return `#${a.id} — ${when}: *${a.service_name}* (${a.duration_minutes}m) — ${a.customer_name}${email}${phone}`;
}

async function handleBookingsToday(user, site) {
  const tz = timezoneOf(site);
  // Today in the salon's tz = [local 00:00, local 24:00).
  const now = new Date();
  // Simplest correct window: from now-12h to now+36h, then filter by local date.
  const fromIso = new Date(now.getTime() - 12 * 3600 * 1000).toISOString();
  const toIso = new Date(now.getTime() + 36 * 3600 * 1000).toISOString();
  const all = await getAppointmentsForSiteInRange(site.id, fromIso, toIso);
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
  const today = all.filter((a) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(a.start_at)) === todayStr);
  if (today.length === 0) {
    await sendTextMessage(user.phone_number, 'No bookings today.');
    return;
  }
  const lines = today.map((a) => fmtAppointmentLine(a, tz));
  await sendTextMessage(user.phone_number, `📅 *Today's bookings* (${tz}):\n\n${lines.join('\n\n')}`);
}

async function handleBookings(user, site) {
  const tz = timezoneOf(site);
  const nowIso = new Date().toISOString();
  const endIso = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const list = await getAppointmentsForSiteInRange(site.id, nowIso, endIso);
  if (list.length === 0) {
    await sendTextMessage(user.phone_number, 'No bookings in the next 7 days.');
    return;
  }
  const lines = list.slice(0, 20).map((a) => fmtAppointmentLine(a, tz));
  const footer = list.length > 20 ? `\n\n…and ${list.length - 20} more.` : '';
  await sendTextMessage(
    user.phone_number,
    `📅 *Next 7 days* (${tz}):\n\n${lines.join('\n\n')}${footer}\n\nTo cancel: reply *cancel 123*.`
  );
}

async function handleCancel(user, site, idStr) {
  const id = parseInt(idStr, 10);
  const tz = timezoneOf(site);
  const appt = await getAppointmentById(id);
  if (!appt || appt.site_id !== site.id) {
    await sendTextMessage(user.phone_number, `No booking found with id #${id}.`);
    return;
  }
  if (appt.status !== 'confirmed') {
    await sendTextMessage(user.phone_number, `Booking #${id} is already ${appt.status}.`);
    return;
  }
  const cancelled = await cancelAppointment(id);
  if (!cancelled) {
    await sendTextMessage(user.phone_number, `Booking #${id} is already cancelled.`);
    return;
  }
  const when = renderLocalDateTime(new Date(cancelled.start_at), tz);
  await sendTextMessage(
    user.phone_number,
    `✅ Cancelled #${id}: ${cancelled.service_name} — ${cancelled.customer_name} on ${when}. The customer has been notified.`
  );
  // Notify customer + record an owner-side copy.
  sendCustomerCancellation({ appointment: cancelled, site, settings: site.booking_settings || {} }).catch((e) =>
    logger.error('[SALON-OWNER] customer cancel email failed:', e.message)
  );
  sendOwnerCancellationAlert({ appointment: cancelled, site, settings: site.booking_settings || {} }).catch(() => {});
}

/**
 * If `message` is a salon owner command and the user owns a salon site,
 * handle it and return true (caller should stop routing). Otherwise return false.
 */
async function tryHandleSalonOwnerCommand(user, message) {
  const text = (message.text || '').trim();
  if (!isSalonOwnerCommand(text)) return false;

  const site = await loadOwnerSalonSite(user);
  if (!site) return false; // User doesn't own a native-booking salon site.

  try {
    if (RE_BOOKINGS_TODAY.test(text)) {
      await handleBookingsToday(user, site);
      await logMessage(user.id, `Salon owner: bookings today (${site.id})`, 'assistant');
      return true;
    }
    const cancelMatch = text.match(RE_CANCEL);
    if (cancelMatch) {
      await handleCancel(user, site, cancelMatch[1]);
      await logMessage(user.id, `Salon owner: cancel ${cancelMatch[1]} (${site.id})`, 'assistant');
      return true;
    }
    if (RE_BOOKINGS.test(text)) {
      await handleBookings(user, site);
      await logMessage(user.id, `Salon owner: bookings (${site.id})`, 'assistant');
      return true;
    }
  } catch (err) {
    logger.error('[SALON-OWNER] command failed:', err);
    await sendTextMessage(user.phone_number, "Couldn't fetch bookings right now — try again in a moment.");
    return true;
  }
  return false;
}

module.exports = { tryHandleSalonOwnerCommand, isSalonOwnerCommand };
