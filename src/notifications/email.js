const sgMail = require('@sendgrid/mail');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

if (env.sendgrid?.apiKey) {
  sgMail.setApiKey(env.sendgrid.apiKey);
}

const NOTIFY_EMAIL = 'bytesuite@bytesplatform.com';
const FROM = {
  email: env.sendgrid?.fromEmail || 'developer@bytesplatform.com',
  name: env.sendgrid?.fromName || 'Pixie',
};
// Lead-notification emails use a Pixie-branded friendly name so owners
// see "Pixie <developer@bytesplatform.com>" in their inbox instead of
// the generic team alias.
const PIXIE_FROM = {
  email: FROM.email,
  name: 'Pixie',
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
        <p>—Pixie</p>
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
        <p>—Pixie</p>
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
        <p>— Pixie</p>
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
        <p>— Pixie</p>
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

/**
 * Notify a site owner that a visitor filled out their contact form. Sends
 * under the "Pixie" friendly name so the alert looks branded. Falls back
 * silently when SendGrid isn't configured (dev environments). The body is
 * designed to be scannable on mobile — name/email/phone stacked, message
 * in its own block, Reply button opens the visitor's email with a useful
 * pre-filled subject.
 */
async function sendLeadNotification({ toEmail, businessName, visitor, sourcePage, previewUrl, leadId }) {
  if (!toEmail) {
    logger.warn('[EMAIL] sendLeadNotification: no recipient email');
    return false;
  }
  if (!env.sendgrid?.apiKey) {
    logger.warn('[EMAIL] SendGrid not configured — skipping lead notification');
    return false;
  }

  const safeBiz = businessName || 'your website';
  const safeName = visitor?.name || 'A visitor';
  const safeEmail = visitor?.email || '';
  const safePhone = visitor?.phone || '';
  const safeMessage = visitor?.message || '(no message)';
  const submittedAt = new Date().toLocaleString('en-US', {
    dateStyle: 'medium', timeStyle: 'short',
  });

  const replySubject = encodeURIComponent(`Re: your message to ${safeBiz}`);
  const replyHref = safeEmail ? `mailto:${safeEmail}?subject=${replySubject}` : null;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff">
      <!-- Teal header -->
      <div style="background:#0F766E;padding:28px 32px;border-radius:12px 12px 0 0">
        <div style="color:rgba(255,255,255,0.75);font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">PIXIE · LEAD NOTIFICATION</div>
        <h1 style="color:#fff;font-size:22px;font-weight:800;margin:0;line-height:1.3">New lead from ${escape(safeBiz)}</h1>
      </div>

      <!-- Body -->
      <div style="padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">

        <!-- Visitor block -->
        <div style="margin-bottom:22px">
          <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px">From</div>
          <div style="font-size:17px;font-weight:700;color:#0f172a;line-height:1.35">${escape(safeName)}</div>
          ${safeEmail ? `<div style="margin-top:4px;font-size:14px"><a href="mailto:${escape(safeEmail)}" style="color:#0F766E;text-decoration:none">${escape(safeEmail)}</a></div>` : ''}
          ${safePhone ? `<div style="margin-top:2px;font-size:14px"><a href="tel:${escape(safePhone.replace(/[^\d+]/g,''))}" style="color:#0F766E;text-decoration:none">${escape(safePhone)}</a></div>` : ''}
        </div>

        <!-- Message block -->
        <div style="margin-bottom:22px">
          <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px">Message</div>
          <div style="background:#f8fafc;border-left:3px solid #0F766E;border-radius:6px;padding:14px 16px;font-size:15px;color:#1f2937;line-height:1.6;white-space:pre-wrap">${escape(safeMessage)}</div>
        </div>

        ${replyHref ? `
        <!-- CTA -->
        <div style="margin:24px 0 20px">
          <a href="${replyHref}" style="display:inline-block;background:#25D366;color:#0A1628;padding:12px 24px;border-radius:999px;font-weight:700;text-decoration:none;font-size:15px">Reply to ${escape(safeName.split(' ')[0] || safeName)}</a>
        </div>` : ''}

        <!-- Meta strip -->
        <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;line-height:1.6">
          <div>Submitted from <strong style="color:#475569">${escape(sourcePage || 'contact form')}</strong> · ${submittedAt}</div>
          ${previewUrl ? `<div style="margin-top:3px">Site: <a href="${escape(previewUrl)}" style="color:#6b7280">${escape(previewUrl.replace(/^https?:\/\//, ''))}</a></div>` : ''}
          ${leadId ? `<div style="margin-top:3px">Lead ID: <span style="font-family:monospace;color:#94a3b8">${escape(String(leadId).slice(0, 8))}</span></div>` : ''}
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:16px 32px;text-align:center;font-size:11px;color:#9ca3af">
        Sent by Pixie · <a href="https://pixiebot.co" style="color:#6b7280;text-decoration:none">pixiebot.co</a>
      </div>
    </div>
  `;

  const text = `New lead from ${safeBiz}\n\n` +
    `From: ${safeName}\n` +
    (safeEmail ? `Email: ${safeEmail}\n` : '') +
    (safePhone ? `Phone: ${safePhone}\n` : '') +
    `\nMessage:\n${safeMessage}\n\n` +
    `Submitted: ${submittedAt}\n` +
    (sourcePage ? `Page: ${sourcePage}\n` : '') +
    (previewUrl ? `Site: ${previewUrl}\n` : '') +
    (leadId ? `Lead ID: ${String(leadId).slice(0, 8)}\n` : '') +
    `\n— Sent by Pixie · pixiebot.co`;

  try {
    await sgMail.send({
      to: toEmail,
      from: PIXIE_FROM,
      replyTo: safeEmail || undefined,  // Let owner reply directly to the visitor
      subject: `New lead from ${safeBiz}${safeName && safeName !== 'A visitor' ? ` — ${safeName}` : ''}`,
      html,
      text,
    });
    logger.info(`[EMAIL] Lead notification sent to ${toEmail} (lead ${leadId || '?'})`);
    return { ok: true };
  } catch (err) {
    // Surface the real SendGrid error — response.body carries the actual
    // error message (e.g. "API key invalid", "sender not verified") that
    // a plain err.message would hide behind a generic HTTP status.
    const body = err.response?.body;
    const detail = body?.errors?.[0]?.message || body?.message || err.message;
    logger.error(`[EMAIL] Lead notification failed for ${toEmail}: ${detail}`);
    if (body) logger.error('[EMAIL] Full SendGrid response body:', JSON.stringify(body));
    return { ok: false, error: detail };
  }
}

// Minimal HTML-escape so visitor-supplied content can't break the email
// or inject arbitrary markup. Matches the other escape helpers in the
// codebase (templates use the same 5-replacement pattern).
function escape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Notify admin that an abusive / flagged message was received (Phase 13).
 * Covers hate, threats, phishing, hacking, illegal. The conversation
 * has been paused via humanTakeover — admin needs to review and
 * decide whether to reply manually or leave the user silenced.
 */
async function sendAbuseNotification({ userPhone, userName, category, messageText, channel, userId }) {
  const safeMsg = escape(String(messageText || '').slice(0, 1000));
  const categoryLabels = {
    hate: 'Hate speech / slurs',
    threats: 'Threats of violence',
    phishing: 'Phishing / impersonation request',
    hacking: 'Unauthorized hacking request',
    illegal: 'Illegal activity',
  };
  const label = categoryLabels[category] || category;

  return sendEmail({
    to: NOTIFY_EMAIL,
    subject: `⚠️ Flagged message (${label}) from ${userName || userPhone}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:620px;margin:0 auto;padding:24px;color:#111827">
        <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:14px 18px;border-radius:4px;margin-bottom:20px">
          <div style="font-size:12px;font-weight:700;color:#991b1b;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px">PIXIE · ABUSE ALERT</div>
          <div style="font-size:17px;font-weight:700;color:#7f1d1d">${escape(label)}</div>
        </div>
        <p style="margin:0 0 14px;color:#374151">The bot declined this message and paused itself on this conversation (human takeover = on). Review the content below and decide whether to resume manually or leave the user silenced.</p>
        <table style="border-collapse:collapse;margin:8px 0 20px;width:100%">
          <tr><td style="padding:6px 10px;font-weight:bold;background:#f9fafb;width:120px">User</td><td style="padding:6px 10px">${escape(userName || 'N/A')}</td></tr>
          <tr><td style="padding:6px 10px;font-weight:bold;background:#f9fafb">Phone</td><td style="padding:6px 10px">${escape(userPhone || 'N/A')}</td></tr>
          <tr><td style="padding:6px 10px;font-weight:bold;background:#f9fafb">Channel</td><td style="padding:6px 10px">${escape(channel || 'whatsapp')}</td></tr>
          <tr><td style="padding:6px 10px;font-weight:bold;background:#f9fafb">Category</td><td style="padding:6px 10px;color:#b91c1c;font-weight:bold">${escape(category)}</td></tr>
          <tr><td style="padding:6px 10px;font-weight:bold;background:#f9fafb">User ID</td><td style="padding:6px 10px;font-family:monospace;font-size:12px">${escape(userId || 'N/A')}</td></tr>
        </table>
        <div style="margin:10px 0 6px;font-size:11px;font-weight:700;color:#6b7280;letter-spacing:1.5px;text-transform:uppercase">Message content</div>
        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:14px;font-size:14px;color:#1f2937;white-space:pre-wrap">${safeMsg}</div>
        <p style="margin:24px 0 0;font-size:13px;color:#6b7280">Use the admin dashboard to review the conversation or toggle takeover off if you want the bot to resume replying.</p>
      </div>
    `,
    text:
      `PIXIE ABUSE ALERT\n` +
      `${label}\n\n` +
      `User: ${userName || 'N/A'}\n` +
      `Phone: ${userPhone || 'N/A'}\n` +
      `Channel: ${channel || 'whatsapp'}\n` +
      `Category: ${category}\n` +
      `User ID: ${userId || 'N/A'}\n\n` +
      `Message:\n${String(messageText || '').slice(0, 1000)}\n\n` +
      `The bot declined and paused itself (humanTakeover=on). Review in the admin dashboard.`,
  });
}

module.exports = {
  sendEmail,
  sendPaymentNotification,
  sendDomainRequestNotification,
  sendUpsellEmail,
  sendMeetingLinkToLead,
  sendLeadNotification,
  sendAbuseNotification,
};
