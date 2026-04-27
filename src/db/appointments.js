const crypto = require('crypto');
const { supabase } = require('../config/database');

function newCancelToken() {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Insert an appointment. Relies on the partial unique index
 * (site_id, start_at) WHERE status='confirmed' to prevent double-booking.
 * Returns { appointment } on success or { conflict: true } if the slot is taken.
 */
async function createAppointment({
  siteId,
  serviceName,
  durationMinutes,
  startAt,
  endAt,
  customerName,
  customerEmail,
  customerPhone,
  notes,
  consentGiven,
  consentAt,
}) {
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      site_id: siteId,
      service_name: serviceName,
      duration_minutes: durationMinutes,
      start_at: startAt,
      end_at: endAt,
      customer_name: customerName,
      customer_email: customerEmail || null,
      customer_phone: customerPhone || null,
      notes: notes || null,
      status: 'confirmed',
      cancel_token: newCancelToken(),
      consent_given: !!consentGiven,
      consent_at: consentAt || (consentGiven ? new Date().toISOString() : null),
    })
    .select()
    .single();

  if (error) {
    // Unique index violation → slot already booked.
    if (error.code === '23505') return { conflict: true };
    throw new Error(`Failed to create appointment: ${error.message}`);
  }
  return { appointment: data };
}

async function getAppointmentsForSiteInRange(siteId, fromIso, toIso) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('site_id', siteId)
    .eq('status', 'confirmed')
    .gte('start_at', fromIso)
    .lt('start_at', toIso)
    .order('start_at', { ascending: true });

  if (error) throw new Error(`Failed to list appointments: ${error.message}`);
  return data || [];
}

async function getAppointmentById(id) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', id)
    .single();
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch appointment: ${error.message}`);
  }
  return data || null;
}

async function getAppointmentByCancelToken(token) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('cancel_token', token)
    .single();
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch appointment: ${error.message}`);
  }
  return data || null;
}

async function cancelAppointment(id) {
  const { data, error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'confirmed')
    .select()
    .single();
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to cancel appointment: ${error.message}`);
  }
  return data || null;
}

/**
 * Pending 24h-ahead reminders: confirmed, not yet reminded, starting within
 * [now, now+window]. The reminder job calls this with window=24h.
 */
async function listPendingReminders(windowHours = 24) {
  const nowIso = new Date().toISOString();
  const endIso = new Date(Date.now() + windowHours * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('status', 'confirmed')
    .is('reminder_sent_at', null)
    .gte('start_at', nowIso)
    .lte('start_at', endIso)
    .order('start_at', { ascending: true });
  if (error) throw new Error(`Failed to list pending reminders: ${error.message}`);
  return data || [];
}

async function markReminderSent(id) {
  const { error } = await supabase
    .from('appointments')
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Failed to mark reminder sent: ${error.message}`);
}

module.exports = {
  createAppointment,
  getAppointmentsForSiteInRange,
  getAppointmentById,
  getAppointmentByCancelToken,
  cancelAppointment,
  listPendingReminders,
  markReminderSent,
};
