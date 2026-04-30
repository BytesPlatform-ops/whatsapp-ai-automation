// Privacy policy page (GET /privacy) — public, mounted before the admin
// auth middleware. Linked from the bot's first-time greeting so users
// have a clear, one-tap path to read what we do with their data.
//
// IMPORTANT: the text below is a sensible starting template, NOT
// lawyer-vetted boilerplate. Have counsel review before EU users hit
// it. Specifics that need real input from the business:
//   - the legal entity name + registered address
//   - the actual list of sub-processors you use today
//   - retention periods that match your DB cleanup jobs
//   - your DPO contact (if applicable under GDPR Art. 37)
//
// Driven by env vars in `env.privacy` so swapping company name /
// contact email doesn't require a code change.

const express = require('express');
const { env } = require('../config/env');

const router = express.Router();

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function privacyPageHtml() {
  const company = escapeHtml(env.privacy.companyName);
  const legal = env.privacy.companyLegalName
    ? escapeHtml(env.privacy.companyLegalName)
    : company;
  const contact = escapeHtml(env.privacy.contactEmail);
  const lastUpdated = env.privacy.lastUpdated
    ? escapeHtml(env.privacy.lastUpdated)
    : new Date().toISOString().slice(0, 10);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Privacy Policy — ${company}</title>
<style>
  :root { color-scheme: light; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 760px;
    margin: 0 auto;
    padding: 32px 22px 80px;
    line-height: 1.6;
    color: #1f2937;
    background: #ffffff;
  }
  h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 19px; margin: 32px 0 8px; letter-spacing: -0.005em; color: #0f172a; }
  h3 { font-size: 15px; margin: 18px 0 6px; color: #0f172a; }
  p, li { font-size: 15px; }
  ul { padding-left: 20px; }
  a { color: #2563eb; }
  .meta { color: #64748b; font-size: 13px; margin-bottom: 28px; }
  .callout {
    background: #f1f5f9;
    border-left: 3px solid #2563eb;
    padding: 14px 16px;
    border-radius: 6px;
    margin: 18px 0;
    font-size: 14px;
    color: #0f172a;
  }
  hr { border: 0; border-top: 1px solid #e5e7eb; margin: 36px 0 12px; }
  footer { color: #64748b; font-size: 13px; }
</style>
</head>
<body>
<h1>Privacy Policy</h1>
<p class="meta">Last updated: ${lastUpdated} &middot; Operated by ${legal}</p>

<div class="callout">
  Short version: we keep your WhatsApp messages, the business details you share,
  and any payment records, so we can build the website / chatbot / ad / report
  you asked us for. We don't sell your data. You can ask us to delete everything
  any time at <a href="mailto:${contact}">${contact}</a>.
</div>

<h2>1. Who we are</h2>
<p>
  This service is operated by ${legal} ("we", "us"). When you message our
  WhatsApp number or interact with one of our chat widgets, we act as the
  data controller for the personal data you share with us during that
  conversation. Contact us at <a href="mailto:${contact}">${contact}</a> for
  any privacy-related question.
</p>

<h2>2. What data we collect</h2>
<ul>
  <li><strong>Your phone number</strong> — provided by WhatsApp / Messenger / Instagram when you message us.</li>
  <li><strong>The content of your messages</strong> — text, images, voice notes (transcribed), location pins, and uploaded files (logos, documents).</li>
  <li><strong>Business details you share</strong> with the bot to build a website / chatbot / ad / report — business name, industry, services, pricing, opening hours, contact details for your own customers, etc.</li>
  <li><strong>Payment records</strong> if you activate a paid service — Stripe handles card data; we receive only the payment status, the email and name on the receipt, and the amount.</li>
  <li><strong>Technical metadata</strong> — message timestamps, the WhatsApp business number you reached us on, the channel (WhatsApp / Messenger / Instagram).</li>
</ul>

<h2>3. Why we use it (legal bases)</h2>
<ul>
  <li><strong>To deliver the service you asked for</strong> (Art. 6(1)(b) GDPR — performance of a contract). Generating a website needs your business name; sending you a payment link needs your phone number; etc.</li>
  <li><strong>To improve the service and prevent abuse</strong> (Art. 6(1)(f) — legitimate interests). We log conversations so a human can step in when the bot gets stuck, and we use anonymised feedback signals to improve responses.</li>
  <li><strong>To comply with legal obligations</strong> (Art. 6(1)(c)) — accounting / tax records for paid transactions.</li>
</ul>

<h2>4. Who else sees it</h2>
<p>We use a small number of sub-processors to operate the service. None of them sell your data. Current list:</p>
<ul>
  <li><strong>Meta Platforms</strong> — WhatsApp / Messenger / Instagram messaging infrastructure.</li>
  <li><strong>OpenAI</strong> — to generate replies. We send only the conversation context needed for the current reply; no data is retained for training under the API terms.</li>
  <li><strong>Supabase</strong> — primary database for conversations, payments, generated sites.</li>
  <li><strong>Netlify</strong> — hosting for generated websites.</li>
  <li><strong>Stripe</strong> — payment processing. They are an independent controller for card data; see <a href="https://stripe.com/privacy">stripe.com/privacy</a>.</li>
  <li><strong>SendGrid</strong> — transactional email (lead notifications, receipts).</li>
  <li><strong>Namecheap / NameSilo</strong> — domain registration (only if you choose a custom domain).</li>
  <li><strong>Render</strong> / <strong>Vercel</strong> — server hosting.</li>
</ul>

<h2>5. How long we keep it</h2>
<ul>
  <li><strong>Conversation history</strong> — kept while your account is active so the bot has context across sessions. Deleted on request, or after 24 months of inactivity.</li>
  <li><strong>Generated assets</strong> (websites, chatbots, ads) — kept as long as you remain a paying customer. Removed within 30 days of cancellation unless you ask us to keep them longer.</li>
  <li><strong>Payment records</strong> — retained for 7 years to meet accounting / tax obligations.</li>
</ul>

<h2>6. Your rights</h2>
<p>
  Under GDPR (and equivalent laws in the UK, California, and other regions),
  you have the right to:
</p>
<ul>
  <li>Access the personal data we hold about you.</li>
  <li>Correct anything that's wrong.</li>
  <li>Ask us to delete your data ("right to erasure"). We'll delete everything except records we're legally required to keep (e.g. payment records for accounting).</li>
  <li>Receive an export of your data in a portable format.</li>
  <li>Object to processing or restrict it.</li>
  <li>Withdraw any consent you previously gave.</li>
  <li>Lodge a complaint with your local data protection authority.</li>
</ul>
<p>
  To exercise any of these, email <a href="mailto:${contact}">${contact}</a> from
  the address on file or message us from the same WhatsApp number you used to
  sign up. We respond within 30 days.
</p>

<h2>7. International transfers</h2>
<p>
  Our sub-processors operate primarily from the United States. Where we
  transfer data outside the EEA / UK, we rely on the European Commission's
  Standard Contractual Clauses with each sub-processor.
</p>

<h2>8. Cookies / tracking</h2>
<p>
  This privacy notice covers the WhatsApp / chat conversation. The
  generated websites we build for our customers may use minimal cookies
  (e.g. for the activation banner on a preview site); each generated site
  carries its own privacy disclosure where applicable.
</p>

<h2>9. Children</h2>
<p>
  This service is not intended for users under 16. If you believe a minor
  has provided us with data, contact us and we'll delete it.
</p>

<h2>10. Changes to this notice</h2>
<p>
  When we change anything material we'll update the "last updated" date
  at the top. We'll also message you on WhatsApp before the new version
  takes effect if the change affects how we use data we already hold.
</p>

<hr>
<footer>
  Questions: <a href="mailto:${contact}">${contact}</a><br>
  ${legal}
</footer>
</body>
</html>`;
}

router.get('/privacy', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.type('html').send(privacyPageHtml());
});

/**
 * Resolve the public privacy URL the bot should link to. Honors the
 * env override when set; otherwise composes from PUBLIC_API_BASE_URL.
 * Returns null when neither is configured (caller should skip the
 * link rather than send a broken one).
 */
function getPrivacyUrl() {
  if (env.privacy.policyUrl) return env.privacy.policyUrl;
  const base = process.env.PUBLIC_API_BASE_URL || env.chatbot?.baseUrl || '';
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/privacy`;
}

module.exports = { router, getPrivacyUrl };
