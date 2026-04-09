/**
 * Namecheap API Client
 *
 * Handles domain availability checks, registration, and DNS configuration.
 * Supports sandbox and production environments.
 *
 * API docs: https://www.namecheap.com/support/api/intro/
 */

const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

const NC = env.namecheap;

// Default registrant info (your company — used for all domain registrations)
const REGISTRANT = {
  FirstName: 'Bytes',
  LastName: 'Platform',
  Organization: 'Bytes Platform',
  Address1: '123 Main St',
  City: 'New York',
  StateProvince: 'NY',
  PostalCode: '10001',
  Country: 'US',
  Phone: '+1.2125551234',
  Email: 'bytesuite@bytesplatform.com',
};

/**
 * Make a Namecheap API request.
 * @param {string} command - API command (e.g., 'namecheap.domains.check')
 * @param {Object} params - Additional parameters
 * @returns {Object} Parsed XML response
 */
async function ncRequest(command, params = {}) {
  if (!NC.apiUser || !NC.apiKey) {
    throw new Error('Namecheap API credentials not configured');
  }

  const queryParams = {
    ApiUser: NC.apiUser,
    ApiKey: NC.apiKey,
    UserName: NC.apiUser,
    ClientIp: NC.clientIp,
    Command: command,
    ...params,
  };

  const queryString = Object.entries(queryParams)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const url = `${NC.baseUrl}?${queryString}`;

  logger.debug(`[NAMECHEAP] ${command}`, { params: Object.keys(params) });

  const response = await axios.get(url, { timeout: 30000 });
  const parsed = await parseStringPromise(response.data, { explicitArray: false });

  const apiResponse = parsed.ApiResponse;
  if (!apiResponse) throw new Error('Invalid Namecheap API response');

  if (apiResponse.$.Status === 'ERROR') {
    const errors = apiResponse.Errors?.Error;
    const errorMsg = Array.isArray(errors)
      ? errors.map(e => e._ || e).join('; ')
      : (errors?._ || errors || 'Unknown error');
    logger.error(`[NAMECHEAP] API error for ${command}:`, errorMsg);
    throw new Error(`Namecheap: ${errorMsg}`);
  }

  return apiResponse.CommandResponse;
}

/**
 * Check availability of multiple domains.
 * @param {string[]} domains - Array of full domain names (e.g., ['mybiz.com', 'mybiz.co'])
 * @returns {Array<{domain: string, available: boolean, premium: boolean, price: string}>}
 */
async function checkDomains(domains) {
  if (!domains || domains.length === 0) return [];

  try {
    const result = await ncRequest('namecheap.domains.check', {
      DomainList: domains.join(','),
    });

    const checks = result.DomainCheckResult;
    const items = Array.isArray(checks) ? checks : [checks];

    return items.map(item => ({
      domain: item.$.Domain,
      available: item.$.Available === 'true',
      premium: item.$.IsPremiumDomain === 'true',
      price: item.$.PremiumRegistrationPrice || '',
    }));
  } catch (err) {
    logger.error('[NAMECHEAP] Domain check failed:', err.message);
    throw err;
  }
}

/**
 * Check availability for a base name across common TLDs.
 * @param {string} baseName - e.g., 'mybusiness'
 * @returns {Array<{domain: string, available: boolean, premium: boolean}>}
 */
async function checkDomainAvailability(baseName) {
  const sanitized = baseName.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!sanitized || sanitized.length < 2) return [];

  const tlds = ['.com', '.co', '.io', '.net', '.org'];
  const domains = tlds.map(tld => sanitized + tld);

  return checkDomains(domains);
}

/**
 * Register a domain.
 * @param {string} domain - Full domain name (e.g., 'mybusiness.com')
 * @param {number} years - Number of years (default: 1)
 * @returns {{registered: boolean, domain: string, chargedAmount: string, orderId: string}}
 */
async function registerDomain(domain, years = 1) {
  const parts = domain.match(/^(.+)\.([^.]+)$/);
  if (!parts) throw new Error(`Invalid domain format: ${domain}`);

  const [, sld, tld] = parts;

  // Build registrant params for all 4 contact types
  const contactParams = {};
  ['Registrant', 'Admin', 'Tech', 'Billing'].forEach(type => {
    Object.entries(REGISTRANT).forEach(([key, val]) => {
      contactParams[`${type}${key}`] = val;
    });
  });

  try {
    const result = await ncRequest('namecheap.domains.create', {
      DomainName: domain,
      Years: years,
      ...contactParams,
      AddFreeWhoisguard: 'yes',
      WGEnabled: 'yes',
    });

    const createResult = result.DomainCreateResult?.$;
    if (!createResult) throw new Error('Unexpected registration response');

    logger.info(`[NAMECHEAP] Domain registered: ${domain} (charged: $${createResult.ChargedAmount})`);

    return {
      registered: createResult.Registered === 'true',
      domain: createResult.Domain,
      chargedAmount: createResult.ChargedAmount || '0',
      orderId: createResult.OrderId || '',
      transactionId: createResult.TransactionId || '',
    };
  } catch (err) {
    logger.error(`[NAMECHEAP] Registration failed for ${domain}:`, err.message);
    throw err;
  }
}

/**
 * Set DNS host records for a domain to point to Netlify.
 * @param {string} domain - Full domain name (e.g., 'mybusiness.com')
 * @param {string} netlifySubdomain - The Netlify subdomain (e.g., 'preview-12345')
 * @returns {boolean}
 */
async function setDNSForNetlify(domain, netlifySubdomain) {
  const parts = domain.match(/^(.+)\.([^.]+)$/);
  if (!parts) throw new Error(`Invalid domain format: ${domain}`);

  const [, sld, tld] = parts;

  try {
    // First, set nameservers to Namecheap's default (so setHosts works)
    await ncRequest('namecheap.domains.dns.setDefault', {
      SLD: sld,
      TLD: tld,
    });

    // Then set the host records
    const result = await ncRequest('namecheap.domains.dns.setHosts', {
      SLD: sld,
      TLD: tld,
      HostName1: '@',
      RecordType1: 'A',
      Address1: '75.2.60.5',
      TTL1: '1800',
      HostName2: 'www',
      RecordType2: 'CNAME',
      Address2: `${netlifySubdomain}.netlify.app`,
      TTL2: '1800',
    });

    const setResult = result.DomainDNSSetHostsResult?.$;
    const success = setResult?.IsSuccess === 'true';

    if (success) {
      logger.info(`[NAMECHEAP] DNS configured for ${domain} → ${netlifySubdomain}.netlify.app`);
    } else {
      logger.error(`[NAMECHEAP] DNS setup returned unsuccessful for ${domain}`);
    }

    return success;
  } catch (err) {
    logger.error(`[NAMECHEAP] DNS setup failed for ${domain}:`, err.message);
    throw err;
  }
}

/**
 * Full automated flow: check availability, register, and configure DNS.
 * @param {string} domain - Full domain name
 * @param {string} netlifySubdomain - Netlify subdomain for DNS
 * @returns {{success: boolean, domain: string, chargedAmount: string, error?: string}}
 */
async function purchaseAndConfigureDomain(domain, netlifySubdomain) {
  try {
    // 1. Verify it's available
    const [check] = await checkDomains([domain]);
    if (!check?.available) {
      return { success: false, domain, error: 'Domain is no longer available' };
    }
    if (check.premium) {
      return { success: false, domain, error: 'Domain is premium-priced and cannot be auto-purchased' };
    }

    // 2. Register it
    const reg = await registerDomain(domain);
    if (!reg.registered) {
      return { success: false, domain, error: 'Registration failed' };
    }

    // 3. Configure DNS
    await setDNSForNetlify(domain, netlifySubdomain);

    return {
      success: true,
      domain,
      chargedAmount: reg.chargedAmount,
      orderId: reg.orderId,
    };
  } catch (err) {
    return { success: false, domain, error: err.message };
  }
}

module.exports = {
  checkDomains,
  checkDomainAvailability,
  registerDomain,
  setDNSForNetlify,
  purchaseAndConfigureDomain,
};
