/**
 * Site Cleanup Job
 *
 * Unpaid preview sites get deleted from Netlify 22 hours after they were
 * generated, then archived in Supabase. Paid sites are skipped.
 *
 * "Paid" is checked at the site level (site_data.paymentStatus === 'paid')
 * not at the user level. Each generated_sites row tracks its own payment
 * state — redeployAsPaid(siteId) writes 'paid' to that specific site's
 * site_data, and the refund handler writes 'preview' back. This means a
 * customer with three businesses on one phone who pays for only one
 * gets exactly one site spared; the other two are eligible for cleanup.
 *
 * A short race-window safeguard also runs before any delete: if this user
 * has a 'paid' payment row in the last 10 minutes, we assume the Stripe
 * webhook's post-processing (redeployAsPaid + site_data write) may still
 * be mid-flight and skip the site for this pass. Covers the rare case
 * where a user finishes checkout at t=21:59 and cleanup fires at t=22:00
 * before redeployAsPaid has finished writing the 'paid' flag.
 *
 * Previously this job also redeployed a "Preview Only" watermark after
 * an hour — removed because the activation banner (injected into every
 * preview build) already communicates "this isn't live yet" far more
 * visibly, and the double treatment just added noise.
 */

const axios = require('axios');
const { supabase } = require('../config/database');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

const NETLIFY_API = 'https://api.netlify.com/api/v1';
const DELETE_AFTER_HOURS = 22;
const RECENT_PAYMENT_WINDOW_MS = 10 * 60 * 1000;

async function runSiteCleanup() {
  if (!env.netlify.token) return;
  const headers = { Authorization: `Bearer ${env.netlify.token}`, 'Content-Type': 'application/json' };

  try {
    // Include 'watermarked' for legacy rows from the old watermark flow so
    // they get caught by the new 22h delete rule too.
    const { data: sites, error } = await supabase
      .from('generated_sites')
      .select('id, user_id, site_data, netlify_site_id, netlify_subdomain, preview_url, status, created_at')
      .in('status', ['preview', 'approved', 'awaiting_payment', 'watermarked']);

    if (error || !sites || sites.length === 0) return;

    const now = Date.now();

    for (const site of sites) {
      const ageHours = (now - new Date(site.created_at).getTime()) / (1000 * 60 * 60);

      if (ageHours < DELETE_AFTER_HOURS) continue; // Still within grace window

      // Per-site check: this specific site is in paid state.
      if (site.site_data?.paymentStatus === 'paid') continue;

      // Race-window safeguard — if this user just paid, redeployAsPaid
      // may still be writing the 'paid' flag onto this site. One-query
      // check: any 'paid' payment in the last 10 min for this user.
      const sinceIso = new Date(now - RECENT_PAYMENT_WINDOW_MS).toISOString();
      const { data: recentPaid } = await supabase
        .from('payments')
        .select('id')
        .eq('user_id', site.user_id)
        .eq('status', 'paid')
        .gte('paid_at', sinceIso)
        .limit(1);
      if (recentPaid && recentPaid.length > 0) {
        logger.info(`[CLEANUP] Skipping site ${site.id} — user has a paid payment in the last 10min (webhook may be in flight)`);
        continue;
      }

      if (!site.netlify_site_id) {
        // Nothing to delete on Netlify's side — just archive the orphan.
        await supabase.from('generated_sites').update({ status: 'archived' }).eq('id', site.id);
        logger.info(`[CLEANUP] Archived orphan row ${site.id} (no netlify_site_id, ${ageHours.toFixed(1)}h old)`);
        continue;
      }

      try {
        await axios.delete(`${NETLIFY_API}/sites/${site.netlify_site_id}`, { headers });
        await supabase.from('generated_sites').update({ status: 'archived' }).eq('id', site.id);
        logger.info(`[CLEANUP] Deleted unpaid site ${site.netlify_site_id} (${ageHours.toFixed(1)}h old) and archived row ${site.id}`);
      } catch (err) {
        // 404 = Netlify already dropped it (manual delete, token rotation,
        // etc). Archive regardless so we stop looping on the same row.
        if (err.response?.status === 404) {
          await supabase.from('generated_sites').update({ status: 'archived' }).eq('id', site.id);
          logger.warn(`[CLEANUP] Netlify site ${site.netlify_site_id} already gone (404) — archived row ${site.id}`);
        } else {
          logger.error(`[CLEANUP] Failed to delete ${site.netlify_site_id}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    logger.error('[CLEANUP] Site cleanup error:', err.message);
  }
}

function startSiteCleanup() {
  const INTERVAL = 15 * 60 * 1000; // 15 minutes

  setTimeout(() => {
    runSiteCleanup().catch((err) => logger.error('[CLEANUP] Initial run error:', err.message));
  }, 60000);

  setInterval(() => {
    runSiteCleanup().catch((err) => logger.error('[CLEANUP] Scheduled run error:', err.message));
  }, INTERVAL);

  logger.info(`[CLEANUP] Site cleanup job started (interval: 15m, delete unpaid after ${DELETE_AFTER_HOURS}h)`);
}

module.exports = { startSiteCleanup };
