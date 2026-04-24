// Shared Pexels API client. All hero / service / neighborhood / listing
// image modules route their searches through here so rate-limit handling,
// retry logic, and response normalization live in one place.
//
// Why Pexels over Unsplash: their license doesn't require attribution on
// the hosting page (Unsplash does, and we don't want "Photo by X on
// Unsplash" showing up on every generated customer site). Commercial
// embedding is explicitly allowed, hotlinking from the Pexels CDN is
// supported, and the free tier gives 20k requests/month (liftable on
// request).
//
// Output shape matches what the old Unsplash helpers returned so callers
// and downstream templates don't need to change:
//   { url, photographer, photographerUrl, sourceUrl, dominantColor }

const axios = require('axios');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

const PEXELS_API = 'https://api.pexels.com/v1';

/**
 * Search Pexels for landscape-oriented photos matching a query. Returns
 * the raw `photos[]` array from Pexels or null on failure — callers
 * decide what to do (typically pick a top-N random result and map it to
 * the normalized shape via mapPhotoToResult below).
 *
 * @param {string} query       Search terms
 * @param {object} [options]
 * @param {string} [options.orientation='landscape']  landscape|portrait|square
 * @param {number} [options.perPage=10]
 * @param {number} [options.timeout=8000]
 * @param {string} [options.logTag='PEXELS']  Prefix for log lines
 * @returns {Promise<null | Array<object>>}
 */
async function searchPhotos(query, options = {}) {
  const apiKey = env.pexels?.apiKey;
  if (!apiKey) {
    logger.warn(`[${options.logTag || 'PEXELS'}] No PEXELS_API_KEY set — image fetch skipped`);
    return null;
  }
  if (!query || !query.trim()) return null;

  const {
    orientation = 'landscape',
    perPage = 10,
    timeout = 8000,
    logTag = 'PEXELS',
  } = options;

  try {
    const response = await axios.get(`${PEXELS_API}/search`, {
      params: {
        query: query.trim(),
        orientation,
        per_page: perPage,
      },
      headers: { Authorization: apiKey },
      timeout,
    });
    return response.data?.photos || [];
  } catch (err) {
    const status = err.response?.status;
    logger.warn(`[${logTag}] Pexels search failed for "${query}" (status ${status || 'n/a'}): ${err.message}`);
    return null;
  }
}

/**
 * Map a raw Pexels photo object to the normalized shape the rest of the
 * codebase already expects. Keeps the `photographer` / `photographerUrl`
 * / `dominantColor` fields the templates read. `url` is pre-sized to the
 * target width via Pexels' CDN query params.
 *
 * @param {object} photo      Raw Pexels photo from search response
 * @param {object} [options]
 * @param {number} [options.width=1600]   Target rendered width
 * @param {number} [options.height]       Optional target height (enables fit=crop)
 * @param {number} [options.quality=80]
 */
function mapPhotoToResult(photo, options = {}) {
  if (!photo || !photo.src) return null;
  const { width = 1600, height, quality = 80 } = options;

  // Pexels CDN accepts auto=compress, cs=tinysrgb, w, h, fit=crop, q.
  // Starting from src.original gives the highest-resolution source; the
  // CDN resizes on the fly.
  const base = photo.src.original || photo.src.large2x || photo.src.large;
  const params = new URLSearchParams({
    auto: 'compress',
    cs: 'tinysrgb',
    w: String(width),
    q: String(quality),
  });
  if (height) {
    params.set('h', String(height));
    params.set('fit', 'crop');
  }

  return {
    url: `${base}?${params.toString()}`,
    photographer: photo.photographer || 'Pexels',
    photographerUrl: photo.photographer_url || 'https://www.pexels.com',
    sourceUrl: photo.url || 'https://www.pexels.com',
    // Unsplash's `color` returned a hex like "#3d5a80"; Pexels' `avg_color`
    // returns the same format. Field renamed but templates already look
    // for dominantColor, so we keep that name.
    dominantColor: photo.avg_color || null,
    // Back-compat for any template reading the Unsplash-era name.
    unsplashUrl: photo.url || 'https://www.pexels.com',
  };
}

module.exports = { searchPhotos, mapPhotoToResult };
