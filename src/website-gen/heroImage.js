const { logger } = require('../utils/logger');
const { searchPhotos, mapPhotoToResult } = require('./pexelsClient');

/**
 * Fetch a landscape hero image from Pexels for a given search query.
 * Picks one of the top 3 relevance-ranked results randomly so two sites
 * in the same industry don't end up with identical hero photos.
 *
 * Returns null if no API key is configured or on any failure — callers
 * should fall back to the gradient hero.
 *
 * @param {string} query - Visual keywords describing what the hero photo should show
 *                         (e.g. "ac cleaning duct", "dental clinic", "bakery cake")
 * @returns {Promise<null | { url: string, photographer: string, photographerUrl: string, sourceUrl: string, dominantColor: string | null }>}
 */
async function getHeroImage(query) {
  // Strip noise words that dilute relevance ranking, and cap to 3-4
  // meaningful words — longer queries hurt relevance.
  const cleaned = (query || '')
    .replace(/\b(services?|solutions?|company|business|professional|corporate|industry)\b/gi, '')
    .replace(/[-_/,]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const primaryQuery = (words.length > 4 ? words.slice(0, 3) : words).join(' ') || 'modern office';

  // Progressive fallback queries — guarantees the hero slot is never empty
  // if the primary returns zero results.
  const fallbackQueries = [];
  if (words.length >= 2) fallbackQueries.push(words.slice(0, 2).join(' '));
  if (words.length >= 1) fallbackQueries.push(words[0]);

  let results = await searchPhotos(primaryQuery, { logTag: 'HERO-IMG' });
  let finalQuery = primaryQuery;
  if (!results || results.length === 0) {
    for (const fb of fallbackQueries) {
      if (fb === primaryQuery) continue;
      logger.info(`[HERO-IMG] Retrying with fallback query "${fb}"`);
      results = await searchPhotos(fb, { logTag: 'HERO-IMG' });
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

  // Top-3 random pick keeps sites with same industry from looking cloned.
  const topN = Math.min(3, results.length);
  const photo = results[Math.floor(Math.random() * topN)];
  const mapped = mapPhotoToResult(photo, { width: 1600, height: 900, quality: 80 });
  if (!mapped) {
    logger.warn(`[HERO-IMG] Pexels photo missing src for query "${finalQuery}"`);
    return null;
  }

  logger.info(`[HERO-IMG] Fetched Pexels photo for "${finalQuery}" by ${mapped.photographer}, dominant=${mapped.dominantColor || 'n/a'}`);
  return mapped;
}

module.exports = { getHeroImage };
