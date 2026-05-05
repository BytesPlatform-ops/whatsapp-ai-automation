// SSRF / DNS-rebinding-safe HTTP fetch wrapper.
//
// validateUrl() in validators.js gates user-supplied URLs at intake time,
// but axios re-resolves DNS at fetch time (often 5–15s later for SEO
// audits). A malicious domain can resolve to a public IP at validation
// and a private IP at fetch. This wrapper closes that window by:
//
//   1. Resolving the hostname ourselves via dns.lookup({ all: true }).
//   2. Failing closed if ANY returned A/AAAA record is private/loopback/
//      link-local/multicast — even one bad record is enough.
//   3. Pinning axios to the public IP we just validated, so the actual
//      TCP connection skips DNS entirely. SNI / Host header keep the
//      original hostname so HTTPS certificates still validate.
//
// Redirects are followed manually (axios maxRedirects: 0) so each hop
// goes through the same DNS check before connecting.

const axios = require('axios');
const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const { URL } = require('url');
const net = require('net');
const { isPrivateIp } = require('./validators');
const { logger } = require('./logger');

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_REDIRECTS = 5;

class SsrfBlockedError extends Error {
  constructor(reason, host, ip) {
    super(`SSRF blocked: ${reason} (host=${host}, ip=${ip || 'n/a'})`);
    this.name = 'SsrfBlockedError';
    this.reason = reason;
    this.host = host;
    this.ip = ip || null;
  }
}

/**
 * Resolve `hostname` and confirm every returned IP is publicly routable.
 * Returns the first public IP for pinning; throws SsrfBlockedError if any
 * record is private. Treating a partially-private resolution as failure
 * is intentional — letting one private record through is the rebinding
 * attack we're guarding against.
 */
async function resolveAndCheck(hostname) {
  // Reject IP literals up front: validateUrl already did this for the
  // user-supplied URL, but redirect targets could re-introduce them.
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new SsrfBlockedError('ip_literal_private', hostname, hostname);
    }
    return { ip: hostname, family: net.isIP(hostname) };
  }

  let records;
  try {
    records = await dns.lookup(hostname, { all: true, family: 0, verbatim: true });
  } catch (err) {
    throw new SsrfBlockedError(`dns_lookup_failed:${err.code || err.message}`, hostname);
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new SsrfBlockedError('dns_empty', hostname);
  }

  for (const rec of records) {
    if (isPrivateIp(rec.address)) {
      throw new SsrfBlockedError('resolved_to_private', hostname, rec.address);
    }
  }

  return { ip: records[0].address, family: records[0].family };
}

/**
 * Build a custom DNS lookup function for axios's http/https agents that
 * ALWAYS returns the IP we pre-validated, regardless of what the caller
 * asks for. This collapses the rebinding window: the IP that passed our
 * private-range check is the same IP we connect to.
 */
function pinnedLookup(ip, family) {
  return function lookup(_hostname, _opts, cb) {
    // Node's API can pass either (hostname, opts, cb) or (hostname, cb).
    const callback = typeof _opts === 'function' ? _opts : cb;
    callback(null, ip, family);
  };
}

function buildPinnedAgents(ip, family) {
  const lookup = pinnedLookup(ip, family);
  return {
    httpAgent: new http.Agent({ lookup, keepAlive: false }),
    httpsAgent: new https.Agent({ lookup, keepAlive: false }),
  };
}

/**
 * Internal: do one HTTP round-trip with DNS pinned, no axios redirect
 * following. Returns the raw axios response so the redirect loop above
 * can read Location headers itself.
 */
async function singleRequest(method, url, options) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError('non_http_scheme', parsed.hostname);
  }
  const { ip, family } = await resolveAndCheck(parsed.hostname);
  const { httpAgent, httpsAgent } = buildPinnedAgents(ip, family);

  return axios.request({
    ...options,
    method,
    url,
    httpAgent,
    httpsAgent,
    maxRedirects: 0,
    timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
    maxContentLength: options.maxContentLength ?? DEFAULT_MAX_BYTES,
    maxBodyLength: options.maxBodyLength ?? DEFAULT_MAX_BYTES,
    // 3xx is not an axios error here — we handle redirects manually.
    validateStatus: options.validateStatus || (() => true),
  });
}

/**
 * Public entry: GET / HEAD with DNS pinning + manual safe redirect
 * following. Each hop re-runs the resolve-and-check pass so a redirect
 * to a private host is rejected just like the original URL would be.
 */
async function safeRequest(method, url, options = {}) {
  let currentUrl = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res;
    try {
      res = await singleRequest(method, currentUrl, options);
    } catch (err) {
      // SsrfBlocked is a security signal; surface it. axios network
      // errors (timeout, connection refused) are normal fetch failures
      // — wrap them in the same shape callers already expect from the
      // pre-existing safeGet helper so swap-in is mechanical.
      if (err instanceof SsrfBlockedError) {
        logger.warn(`[SAFE-FETCH] ${err.message}`);
        throw err;
      }
      logger.debug(`[SAFE-FETCH] ${method} ${currentUrl} failed: ${err.message}`);
      throw err;
    }
    if (res.status >= 300 && res.status < 400 && res.headers && res.headers.location) {
      const next = new URL(res.headers.location, currentUrl).toString();
      logger.debug(`[SAFE-FETCH] redirect ${res.status} → ${next}`);
      currentUrl = next;
      continue;
    }
    return res;
  }
  throw new SsrfBlockedError('too_many_redirects', new URL(currentUrl).hostname);
}

function safeAxiosGet(url, options = {}) {
  return safeRequest('GET', url, options);
}

function safeAxiosHead(url, options = {}) {
  return safeRequest('HEAD', url, options);
}

module.exports = {
  safeAxiosGet,
  safeAxiosHead,
  SsrfBlockedError,
  // Exported for tests / advanced callers that want the resolution check
  // without the axios round-trip.
  resolveAndCheck,
};
