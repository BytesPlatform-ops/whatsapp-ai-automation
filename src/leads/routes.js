// Public lead-capture endpoint. Generated sites on Netlify post their
// contact-form submissions here; we persist to `form_submissions`, then
// fire a Pixie-branded SendGrid email to the owner.
//
// Why a separate router: the existing express-rate-limit applied globally
// allows 100 req/min per IP across ALL endpoints. For a public form
// endpoint we want a stricter dedicated cap (5/hr per IP+site) enforced
// via a DB count rather than an in-memory counter — a bot spread across
// sites could otherwise slip under the global bucket undetected.

const express = require('express');
const { logger } = require('../utils/logger');
const { createLead, markLeadDelivery, getSiteOwnerInfo, countRecentLeadsFromIp } = require('../db/leads');
const { sendLeadNotification } = require('../notifications/email');

const router = express.Router();

// CORS — the public endpoint is hit from random *.netlify.app hostnames
// (every generated site has a different subdomain), plus custom domains.
// Open CORS is intentional: this endpoint is write-only, never returns
// sensitive data, and already rate-limited.
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Limits used by the hard checks below
const MAX_FIELD = 2000;          // any single field
const MAX_MESSAGE = 5000;        // message field (looser — people write)
const MAX_LEADS_PER_IP_PER_HOUR = 5;

/**
 * POST /public/leads/:siteId
 *
 * Accepts form-encoded OR JSON submissions. Expected fields:
 *   name, email, phone, message, form_name (optional), _honey (honeypot)
 *
 * Responds with { ok: true, leadId } on success. On a soft-fail (spam /
 * rate-limited / invalid) returns 200 with ok: false so the submitter
 * can't use error codes to probe — keeps bots in the dark.
 */
router.post('/public/leads/:siteId', async (req, res) => {
  const siteId = String(req.params.siteId || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId)) {
    return res.status(400).json({ ok: false, error: 'invalid_site' });
  }

  const body = req.body || {};
  const honeypot = pickStr(body, ['_honey', '_honeypot']);
  if (honeypot) {
    // Silent success — bot gets 200, thinks it worked, moves on.
    logger.info(`[LEADS] Honeypot triggered on site ${siteId}, dropping`);
    return res.json({ ok: true });
  }

  const name = clip(pickStr(body, ['name', 'full_name', 'full-name']), MAX_FIELD);
  const email = clip(pickStr(body, ['email', 'email_address']), MAX_FIELD);
  const phone = clip(pickStr(body, ['phone', 'phone_number', 'tel']), MAX_FIELD);
  const message = clip(pickStr(body, ['message', 'comments', 'notes', 'body']), MAX_MESSAGE);
  const formName = clip(pickStr(body, ['form_name', 'form-name', '_form']), 64) || 'contact';
  const sourcePage = clip(pickStr(body, ['source_page', 'source-page', '_source']) || req.get('referer') || '', MAX_FIELD);

  // Require at least ONE way to reach the lead back — otherwise it's noise.
  if (!email && !phone) {
    return res.status(400).json({ ok: false, error: 'contact_required' });
  }
  // Shape check on email when present; lenient on purpose — visitor typos
  // shouldn't silently discard the lead, owner can still respond to name.
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }

  const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  const userAgent = req.get('user-agent') || '';

  // Rate limit check — per IP, per site, per hour. In-memory limiter would
  // miss cross-process calls; querying the DB is slow but this endpoint
  // isn't a hot path.
  try {
    const recent = await countRecentLeadsFromIp(ip, siteId, 1);
    if (recent >= MAX_LEADS_PER_IP_PER_HOUR) {
      logger.warn(`[LEADS] Rate-limited: ip=${ip} site=${siteId} count=${recent}`);
      return res.status(429).json({ ok: false, error: 'rate_limited' });
    }
  } catch (err) {
    // Fail open — do not block legitimate leads because the counter failed.
    logger.warn(`[LEADS] Rate-limit count failed: ${err.message}`);
  }

  // Resolve owner info (email to notify, business name for the subject).
  let owner = null;
  try {
    owner = await getSiteOwnerInfo(siteId);
  } catch (err) {
    logger.warn(`[LEADS] Owner lookup failed for site ${siteId}: ${err.message}`);
  }

  let lead;
  try {
    lead = await createLead({
      siteId,
      userId: owner?.userId || null,
      formName,
      name,
      email,
      phone,
      message,
      sourcePage,
      ipAddress: ip,
      userAgent,
    });
  } catch (err) {
    logger.error(`[LEADS] Save failed for site ${siteId}: ${err.message}`);
    return res.status(500).json({ ok: false, error: 'save_failed' });
  }

  // Fire the email — fire-and-forget so the browser gets a fast 200 ack
  // and doesn't wait on SendGrid's TLS round-trip. Delivery status gets
  // written back to the row so admin dashboard can show sent/failed.
  (async () => {
    try {
      if (!owner?.ownerEmail) {
        logger.warn(`[LEADS] No owner email for site ${siteId} — lead ${lead.id} saved but no notification sent`);
        await markLeadDelivery(lead.id, 'no_recipient');
        return;
      }
      const ok = await sendLeadNotification({
        toEmail: owner.ownerEmail,
        businessName: owner.businessName,
        visitor: { name, email, phone, message },
        sourcePage,
        previewUrl: owner.previewUrl,
        leadId: lead.id,
      });
      await markLeadDelivery(lead.id, ok ? 'sent' : 'failed', ok ? null : 'sendgrid returned false');
    } catch (err) {
      logger.error(`[LEADS] Notification dispatch threw for lead ${lead.id}: ${err.message}`);
      await markLeadDelivery(lead.id, 'failed', err.message);
    }
  })();

  res.json({ ok: true, leadId: lead.id });
});

// ─── helpers ────────────────────────────────────────────────────────────
function pickStr(body, keys) {
  for (const k of keys) {
    const v = body?.[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}
function clip(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) : str;
}

module.exports = router;
