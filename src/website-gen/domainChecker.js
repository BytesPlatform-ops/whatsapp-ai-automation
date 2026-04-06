const dns = require('dns').promises;
const { logger } = require('../utils/logger');

/**
 * Check if a domain is likely available using DNS resolution heuristic.
 * Not 100% accurate (parked domains may have no records) but works without any API key.
 */
async function isDomainAvailable(domain) {
  try {
    await dns.resolve(domain);
    return false; // has DNS records = taken
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA' || err.code === 'ESERVFAIL') {
      return true; // likely available
    }
    return false; // err on the side of "taken"
  }
}

/**
 * Check availability of a base name across multiple TLDs.
 * @param {string} baseName - e.g. "quantiva"
 * @returns {Promise<Array<{domain: string, available: boolean}>>}
 */
async function checkDomainAvailability(baseName) {
  const sanitized = baseName.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!sanitized || sanitized.length < 2) return [];

  const tlds = ['.com', '.co', '.io', '.net', '.org'];
  const results = await Promise.all(
    tlds.map(async (tld) => {
      const domain = sanitized + tld;
      try {
        const available = await isDomainAvailable(domain);
        return { domain, available };
      } catch (err) {
        logger.error(`Domain check failed for ${domain}:`, err.message);
        return { domain, available: false };
      }
    })
  );

  return results;
}

/**
 * Generate a purchase link for a domain on popular registrars.
 */
function getPurchaseLinks(domain) {
  return {
    namecheap: `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(domain)}`,
    porkbun: `https://porkbun.com/checkout/search?q=${encodeURIComponent(domain)}`,
  };
}

/**
 * Verify if a domain's DNS is pointing to a Netlify site.
 */
async function verifyDNS(domain, netlifySubdomain) {
  const target = `${netlifySubdomain}.netlify.app`;
  try {
    // Check CNAME for www
    const cnames = await dns.resolveCname(`www.${domain}`);
    if (cnames.some(c => c.toLowerCase().includes('netlify'))) return { verified: true, type: 'cname' };
  } catch {}

  try {
    // Check A record for root domain (Netlify load balancer IP)
    const addresses = await dns.resolve4(domain);
    if (addresses.includes('75.2.60.5')) return { verified: true, type: 'a-record' };
  } catch {}

  return { verified: false };
}

module.exports = { checkDomainAvailability, getPurchaseLinks, verifyDNS };
