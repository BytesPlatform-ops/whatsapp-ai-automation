const dns = require('dns').promises;
const { logger } = require('../utils/logger');
const { env } = require('../config/env');

/**
 * Check availability of a base name across multiple TLDs via Namecheap.
 * Returns an array of { domain, available, premium, price, priceSource }.
 *
 * When Namecheap is unreachable we throw a recognizable error up to the
 * caller (NO estimates — quoting a made-up price risks under-charging the
 * customer vs. what Namecheap actually bills us at registration). The
 * WebDev handler catches and routes the user to "own"/"skip" instead.
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

  if (!env.namecheap.apiKey) {
    throw new DomainLookupUnavailable('Namecheap API not configured');
  }

  try {
    const { checkDomainAvailability: ncCheck } = require('../integrations/namecheap');
    const results = await ncCheck(sanitized);

    // If Namecheap returned availability but NO price for available/non-premium
    // rows, pricing fetch silently failed. Treat it as unusable — never
    // quote "$0" or make up a number.
    const hasAnyAvailable = results.some((r) => r.available && !r.premium);
    const hasAnyPricedAvailable = results.some(
      (r) => r.available && !r.premium && r.price && parseFloat(r.price) > 0
    );
    if (hasAnyAvailable && !hasAnyPricedAvailable) {
      throw new DomainLookupUnavailable('Namecheap returned no prices');
    }

    return results.map((r) => ({ ...r, priceSource: 'namecheap' }));
  } catch (err) {
    if (err instanceof DomainLookupUnavailable) throw err;
    logger.error(`[DOMAIN] Namecheap lookup failed: ${err.message}`);
    throw new DomainLookupUnavailable(err.message);
  }
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
