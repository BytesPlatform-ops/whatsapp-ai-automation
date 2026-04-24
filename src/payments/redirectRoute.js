// Payment redirect / status page.
//
// The activation banner on every preview site routes through this URL
// (/pay/:paymentId) instead of linking to Stripe directly. Reason: once
// a payment succeeds, the same link is still sitting in WhatsApp chats
// and on the now-live site. A bare Stripe link would just offer checkout
// again — so the visitor would pay twice unless we intercept.
//
// Branching by payments.status lets us show a friendly "already paid"
// confirmation instead, with a link back to the live site. Pending
// payments still 302 straight through to Stripe so the hop is invisible.

const express = require('express');
const { supabase } = require('../config/database');
const { logger } = require('../utils/logger');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Minimal branded status page. Inline styles only so it renders the
 * same wherever it's viewed (including email previews). Keeps the
 * Pixie navy → teal → WhatsApp-green palette consistent with the
 * activation banner and thank-you email.
 */
function statusPage({ title, accent = '#0F766E', heading, body, cta, subCta }) {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#0A1628 0%,#13335A 100%);color:#F1F5F9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;-webkit-font-smoothing:antialiased}
  .card{background:#fff;color:#0A1628;max-width:480px;width:100%;border-radius:18px;box-shadow:0 30px 60px -20px rgba(0,0,0,0.5);overflow:hidden}
  .head{padding:14px 0;background:${accent};text-align:center;color:#fff;font-size:10.5px;font-weight:700;letter-spacing:0.32em;text-transform:uppercase}
  .body{padding:44px 36px 30px;text-align:center}
  .icon{width:72px;height:72px;border-radius:50%;background:${accent}15;color:${accent};display:inline-flex;align-items:center;justify-content:center;margin-bottom:22px}
  h1{font-size:26px;font-weight:800;margin:0 0 12px;letter-spacing:-0.5px;line-height:1.2}
  p{font-size:15px;color:#475569;line-height:1.65;margin:0 0 18px}
  .cta{display:inline-block;background:#25D366;color:#0A1628;padding:14px 26px;border-radius:999px;font-weight:700;font-size:15px;text-decoration:none;margin-top:10px;transition:transform 0.15s}
  .cta:hover{transform:translateY(-1px)}
  .sub{display:block;margin-top:16px;font-size:13px;color:#94a3b8;text-decoration:none}
  .sub:hover{color:#64748b}
  .foot{padding:16px;text-align:center;border-top:1px solid #e5e7eb;font-size:11px;color:#94a3b8}
  .foot a{color:#64748b;text-decoration:none}
</style></head>
<body>
  <div class="card">
    <div class="head">Pixie · Payment status</div>
    <div class="body">
      <div class="icon">${cta ? '' : ''}</div>
      <h1>${heading}</h1>
      ${body}
      ${cta || ''}
      ${subCta || ''}
    </div>
    <div class="foot">Built by <a href="https://pixiebot.co">Pixie</a></div>
  </div>
</body></html>`;
}

const ICON_CHECK = `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 7"/></svg>`;
const ICON_REFUND = `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>`;
const ICON_WARN = `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>`;

function iconCard({ title, accent, icon, heading, body, cta, subCta }) {
  const html = statusPage({ title, accent, heading, body, cta, subCta });
  // Drop the icon in — statusPage leaves the div empty so we inject here.
  return html.replace('<div class="icon">', `<div class="icon">${icon}`);
}

/**
 * GET /pay/:paymentId
 *
 * Branches on the payment row's status:
 *   - pending   → 302 to the Stripe checkout URL
 *   - paid      → "already paid" status page linking back to the site
 *   - refunded  → "payment refunded" status page
 *   - cancelled/expired → "link no longer valid" page
 *   - anything else, or missing payment → 404
 */
router.get('/pay/:paymentId', async (req, res) => {
  const paymentId = String(req.params.paymentId || '').trim();
  if (!UUID_RE.test(paymentId)) {
    res.status(400).type('html').send(iconCard({
      title: 'Invalid link',
      accent: '#dc2626',
      icon: ICON_WARN,
      heading: 'Invalid payment link',
      body: '<p>This link doesn\'t look right. Please use the link from your WhatsApp message or the activation banner on your site.</p>',
    }));
    return;
  }

  const { data: payment, error } = await supabase
    .from('payments')
    .select('id, user_id, status, stripe_payment_link_url, amount, description, paid_at')
    .eq('id', paymentId)
    .maybeSingle();

  if (error || !payment) {
    res.status(404).type('html').send(iconCard({
      title: 'Payment not found',
      accent: '#dc2626',
      icon: ICON_WARN,
      heading: 'Payment not found',
      body: '<p>We couldn\'t find this payment. If you think this is wrong, please message us on WhatsApp and we\'ll help.</p>',
    }));
    return;
  }

  // pending → send them to Stripe. Silent 302 so the visitor barely
  // notices the hop. Every other branch below renders a real page.
  if (payment.status === 'pending' && payment.stripe_payment_link_url) {
    return res.redirect(302, payment.stripe_payment_link_url);
  }

  // paid → friendly confirmation with a link back to the site.
  if (payment.status === 'paid') {
    const { data: site } = await supabase
      .from('generated_sites')
      .select('preview_url, site_data')
      .eq('user_id', payment.user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const siteUrl = site?.site_data?.custom_domain
      ? `https://${site.site_data.custom_domain}`
      : site?.preview_url || null;
    const paidOn = payment.paid_at
      ? new Date(payment.paid_at).toLocaleDateString('en-US', { dateStyle: 'medium' })
      : null;
    const amountLine = payment.amount
      ? `<p><strong style="color:#0A1628">$${(payment.amount / 100).toLocaleString()}</strong>${paidOn ? ` on ${esc(paidOn)}` : ''}</p>`
      : '';

    res.status(200).type('html').send(iconCard({
      title: 'Already paid — Pixie',
      accent: '#0F766E',
      icon: ICON_CHECK,
      heading: 'You\'re already paid up.',
      body: `
        <p>This payment is complete — your site is live. No action needed.</p>
        ${amountLine}
      `,
      cta: siteUrl
        ? `<a class="cta" href="${esc(siteUrl)}">Open my site →</a>`
        : '',
      subCta: '<a class="sub" href="https://wa.me/3197010277911">Questions? Message us on WhatsApp</a>',
    }));
    return;
  }

  // refunded → explain + offer WhatsApp contact
  if (payment.status === 'refunded') {
    res.status(200).type('html').send(iconCard({
      title: 'Payment refunded — Pixie',
      accent: '#d97706',
      icon: ICON_REFUND,
      heading: 'This payment was refunded.',
      body: '<p>The charge for this link has been refunded. If you want to re-activate your site, message us on WhatsApp and we\'ll send a fresh link.</p>',
      cta: '<a class="cta" href="https://wa.me/3197010277911">Message us</a>',
    }));
    return;
  }

  // cancelled / expired / anything else → link dead, route to WhatsApp
  res.status(200).type('html').send(iconCard({
    title: 'Link no longer active — Pixie',
    accent: '#64748b',
    icon: ICON_WARN,
    heading: 'This link is no longer active.',
    body: '<p>Message us on WhatsApp and we\'ll send you a fresh activation link.</p>',
    cta: '<a class="cta" href="https://wa.me/3197010277911">Get a new link</a>',
  }));
});

module.exports = router;
