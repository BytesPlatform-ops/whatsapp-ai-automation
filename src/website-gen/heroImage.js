const axios = require('axios');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

const UNSPLASH_API = 'https://api.unsplash.com';
const UTM = 'utm_source=bytes_platform&utm_medium=referral';

/**
 * Fetch a landscape hero image from Unsplash for a given industry.
 * Returns null if no API key is configured or on any failure — callers
 * should fall back to the gradient hero.
 *
 * @param {string} industry - Free-text industry/business type (e.g. "restaurant", "dental clinic")
 * @returns {Promise<null | { url: string, photographer: string, photographerUrl: string, unsplashUrl: string }>}
 */
async function getHeroImage(industry) {
  const accessKey = env.unsplash?.accessKey;
  if (!accessKey) {
    logger.debug('[HERO-IMG] No UNSPLASH_ACCESS_KEY set - skipping Unsplash fetch');
    return null;
  }

  const query = (industry || '').trim() || 'business';

  try {
    const response = await axios.get(`${UNSPLASH_API}/photos/random`, {
      params: {
        query,
        orientation: 'landscape',
        content_filter: 'high',
      },
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        'Accept-Version': 'v1',
      },
      timeout: 8000,
    });

    const photo = response.data;
    if (!photo || !photo.urls?.regular) {
      logger.warn(`[HERO-IMG] Unsplash returned no photo for query "${query}"`);
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

    logger.info(`[HERO-IMG] Fetched Unsplash photo for "${query}" by ${photographer}`);

    return {
      url: `${photo.urls.regular}&w=1600&q=80&auto=format&fit=crop`,
      photographer,
      photographerUrl: `${photographerProfile}?${UTM}`,
      unsplashUrl: `https://unsplash.com/?${UTM}`,
    };
  } catch (error) {
    const status = error.response?.status;
    logger.warn(`[HERO-IMG] Unsplash fetch failed for "${query}" (status ${status || 'n/a'}): ${error.message}`);
    return null;
  }
}

module.exports = { getHeroImage };
