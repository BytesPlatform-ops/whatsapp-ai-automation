const dns = require('dns').promises;
const { logger } = require('../utils/logger');
const { env } = require('../config/env');

/**
 * Check availability + pricing for a base name across multiple TLDs.
 *
 * NameSilo is the PRIMARY registrar (no IP whitelist, reseller-friendly TOS,
 * instant signup). Namecheap is kept as an env-gated fallback only — used
 * when NameSilo isn't configured.
 *
 * Strategy:
 *   1. NameSilo primary — one GET, returns availability + price inline.
 *   2. Namecheap fallback — legacy, rarely used in production now.
 *   3. All fail → throw DomainLookupUnavailable so webDev.js routes the
 *      user to own/skip instead of quoting a zero price.
 */
class DomainLookupUnavailable extends Error {
  constructor(cause) {
    super(`Domain lookup unavailable: ${cause}`);
    this.name = 'DomainLookupUnavailable';
    this.code = 'DOMAIN_LOOKUP_UNAVAILABLE';
  }
}

async function checkDomainAvailability(baseName) {
  const sanitized = baseName.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!sanitized || sanitized.length < 2) return [];

  const hasNameSilo = !!process.env.NAMESILO_API_KEY;
  const hasNamecheap = !!env.namecheap.apiKey;

  // 1. NameSilo primary.
  if (hasNameSilo) {
    try {
      const namesilo = require('../integrations/namesilo');
      const results = await namesilo.checkDomainAvailability(sanitized);

      const hasAnyPriced = results.some(
        (r) => r.available && !r.premium && r.price && parseFloat(r.price) > 0
      );
      if (!hasAnyPriced) {
        throw new DomainLookupUnavailable('NameSilo returned no priced results');
      }

      return results.map((r) => ({ ...r, priceSource: 'namesilo' }));
    } catch (err) {
      if (err instanceof DomainLookupUnavailable) throw err;
      logger.error(`[DOMAIN] NameSilo lookup failed: ${err.message}`);
      // Fall through to Namecheap fallback if present, else rethrow.
      if (!hasNamecheap) throw new DomainLookupUnavailable(err.message);
    }
  }

  // 2. Namecheap fallback (legacy).
  if (hasNamecheap) {
    try {
      const { checkDomainAvailability: ncCheck } = require('../integrations/namecheap');
      const results = await ncCheck(sanitized);

      const hasAnyPriced = results.some(
        (r) => r.available && !r.premium && r.price && parseFloat(r.price) > 0
      );
      if (hasAnyPriced) {
        return results.map((r) => ({ ...r, priceSource: 'namecheap' }));
      }

      throw new DomainLookupUnavailable('Namecheap returned no priced results');
    } catch (err) {
      if (err instanceof DomainLookupUnavailable) throw err;
      logger.error(`[DOMAIN] Namecheap fallback failed: ${err.message}`);
      throw new DomainLookupUnavailable(err.message);
    }
  }

  throw new DomainLookupUnavailable('No registrar configured');
}

/**
 * Verify if a domain's DNS is pointing to a Netlify site.
 */
async function verifyDNS(domain) {
  try {
    const cnames = await dns.resolveCname(`www.${domain}`);
    if (cnames.some(c => c.toLowerCase().includes('netlify'))) return { verified: true, type: 'cname' };
  } catch {}

  try {
    const addresses = await dns.resolve4(domain);
    if (addresses.includes('75.2.60.5')) return { verified: true, type: 'a-record' };
  } catch {}

  return { verified: false };
}

module.exports = { checkDomainAvailability, verifyDNS, DomainLookupUnavailable };
