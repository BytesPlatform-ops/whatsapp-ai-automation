const axios = require('axios');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

const UNSPLASH_API = 'https://api.unsplash.com';
const UTM = 'utm_source=bytes_platform&utm_medium=referral';
const CONCURRENCY = 4;
const PER_FETCH_TIMEOUT_MS = 7000;

// Sharpen the Unsplash query by mapping common salon-service terms to visual cues.
const QUERY_HINTS = [
  [/balayage|highlights?/i, 'balayage hair color'],
  [/\bcolou?r\b/i, 'hair color salon'],
  [/keratin|smooth(?:ing)?/i, 'keratin hair treatment'],
  [/\bcut\b|haircut|trim/i, 'haircut salon'],
  [/blow.?dry|styling/i, 'blow dry styling'],
  [/wash|shampoo/i, 'hair wash salon'],
  [/gel (mani|nail)|manicure/i, 'manicure nails'],
  [/pedicure/i, 'pedicure nails'],
  [/acrylic/i, 'acrylic nails'],
  [/nail art/i, 'nail art'],
  [/facial/i, 'facial treatment spa'],
  [/lash/i, 'lash extensions eyelash'],
  [/brow|microblad/i, 'eyebrow beauty'],
  [/wax/i, 'waxing salon'],
  [/massage/i, 'massage spa'],
  [/bridal|wedding/i, 'bridal hair makeup'],
  [/barber|men/i, 'barber shop'],
];

function sharpenQuery(name) {
  const raw = String(name || '').trim();
  for (const [re, hint] of QUERY_HINTS) if (re.test(raw)) return hint;
  // Fallback: append "salon" so generic words like "Treatment" don't return noise.
  return `${raw} salon`.replace(/\s{2,}/g, ' ').trim();
}

async function fetchOne(query, accessKey) {
  try {
    const response = await axios.get(`${UNSPLASH_API}/search/photos`, {
      params: { query, orientation: 'squarish', content_filter: 'high', per_page: 6, order_by: 'relevant' },
      headers: { Authorization: `Client-ID ${accessKey}`, 'Accept-Version': 'v1' },
      timeout: PER_FETCH_TIMEOUT_MS,
    });
    const results = response.data?.results || [];
    if (results.length === 0) return null;
    // Pick from top 3 so two sites with the same service don't get identical cards.
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

    return {
      url: `${pick.urls.regular}&w=800&q=80&auto=format&fit=crop`,
      photographer: pick.user?.name || 'Unsplash',
      photographerUrl: `${(pick.user?.links?.html) || 'https://unsplash.com'}?${UTM}`,
      unsplashUrl: `https://unsplash.com/?${UTM}`,
    };
  } catch (err) {
    logger.warn(`[SERVICE-IMG] "${query}" failed: ${err.response?.status || err.message}`);
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
 */
async function attachServiceImages(services) {
  const accessKey = env.unsplash?.accessKey;
  if (!accessKey || !Array.isArray(services) || services.length === 0) return services || [];

  const queries = services.map((s) => sharpenQuery(s.name));
  logger.info(`[SERVICE-IMG] Fetching ${queries.length} service images`);
  const images = await runPool(queries, CONCURRENCY, (q) => fetchOne(q, accessKey));

  const hits = images.filter(Boolean).length;
  logger.info(`[SERVICE-IMG] Got ${hits}/${queries.length} service images`);

  return services.map((s, i) => (images[i] ? { ...s, image: images[i] } : s));
}

module.exports = { attachServiceImages, sharpenQuery };
