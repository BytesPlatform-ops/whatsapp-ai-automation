const { sendEmail } = require('./email');
const { env } = require('../config/env');
const { renderLocalDateTime } = require('../booking/slots');

function publicBaseUrl() {
  return process.env.PUBLIC_API_BASE_URL || env.chatbot.baseUrl;
}

function fmt(a, tz) {
  return renderLocalDateTime(new Date(a.start_at), tz || 'Europe/Dublin');
}

/**
 * Safe, email-client-tolerant HTML. Inline styles only (no <style> or <link>);
 * Georgia as the display serif fallback since Cormorant Garamond won't load
 * in most mail clients. Table-based layout where centering matters.
 */
function shell({ accent = '#1F2937', bodyHtml, preheader = '' }) {
  const display = `'Cormorant Garamond','Playfair Display',Georgia,'Times New Roman',serif`;
  const body = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FBF6EC;font-family:${body};color:#0E0D0C;-webkit-font-smoothing:antialiased">
  <span style="display:none;opacity:0;visibility:hidden;height:0;width:0;max-height:0;max-width:0;overflow:hidden;font-size:1px;color:#FBF6EC">${preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FBF6EC">
    <tr><td align="center" style="padding:40px 16px">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#FFFBF3;border:1px solid #E8DFD2">
        <tr><td style="height:6px;background:${accent};font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="padding:48px 44px 16px;font-family:${body};font-size:11px;letter-spacing:0.42em;text-transform:uppercase;color:#8A7F74;font-weight:500">— ${preheader || ''} —</td></tr>
        ${bodyHtml.replace('__DISPLAY__', display).replace('__BODY__', body).replace('__ACCENT__', accent)}
      </table>
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;margin-top:14px">
        <tr><td align="center" style="padding:14px;font-family:${body};font-size:11px;color:#8A7F74;letter-spacing:0.14em">This email was sent by your salon's booking system.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function brandColor(site) {
  return site?.site_data?.primaryColor || '#1F2937';
}

function siteName(site) {
  return site?.site_data?.businessName || 'Your salon';
}

function siteAddress(site) {
  return site?.site_data?.contactAddress || '';
}

async function sendCustomerBookingConfirmation({ appointment, site, settings }) {
  if (!appointment.customer_email) return false;
  const tz = settings?.timezone || 'Europe/Dublin';
  const cancelUrl = `${publicBaseUrl()}/api/booking/cancel/${appointment.cancel_token}`;
  const when = fmt(appointment, tz);
  const accent = brandColor(site);
  const name = siteName(site);
  const addr = siteAddress(site);

  const body = `
    <tr><td style="padding:6px 44px 4px"><h1 style="margin:0;font-family:__DISPLAY__;font-weight:500;font-size:44px;line-height:1.05;letter-spacing:-0.01em;color:#0E0D0C">Thank you<span style="color:${accent}">.</span></h1></td></tr>
    <tr><td style="padding:18px 44px 6px;font-family:__BODY__;font-size:15px;line-height:1.7;color:#3a3530;font-weight:300">Dear ${appointment.customer_name}, your reservation at <strong style="font-weight:500;color:#0E0D0C">${name}</strong> is confirmed. We look forward to seeing you.</td></tr>
    <tr><td style="padding:28px 44px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FBF6EC;border:1px solid #E8DFD2">
        <tr><td style="padding:26px 28px">
          <p style="margin:0;font-family:__BODY__;font-size:10px;letter-spacing:0.34em;text-transform:uppercase;color:#8A7F74;font-weight:500">Treatment</p>
          <p style="margin:6px 0 18px;font-family:__DISPLAY__;font-size:26px;font-weight:500;color:#0E0D0C">${appointment.service_name}</p>
          <p style="margin:0;font-family:__BODY__;font-size:10px;letter-spacing:0.34em;text-transform:uppercase;color:#8A7F74;font-weight:500">When</p>
          <p style="margin:6px 0 4px;font-family:__DISPLAY__;font-size:22px;font-weight:500;color:#0E0D0C">${when}</p>
          <p style="margin:0;font-family:__BODY__;font-size:12px;color:#8A7F74">${appointment.duration_minutes} minutes · ${tz}</p>
          ${appointment.notes ? `<p style="margin:18px 0 0;font-family:__DISPLAY__;font-style:italic;font-size:16px;color:#3a3530;border-top:1px solid #E8DFD2;padding-top:14px">“${appointment.notes}”</p>` : ''}
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:30px 44px 4px;font-family:__BODY__;font-size:14px;line-height:1.7;color:#3a3530;font-weight:300">Plans change. If you need to cancel or reschedule, please do so at least 24 hours before your visit — it lets us offer the time to another guest.</td></tr>
    <tr><td align="center" style="padding:20px 44px 40px">
      <a href="${cancelUrl}" style="display:inline-block;padding:14px 28px;font-family:__BODY__;font-size:12px;letter-spacing:0.26em;text-transform:uppercase;text-decoration:none;color:#0E0D0C;border:1px solid #0E0D0C">Cancel reservation</a>
    </td></tr>
    ${addr ? `<tr><td style="padding:0 44px 42px;border-top:1px solid #E8DFD2;padding-top:24px;font-family:__BODY__;font-size:12px;color:#8A7F74;letter-spacing:0.08em">${addr}</td></tr>` : ''}
    <tr><td align="center" style="padding:0 44px 38px;font-family:__DISPLAY__;font-size:20px;font-style:italic;color:#8A7F74">${name}</td></tr>`;

  return sendEmail({
    to: appointment.customer_email,
    subject: `Reservation confirmed — ${name}`,
    html: shell({ accent, bodyHtml: body, preheader: 'Reserved' }),
  });
}

async function sendOwnerNewBookingAlert({ appointment, site, settings }) {
  const owner = site?.site_data?.contactEmail;
  if (!owner) return false;
  const tz = settings?.timezone || 'Europe/Dublin';
  const when = fmt(appointment, tz);
  const accent = brandColor(site);
  const name = siteName(site);

  const body = `
    <tr><td style="padding:6px 44px 4px"><h1 style="margin:0;font-family:__DISPLAY__;font-weight:500;font-size:38px;line-height:1.08;letter-spacing:-0.01em;color:#0E0D0C">New booking<span style="color:${accent}">.</span></h1></td></tr>
    <tr><td style="padding:18px 44px 6px;font-family:__BODY__;font-size:15px;line-height:1.7;color:#3a3530;font-weight:300">A new reservation has been confirmed at <strong style="font-weight:500;color:#0E0D0C">${name}</strong>.</td></tr>
    <tr><td style="padding:28px 44px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FBF6EC;border:1px solid #E8DFD2">
        <tr><td style="padding:26px 28px">
          <p style="margin:0;font-family:__BODY__;font-size:10px;letter-spacing:0.34em;text-transform:uppercase;color:#8A7F74;font-weight:500">Guest</p>
          <p style="margin:6px 0 20px;font-family:__DISPLAY__;font-size:28px;font-weight:500;color:#0E0D0C">${appointment.customer_name}</p>
          <table role="presentation" width="100%"><tr>
            <td style="padding-right:10px;vertical-align:top">
              <p style="margin:0;font-family:__BODY__;font-size:10px;letter-spacing:0.34em;text-transform:uppercase;color:#8A7F74;font-weight:500">Treatment</p>
              <p style="margin:6px 0 4px;font-family:__DISPLAY__;font-size:20px;font-weight:500;color:#0E0D0C">${appointment.service_name}</p>
              <p style="margin:0;font-family:__BODY__;font-size:12px;color:#8A7F74">${appointment.duration_minutes} min</p>
            </td>
            <td style="padding-left:10px;vertical-align:top">
              <p style="margin:0;font-family:__BODY__;font-size:10px;letter-spacing:0.34em;text-transform:uppercase;color:#8A7F74;font-weight:500">When</p>
              <p style="margin:6px 0 4px;font-family:__DISPLAY__;font-size:20px;font-weight:500;color:#0E0D0C">${when}</p>
              <p style="margin:0;font-family:__BODY__;font-size:12px;color:#8A7F74">${tz}</p>
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:28px 44px 8px">
      <p style="margin:0 0 10px;font-family:__BODY__;font-size:10px;letter-spacing:0.34em;text-transform:uppercase;color:#8A7F74;font-weight:500">Contact</p>
      ${appointment.customer_email ? `<p style="margin:4px 0;font-family:__BODY__;font-size:15px"><a href="mailto:${appointment.customer_email}" style="color:${accent};text-decoration:none">${appointment.customer_email}</a></p>` : ''}
      ${appointment.customer_phone ? `<p style="margin:4px 0;font-family:__BODY__;font-size:15px"><a href="tel:${appointment.customer_phone}" style="color:${accent};text-decoration:none">${appointment.customer_phone}</a></p>` : ''}
    </td></tr>
    ${appointment.notes ? `<tr><td style="padding:14px 44px 4px"><p style="margin:0 0 10px;font-family:__BODY__;font-size:10px;letter-spacing:0.34em;text-transform:uppercase;color:#8A7F74;font-weight:500">Notes</p><p style="margin:0;font-family:__DISPLAY__;font-style:italic;font-size:15px;color:#3a3530">“${appointment.notes}”</p></td></tr>` : ''}
    <tr><td style="padding:28px 44px 40px;font-family:__BODY__;font-size:12px;color:#8A7F74;letter-spacing:0.08em;border-top:1px solid #E8DFD2;padding-top:22px">
      Reply to manage via WhatsApp: <strong style="color:#0E0D0C">cancel #${appointment.id}</strong> to cancel, or <strong style="color:#0E0D0C">bookings</strong> to see the week ahead.
    </td></tr>`;

  return sendEmail({
    to: owner,
    subject: `New booking · ${appointment.customer_name} · ${appointment.service_name}`,
    html: shell({ accent, bodyHtml: body, preheader: 'New booking' }),
  });
}

async function sendCustomerCancellation({ appointment, site, settings }) {
  if (!appointment.customer_email) return false;
  const tz = settings?.timezone || 'Europe/Dublin';
  const when = fmt(appointment, tz);
  const accent = brandColor(site);
  const name = siteName(site);
  const body = `
    <tr><td style="padding:6px 44px 4px"><h1 style="margin:0;font-family:__DISPLAY__;font-weight:500;font-size:38px;line-height:1.08;letter-spacing:-0.01em">Cancelled<span style="color:${accent}">.</span></h1></td></tr>
    <tr><td style="padding:18px 44px 28px;font-family:__BODY__;font-size:15px;line-height:1.7;color:#3a3530;font-weight:300">Your reservation for <strong style="color:#0E0D0C">${appointment.service_name}</strong> on <strong style="color:#0E0D0C">${when}</strong> (${tz}) has been cancelled. We hope to welcome you another time.</td></tr>
    <tr><td align="center" style="padding:0 44px 40px;font-family:__DISPLAY__;font-style:italic;font-size:20px;color:#8A7F74">${name}</td></tr>`;
  return sendEmail({
    to: appointment.customer_email,
    subject: `Cancellation confirmed — ${name}`,
    html: shell({ accent, bodyHtml: body, preheader: 'Cancelled' }),
  });
}

async function sendOwnerCancellationAlert({ appointment, site, settings }) {
  const owner = site?.site_data?.contactEmail;
  if (!owner) return false;
  const tz = settings?.timezone || 'Europe/Dublin';
  const when = fmt(appointment, tz);
  const accent = brandColor(site);
  const body = `
    <tr><td style="padding:6px 44px 4px"><h1 style="margin:0;font-family:__DISPLAY__;font-weight:500;font-size:34px;line-height:1.08;letter-spacing:-0.01em">Booking cancelled<span style="color:${accent}">.</span></h1></td></tr>
    <tr><td style="padding:18px 44px 28px;font-family:__BODY__;font-size:15px;line-height:1.7;color:#3a3530;font-weight:300"><strong style="color:#0E0D0C">${appointment.customer_name}</strong> cancelled ${appointment.service_name} on ${when} (${tz}).</td></tr>
    <tr><td style="padding:0 44px 40px;font-family:__BODY__;font-size:12px;color:#8A7F74">Booking #${appointment.id}</td></tr>`;
  return sendEmail({
    to: owner,
    subject: `Cancelled · ${appointment.customer_name}`,
    html: shell({ accent, bodyHtml: body, preheader: 'Cancellation' }),
  });
}

async function sendCustomerReminder({ appointment, site, settings }) {
  if (!appointment.customer_email) return false;
  const tz = settings?.timezone || 'Europe/Dublin';
  const when = fmt(appointment, tz);
  const cancelUrl = `${publicBaseUrl()}/api/booking/cancel/${appointment.cancel_token}`;
  const accent = brandColor(site);
  const name = siteName(site);
  const body = `
    <tr><td style="padding:6px 44px 4px"><h1 style="margin:0;font-family:__DISPLAY__;font-weight:500;font-size:40px;line-height:1.05;letter-spacing:-0.01em">See you soon<span style="color:${accent}">.</span></h1></td></tr>
    <tr><td style="padding:18px 44px 6px;font-family:__BODY__;font-size:15px;line-height:1.7;color:#3a3530;font-weight:300">A gentle reminder — your reservation at <strong style="color:#0E0D0C">${name}</strong>.</td></tr>
    <tr><td style="padding:24px 44px 0"><table role="presentation" width="100%" style="background:#FBF6EC;border:1px solid #E8DFD2"><tr><td style="padding:24px 28px">
      <p style="margin:0;font-family:__DISPLAY__;font-size:22px;font-weight:500">${appointment.service_name}</p>
      <p style="margin:8px 0 0;font-family:__BODY__;font-size:14px;color:#3a3530">${when} · ${tz}</p>
    </td></tr></table></td></tr>
    <tr><td align="center" style="padding:28px 44px 40px"><a href="${cancelUrl}" style="display:inline-block;padding:12px 24px;font-family:__BODY__;font-size:12px;letter-spacing:0.26em;text-transform:uppercase;text-decoration:none;color:#0E0D0C;border:1px solid #0E0D0C">Need to cancel?</a></td></tr>`;
  return sendEmail({
    to: appointment.customer_email,
    subject: `Reminder — ${name} tomorrow`,
    html: shell({ accent, bodyHtml: body, preheader: 'Reminder' }),
  });
}

module.exports = {
  sendCustomerBookingConfirmation,
  sendOwnerNewBookingAlert,
  sendCustomerCancellation,
  sendOwnerCancellationAlert,
  sendCustomerReminder,
};
