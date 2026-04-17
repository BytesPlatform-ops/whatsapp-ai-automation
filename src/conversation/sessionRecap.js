/**
 * sessionRecap.js
 *
 * Generates a short contextual "welcome back" summary for users who
 * return after a long gap. Without this, a returning user gets the next
 * collection question with no acknowledgment that they were gone — which
 * feels robotic and confusing mid-flow.
 *
 * Integration: `router.js` calls `buildRecapIfNeeded(user)` right after
 * `findOrCreateUser`. If it returns a non-empty string, the router sends
 * it BEFORE handing the message to the regular handler.
 *
 * Thresholds:
 *   - < 30 min gap   → no recap (still "in conversation")
 *   - 30 min – 24 h  → short recap
 *   - > 24 h         → warmer recap ("hey, good to hear from you again")
 *
 * We only recap mid-flow — once the user is back in SALES_CHAT /
 * SERVICE_SELECTION there's nothing to recap, the sales bot re-greets.
 */

'use strict';

const { supabase } = require('../config/database');
const { STATES } = require('./states');
const { logger } = require('../utils/logger');

const GAP_THRESHOLD_MINUTES = 30;
const WARM_THRESHOLD_MINUTES = 24 * 60; // 24h

// States that benefit from a recap. These are mid-flow collection states
// where "welcome back, we were working on X" is genuinely useful.
const RECAP_STATES = new Set([
  STATES.WEB_COLLECTING,
  STATES.WEB_COLLECT_NAME,
  STATES.WEB_COLLECT_EMAIL,
  STATES.WEB_COLLECT_INDUSTRY,
  STATES.WEB_COLLECT_AREAS,
  STATES.WEB_COLLECT_SERVICES,
  STATES.WEB_COLLECT_CONTACT,
  STATES.SALON_BOOKING_TOOL,
  STATES.SALON_INSTAGRAM,
  STATES.SALON_HOURS,
  STATES.SALON_SERVICE_DURATIONS,
  STATES.WEB_CONFIRM,
  STATES.WEB_REVISIONS,
  STATES.APP_COLLECT_REQUIREMENTS,
  STATES.MARKETING_COLLECT_DETAILS,
  STATES.SCHEDULE_COLLECT_DATE,
  STATES.SCHEDULE_COLLECT_TIME,
  STATES.CB_COLLECT_NAME,
  STATES.CB_COLLECT_INDUSTRY,
  STATES.CB_COLLECT_FAQS,
  STATES.CB_COLLECT_SERVICES,
  STATES.CB_COLLECT_HOURS,
  STATES.CB_COLLECT_LOCATION,
  STATES.AD_COLLECT_BUSINESS,
  STATES.AD_COLLECT_INDUSTRY,
  STATES.AD_COLLECT_NICHE,
  STATES.AD_COLLECT_SLOGAN,
  STATES.AD_COLLECT_PRICING,
  STATES.AD_COLLECT_COLORS,
  STATES.LOGO_COLLECT_BUSINESS,
  STATES.LOGO_COLLECT_INDUSTRY,
  STATES.LOGO_COLLECT_DESCRIPTION,
  STATES.LOGO_COLLECT_COLORS,
  STATES.LOGO_COLLECT_SYMBOL,
]);

/**
 * Return the most recent message (any role) for a user, or null.
 * Uses a direct Supabase call rather than getConversationHistory so we
 * can grab just the timestamp without pulling 20 rows.
 */
async function getLastActivityAt(userId) {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      logger.warn(`[RECAP] Failed to read last activity: ${error.message}`);
      return null;
    }
    return data?.created_at ? new Date(data.created_at) : null;
  } catch (err) {
    logger.warn(`[RECAP] getLastActivityAt threw: ${err.message}`);
    return null;
  }
}

/**
 * Describe the flow a user is in based on their state. Used in recap copy.
 */
function flowLabel(state) {
  const s = String(state || '');
  if (s.startsWith('WEB_') || s.startsWith('SALON_')) return 'website';
  if (s.startsWith('LOGO_')) return 'logo';
  if (s.startsWith('AD_')) return 'marketing ad';
  if (s.startsWith('CB_')) return 'chatbot';
  if (s.startsWith('APP_')) return 'app';
  if (s.startsWith('MARKETING_')) return 'marketing strategy';
  if (s.startsWith('SCHEDULE_')) return 'meeting';
  return 'project';
}

/**
 * Describe which fields we already have for their current flow.
 */
function knownFieldsSummary(user) {
  const m = user.metadata || {};
  const state = String(user.state || '');
  const parts = [];

  if (state.startsWith('WEB_') || state.startsWith('SALON_')) {
    const wd = m.websiteData || {};
    if (wd.businessName) parts.push(`business name (*${wd.businessName}*)`);
    if (wd.industry) parts.push(`industry (*${wd.industry}*)`);
    if (Array.isArray(wd.services) && wd.services.length) parts.push('services');
    if (wd.contactEmail || wd.contactPhone) parts.push('contact info');
  } else if (state.startsWith('LOGO_')) {
    const ld = m.logoData || {};
    if (ld.businessName) parts.push(`business name (*${ld.businessName}*)`);
    if (ld.industry) parts.push(`industry (*${ld.industry}*)`);
    if (ld.style) parts.push('style');
  } else if (state.startsWith('AD_')) {
    const ad = m.adData || {};
    if (ad.businessName) parts.push(`business name (*${ad.businessName}*)`);
    if (ad.industry) parts.push(`industry (*${ad.industry}*)`);
    if (ad.niche) parts.push('product details');
  } else if (state.startsWith('CB_')) {
    const cb = m.chatbotData || {};
    if (cb.businessName) parts.push(`business name (*${cb.businessName}*)`);
    if (cb.industry) parts.push(`industry (*${cb.industry}*)`);
    if (Array.isArray(cb.faqs) && cb.faqs.length) parts.push(`${cb.faqs.length} FAQs`);
  }

  return parts;
}

/**
 * Build the recap string. Returns '' when no recap should fire.
 */
async function buildRecapIfNeeded(user) {
  if (!user || !user.id) return '';
  if (!RECAP_STATES.has(user.state)) return '';

  const lastAt = await getLastActivityAt(user.id);
  if (!lastAt) return '';

  const gapMinutes = (Date.now() - lastAt.getTime()) / 60000;
  if (gapMinutes < GAP_THRESHOLD_MINUTES) return '';

  const flow = flowLabel(user.state);
  const known = knownFieldsSummary(user);
  const warm = gapMinutes >= WARM_THRESHOLD_MINUTES;

  let recap;
  if (known.length === 0) {
    recap = warm
      ? "Hey! 👋 Welcome back. Let's pick up where we left off on your *" + flow + "*."
      : "Welcome back! Let's pick up where we left off on your *" + flow + "*.";
  } else {
    const last = known.pop();
    const knownText = known.length > 0 ? known.join(', ') + ', and ' + last : last;
    recap = warm
      ? `Hey! 👋 Good to hear from you again. We were working on your *${flow}* — I've still got ${knownText}. Let's keep going.`
      : `Welcome back! We were working on your *${flow}* — I've still got ${knownText}. Let's keep going.`;
  }

  logger.info(`[RECAP] ${user.phone_number}: gap=${gapMinutes.toFixed(1)}min state=${user.state} → "${recap.slice(0, 80)}…"`);
  return recap;
}

module.exports = {
  buildRecapIfNeeded,
  getLastActivityAt,
  RECAP_STATES,
  GAP_THRESHOLD_MINUTES,
};
