/**
 * Admin-managed runtime settings.
 *
 * Backed by the `admin_settings` table (migration 019). Values live as
 * JSONB so a setting can be a number, a string, or a small object —
 * the consumer is responsible for type expectations.
 *
 * In-memory cache:
 *   - `loadAllSettings()` populates on first call (and again on any setSetting).
 *   - Synchronous `getCachedSetting(key, fallback)` is what hot paths
 *     (LLM prompt interpolation) use — no DB hit per call.
 *   - Async `getSetting(key, fallback)` triggers a load if cold, then reads
 *     the cache. Use this in handler/scheduler/email paths where we
 *     can afford one warm-up await.
 *
 * Cache invalidation is in-process. We deliberately don't pub/sub to
 * other instances yet — the app runs single-instance on Render today,
 * and the price is at most a few minutes of staleness on the worker
 * side if we ever scale out. Document and revisit then.
 *
 * Pricing tokens (used by the LLM prompt interpolator in src/llm/provider.js):
 *   {{WEBSITE_PRICE}}          — `website_price`
 *   {{WEBSITE_DISCOUNT_PCT}}   — `website_discount_pct`
 *   {{REVISION_PRICE}}         — `revision_price`
 *   {{SEO_FLOOR_PRICE}}        — `seo_floor_price`
 */

const { supabase } = require('../config/database');
const { withRetry, throwIfNetworkError } = require('./retry');
const { logger } = require('../utils/logger');

let cache = null;        // Map<string, JSONB>
let loadPromise = null;  // shared in-flight loader so concurrent callers don't dogpile

async function loadAllSettings() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const rows = await withRetry(async () => {
        const { data, error } = await supabase
          .from('admin_settings')
          .select('key, value');
        throwIfNetworkError(error);
        if (error) throw new Error(`Failed to load admin_settings: ${error.message}`);
        return data || [];
      }, 'loadAllSettings');
      const next = new Map();
      for (const row of rows) next.set(row.key, row.value);
      cache = next;
      logger.info(`[SETTINGS] Loaded ${next.size} admin_settings into cache`);
    } catch (err) {
      logger.error(`[SETTINGS] Load failed: ${err.message} — falling back to defaults`);
      cache = new Map(); // empty cache → callers will use fallbacks
    } finally {
      loadPromise = null;
    }
  })();
  return loadPromise;
}

/**
 * Synchronous read. Returns the cached value (whatever JSONB type it
 * stored) or the supplied `fallback` if the cache is cold/missing.
 * Safe to call from anywhere; never awaits.
 */
function getCachedSetting(key, fallback) {
  if (!cache) return fallback;
  return cache.has(key) ? cache.get(key) : fallback;
}

/**
 * Async read with auto-warm. Use in handlers / scheduler / email paths
 * that can afford a one-time await on cold start.
 */
async function getSetting(key, fallback) {
  if (!cache) await loadAllSettings();
  return getCachedSetting(key, fallback);
}

/**
 * Convenience: read a numeric setting, coerce to Number, fall back to
 * `fallback` if NaN or missing. The Stripe path needs this — passing a
 * string to unit_amount silently truncates.
 */
async function getNumberSetting(key, fallback) {
  const raw = await getSetting(key, fallback);
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Same as getNumberSetting but synchronous — for hot paths that can't
 * await (LLM prompt interpolation in provider).
 */
function getCachedNumber(key, fallback) {
  const raw = getCachedSetting(key, fallback);
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Persist a new value. Triggers a cache reload on success so the next
 * read sees the new value. `updatedBy` is optional context for the audit
 * column — admin email or 'admin-panel' is fine.
 */
async function setSetting(key, value, updatedBy = 'admin-panel') {
  await withRetry(async () => {
    const { error } = await supabase
      .from('admin_settings')
      .upsert(
        { key, value, updated_by: updatedBy, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    throwIfNetworkError(error);
    if (error) throw new Error(`Failed to upsert setting ${key}: ${error.message}`);
  }, `setSetting:${key}`);
  // Refresh cache so subsequent reads see the new value immediately.
  cache = null;
  await loadAllSettings();
}

/**
 * Bulk read for the admin UI. Returns a map of key → value pulled fresh
 * from the cache (loading on cold).
 */
async function listSettings() {
  if (!cache) await loadAllSettings();
  const out = {};
  if (cache) for (const [k, v] of cache.entries()) out[k] = v;
  return out;
}

/**
 * Replace pricing tokens in any text with the cached values. Used by
 * src/llm/provider.js to inject current prices into LLM system prompts
 * without making every call site async. Falls back to the defaults if
 * the cache is cold (better to send slightly stale prices than block
 * a user-facing chat reply on a DB read).
 */
function applyPricingTokens(text) {
  if (!text || typeof text !== 'string') return text;
  const wp = getCachedNumber('website_price', 199);
  const wdp = getCachedNumber('website_discount_pct', 20);
  const rp = getCachedNumber('revision_price', 200);
  const sfp = getCachedNumber('seo_floor_price', 200);
  return text
    .replace(/\{\{WEBSITE_PRICE\}\}/g, String(wp))
    .replace(/\{\{WEBSITE_DISCOUNT_PCT\}\}/g, String(wdp))
    .replace(/\{\{REVISION_PRICE\}\}/g, String(rp))
    .replace(/\{\{SEO_FLOOR_PRICE\}\}/g, String(sfp));
}

module.exports = {
  loadAllSettings,
  getSetting,
  getCachedSetting,
  getNumberSetting,
  getCachedNumber,
  setSetting,
  listSettings,
  applyPricingTokens,
};
