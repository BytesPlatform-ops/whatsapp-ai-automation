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
 * Notify team that a payment was received. Pixie-branded layout with a
 * hero amount, customer card, package details, and a one-click link
 * straight to the site — matches the styling of sendLeadNotification so
 * both inbox entries feel like they came from the same product.
 */
async function sendPaymentNotification({ userName, userPhone, userEmail, amount, serviceType, description, sitePreviewUrl, channel }) {
  const safeName = userName || 'New customer';
  const safePhone = userPhone || '';
  const safeEmail = userEmail || '';
  const safeChannel = (channel || 'whatsapp').toLowerCase();
  const safeService = (serviceType || '').trim();
  const safeDescription = (description || '').trim();
  const amountText = typeof amount === 'number'
    ? `$${amount.toLocaleString('en-US', { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
    : `$${amount}`;
  const paidAt = new Date().toLocaleString('en-US', {
    dateStyle: 'medium', timeStyle: 'short',
  });

  // Human-friendly channel labels; unknown values fall through as-is.
  const channelLabels = { whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram' };
  const channelLabel = channelLabels[safeChannel] || safeChannel.replace(/^\w/, (c) => c.toUpperCase());

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff">
      <!-- Gradient header: navy → teal → WhatsApp green -->
      <div style="background:linear-gradient(135deg,#0A1628 0%,#0F766E 55%,#25D366 100%);padding:28px 32px;border-radius:12px 12px 0 0">
        <div style="color:rgba(255,255,255,0.8);font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">PIXIE · PAYMENT CONFIRMED</div>
        <h1 style="color:#fff;font-size:22px;font-weight:800;margin:0;line-height:1.3">${escape(safeName)} just paid.</h1>
      </div>

      <!-- Body -->
      <div style="padding:0;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">

        <!-- Amount hero -->
        <div style="text-align:center;padding:32px 32px 26px;border-bottom:1px solid #e5e7eb;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)">
          <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">Amount</div>
          <div style="font-size:44px;font-weight:900;color:#0F766E;letter-spacing:-1px;line-height:1">${escape(amountText)}</div>
          ${safeService ? `<div style="margin-top:10px;font-size:13px;color:#64748b">for <strong style="color:#0A1628;font-weight:600">${escape(safeService)}</strong></div>` : ''}
        </div>

        <!-- Customer block -->
        <div style="padding:26px 32px 8px">
          <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px">Customer</div>
          <div style="font-size:17px;font-weight:700;color:#0f172a;line-height:1.35;margin-bottom:6px">${escape(safeName)}</div>
          <table role="presentation" style="width:100%;font-size:14px;color:#475569;border-collapse:collapse">
            ${safePhone ? `<tr><td style="padding:3px 0;width:80px;color:#94a3b8;font-size:12px;letter-spacing:0.05em">Phone</td><td style="padding:3px 0"><a href="tel:${escape(safePhone.replace(/[^\d+]/g, ''))}" style="color:#0F766E;text-decoration:none">${escape(safePhone)}</a></td></tr>` : ''}
            ${safeEmail ? `<tr><td style="padding:3px 0;color:#94a3b8;font-size:12px;letter-spacing:0.05em">Email</td><td style="padding:3px 0"><a href="mailto:${escape(safeEmail)}" style="color:#0F766E;text-decoration:none">${escape(safeEmail)}</a></td></tr>` : ''}
            <tr><td style="padding:3px 0;color:#94a3b8;font-size:12px;letter-spacing:0.05em">Channel</td><td style="padding:3px 0;color:#475569">${escape(channelLabel)}</td></tr>
          </table>
        </div>

        ${safeDescription ? `
        <!-- Package / description -->
        <div style="padding:18px 32px 4px">
          <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px">Package</div>
          <div style="background:#f8fafc;border-left:3px solid #0F766E;border-radius:6px;padding:12px 16px;font-size:14.5px;color:#1f2937;line-height:1.55">${escape(safeDescription)}</div>
        </div>` : ''}

        ${sitePreviewUrl ? `
        <!-- Site CTA -->
        <div style="padding:24px 32px 4px">
          <a href="${escape(sitePreviewUrl)}" style="display:inline-block;background:#25D366;color:#0A1628;padding:12px 24px;border-radius:999px;font-weight:700;text-decoration:none;font-size:15px">Open their site →</a>
        </div>` : ''}

        <!-- Meta strip -->
        <div style="margin:26px 32px 0;padding:18px 0 22px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;line-height:1.6">
          <div>Paid at <strong style="color:#475569">${escape(paidAt)}</strong></div>
          ${sitePreviewUrl ? `<div style="margin-top:3px">Site: <a href="${escape(sitePreviewUrl)}" style="color:#6b7280">${escape(sitePreviewUrl.replace(/^https?:\/\//, ''))}</a></div>` : ''}
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:16px 32px;text-align:center;font-size:11px;color:#9ca3af">
        Sent by Pixie · <a href="https://pixiebot.co" style="color:#6b7280;text-decoration:none">pixiebot.co</a>
      </div>
    </div>
  `;

  const text = `Payment confirmed — ${amountText}\n\n` +
    `Customer: ${safeName}\n` +
    (safePhone ? `Phone: ${safePhone}\n` : '') +
    (safeEmail ? `Email: ${safeEmail}\n` : '') +
    `Channel: ${channelLabel}\n` +
    (safeService ? `Service: ${safeService}\n` : '') +
    (safeDescription ? `Package: ${safeDescription}\n` : '') +
    (sitePreviewUrl ? `Site: ${sitePreviewUrl}\n` : '') +
    `Paid: ${paidAt}\n\n— Sent by Pixie · pixiebot.co`;

  if (!env.sendgrid?.apiKey) {
    logger.warn('[EMAIL] SendGrid not configured — skipping payment notification');
    return false;
  }
  try {
    await sgMail.send({
      to: NOTIFY_EMAIL,
      from: PIXIE_FROM,
      subject: `Payment received — ${amountText} from ${safeName}`,
      html,
      text,
    });
    logger.info(`[EMAIL] Payment notification sent to ${NOTIFY_EMAIL} (${amountText} from ${safeName})`);
    return true;
  } catch (err) {
    const body = err.response?.body;
    const detail = body?.errors?.[0]?.message || body?.message || err.message;
    logger.error(`[EMAIL] Payment notification failed: ${detail}`);
    return false;
  }
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

module.exports = {
  sendEmail,
  sendPaymentNotification,
  sendDomainRequestNotification,
  sendUpsellEmail,
  sendMeetingLinkToLead,
  sendLeadNotification,
};
