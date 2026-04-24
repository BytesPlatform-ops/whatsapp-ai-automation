// HVAC-specific Pexels image fetcher — per service, with HVAC-relevant
// query hints so "Furnace Repair" pulls a technician working on a furnace,
// not a cozy fireplace.

const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { searchPhotos, mapPhotoToResult } = require('./pexelsClient');

const CONCURRENCY = 4;
const PER_FETCH_TIMEOUT_MS = 7000;

const HVAC_QUERY_HINTS = [
  [/ac (repair|maintenance|service)/i, 'air conditioner repair technician'],
  [/ac (install|replacement|replace)/i, 'air conditioning installation'],
  [/\bac\b/i, 'air conditioner outdoor unit'],
  [/air condition/i, 'air conditioning repair'],
  [/furnace/i, 'furnace repair technician'],
  [/heater.*(install|replace)/i, 'home heating installation'],
  [/heat(er|ing).*(repair|service|maintenance)/i, 'heating system technician'],
  [/heat(ing)? (install|replacement|system)/i, 'home heating system'],
  [/heat pump/i, 'heat pump outdoor unit'],
  [/duct.*(clean|seal)/i, 'air duct cleaning'],
  [/duct/i, 'hvac ductwork'],
  [/indoor air|air quality|purifier/i, 'home air purifier'],
  [/thermostat/i, 'smart thermostat wall'],
  [/emergency.*hvac|hvac.*emergency|24.?7/i, 'hvac technician emergency'],
  [/maintenance plan|tune.?up|agreement/i, 'hvac maintenance inspection'],
  [/refrigerant|freon/i, 'hvac refrigerant gauges'],
  [/boiler/i, 'boiler technician'],
  [/mini.?split|ductless/i, 'mini split air conditioner'],
];

function sharpenHvacQuery(name) {
  const raw = String(name || '').trim();
  for (const [re, hint] of HVAC_QUERY_HINTS) {
    if (re.test(raw)) return hint;
  }
  return `${raw} hvac`.replace(/\s{2,}/g, ' ').trim() || 'hvac technician';
}

async function fetchOne(query) {
  const results = await searchPhotos(query, {
    orientation: 'landscape',
    perPage: 6,
    timeout: PER_FETCH_TIMEOUT_MS,
    logTag: 'HVAC-IMG',
  });
  if (!results || !results.length) return null;
  const pick = results[Math.floor(Math.random() * Math.min(3, results.length))];
  return mapPhotoToResult(pick, { width: 1000, quality: 80 });
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
 * Fetch one Pexels image per HVAC service title, in parallel. Returns a new
 * array of services with `.image = { url, photographer, photographerUrl, ... }`.
 * Silent on individual failures.
 */
async function attachHvacServiceImages(services) {
  if (!env.pexels?.apiKey || !Array.isArray(services) || services.length === 0) return services || [];

  const queries = services.map((s) => sharpenHvacQuery(s.title || s.name));
  logger.info(`[HVAC-IMG] Fetching ${queries.length} service images`);
  const images = await runPool(queries, CONCURRENCY, (q) => fetchOne(q));
  const hits = images.filter(Boolean).length;
  logger.info(`[HVAC-IMG] Got ${hits}/${queries.length} service images`);

  return services.map((s, i) => (images[i] ? { ...s, image: images[i] } : s));
}

module.exports = { attachHvacServiceImages, sharpenHvacQuery };
