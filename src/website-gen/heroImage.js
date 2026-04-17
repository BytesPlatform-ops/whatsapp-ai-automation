const axios = require('axios');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

const UNSPLASH_API = 'https://api.unsplash.com';
const UTM = 'utm_source=bytes_platform&utm_medium=referral';

/**
 * Fetch a landscape hero image from Unsplash for a given search query.
 * Uses the /search/photos endpoint (relevance-ranked) and picks one of the
 * top results, so specific queries like "air conditioner cleaning" return
 * actually-relevant photos instead of generic random-pool matches.
 *
 * Returns null if no API key is configured or on any failure — callers
 * should fall back to the gradient hero.
 *
 * @param {string} query - Visual keywords describing what the hero photo should show
 *                         (e.g. "ac cleaning duct", "dental clinic", "bakery cake")
 * @returns {Promise<null | { url: string, photographer: string, photographerUrl: string, unsplashUrl: string }>}
 */
async function getHeroImage(query) {
  const accessKey = env.unsplash?.accessKey;
  if (!accessKey) {
    // Bumped from debug → warn so missing keys are visible in production
    // logs (the hero then falls back to a gradient, which is what the user
    // was seeing on generic sites).
    logger.warn('[HERO-IMG] No UNSPLASH_ACCESS_KEY set - hero will fall back to gradient');
    return null;
  }

  // Strip noise words that dilute Unsplash's relevance ranking. Also cap
  // word count: Unsplash rejects/rate-limits long verbose queries (403),
  // and anything past 3-4 meaningful words hurts relevance anyway.
  const cleaned = (query || '')
    .replace(/\b(services?|solutions?|company|business|professional|corporate|industry)\b/gi, '')
    .replace(/[-_/,]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const primaryQuery = (words.length > 4 ? words.slice(0, 3) : words).join(' ') || 'modern office';
  // Short fallback — progressively simpler queries if the primary fails or
  // hits rate limits. Guarantees the hero slot is never empty.
  const fallbackQueries = [];
  if (words.length >= 2) fallbackQueries.push(words.slice(0, 2).join(' '));
  if (words.length >= 1) fallbackQueries.push(words[0]);

  async function tryFetch(q) {
    try {
      const response = await axios.get(`${UNSPLASH_API}/search/photos`, {
        params: {
          query: q,
          orientation: 'landscape',
          content_filter: 'high',
          per_page: 10,
          order_by: 'relevant',
        },
        headers: {
          Authorization: `Client-ID ${accessKey}`,
          'Accept-Version': 'v1',
        },
        timeout: 8000,
      });
      return response.data?.results || [];
    } catch (err) {
      const status = err.response?.status;
      logger.warn(`[HERO-IMG] Unsplash fetch failed for "${q}" (status ${status || 'n/a'}): ${err.message}`);
      return null;
    }
  }

  let results = await tryFetch(primaryQuery);
  let finalQuery = primaryQuery;
  if (!results || results.length === 0) {
    for (const fb of fallbackQueries) {
      if (fb === primaryQuery) continue;
      logger.info(`[HERO-IMG] Retrying with fallback query "${fb}"`);
      results = await tryFetch(fb);
      if (results && results.length) {
        finalQuery = fb;
        break;
      }
    }
  }
  if (!results || results.length === 0) {
    logger.warn(`[HERO-IMG] All queries exhausted for "${primaryQuery}" (and fallbacks)`);
    return null;
  }

  // Pick randomly from the top 3 relevance-ranked results so two businesses
  // with the same industry don't get identical images.
  const topN = Math.min(3, results.length);
  const photo = results[Math.floor(Math.random() * topN)];
  if (!photo || !photo.urls?.regular) {
    logger.warn(`[HERO-IMG] Unsplash photo missing urls.regular for query "${finalQuery}"`);
    return null;
  }

  // Unsplash API TOS requires pinging the download_location endpoint when a
  // photo is used in a product. Fire-and-forget - we don't block on it.
  if (photo.links?.download_location) {
    axios
      .get(photo.links.download_location, {
        headers: { Authorization: `Client-ID ${accessKey}` },
        timeout: 5000,
      })
      .catch((err) => {
        logger.debug(`[HERO-IMG] Download tracking ping failed: ${err.message}`);
      });
  }

  const photographer = photo.user?.name || 'Unsplash';
  const photographerProfile = photo.user?.links?.html || 'https://unsplash.com';
  const dominantColor = photo.color || null;

  logger.info(`[HERO-IMG] Fetched Unsplash photo for "${finalQuery}" by ${photographer}, dominant=${dominantColor || 'n/a'}`);

  return {
    url: `${photo.urls.regular}&w=1600&q=80&auto=format&fit=crop`,
    photographer,
    photographerUrl: `${photographerProfile}?${UTM}`,
    unsplashUrl: `https://unsplash.com/?${UTM}`,
    dominantColor,
  };
}

module.exports = { getHeroImage };
