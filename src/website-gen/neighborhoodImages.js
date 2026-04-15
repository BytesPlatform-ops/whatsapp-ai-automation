// Real-estate neighborhood image fetcher — one Unsplash photo per
// neighborhood, with specific queries (street / architecture / lifestyle)
// rather than generic "city name" searches, which tend to return generic
// skyline shots.

const axios = require('axios');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

const UNSPLASH_API = 'https://api.unsplash.com';
const UTM = 'utm_source=bytes_platform&utm_medium=referral';
const CONCURRENCY = 4;
const PER_FETCH_TIMEOUT_MS = 7000;

// Query templates — we rotate through these per neighborhood to vary the
// visual feel across the grid (one card = street view, another = homes,
// another = lifestyle detail).
const QUERY_TEMPLATES = [
  (city, area) => `${area} ${city} homes street`,
  (city, area) => `${area} ${city} neighborhood architecture`,
  (city, area) => `${area} ${city} suburban houses`,
  (city, area) => `${area} residential street`,
];

function queryForNeighborhood(city, neighborhood, index) {
  const tmpl = QUERY_TEMPLATES[index % QUERY_TEMPLATES.length];
  return tmpl(city || '', neighborhood || '').replace(/\s{2,}/g, ' ').trim();
}

async function fetchOne(query, accessKey) {
  try {
    const response = await axios.get(`${UNSPLASH_API}/search/photos`, {
      params: { query, orientation: 'landscape', content_filter: 'high', per_page: 6, order_by: 'relevant' },
      headers: { Authorization: `Client-ID ${accessKey}`, 'Accept-Version': 'v1' },
      timeout: PER_FETCH_TIMEOUT_MS,
    });
    const results = response.data?.results || [];
    if (!results.length) return null;
    const pick = results[Math.floor(Math.random() * Math.min(3, results.length))];
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
    logger.warn(`[NEIGH-IMG] "${query}" failed: ${err.response?.status || err.message}`);
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

// Returns a map { [neighborhoodName]: { url, photographer, ... } }
async function fetchNeighborhoodImages(city, neighborhoods) {
  const accessKey = env.unsplash?.accessKey;
  if (!accessKey || !Array.isArray(neighborhoods) || !neighborhoods.length) return {};
  const queries = neighborhoods.map((n, i) => queryForNeighborhood(city, n, i));
  logger.info(`[NEIGH-IMG] Fetching ${queries.length} neighborhood images for ${city || 'unspecified city'}`);
  const images = await runPool(queries, CONCURRENCY, (q) => fetchOne(q, accessKey));
  const hits = images.filter(Boolean).length;
  logger.info(`[NEIGH-IMG] Got ${hits}/${queries.length} neighborhood images`);
  const map = {};
  neighborhoods.forEach((n, i) => {
    if (images[i]) map[n] = images[i];
  });
  return map;
}

// Agent-portrait placeholder lifestyle photo — queried once per site, NOT
// a person's face (user's preference per real_estate_context decision 4).
async function fetchAgentPlaceholderImage() {
  const accessKey = env.unsplash?.accessKey;
  if (!accessKey) return null;
  const pool = [
    'modern office desk minimalist',
    'coffee shop natural light morning',
    'luxury real estate office interior',
    'architect workspace wood desk',
    'hands keys home exchange',
  ];
  const query = pool[Math.floor(Math.random() * pool.length)];
  return fetchOne(query, accessKey);
}

module.exports = { fetchNeighborhoodImages, fetchAgentPlaceholderImage, queryForNeighborhood };
