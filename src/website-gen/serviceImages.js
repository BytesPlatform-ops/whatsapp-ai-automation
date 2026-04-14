const axios = require('axios');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

const UNSPLASH_API = 'https://api.unsplash.com';
const UTM = 'utm_source=bytes_platform&utm_medium=referral';
const CONCURRENCY = 4;
const PER_FETCH_TIMEOUT_MS = 7000;

// In-memory cache of query → image result (or null for confirmed misses).
// Unsplash demo apps are capped at 50 req/hr, so caching across builds in the
// same process prevents re-fetching the same salon services over and over.
// Cleared naturally when the bot restarts; not shared across instances.
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map(); // query -> { at, value }

function cacheGet(query) {
  const hit = cache.get(query);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(query);
    return undefined;
  }
  return hit.value;
}
function cacheSet(query, value) {
  cache.set(query, { at: Date.now(), value });
}

// Sharpen the Unsplash query by mapping common salon-service terms to visual cues.
// Order matters: first match wins, so put more specific patterns first.
const QUERY_HINTS = [
  [/hair spa/i, 'hair spa treatment'],
  [/head massage/i, 'head massage spa'],
  [/body (polish|scrub|wrap)/i, 'body spa treatment'],
  [/balayage|highlights?/i, 'balayage hair color'],
  [/\bcolou?r\b/i, 'hair color salon'],
  [/keratin|smooth(?:ing)?/i, 'keratin hair treatment'],
  [/blow.?dry|styling/i, 'blow dry styling'],
  [/wash|shampoo/i, 'hair wash salon'],
  [/\bcut\b|haircut|trim/i, 'haircut salon'],
  [/gel (mani|nail)/i, 'gel manicure'],
  [/manicure/i, 'manicure hands nails'],
  [/pedicure/i, 'pedicure feet nails'],
  [/acrylic/i, 'acrylic nails'],
  [/nail art/i, 'nail art'],
  [/\bnail/i, 'nails manicure'],
  [/cleanup|clean.?up/i, 'facial cleanup skin'],
  [/facial/i, 'facial treatment spa'],
  [/peel|microderm|dermaplan|skin care/i, 'skincare facial'],
  [/lash/i, 'lash extensions eyelash'],
  [/brow|microblad/i, 'eyebrow beauty'],
  [/threading/i, 'eyebrow threading beauty'],
  [/wax/i, 'waxing beauty salon'],
  [/bleach/i, 'facial skin beauty'],
  [/massage/i, 'massage spa'],
  [/bridal|wedding/i, 'bridal hair makeup'],
  [/party/i, 'party makeup'],
  [/makeup/i, 'makeup artist'],
  [/barber|men/i, 'barber shop'],
];

// Broad fallback queries by category — used when the specific query returns
// zero results so we still get a thematically relevant image.
const CATEGORY_FALLBACK = {
  Hair: 'hair salon interior',
  Nails: 'nail salon',
  Skin: 'facial spa skincare',
  'Lash & Brow': 'beauty salon',
  Waxing: 'beauty salon',
  Spa: 'spa treatment',
  Makeup: 'makeup beauty',
  Signature: 'salon beauty',
};

function sharpenQuery(name) {
  const raw = String(name || '').trim();
  for (const [re, hint] of QUERY_HINTS) if (re.test(raw)) return hint;
  // Fallback: append "salon" so generic words like "Treatment" don't return noise.
  return `${raw} salon beauty`.replace(/\s{2,}/g, ' ').trim();
}

// Rough category for a salon service — used to pick a broader fallback query.
function roughCategory(name) {
  const n = String(name || '').toLowerCase();
  if (/balayage|highlight|color|colour|keratin|blow|cut|hair|trim|styl|wash|shampoo|bridal/.test(n)) return 'Hair';
  if (/manicure|pedicure|acrylic|nail/.test(n)) return 'Nails';
  if (/facial|peel|skin|microderm|dermaplan|cleanup|bleach/.test(n)) return 'Skin';
  if (/lash|brow|microblad|threading/.test(n)) return 'Lash & Brow';
  if (/wax/.test(n)) return 'Waxing';
  if (/massage|spa|polish|relax/.test(n)) return 'Spa';
  if (/makeup/.test(n)) return 'Makeup';
  return 'Signature';
}

async function fetchOne(query, accessKey) {
  const cached = cacheGet(query);
  if (cached !== undefined) return cached;
  try {
    const response = await axios.get(`${UNSPLASH_API}/search/photos`, {
      // No orientation filter — many salon subjects (tools, close-ups) are mostly portrait/landscape and
      // filtering to "squarish" was dropping valid results. The CSS crops into a 4/5 frame anyway.
      params: { query, content_filter: 'high', per_page: 10, order_by: 'relevant' },
      headers: { Authorization: `Client-ID ${accessKey}`, 'Accept-Version': 'v1' },
      timeout: PER_FETCH_TIMEOUT_MS,
    });
    const results = response.data?.results || [];
    if (results.length === 0) {
      cacheSet(query, null);
      return null;
    }
    // Pick from the top 3 so two sites with the same service don't get identical cards.
    const pick = results[Math.floor(Math.random() * Math.min(3, results.length))];
    if (!pick?.urls?.regular) return null;

    if (pick.links?.download_location) {
      axios
        .get(pick.links.download_location, {
          headers: { Authorization: `Client-ID ${accessKey}` },
          timeout: 5000,
        })
        .catch(() => {});
    }

    const image = {
      url: `${pick.urls.regular}&w=800&q=80&auto=format&fit=crop`,
      photographer: pick.user?.name || 'Unsplash',
      photographerUrl: `${(pick.user?.links?.html) || 'https://unsplash.com'}?${UTM}`,
      unsplashUrl: `https://unsplash.com/?${UTM}`,
    };
    cacheSet(query, image);
    return image;
  } catch (err) {
    const status = err.response?.status;
    if (status === 403) {
      // Hit the hourly rate limit — don't log every one, caller will see the low hit rate.
      logger.warn(`[SERVICE-IMG] Rate limited on "${query}" (HTTP 403)`);
    } else {
      logger.warn(`[SERVICE-IMG] "${query}" failed: ${status || err.message}`);
    }
    return null;
  }
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function pull() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, pull);
  await Promise.all(workers);
  return results;
}

/**
 * Fetch one Unsplash image per service name, in parallel with a small pool.
 * Returns a new array of services with `image` attached where available.
 * Never throws — failures per-service just yield no image on that entry.
 *
 * Two-pass strategy:
 *   1. Fire the sharpened per-service query (e.g. "balayage hair color").
 *   2. For any service that missed, fire a broader category query
 *      ("hair salon interior", "nail salon", etc.) so cards get a
 *      thematically relevant photo even when the exact term is thin on
 *      Unsplash. Covers ambiguous names like "Bleach" or "Cleanup".
 */
async function attachServiceImages(services) {
  const accessKey = env.unsplash?.accessKey;
  if (!accessKey || !Array.isArray(services) || services.length === 0) return services || [];

  const specific = services.map((s) => sharpenQuery(s.name));
  logger.info(`[SERVICE-IMG] Pass 1: fetching ${specific.length} specific queries`);
  const firstPass = await runPool(specific, CONCURRENCY, (q) => fetchOne(q, accessKey));
  const hits1 = firstPass.filter(Boolean).length;

  // Second pass only for the misses, using a broader category fallback.
  const missingIdx = firstPass.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  let hits2 = 0;
  if (missingIdx.length > 0) {
    // De-dupe category queries so multiple missing Hair services share one fetch.
    const fallbackQueries = Array.from(
      new Set(missingIdx.map((i) => CATEGORY_FALLBACK[roughCategory(services[i].name)] || 'salon beauty'))
    );
    logger.info(`[SERVICE-IMG] Pass 2: ${missingIdx.length} misses → ${fallbackQueries.length} fallback queries`);
    const fallbackResults = await runPool(fallbackQueries, CONCURRENCY, (q) => fetchOne(q, accessKey));
    const byQuery = Object.fromEntries(fallbackQueries.map((q, i) => [q, fallbackResults[i]]));
    for (const i of missingIdx) {
      const q = CATEGORY_FALLBACK[roughCategory(services[i].name)] || 'salon beauty';
      if (byQuery[q]) {
        firstPass[i] = byQuery[q];
        hits2++;
      }
    }
  }

  logger.info(`[SERVICE-IMG] Total: ${hits1 + hits2}/${services.length} service images (${hits1} specific + ${hits2} fallback)`);
  return services.map((s, i) => (firstPass[i] ? { ...s, image: firstPass[i] } : s));
}

module.exports = { attachServiceImages, sharpenQuery };
