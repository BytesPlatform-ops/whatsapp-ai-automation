const sgMail = require('@sendgrid/mail');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

if (env.sendgrid?.apiKey) {
  sgMail.setApiKey(env.sendgrid.apiKey);
}

const NOTIFY_EMAIL = 'bytesuite@bytesplatform.com';
const FROM = {
  email: env.sendgrid?.fromEmail || 'developer@bytesplatform.com',
  name: env.sendgrid?.fromName || 'Bytes Platform',
};

/**
 * Send an email via SendGrid. Fails silently with logging.
 */
async function sendEmail({ to, subject, html, text }) {
  if (!env.sendgrid?.apiKey) {
    logger.warn('[EMAIL] SendGrid not configured — skipping email');
    return false;
  }
  try {
    const plainText = text || (html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : subject);
    await sgMail.send({ to, from: FROM, subject, html, text: plainText });
    logger.info(`[EMAIL] Sent to ${to}: ${subject}`);
    return true;
  } catch (err) {
    logger.error(`[EMAIL] Failed to send to ${to}:`, err.response?.body || err.message);
    return false;
  }
}

/**
 * Notify team that a payment was received.
 */
async function sendPaymentNotification({ userName, userPhone, userEmail, amount, serviceType, description, sitePreviewUrl, channel }) {
  return sendEmail({
    to: NOTIFY_EMAIL,
    subject: `💰 New Payment: $${amount} from ${userName || userPhone}`,
    html: `
      <h2>New Payment Received</h2>
      <table style="border-collapse:collapse;font-family:sans-serif;">
        <tr><td style="padding:8px;font-weight:bold;">Customer</td><td style="padding:8px;">${userName || 'N/A'}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;">Phone</td><td style="padding:8px;">${userPhone}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;">Email</td><td style="padding:8px;">${userEmail || 'Not provided'}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;">Channel</td><td style="padding:8px;">${channel || 'whatsapp'}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;">Amount</td><td style="padding:8px;color:#16a34a;font-weight:bold;">$${amount}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;">Service</td><td style="padding:8px;">${serviceType || 'N/A'}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;">Description</td><td style="padding:8px;">${description || 'N/A'}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;">Preview URL</td><td style="padding:8px;"><a href="${sitePreviewUrl || '#'}">${sitePreviewUrl || 'N/A'}</a></td></tr>
      </table>
    `,
  });
}

/**
 * Notify team that a domain setup is needed.
 */
async function sendDomainRequestNotification({ userName, userPhone, userEmail, selectedDomain, sitePreviewUrl, netlifySiteId }) {
  return sendEmail({
    to: NOTIFY_EMAIL,
    subject: `🌐 Domain Setup Needed: ${selectedDomain} for ${userName || userPhone}`,
    html: `
      <h2>Domain Setup Request</h2>
      <table style="border-collapse:collapse;font-family:sans-serif;">
        <tr><td style="padding:8px;font-weight:bold;">Customer</td><td style="padding:8px;">${userName || 'N/A'}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;">Phone</td><td style="padding:8px;">${userPhone}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;">Email</td><td style="padding:8px;">${userEmail || 'Not provided'}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;">Domain</td><td style="padding:8px;font-weight:bold;color:#4f46e5;">${selectedDomain}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;">Preview URL</td><td style="padding:8px;"><a href="${sitePreviewUrl || '#'}">${sitePreviewUrl || 'N/A'}</a></td></tr>
        <tr><td style="padding:8px;font-weight:bold;">Netlify Site ID</td><td style="padding:8px;">${netlifySiteId || 'N/A'}</td></tr>
      </table>
      <p style="margin-top:16px;color:#666;">Please purchase the domain and configure DNS within 2 business days.</p>
    `,
  });
}

/**
 * Send a post-sale upsell email to the customer.
 */
async function sendUpsellEmail({ toEmail, userName, type }) {
  const templates = {
    day7: {
      subject: `${userName || 'Hey'}, let's get you found on Google! 🔍`,
      html: `
        <h2>Your Website is Live — Now Let's Get You Found!</h2>
        <p>Hi ${userName || 'there'},</p>
        <p>Your website has been live for a week now — great start! The next step to getting more customers is setting up your <strong>Google Business Profile</strong>.</p>
        <p>This means when someone searches for your type of business nearby, you show up on Google Maps and in local search results.</p>
        <p>We can set this up for you — just reply to this email or message us on WhatsApp and we'll get it done.</p>
        <p>— The Bytes Platform Team</p>
      `,
    },
    day30: {
      subject: `${userName || 'Hey'}, ready to rank higher on Google? 📈`,
      html: `
        <h2>Your Website's First Month — Time to Boost Traffic</h2>
        <p>Hi ${userName || 'there'},</p>
        <p>Your website has been live for a month! Want to get more visitors from Google?</p>
        <p>Our <strong>SEO packages</strong> help your business rank higher in search results so customers find you first. We'll handle keyword research, on-page optimization, and monthly reporting.</p>
        <p>Reply to learn more about our SEO packages — they start from just $200.</p>
        <p>— The Bytes Platform Team</p>
      `,
    },
    day60: {
      subject: `Add WhatsApp chat to your website? 💬`,
      html: `
        <h2>Let Customers Message You Directly From Your Website</h2>
        <p>Hi ${userName || 'there'},</p>
        <p>Did you know you can add a <strong>WhatsApp chat button</strong> to your website? When visitors click it, they can message you directly — no forms, no waiting.</p>
        <p>It's one of the easiest ways to convert website visitors into customers. We can set it up for you quickly.</p>
        <p>Interested? Just reply and we'll get it done.</p>
        <p>— The Bytes Platform Team</p>
      `,
    },
    day90: {
      subject: `Time for a fresh look? 🎨`,
      html: `
        <h2>Your Website is 3 Months Old — Time for a Refresh?</h2>
        <p>Hi ${userName || 'there'},</p>
        <p>Your website has been working hard for 3 months! Want to give it a fresh look or add new features?</p>
        <p>We can update the design, add new sections, improve the layout, or add functionality like booking, reviews, or a gallery.</p>
        <p>Reply and we'll send you a free mockup of an updated design!</p>
        <p>— The Bytes Platform Team</p>
      `,
    },
  };

  const template = templates[type];
  if (!template) {
    logger.warn(`[EMAIL] Unknown upsell type: ${type}`);
    return false;
  }

  return sendEmail({
    to: toEmail,
    subject: template.subject,
    html: template.html,
  });
}

/**
 * Send (or re-send) the meeting join link to a booked lead.
 * Triggered from the admin dashboard. Includes the join URL as a clickable
 * button + plain-text fallback, with reschedule/cancel links when present.
 */
async function sendMeetingLinkToLead({ toEmail, leadName, joinUrl, topic, dateStr, timeStr, rescheduleUrl, cancelUrl }) {
  if (!toEmail) {
    logger.warn('[EMAIL] sendMeetingLinkToLead: no recipient email');
    return false;
  }
  if (!joinUrl) {
    logger.warn('[EMAIL] sendMeetingLinkToLead: no join URL');
    return false;
  }

  const safeName = leadName || 'there';
  const whenLine = (dateStr || timeStr)
    ? `<p style="font-size:15px;color:#374151;margin:0 0 20px">${[dateStr, timeStr].filter(Boolean).join(' &middot; ')}</p>`
    : '';
  const topicLine = topic ? `<p style="font-size:14px;color:#6b7280;margin:0 0 28px">${topic}</p>` : '';
  const rescheduleLine = (rescheduleUrl || cancelUrl)
    ? `<p style="font-size:13px;color:#6b7280;margin:28px 0 0">Need to change it? ${rescheduleUrl ? `<a href="${rescheduleUrl}" style="color:#4f46e5">Reschedule</a>` : ''}${rescheduleUrl && cancelUrl ? ' or ' : ''}${cancelUrl ? `<a href="${cancelUrl}" style="color:#4f46e5">Cancel</a>` : ''}.</p>`
    : '';

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#111827">
      <h2 style="font-size:20px;font-weight:700;margin:0 0 12px">Your meeting link, ${safeName}</h2>
      ${whenLine}
      ${topicLine}
      <a href="${joinUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;border-radius:8px;font-size:15px">Join the meeting</a>
      <p style="font-size:13px;color:#6b7280;margin:20px 0 0;word-break:break-all">Or paste this into your browser: <a href="${joinUrl}" style="color:#4f46e5">${joinUrl}</a></p>
      ${rescheduleLine}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0">
      <p style="font-size:12px;color:#9ca3af;margin:0">Bytes Platform &middot; See you on the call.</p>
    </div>
  `;

  const text = `Your meeting link, ${safeName}\n\n` +
    (dateStr || timeStr ? `${[dateStr, timeStr].filter(Boolean).join(' · ')}\n` : '') +
    (topic ? `${topic}\n\n` : '\n') +
    `Join: ${joinUrl}\n` +
    (rescheduleUrl ? `Reschedule: ${rescheduleUrl}\n` : '') +
    (cancelUrl ? `Cancel: ${cancelUrl}\n` : '');

  return sendEmail({
    to: toEmail,
    subject: `Your meeting link${topic ? ` — ${topic}` : ''}`,
    html,
    text,
  });
}

module.exports = {
  sendEmail,
  sendPaymentNotification,
  sendDomainRequestNotification,
  sendUpsellEmail,
  sendMeetingLinkToLead,
};
