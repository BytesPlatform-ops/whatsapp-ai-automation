const axios = require('axios');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

/**
 * Refresh the Instagram long-lived access token.
 * Must be called before the token expires (every 60 days).
 * The token must be at least 24 hours old to be refreshed.
 */
async function refreshInstagramToken() {
  const currentToken = env.messenger.instagramAccessToken;
  if (!currentToken) {
    logger.debug('[IG-TOKEN] No Instagram access token configured, skipping refresh');
    return;
  }

  try {
    const response = await axios.get('https://graph.instagram.com/refresh_access_token', {
      params: {
        grant_type: 'ig_refresh_token',
        access_token: currentToken,
      },
    });

    const newToken = response.data?.access_token;
    const expiresIn = response.data?.expires_in; // seconds

    if (newToken) {
      // Update the in-memory token
      env.messenger.instagramAccessToken = newToken;
      const expiryDays = Math.round((expiresIn || 0) / 86400);
      logger.info(`[IG-TOKEN] Token refreshed successfully, expires in ${expiryDays} days`);
    }
  } catch (error) {
    logger.error('[IG-TOKEN] Failed to refresh Instagram token', {
      error: error.response?.data || error.message,
    });
  }
}

/**
 * Start the Instagram token refresh scheduler.
 * Runs every 50 days to refresh before the 60-day expiry.
 */
function startInstagramTokenRefreshScheduler() {
  if (!env.messenger.instagramAccessToken) return;

  const FIFTY_DAYS_MS = 50 * 24 * 60 * 60 * 1000;

  // Refresh on startup (in case token is close to expiry)
  setTimeout(() => refreshInstagramToken(), 10000); // 10s after startup

  // Then refresh every 50 days
  setInterval(() => refreshInstagramToken(), FIFTY_DAYS_MS);

  logger.info('[IG-TOKEN] Instagram token refresh scheduler started (interval: 50 days)');
}

module.exports = { startInstagramTokenRefreshScheduler, refreshInstagramToken };
