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
    await sgMail.send({ to, from: FROM, subject, html, text: text || '' });
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

module.exports = {
  sendEmail,
  sendPaymentNotification,
  sendDomainRequestNotification,
  sendUpsellEmail,
};
