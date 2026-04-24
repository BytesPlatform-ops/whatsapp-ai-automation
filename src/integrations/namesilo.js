/**
 * NameSilo API Client — full registrar integration.
 *
 * NameSilo is our PRIMARY registrar:
 *   - IP whitelist is OPTIONAL (left blank → any IP connects). This is the
 *     critical feature that Namecheap lacks and which blocked us on
 *     Render's shared outbound IP pool.
 *   - Reseller use case is explicitly allowed in their TOS (private-label
 *     registrations on behalf of end customers).
 *   - Instant API key, no ID verification at signup.
 *
 * Auth & transport:
 *   - All requests are HTTP GET with key + params in the query string
 *     (auth via `key=<API_KEY>`). No headers, no POST body.
 *   - Response format pinned to JSON via `type=json`.
 *   - Success response is { request: {...}, reply: { code: 300, ... } }.
 *     Any code != 300 is treated as an error by this client.
 *
 * API docs: https://www.namesilo.com/api-reference
 */

const axios = require('axios');
const { logger } = require('../utils/logger');

const NAMESILO_BASE = 'https://www.namesilo.com/api';
const PRICING_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30000;
// No markup — we pass NameSilo's wholesale price through to the customer.
// The website activation fee is the profit center; the domain is charged
// at-cost as a trust signal ("we don't mark up domains").

let pricingCache = { fetchedAt: 0, prices: {} };

// ─── CORE REQUEST ──────────────────────────────────────────────────

/**
 * Make a NameSilo API call. All endpoints are HTTP GET with params in
 * the query string. Returns the parsed `reply` object on success, throws
 * Error with `reply.detail` on failure.
 */
async function nsRequest(endpoint, params = {}) {
  const key = process.env.NAMESILO_API_KEY;
  if (!key) throw new Error('NAMESILO_API_KEY not configured');

  const q = new URLSearchParams({
    version: '1',
    type: 'json',
    key,
    ...params,
  });
  const url = `${NAMESILO_BASE}/${endpoint}?${q.toString()}`;

  let response;
  try {
    response = await axios.get(url, { timeout: REQUEST_TIMEOUT_MS });
  } catch (err) {
    const detail = err.response
      ? `HTTP ${err.response.status}: ${String(err.response.data).slice(0, 300)}`
      : err.message || err.code || 'network error';
    logger.error(`[NAMESILO] HTTP call failed for ${endpoint}: ${detail}`);
    throw new Error(`NameSilo HTTP: ${detail}`);
  }

  const reply = response.data?.reply;
  if (!reply) throw new Error('NameSilo response missing `reply` block');
  // Code 300 = full success, 301 = partial success (some ops succeeded, some didn't).
  // Anything else is a hard error we surface to the caller.
  if (reply.code !== 300 && reply.code !== 301) {
    const msg = reply.detail || `code ${reply.code}`;
    logger.error(`[NAMESILO] API error on ${endpoint}: ${msg}`);
    throw new Error(`NameSilo: ${msg}`);
  }
  return reply;
}

// ─── PRICING ──────────────────────────────────────────────────────

/**
 * Fetch 1-year registration prices for all TLDs NameSilo carries.
 * Returns raw NameSilo prices (no markup) — we pass the wholesale cost
 * straight through to the customer. Cached for 24h.
 */
async function getTldPricing() {
  const now = Date.now();
  if (now - pricingCache.fetchedAt < PRICING_TTL_MS && Object.keys(pricingCache.prices).length) {
    return pricingCache.prices;
  }

  try {
    const reply = await nsRequest('getPrices');
    const prices = {};
    // Response shape: reply = { code, detail, com: { registration, renew, transfer }, net: {...}, ... }
    // Skip non-TLD fields like 'code' and 'detail'.
    for (const [tld, info] of Object.entries(reply)) {
      if (tld === 'code' || tld === 'detail') continue;
      const reg = parseFloat(info?.registration);
      if (reg > 0 && Number.isFinite(reg)) {
        prices[tld.toLowerCase()] = reg;
      }
    }

    pricingCache = { fetchedAt: now, prices };
    logger.info(`[NAMESILO] TLD pricing cached: ${Object.keys(prices).length} TLDs (at-cost)`);
    return prices;
  } catch (err) {
    logger.error(`[NAMESILO] getTldPricing failed: ${err.message}`);
    return pricingCache.prices || {};
  }
}

/**
 * Cost-basis price (pre-markup) for a specific TLD. Used for balance
 * pre-flight checks before registration.
 */
async function costPriceForTld(tld) {
  const clean = String(tld || '').toLowerCase().replace(/^\./, '');
  if (!clean) return null;
  try {
    const reply = await nsRequest('getPrices');
    const info = reply[clean];
    const reg = parseFloat(info?.registration);
    return reg > 0 ? reg : null;
  } catch {
    return null;
  }
}

// ─── AVAILABILITY ──────────────────────────────────────────────────

/**
 * Check availability for a base name across our default TLDs. Uses a
 * single `checkRegisterAvailability` call (batches all TLDs in one request).
 * Returns rows in the shape our domain-checker expects.
 *
 * NameSilo's availability reply returns per-domain `price` inline — we
 * use that directly (no second `getPrices` call needed), then apply the
 * configured markup.
 */
// NameSilo's JSON response shape is frustrating: for multi-domain queries
// `available`/`unavailable`/`invalid` come back as arrays, but for single-
// domain queries they nest as `{ domain: {...} }` (the XML-to-JSON parser
// treats a lone <domain> element differently). Normalize both cases.
function normalizeDomainList(section) {
  if (section == null) return [];
  if (Array.isArray(section)) return section;
  if (typeof section === 'object') {
    // Single-row case: { domain: { domain: "x", price: ... } }
    if (section.domain && typeof section.domain === 'object') return [section.domain];
    // Bare object that already IS the row
    if (section.domain && typeof section.domain === 'string') return [section];
  }
  return [section];
}

async function checkDomainAvailability(baseName, tldList) {
  const sanitized = baseName.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!sanitized || sanitized.length < 2) return [];

  // Caller can pass an explicit TLD list (e.g. widened pool for filtering
  // to ≤$25, or a single TLD for a targeted lookup). Defaults to the
  // classic 5 for backwards compatibility.
  const tlds = (Array.isArray(tldList) && tldList.length)
    ? tldList.map((t) => (t.startsWith('.') ? t : `.${t}`))
    : ['.com', '.co', '.io', '.net', '.org'];
  const domains = tlds.map((tld) => sanitized + tld);

  let reply;
  try {
    reply = await nsRequest('checkRegisterAvailability', { domains: domains.join(',') });
  } catch (err) {
    logger.error(`[NAMESILO] Availability check failed: ${err.message}`);
    throw err;
  }

  const avail = normalizeDomainList(reply.available);
  const invalid = normalizeDomainList(reply.invalid);

  // Build final result in the same order as input domains. Price is raw
  // NameSilo wholesale — no markup applied.
  return domains.map((d) => {
    const a = avail.find((row) => (row.domain || row) === d);
    if (a) {
      const rawPrice = parseFloat(a.price) || 0;
      return {
        domain: d,
        available: true,
        premium: (a.premium || 0) > 0,
        price: rawPrice > 0 ? rawPrice.toFixed(2) : '',
      };
    }
    const isInvalid = invalid.some((row) => (row.domain || row) === d);
    return {
      domain: d,
      available: false,
      premium: false,
      price: '',
      reason: isInvalid ? 'invalid' : 'taken',
    };
  });
}

/**
 * Check availability + price for a pre-built list of full domains (any
 * mix of bases and TLDs). Used by the alternative-name suggestion flow —
 * LLM proposes 5 base names, we query each × 2-3 TLDs in one batch call.
 *
 * Returns rows in the same shape as checkDomainAvailability.
 */
async function checkDomainsExact(domainList) {
  if (!Array.isArray(domainList) || domainList.length === 0) return [];
  const cleanDomains = domainList
    .map((d) => String(d || '').toLowerCase().trim())
    .filter((d) => /^[a-z0-9][a-z0-9-]*\.[a-z]{2,}$/.test(d));
  if (cleanDomains.length === 0) return [];

  let reply;
  try {
    reply = await nsRequest('checkRegisterAvailability', { domains: cleanDomains.join(',') });
  } catch (err) {
    logger.error(`[NAMESILO] Batch availability check failed: ${err.message}`);
    throw err;
  }

  const avail = normalizeDomainList(reply.available);
  const invalid = normalizeDomainList(reply.invalid);

  return cleanDomains.map((d) => {
    const a = avail.find((row) => (row.domain || row) === d);
    if (a) {
      const rawPrice = parseFloat(a.price) || 0;
      return {
        domain: d,
        available: true,
        premium: (a.premium || 0) > 0,
        price: rawPrice > 0 ? rawPrice.toFixed(2) : '',
      };
    }
    const isInvalid = invalid.some((row) => (row.domain || row) === d);
    return {
      domain: d,
      available: false,
      premium: false,
      price: '',
      reason: isInvalid ? 'invalid' : 'taken',
    };
  });
}

/**
 * Check a single specific domain (e.g. user typed the full name they want).
 * Returns NameSilo's wholesale price directly (no markup).
 */
async function checkSingleDomain(domain) {
  const clean = domain.toLowerCase().trim();

  const reply = await nsRequest('checkRegisterAvailability', { domains: clean });
  const avail = normalizeDomainList(reply.available);
  const a = avail.find((row) => (row.domain || row) === clean);
  if (a) {
    const rawPrice = parseFloat(a.price) || 0;
    return {
      domain: clean,
      available: true,
      premium: (a.premium || 0) > 0,
      price: rawPrice > 0 ? rawPrice.toFixed(2) : '',
      rawPrice,
    };
  }
  return { domain: clean, available: false, premium: false, price: '' };
}

// ─── CONTACT MANAGEMENT ────────────────────────────────────────────
// NameSilo requires a contact profile on the account BEFORE registerDomain
// can be called. We maintain one default reseller contact (Pixie's own
// business info) and reuse its contact_id for every purchase. This is
// allowed under NameSilo's private-label/reseller rules: the domain is
// registered under our contact info, we manage it for the customer.

const DEFAULT_CONTACT = {
  fn: process.env.NAMESILO_CONTACT_FIRST_NAME || 'Bytes',
  ln: process.env.NAMESILO_CONTACT_LAST_NAME || 'Platform',
  cp: process.env.NAMESILO_CONTACT_COMPANY || 'Bytes Platform',
  ad: process.env.NAMESILO_CONTACT_ADDRESS || '123 Main St',
  cy: process.env.NAMESILO_CONTACT_CITY || 'New York',
  st: process.env.NAMESILO_CONTACT_STATE || 'NY',
  zp: process.env.NAMESILO_CONTACT_ZIP || '10001',
  ct: process.env.NAMESILO_CONTACT_COUNTRY || 'US',
  em: process.env.NAMESILO_CONTACT_EMAIL || 'bytesuite@bytesplatform.com',
  ph: process.env.NAMESILO_CONTACT_PHONE || '+1.2125551234',
};

let cachedContactId = null;

async function addContact(contact = DEFAULT_CONTACT) {
  const reply = await nsRequest('contactAdd', contact);
  return reply.contact_id;
}

/**
 * Ensure we have a contact profile on the NameSilo account. If the user
 * has NAMESILO_CONTACT_ID in env, use that. Otherwise create one on first
 * registration and cache for this process lifetime.
 */
async function ensureContactId() {
  if (process.env.NAMESILO_CONTACT_ID) return process.env.NAMESILO_CONTACT_ID;
  if (cachedContactId) return cachedContactId;
  cachedContactId = await addContact();
  logger.info(`[NAMESILO] Created default reseller contact: ${cachedContactId}`);
  return cachedContactId;
}

// ─── REGISTRATION ──────────────────────────────────────────────────

/**
 * Register a domain via NameSilo. Charges the account balance.
 * Requires a contact_id on file (auto-managed above).
 *
 * Defaults we set:
 *   - private = 1 (free WHOIS privacy, included)
 *   - auto_renew = 0 (manual renewal; we bill the customer separately
 *     if they want year-2)
 */
async function registerDomain(domain, years = 1) {
  const clean = domain.toLowerCase().trim();
  const contactId = await ensureContactId();

  const reply = await nsRequest('registerDomain', {
    domain: clean,
    years: String(years),
    private: '1',
    auto_renew: '0',
    // Use our contact profile for all registrant roles
    registrant: contactId,
    admin: contactId,
    tech: contactId,
    billing: contactId,
  });

  logger.info(`[NAMESILO] Domain registered: ${clean} (years=${years}, order=${reply.order_amount || '?'})`);
  return {
    registered: true,
    domain: clean,
    chargedAmount: reply.order_amount || '',
    orderId: reply.order_number || '',
    raw: reply,
  };
}

// ─── DNS FOR NETLIFY ───────────────────────────────────────────────

/**
 * Configure DNS records so the domain points at the Netlify site:
 *   - A record @ → 75.2.60.5 (Netlify's load balancer)
 *   - CNAME www → <subdomain>.netlify.app
 *
 * NameSilo's dnsAddRecord takes rrtype, rrhost, rrvalue, rrttl.
 */
async function setDNSForNetlify(domain, netlifySubdomain) {
  const clean = domain.toLowerCase().trim();

  // Apex A record
  try {
    await nsRequest('dnsAddRecord', {
      domain: clean,
      rrtype: 'A',
      rrhost: '',             // empty host = apex (@)
      rrvalue: '75.2.60.5',
      rrttl: '300',
    });
    logger.info(`[NAMESILO] A record created for ${clean} → 75.2.60.5`);
  } catch (err) {
    logger.error(`[NAMESILO] Failed to create A record for ${clean}: ${err.message}`);
    throw err;
  }

  // www CNAME (non-fatal if it fails — A record alone is enough for apex)
  try {
    await nsRequest('dnsAddRecord', {
      domain: clean,
      rrtype: 'CNAME',
      rrhost: 'www',
      rrvalue: `${netlifySubdomain}.netlify.app`,
      rrttl: '300',
    });
    logger.info(`[NAMESILO] CNAME created for www.${clean} → ${netlifySubdomain}.netlify.app`);
  } catch (err) {
    logger.warn(`[NAMESILO] www CNAME create failed for ${clean}: ${err.message}`);
  }

  return true;
}

// ─── ACCOUNT BALANCE ───────────────────────────────────────────────

async function getAccountBalance() {
  try {
    const reply = await nsRequest('getAccountBalance');
    return parseFloat(reply.balance) || 0;
  } catch (err) {
    logger.error(`[NAMESILO] getAccountBalance failed: ${err.message}`);
    return null;
  }
}

// ─── FULL AUTOMATED PURCHASE FLOW ──────────────────────────────────

/**
 * Full flow: availability → balance → register → DNS. Signature mirrors
 * the Namecheap + Porkbun helpers so postPayment.js can swap registrars
 * with one import line change.
 */
async function purchaseAndConfigureDomain(domain, netlifySubdomain) {
  const clean = domain.toLowerCase().trim();

  try {
    // 1. Verify still available
    const check = await checkSingleDomain(clean);
    if (!check.available) {
      return { success: false, domain: clean, error: 'Domain is no longer available' };
    }
    if (check.premium) {
      return { success: false, domain: clean, error: 'Domain is premium-priced and cannot be auto-purchased' };
    }

    // 2. Balance pre-flight
    const cost = check.rawPrice;
    const balance = await getAccountBalance();
    if (cost > 0 && balance != null && balance < cost) {
      return {
        success: false,
        domain: clean,
        error: `NameSilo balance ($${balance.toFixed(2)}) is below registration cost ($${cost.toFixed(2)}). Top up the account.`,
      };
    }

    // 3. Register
    const reg = await registerDomain(clean, 1);
    if (!reg.registered) {
      return { success: false, domain: clean, error: 'Registration failed' };
    }

    // 4. DNS
    await setDNSForNetlify(clean, netlifySubdomain);

    return {
      success: true,
      domain: clean,
      chargedAmount: reg.chargedAmount,
      orderId: reg.orderId,
    };
  } catch (err) {
    return { success: false, domain: clean, error: err.message };
  }
}

// ─── HEALTH CHECK ──────────────────────────────────────────────────

async function ping() {
  try {
    const reply = await nsRequest('getAccountBalance');
    return { ok: true, balance: parseFloat(reply.balance) || 0 };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  getTldPricing,
  costPriceForTld,
  checkDomainAvailability,
  checkDomainsExact,
  checkSingleDomain,
  addContact,
  ensureContactId,
  registerDomain,
  setDNSForNetlify,
  getAccountBalance,
  purchaseAndConfigureDomain,
  ping,
};
