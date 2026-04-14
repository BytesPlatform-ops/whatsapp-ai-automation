const { sendEmail } = require('./email');
const { env } = require('../config/env');
const { renderLocalDateTime } = require('../booking/slots');

function publicBaseUrl() {
  return process.env.PUBLIC_API_BASE_URL || env.chatbot.baseUrl;
}

function fmt(a, tz) {
  return renderLocalDateTime(new Date(a.start_at), tz || 'Europe/Dublin');
}

async function sendCustomerBookingConfirmation({ appointment, site, settings }) {
  if (!appointment.customer_email) return false;
  const tz = settings?.timezone || 'Europe/Dublin';
  const cancelUrl = `${publicBaseUrl()}/api/booking/cancel/${appointment.cancel_token}`;
  const siteName = site.site_data?.businessName || 'Your appointment';
  const when = fmt(appointment, tz);

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222">
    <h2 style="margin:0 0 12px">You're booked! ✨</h2>
    <p>Hi ${appointment.customer_name},</p>
    <p>Your appointment at <strong>${siteName}</strong> is confirmed.</p>
    <div style="background:#faf8f6;border-radius:10px;padding:16px;margin:16px 0">
      <p style="margin:0"><strong>${appointment.service_name}</strong></p>
      <p style="margin:8px 0 0;color:#555">${when} (${tz})</p>
      <p style="margin:4px 0 0;color:#888;font-size:13px">${appointment.duration_minutes} min</p>
    </div>
    ${appointment.notes ? `<p style="color:#555"><em>Your note: ${appointment.notes}</em></p>` : ''}
    <p style="margin-top:24px">Need to cancel? <a href="${cancelUrl}" style="color:#c026d3">Cancel this appointment</a>. Free cancellation up to 24 hours before your slot.</p>
    <p style="color:#888;font-size:13px;margin-top:24px">See you soon!</p>
  </div>`;

  return sendEmail({
    to: appointment.customer_email,
    subject: `Booking confirmed — ${siteName}`,
    html,
  });
}

async function sendOwnerNewBookingAlert({ appointment, site, settings }) {
  const owner = site.site_data?.contactEmail;
  if (!owner) return false;
  const tz = settings?.timezone || 'Europe/Dublin';
  const siteName = site.site_data?.businessName || 'Salon';
  const when = fmt(appointment, tz);

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222">
    <h2 style="margin:0 0 12px">New booking</h2>
    <div style="background:#faf8f6;border-radius:10px;padding:16px;margin:16px 0">
      <p style="margin:0"><strong>${appointment.service_name}</strong> (${appointment.duration_minutes} min)</p>
      <p style="margin:8px 0 0;color:#555">${when} (${tz})</p>
    </div>
    <p><strong>Customer:</strong> ${appointment.customer_name}</p>
    ${appointment.customer_email ? `<p style="margin:4px 0">Email: <a href="mailto:${appointment.customer_email}">${appointment.customer_email}</a></p>` : ''}
    ${appointment.customer_phone ? `<p style="margin:4px 0">Phone: <a href="tel:${appointment.customer_phone}">${appointment.customer_phone}</a></p>` : ''}
    ${appointment.notes ? `<p style="margin-top:12px;color:#555"><em>Notes: ${appointment.notes}</em></p>` : ''}
    <p style="color:#888;font-size:13px;margin-top:24px">Booking ID: #${appointment.id} — ${siteName}</p>
  </div>`;

  return sendEmail({
    to: owner,
    subject: `New booking: ${appointment.customer_name} — ${appointment.service_name}`,
    html,
  });
}

async function sendCustomerCancellation({ appointment, site, settings }) {
  if (!appointment.customer_email) return false;
  const tz = settings?.timezone || 'Europe/Dublin';
  const siteName = site.site_data?.businessName || 'Salon';
  const when = fmt(appointment, tz);
  return sendEmail({
    to: appointment.customer_email,
    subject: `Cancellation confirmed — ${siteName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222">
        <h2>Appointment cancelled</h2>
        <p>Your ${appointment.service_name} on ${when} (${tz}) has been cancelled. Hope to see you another time!</p>
      </div>`,
  });
}

async function sendOwnerCancellationAlert({ appointment, site, settings }) {
  const owner = site.site_data?.contactEmail;
  if (!owner) return false;
  const tz = settings?.timezone || 'Europe/Dublin';
  const when = fmt(appointment, tz);
  return sendEmail({
    to: owner,
    subject: `Cancellation: ${appointment.customer_name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222">
        <p>${appointment.customer_name} cancelled their ${appointment.service_name} on ${when} (${tz}).</p>
        <p style="color:#888;font-size:13px">Booking #${appointment.id}</p>
      </div>`,
  });
}

async function sendCustomerReminder({ appointment, site, settings }) {
  if (!appointment.customer_email) return false;
  const tz = settings?.timezone || 'Europe/Dublin';
  const siteName = site.site_data?.businessName || 'Your appointment';
  const when = fmt(appointment, tz);
  const cancelUrl = `${publicBaseUrl()}/api/booking/cancel/${appointment.cancel_token}`;
  return sendEmail({
    to: appointment.customer_email,
    subject: `Reminder — ${siteName} tomorrow`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222">
        <h2>See you tomorrow!</h2>
        <p>Just a friendly reminder: you have <strong>${appointment.service_name}</strong> at ${siteName} on ${when} (${tz}).</p>
        <p>Can't make it? <a href="${cancelUrl}">Cancel here</a>.</p>
      </div>`,
  });
}

module.exports = {
  sendCustomerBookingConfirmation,
  sendOwnerNewBookingAlert,
  sendCustomerCancellation,
  sendOwnerCancellationAlert,
  sendCustomerReminder,
};
