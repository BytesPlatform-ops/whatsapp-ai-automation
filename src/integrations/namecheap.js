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
  EmailAddress: 'bytesuite@bytesplatform.com',
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

// TLD registration-price cache (keyed by TLD without leading dot, e.g. "com")
const PRICING_TTL_MS = 24 * 60 * 60 * 1000;
let pricingCache = { fetchedAt: 0, prices: {} };

/**
 * Fetch 1-year registration prices for domain TLDs from Namecheap.
 * Cached in-memory for 24h. Returns a map like { com: 10.98, co: 25.98, ... }.
 */
async function getTldPricing() {
  const now = Date.now();
  if (now - pricingCache.fetchedAt < PRICING_TTL_MS && Object.keys(pricingCache.prices).length) {
    return pricingCache.prices;
  }

  try {
    const result = await ncRequest('namecheap.users.getPricing', {
      ProductType: 'DOMAIN',
      ProductCategory: 'REGISTER',
      ActionName: 'REGISTER',
    });

    const prices = {};
    const productType = result.UserGetPricingResult?.ProductType;
    const categories = productType?.ProductCategory;
    const categoryList = Array.isArray(categories) ? categories : [categories];

    for (const cat of categoryList) {
      if (!cat || cat.$?.Name?.toLowerCase() !== 'register') continue;
      const products = Array.isArray(cat.Product) ? cat.Product : [cat.Product];
      for (const product of products) {
        if (!product) continue;
        const tld = product.$?.Name?.toLowerCase();
        const priceEntries = Array.isArray(product.Price) ? product.Price : [product.Price];
        const oneYear = priceEntries.find(p => p?.$?.Duration === '1');
        if (tld && oneYear?.$?.Price) {
          prices[tld] = parseFloat(oneYear.$.Price);
        }
      }
    }

    pricingCache = { fetchedAt: now, prices };
    logger.info(`[NAMECHEAP] TLD pricing cached: ${Object.keys(prices).length} TLDs`);
    return prices;
  } catch (err) {
    logger.error('[NAMECHEAP] getTldPricing failed:', err.message);
    return pricingCache.prices || {};
  }
}

/**
 * Check availability of multiple domains.
 * @param {string[]} domains - Array of full domain names (e.g., ['mybiz.com', 'mybiz.co'])
 * @returns {Array<{domain: string, available: boolean, premium: boolean, price: string}>}
 */
async function checkDomains(domains) {
  if (!domains || domains.length === 0) return [];

  try {
    const [result, tldPrices] = await Promise.all([
      ncRequest('namecheap.domains.check', { DomainList: domains.join(',') }),
      getTldPricing(),
    ]);

    const checks = result.DomainCheckResult;
    const items = Array.isArray(checks) ? checks : [checks];

    return items.map(item => {
      const domain = item.$.Domain;
      const premium = item.$.IsPremiumDomain === 'true';
      const premiumPrice = item.$.PremiumRegistrationPrice;
      const tld = domain.split('.').pop().toLowerCase();

      let price = '';
      if (premium && premiumPrice && parseFloat(premiumPrice) > 0) {
        price = parseFloat(premiumPrice).toFixed(2);
      } else if (tldPrices[tld]) {
        price = tldPrices[tld].toFixed(2);
      }

      return { domain, available: item.$.Available === 'true', premium, price };
    });
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
  getTldPricing,
  registerDomain,
  setDNSForNetlify,
  purchaseAndConfigureDomain,
};
