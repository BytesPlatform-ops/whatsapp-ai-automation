const dns = require('dns').promises;
const { logger } = require('../utils/logger');
const { env } = require('../config/env');

/**
 * Check availability of a base name across multiple TLDs.
 * Uses Namecheap API if configured, falls back to DNS heuristic.
 */
async function checkDomainAvailability(baseName) {
  const sanitized = baseName.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!sanitized || sanitized.length < 2) return [];

  // Use Namecheap API if configured (more accurate)
  if (env.namecheap.apiKey) {
    try {
      const { checkDomainAvailability: ncCheck } = require('../integrations/namecheap');
      return await ncCheck(sanitized);
    } catch (err) {
      logger.error('[DOMAIN] Namecheap check failed, falling back to DNS:', err.message);
    }
  }

  // Fallback: DNS heuristic
  const tlds = ['.com', '.co', '.io', '.net', '.org'];
  const results = await Promise.all(
    tlds.map(async (tld) => {
      const domain = sanitized + tld;
      try {
        await dns.resolve(domain);
        return { domain, available: false };
      } catch (err) {
        if (err.code === 'ENOTFOUND' || err.code === 'ENODATA' || err.code === 'ESERVFAIL') {
          return { domain, available: true };
        }
        return { domain, available: false };
      }
    })
  );
  return results;
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

module.exports = { checkDomainAvailability, verifyDNS };
