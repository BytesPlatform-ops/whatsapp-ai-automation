const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { searchPhotos, mapPhotoToResult } = require('./pexelsClient');

const CONCURRENCY = 4;
const PER_FETCH_TIMEOUT_MS = 7000;

// In-memory cache of query → image result (or null for confirmed misses).
// Keeps builds in the same process from re-hitting Pexels for the same
// salon services over and over. Cleared naturally on restart; not shared
// across instances.
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

// Generic (non-salon) query sharpener. Uses the industry as an anchor so
// "Pipe repair" for a plumber becomes "pipe repair plumbing" instead of the
// salon-biased "pipe repair salon beauty". Strips common noise words so the
// result stays tight (Unsplash keyword search is sensitive to filler).
function sharpenGenericQuery(name, industry) {
  const cleanedName = String(name || '')
    .replace(/\b(services?|solutions?|company|business|professional|corporate|industry|consulting|consultation)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const cleanedIndustry = String(industry || '')
    .replace(/\b(services?|solutions?|company|business|professional|corporate|industry)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // If the industry is already inside the service name, don't double it up.
  if (cleanedIndustry && cleanedName && !cleanedName.toLowerCase().includes(cleanedIndustry.toLowerCase())) {
    return `${cleanedName} ${cleanedIndustry}`.trim();
  }
  return cleanedName || cleanedIndustry || 'business';
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

async function fetchOne(query) {
  const cached = cacheGet(query);
  if (cached !== undefined) return cached;

  // No orientation filter — many salon subjects (tools, close-ups) are
  // mostly portrait/landscape and filtering to "squarish" was dropping
  // valid results. The CSS crops into a 4/5 frame anyway.
  const results = await searchPhotos(query, {
    orientation: undefined,
    perPage: 10,
    timeout: PER_FETCH_TIMEOUT_MS,
    logTag: 'SERVICE-IMG',
  });
  if (!results || results.length === 0) {
    cacheSet(query, null);
    return null;
  }

  // Pick from the top 3 so two sites with the same service don't look cloned.
  const pick = results[Math.floor(Math.random() * Math.min(3, results.length))];
  const image = mapPhotoToResult(pick, { width: 800, quality: 80 });
  if (!image) {
    cacheSet(query, null);
    return null;
  }
  cacheSet(query, image);
  return image;
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
async function attachServiceImages(services, options = {}) {
  if (!env.pexels?.apiKey) {
    logger.warn('[SERVICE-IMG] PEXELS_API_KEY not set — service images will be skipped');
    return services || [];
  }
  if (!Array.isArray(services) || services.length === 0) return services || [];

  // Mode is now explicit. Callers pass `{ mode: 'generic', industry: '...' }`
  // so we don't have to guess from whether individual service objects happen
  // to carry an `industry` field. Default mode is 'salon' to preserve legacy
  // behaviour for the salon template.
  const mode = options.mode || (services.some((s) => s && typeof s.industry === 'string' && s.industry.length > 0) ? 'generic' : 'salon');
  const fallbackIndustry = String(options.industry || '').trim();

  const specific = mode === 'generic'
    ? services.map((s) => sharpenGenericQuery(s.name, s.industry || fallbackIndustry))
    : services.map((s) => sharpenQuery(s.name));
  logger.info(`[SERVICE-IMG] Pass 1 (${mode}): fetching ${specific.length} queries: ${specific.join(' | ')}`);
  const firstPass = await runPool(specific, CONCURRENCY, (q) => fetchOne(q));
  const hits1 = firstPass.filter(Boolean).length;

  // Second pass for misses — broader category/industry fallback.
  const missingIdx = firstPass.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  let hits2 = 0;
  if (missingIdx.length > 0) {
    const fallbackFor = (i) => {
      if (mode === 'generic') {
        const ind = services[i].industry || fallbackIndustry;
        if (ind) return ind;
        // Last-ditch: service name alone with no industry. Strip noise words
        // so "Cleaning Services" doesn't search for the word "services".
        return String(services[i].name || 'business')
          .replace(/\b(services?|solutions?)\b/gi, '')
          .trim() || 'business';
      }
      return CATEGORY_FALLBACK[roughCategory(services[i].name)] || 'salon beauty';
    };
    const fallbackQueries = Array.from(new Set(missingIdx.map(fallbackFor)));
    logger.info(`[SERVICE-IMG] Pass 2: ${missingIdx.length} misses → fallback queries: ${fallbackQueries.join(' | ')}`);
    const fallbackResults = await runPool(fallbackQueries, CONCURRENCY, (q) => fetchOne(q));
    const byQuery = Object.fromEntries(fallbackQueries.map((q, i) => [q, fallbackResults[i]]));
    for (const i of missingIdx) {
      const q = fallbackFor(i);
      if (byQuery[q]) {
        firstPass[i] = byQuery[q];
        hits2++;
      }
    }
  }

  // Third-pass safety net for generic mode: if we still have misses, borrow
  // the first successful image from another service so every card has SOME
  // visual instead of falling back to the icon tile. Better than a bare card.
  if (mode === 'generic') {
    const stillMissing = firstPass.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    const anyHit = firstPass.find(Boolean);
    if (anyHit && stillMissing.length > 0) {
      for (const i of stillMissing) firstPass[i] = anyHit;
      logger.info(`[SERVICE-IMG] Pass 3: filled ${stillMissing.length} remaining misses with a borrowed image`);
    }
  }

  logger.info(`[SERVICE-IMG] Total: ${firstPass.filter(Boolean).length}/${services.length} service images (${hits1} specific + ${hits2} fallback)`);
  return services.map((s, i) => (firstPass[i] ? { ...s, image: firstPass[i] } : s));
}

module.exports = { attachServiceImages, sharpenQuery };
