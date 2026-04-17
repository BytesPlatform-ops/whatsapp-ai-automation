/**
 * returningUser.js
 *
 * When a user with completed projects (approved sites, SEO audits,
 * generated logos) sends a greeting from WELCOME / SALES_CHAT, Pixie
 * should reference their past work instead of giving a cold intro.
 *
 * Example: instead of "Hi, I'm Pixie! How can I help?"
 *   → "Hey! How's the Fresh Cuts website working out? Let me know if
 *     you need anything else."
 *
 * Integration: router.js calls `buildReturningGreeting(user)` for the
 * first message of a returning session. If it returns a non-empty
 * string, the router prepends it to the greeting.
 */

'use strict';

const { supabase } = require('../config/database');
const { logger } = require('../utils/logger');
const { STATES } = require('./states');

// Only fire when the user arrives in one of these "entry" states — not
// mid-flow, where a project reference would be confusing.
const ENTRY_STATES = new Set([
  STATES.WELCOME,
  STATES.SALES_CHAT,
  STATES.GENERAL_CHAT,
  STATES.SERVICE_SELECTION,
]);

/**
 * Query Supabase for any completed projects belonging to this user.
 * Returns { sites: [], audits: [] } with at most 3 of each.
 */
async function fetchCompletedProjects(userId) {
  const out = { sites: [], audits: [] };
  try {
    const { data: sites } = await supabase
      .from('sites')
      .select('id, preview_url, custom_domain, template_id, site_data, status')
      .eq('user_id', userId)
      .in('status', ['approved', 'published', 'live'])
      .order('created_at', { ascending: false })
      .limit(3);
    if (sites) out.sites = sites;
  } catch (err) {
    logger.warn(`[RETURNING] sites query failed: ${err.message}`);
  }
  try {
    const { data: audits } = await supabase
      .from('audits')
      .select('id, url, status')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(3);
    if (audits) out.audits = audits;
  } catch (err) {
    logger.warn(`[RETURNING] audits query failed: ${err.message}`);
  }
  return out;
}

/**
 * Build a warm, project-specific greeting for a returning user.
 * Returns '' when we have nothing meaningful to reference.
 */
async function buildReturningGreeting(user) {
  if (!user || !user.id) return '';
  if (!ENTRY_STATES.has(user.state)) return '';

  // Only greet returning users — check if there's any conversation
  // history at all. A user who just arrived for the first time should
  // get the standard fresh greeting.
  const alreadyGreeted = user.metadata?.returningGreetShown;
  if (alreadyGreeted) return ''; // one greeting per session

  const { sites, audits } = await fetchCompletedProjects(user.id);
  if (sites.length === 0 && audits.length === 0) return '';

  let greeting = '';
  if (sites.length > 0) {
    const site = sites[0];
    const name = site.site_data?.businessName || site.site_data?.headline || '';
    const domain = site.custom_domain || '';
    if (name && domain) {
      greeting = `Hey! Good to see you again. How's the *${name}* site at *${domain}* going? Let me know if you need anything.`;
    } else if (name) {
      greeting = `Hey! Good to see you again. How's the *${name}* website working out? Let me know if you need anything.`;
    } else {
      greeting = `Hey! Good to see you again. How's your website going? Let me know if you need updates or anything new.`;
    }
  } else if (audits.length > 0) {
    const audit = audits[0];
    greeting = `Hey! Good to see you again. Did the SEO tips from your *${audit.url || 'site'}* audit help out? Let me know what else I can do.`;
  }

  if (!greeting) return '';

  logger.info(`[RETURNING] ${user.phone_number}: greeting with project reference (sites=${sites.length} audits=${audits.length})`);
  return greeting;
}

module.exports = {
  buildReturningGreeting,
  fetchCompletedProjects,
  ENTRY_STATES,
};
