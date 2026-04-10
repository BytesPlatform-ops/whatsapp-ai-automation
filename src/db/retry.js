/**
 * Shared Supabase retry helpers.
 *
 * Supabase JS client can fail in two ways during transient network blips:
 *   1. Throws an exception (older client behavior)
 *   2. Returns { data: null, error: { message: 'TypeError: fetch failed' } } (newer client)
 * Both must be retried.
 *
 * Use these helpers to wrap any Supabase call that touches the network.
 */

const { logger } = require('../utils/logger');

/**
 * Detect transient network errors from either thrown exceptions or error responses.
 */
function isNetworkError(err) {
  if (!err) return false;
  const msg = String(err.message || err || '').toLowerCase();
  const causeMsg = String(err.cause?.message || '').toLowerCase();
  return (
    msg.includes('fetch failed') ||
    msg.includes('socket hang up') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('network request failed') ||
    causeMsg.includes('socket hang up') ||
    causeMsg.includes('econnreset') ||
    err.cause?.code === 'UND_ERR_SOCKET' ||
    err.code === 'ETIMEDOUT' ||
    err.code === 'ECONNRESET'
  );
}

/**
 * Retry an operation on transient network failures only.
 * Application errors (validation, constraints, etc.) fail fast — no retry.
 *
 * @param {Function} operation - Async function to execute
 * @param {string} label - Identifier for log messages
 * @param {number} maxAttempts - Default 3
 * @returns {Promise<any>} - Whatever the operation returns
 */
async function withRetry(operation, label = 'supabase op', maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (!isNetworkError(err) || attempt === maxAttempts) throw err;
      const delayMs = 300 * Math.pow(2, attempt - 1);
      logger.warn(`[DB-RETRY] ${label} attempt ${attempt}/${maxAttempts} failed: ${err.message}. Retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

/**
 * Helper: throws if a Supabase response error is a network error,
 * so withRetry will catch it and retry.
 *
 * Use this AFTER every supabase call inside a withRetry block:
 *   const { data, error } = await supabase.from(...).select();
 *   throwIfNetworkError(error);
 *   if (error) throw new Error(`App error: ${error.message}`);
 */
function throwIfNetworkError(error) {
  if (error && isNetworkError(error)) {
    const wrapped = new Error(error.message || 'fetch failed');
    wrapped.cause = error;
    throw wrapped;
  }
}

module.exports = { isNetworkError, withRetry, throwIfNetworkError };
