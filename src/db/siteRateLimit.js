const { supabase } = require('../config/database');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { isTester } = require('../feedback/feedback');

const DEFAULT_LIMIT = 5;
const DEFAULT_WINDOW_HOURS = 24;

function getLimit() {
  const raw = parseInt(process.env.WEBSITE_RATE_LIMIT_PER_DAY, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LIMIT;
}

function getWindowHours() {
  const raw = parseInt(process.env.WEBSITE_RATE_LIMIT_WINDOW_HOURS, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_WINDOW_HOURS;
}

async function userHasPaidPayment(userId) {
  const { data, error } = await supabase
    .from('payments')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'paid')
    .limit(1);
  if (error) {
    logger.warn(`[SITE-RATE-LIMIT] payments lookup failed for user ${userId}: ${error.message}`);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Decide whether `user` is allowed to create another preview website right now.
 *
 * Bypasses (always allowed):
 *   - Phone number is in TESTER_PHONES (matches existing exemption pattern).
 *   - User has at least one row in `payments` with status = 'paid' (they've
 *     already activated a site, so further previews are part of normal use).
 *
 * Otherwise: count rows in `generated_sites` for this user inside the rolling
 * window. If count >= limit, deny and report the soonest reset time (when
 * the oldest in-window row falls off).
 *
 * Failures (DB unreachable, etc.) FAIL OPEN — denying users because Supabase
 * blipped is worse than letting one extra site through. The error is logged.
 *
 * @param {{ id: string, phone_number: string }} user
 * @returns {Promise<{
 *   allowed: boolean,
 *   reason: 'tester' | 'paid' | 'under_limit' | 'over_limit' | 'error',
 *   count: number,
 *   limit: number,
 *   windowHours: number,
 *   resetAt: Date | null,
 * }>}
 */
async function checkSiteCreationAllowed(user) {
  const limit = getLimit();
  const windowHours = getWindowHours();
  const base = { count: 0, limit, windowHours, resetAt: null };

  if (!user || !user.id) {
    return { ...base, allowed: true, reason: 'error' };
  }

  if (isTester(user)) {
    return { ...base, allowed: true, reason: 'tester' };
  }

  try {
    if (await userHasPaidPayment(user.id)) {
      return { ...base, allowed: true, reason: 'paid' };
    }
  } catch (err) {
    logger.warn(`[SITE-RATE-LIMIT] paid-bypass check failed for user ${user.id}: ${err.message}`);
  }

  const windowMs = windowHours * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - windowMs).toISOString();

  let rows;
  try {
    const { data, error } = await supabase
      .from('generated_sites')
      .select('created_at')
      .eq('user_id', user.id)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    rows = data || [];
  } catch (err) {
    logger.warn(`[SITE-RATE-LIMIT] generated_sites count failed for user ${user.id}: ${err.message} — failing open`);
    return { ...base, allowed: true, reason: 'error' };
  }

  const count = rows.length;
  if (count < limit) {
    return { count, limit, windowHours, resetAt: null, allowed: true, reason: 'under_limit' };
  }

  const oldestInWindow = rows[0]?.created_at;
  const resetAt = oldestInWindow
    ? new Date(new Date(oldestInWindow).getTime() + windowMs)
    : new Date(Date.now() + windowMs);

  return { count, limit, windowHours, resetAt, allowed: false, reason: 'over_limit' };
}

/**
 * Format the time until `resetAt` as a short human string suitable for chat
 * messages, e.g. "5h 12m" or "47m" or "less than a minute".
 */
function formatTimeUntil(resetAt) {
  if (!resetAt) return '';
  const ms = resetAt.getTime() - Date.now();
  if (ms <= 0) return 'less than a minute';
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

module.exports = { checkSiteCreationAllowed, formatTimeUntil };
