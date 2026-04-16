// Real-estate listing image fetcher — Unsplash, with query hints that map a
// listing's beds/sqft/neighborhood/status into a relevant interior or
// exterior search ("luxury home interior", "modern kitchen", "suburban
// craftsman house exterior") so listings don't all get the same generic
// "real estate" stock photo.

const axios = require('axios');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

const UNSPLASH_API = 'https://api.unsplash.com';
const UTM = 'utm_source=bytes_platform&utm_medium=referral';
const CONCURRENCY = 4;
const PER_FETCH_TIMEOUT_MS = 7000;

// Pool of varied listing-photo queries. Picked round-robin so 3 listings on
// the same page don't end up with three near-identical images.
const LISTING_QUERY_POOL = [
  'modern home exterior',
  'luxury home interior',
  'modern kitchen interior',
  'craftsman house exterior',
  'mid century modern home',
  'living room natural light',
  'farmhouse exterior',
  'contemporary house facade',
  'open concept living room',
  'master bedroom interior',
];

function pickQuery(listing, index = 0) {
  const sqft = Number(listing && listing.sqft) || 0;
  const beds = Number(listing && listing.beds) || 0;
  const status = String((listing && listing.status) || '').toLowerCase();
  // Larger / luxury listings get luxury queries
  if (sqft >= 4000 || beds >= 5) return 'luxury home interior';
  if (sqft >= 2800) return 'modern home exterior';
  if (status.includes('just listed')) return 'contemporary house facade';
  // Fall back to round-robin by index
  return LISTING_QUERY_POOL[index % LISTING_QUERY_POOL.length];
}

async function fetchOne(query, accessKey) {
  try {
    const response = await axios.get(`${UNSPLASH_API}/search/photos`, {
      params: { query, orientation: 'landscape', content_filter: 'high', per_page: 8, order_by: 'relevant' },
      headers: { Authorization: `Client-ID ${accessKey}`, 'Accept-Version': 'v1' },
      timeout: PER_FETCH_TIMEOUT_MS,
    });
    const results = response.data?.results || [];
    if (!results.length) return null;
    // Pick from top 4 so the same query gives variety across calls
    const pick = results[Math.floor(Math.random() * Math.min(4, results.length))];
    if (!pick?.urls?.regular) return null;
    if (pick.links?.download_location) {
      axios.get(pick.links.download_location, {
        headers: { Authorization: `Client-ID ${accessKey}` },
        timeout: 5000,
      }).catch(() => {});
    }
    return {
      url: `${pick.urls.regular}&w=1000&q=80&auto=format&fit=crop`,
      photographer: pick.user?.name || 'Unsplash',
      photographerUrl: `${(pick.user?.links?.html) || 'https://unsplash.com'}?${UTM}`,
      unsplashUrl: `https://unsplash.com/?${UTM}`,
    };
  } catch (err) {
    logger.warn(`[RE-IMG] "${query}" failed: ${err.response?.status || err.message}`);
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

async function attachRealEstateListingImages(listings) {
  const accessKey = env.unsplash?.accessKey;
  if (!accessKey || !Array.isArray(listings) || !listings.length) return listings || [];
  // Skip fetch for listings that already have a user-provided image.
  const missingIdx = listings
    .map((l, i) => (l && (l.image || l.photoUrl) ? -1 : i))
    .filter((i) => i >= 0);
  if (!missingIdx.length) {
    logger.info(`[RE-IMG] All ${listings.length} listings have user photos — no Unsplash fetch`);
    return listings;
  }
  const queries = missingIdx.map((i) => pickQuery(listings[i], i));
  logger.info(`[RE-IMG] Fetching ${queries.length} listing images (${listings.length - queries.length} already have photos)`);
  const images = await runPool(queries, CONCURRENCY, (q) => fetchOne(q, accessKey));
  const hits = images.filter(Boolean).length;
  logger.info(`[RE-IMG] Got ${hits}/${queries.length} listing images`);
  return listings.map((l, i) => {
    const slot = missingIdx.indexOf(i);
    if (slot >= 0 && images[slot]) return { ...l, image: images[slot] };
    return l;
  });
}

module.exports = { attachRealEstateListingImages, pickQuery };
