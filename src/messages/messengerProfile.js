// Messenger / Instagram display-name resolver.
//
// Meta's webhook payloads carry only the user's Page-Scoped ID (PSID for
// Messenger) or Instagram-Scoped ID (IGSID) — never their display name.
// To get a friendly name we have to call Graph API per user the first
// time they message us:
//
//   Messenger:  GET /{PSID}?fields=first_name,last_name&access_token=PAGE_TOKEN
//   Instagram:  GET /{IGSID}?fields=name,username&access_token=IG_TOKEN
//
// Both require a token scoped to the same Page / IG Business account
// the user just messaged. We already have those tokens in env config.
//
// Caching:
//   - In-memory Map keyed by `${channel}:${id}` — names don't change
//     often and a 24h TTL is plenty.
//   - Negative results (token missing, permissions error, user not
//     found) are cached for half the TTL so a hard failure doesn't
//     hammer Graph for every message in the same conversation.
//
// Best-effort throughout — caller treats null/empty as "no name yet"
// and the welcome handler will pick the name up on a later turn once
// the cache or token state recovers.

const axios = require('axios');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

const PROFILE_CACHE = new Map(); // key: `${channel}:${id}` → { name, fetchedAt }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;       // 24h on success
const FAIL_CACHE_TTL_MS = 30 * 60 * 1000;        // 30m on failure
const REQUEST_TIMEOUT_MS = 5_000;
const GRAPH_BASE = 'https://graph.facebook.com';

function tokenFor(channel) {
  if (channel === 'instagram') {
    return env.messenger?.instagramAccessToken || env.messenger?.pageAccessToken || '';
  }
  return env.messenger?.pageAccessToken || '';
}

function buildName(data, channel) {
  if (!data) return '';
  if (channel === 'instagram') {
    // Instagram returns `name` (display) and `username` (handle). Prefer
    // the display name; fall back to @username if name is missing.
    if (data.name) return String(data.name).trim();
    if (data.username) return `@${String(data.username).trim()}`;
    return '';
  }
  // Messenger returns first_name / last_name.
  const first = data.first_name ? String(data.first_name).trim() : '';
  const last = data.last_name ? String(data.last_name).trim() : '';
  return [first, last].filter(Boolean).join(' ');
}

/**
 * Resolve a Messenger / Instagram user's display name from their PSID
 * or IGSID. Returns the name as a string ('' when no name could be
 * resolved). Never throws — failures are logged and cached briefly so
 * subsequent messages in the same conversation don't repeat the call.
 *
 * @param {string} senderId  PSID for Messenger / IGSID for Instagram
 * @param {'messenger'|'instagram'} channel
 * @returns {Promise<string>}
 */
async function fetchMessengerProfile(senderId, channel) {
  if (!senderId || (channel !== 'messenger' && channel !== 'instagram')) return '';

  const key = `${channel}:${senderId}`;
  const cached = PROFILE_CACHE.get(key);
  const now = Date.now();
  if (cached) {
    const ttl = cached.name ? CACHE_TTL_MS : FAIL_CACHE_TTL_MS;
    if (now - cached.fetchedAt < ttl) return cached.name || '';
  }

  const token = tokenFor(channel);
  if (!token) {
    logger.debug(`[MSG-PROFILE] No ${channel} access token configured — skipping name fetch for ${senderId}`);
    PROFILE_CACHE.set(key, { name: '', fetchedAt: now });
    return '';
  }

  const fields = channel === 'instagram' ? 'name,username' : 'first_name,last_name';
  const url = `${GRAPH_BASE}/${encodeURIComponent(senderId)}`;

  try {
    const response = await axios.get(url, {
      params: { fields, access_token: token },
      timeout: REQUEST_TIMEOUT_MS,
    });
    const name = buildName(response?.data, channel);
    PROFILE_CACHE.set(key, { name, fetchedAt: now });
    if (name) {
      logger.info(`[MSG-PROFILE] Resolved ${channel} ${senderId} → "${name}"`);
    } else {
      logger.debug(`[MSG-PROFILE] ${channel} ${senderId} returned no name fields`);
    }
    return name;
  } catch (err) {
    const status = err?.response?.status;
    const metaCode = err?.response?.data?.error?.code;
    const metaMsg = err?.response?.data?.error?.message;
    logger.warn(
      `[MSG-PROFILE] ${channel} profile fetch failed for ${senderId}: ` +
        `${err.message}${status ? ` (HTTP ${status})` : ''}${metaCode ? ` Meta:${metaCode} ${metaMsg}` : ''}`
    );
    PROFILE_CACHE.set(key, { name: '', fetchedAt: now });
    return '';
  }
}

/**
 * Wipe the cache. Exposed for tests / admin tooling — not used at
 * runtime. Process restart also clears it (cache is in-memory only).
 */
function clearProfileCache() {
  PROFILE_CACHE.clear();
}

module.exports = { fetchMessengerProfile, clearProfileCache };
