/**
 * Site Cleanup Job
 *
 * Unpaid preview sites get deleted from Netlify 23 hours after they were
 * generated, then archived in Supabase. Paid sites are skipped.
 *
 * Timing pairs with the follow-up scheduler: the 22h discount job offers
 * 20% off the website, then this cleanup kills the preview 1 hour later
 * if still unpaid. That 1-hour gap is the urgency window.
 *
 * "Paid" is checked at the site level (site_data.paymentStatus === 'paid')
 * not at the user level. Each generated_sites row tracks its own payment
 * state — redeployAsPaid(siteId) writes 'paid' to that specific site's
 * site_data, and the refund handler writes 'preview' back. This means a
 * customer with three businesses on one phone who pays for only one
 * gets exactly one site spared; the other two are eligible for cleanup.
 *
 * Payment-row safeguard also runs before any delete: if the user has any
 * 'paid' payment with paid_at >= this site's created_at, we skip. That
 * cleanly excludes payments for OTHER, prior sites (their paid_at is
 * before this site existed) while protecting any paid site whose
 * site_data.paymentStatus failed to flip to 'paid' — e.g. when the
 * fire-and-forget redeployAsPaid hit a Netlify outage and never wrote
 * the in-row flag. Without this safeguard a paid customer's site could
 * silently get deleted at the 23h mark.
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
const DELETE_AFTER_HOURS = 23;

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

      // Payment-row safeguard — second line of defense if redeployAsPaid
      // never wrote site_data.paymentStatus='paid' (Netlify outage,
      // token rotation, etc.). Look for any paid payment for this user
      // with paid_at >= this site's created_at; if one exists, the
      // payment is either for this site or for a later site, but a
      // *prior* paid site would have been created BEFORE its paid_at,
      // so the timestamp comparison cleanly excludes that case.
      // Replaces the prior 10-minute race window with a broader check
      // so a paid customer's site is never deleted just because the
      // banner-removal redeploy failed to write the in-row flag.
      const { data: paidForThisOrLater } = await supabase
        .from('payments')
        .select('id, paid_at')
        .eq('user_id', site.user_id)
        .eq('status', 'paid')
        .gte('paid_at', site.created_at)
        .limit(1);
      if (paidForThisOrLater && paidForThisOrLater.length > 0) {
        logger.info(
          `[CLEANUP] Skipping site ${site.id} — user has a paid payment ` +
            `at ${paidForThisOrLater[0].paid_at} ≥ site created_at ${site.created_at}`
        );
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
