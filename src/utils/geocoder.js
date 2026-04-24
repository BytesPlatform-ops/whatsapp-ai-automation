// Reverse geocoding via OpenStreetMap Nominatim (Phase 14).
//
// Nominatim is free and requires no API key, but its usage policy
// mandates:
//   - A meaningful User-Agent identifying the app (NOT the default
//     axios/node fetch string, which they throttle).
//   - Max 1 request per second from a single origin.
//
// We'll easily stay under 1 RPS — reverse lookups only fire when a
// user drops a WhatsApp location pin, which is rare. If we ever need
// higher volume we'll swap to Google Maps Geocoding API (paid).

const axios = require('axios');
const { logger } = require('./logger');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
// User-Agent needs to identify the app + a contact. Nominatim's terms
// explicitly require this; generic SDK strings get blocked.
const USER_AGENT = 'PixieBot/1.0 (contact: bytesuite@bytesplatform.com)';

/**
 * Reverse geocode a lat/lng to a structured address. Returns null on
 * any failure (network, bad response, rate-limit) — callers should
 * handle the null case with a graceful fallback ("got your location,
 * saved the coordinates").
 *
 * @param {{latitude: number, longitude: number}} coords
 * @returns {Promise<{
 *   city: string|null,
 *   region: string|null,
 *   country: string|null,
 *   streetAddress: string|null,
 *   displayName: string|null,
 * }|null>}
 */
async function reverseGeocode({ latitude, longitude } = {}) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  const doRequest = async () => {
    const response = await axios.get(NOMINATIM_URL, {
      params: {
        lat,
        lon,
        format: 'json',
        addressdetails: 1,
        zoom: 18, // street-level precision where available
      },
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en',
      },
      timeout: 8_000,
    });

    const data = response.data;
    if (!data || typeof data !== 'object') return null;

    const addr = data.address || {};
    // Nominatim's schema varies by country. Grab the likeliest
    // city-equivalent from a priority list, then fall back to a
    // higher-level admin region.
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.suburb ||
      addr.county ||
      null;
    const region = addr.state || addr.region || null;
    const country = addr.country || null;

    // Build a compact street-address string from the components we
    // have. Skip empties so we don't get "null, null, Austin, TX".
    const streetParts = [
      addr.house_number && addr.road ? `${addr.house_number} ${addr.road}` : addr.road,
      addr.neighbourhood,
      addr.postcode,
    ].filter(Boolean);
    const streetAddress = streetParts.length ? streetParts.join(', ') : null;

    return {
      city,
      region,
      country,
      streetAddress,
      displayName: typeof data.display_name === 'string' ? data.display_name : null,
    };
  };

  // One retry on transient failures. Nominatim is free and commonly
  // times out or returns 5xx under load; a single miss shouldn't
  // strand a user mid-flow. 1.2s backoff keeps us under the 1 RPS
  // per-origin policy.
  const isRetryable = (err) => {
    const status = err?.response?.status;
    return (
      err?.code === 'ECONNABORTED' ||
      err?.code === 'ETIMEDOUT' ||
      err?.code === 'ECONNRESET' ||
      err?.code === 'ENOTFOUND' ||
      status === 429 ||
      (typeof status === 'number' && status >= 500 && status < 600)
    );
  };

  try {
    return await doRequest();
  } catch (err) {
    if (!isRetryable(err)) {
      logger.warn(`[GEOCODE] Reverse lookup failed for (${lat}, ${lon}): ${err.message}`);
      return null;
    }
    logger.info(`[GEOCODE] Transient failure (${err.message}); retrying once`);
    await new Promise((r) => setTimeout(r, 1200));
    try {
      return await doRequest();
    } catch (retryErr) {
      logger.warn(`[GEOCODE] Retry failed for (${lat}, ${lon}): ${retryErr.message}`);
      return null;
    }
  }
}

module.exports = { reverseGeocode };
