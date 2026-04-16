/**
 * Site Cleanup Job
 *
 * - After 1h unpaid: redeploy with "Preview Only" watermark
 * - After 60 days unpaid: delete the Netlify site and archive in DB
 *
 * Runs every 15 minutes so the 1h watermark threshold is actually honoured —
 * a slower cadence would let previews sit un-watermarked hours past the cutoff.
 */

const axios = require('axios');
const { supabase } = require('../config/database');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

const NETLIFY_API = 'https://api.netlify.com/api/v1';
const WATERMARK_AFTER_HOURS = 1;
const DELETE_AFTER_DAYS = 60;

async function runSiteCleanup() {
  if (!env.netlify.token) return;
  const headers = { Authorization: `Bearer ${env.netlify.token}`, 'Content-Type': 'application/json' };

  try {
    // Get all preview sites (not paid, not live, not already watermarked/archived)
    const { data: sites, error } = await supabase
      .from('generated_sites')
      .select('id, user_id, site_data, netlify_site_id, netlify_subdomain, preview_url, status, created_at')
      .in('status', ['preview', 'approved', 'awaiting_payment']);

    if (error || !sites || sites.length === 0) return;

    const now = Date.now();

    for (const site of sites) {
      const ageHours = (now - new Date(site.created_at).getTime()) / (1000 * 60 * 60);
      const ageDays = ageHours / 24;

      // Check if user has paid
      const { data: user } = await supabase
        .from('users')
        .select('metadata')
        .eq('id', site.user_id)
        .single();

      if (user?.metadata?.paymentConfirmed) continue; // Paid — skip

      // 60+ days: delete the Netlify site and archive
      if (ageDays >= DELETE_AFTER_DAYS && site.netlify_site_id) {
        try {
          await axios.delete(`${NETLIFY_API}/sites/${site.netlify_site_id}`, { headers });
          await supabase.from('generated_sites').update({ status: 'archived' }).eq('id', site.id);
          logger.info(`[CLEANUP] Deleted and archived site ${site.netlify_site_id} (${ageDays.toFixed(0)} days old)`);
        } catch (err) {
          logger.error(`[CLEANUP] Failed to delete site ${site.netlify_site_id}:`, err.message);
        }
        continue;
      }

      // 1+ hour: redeploy with watermark
      if (ageHours >= WATERMARK_AFTER_HOURS && site.status !== 'watermarked' && site.netlify_site_id && site.site_data) {
        try {
          const { deployToNetlify } = require('../website-gen/deployer');
          await deployToNetlify(site.site_data, site.netlify_site_id, { watermark: true });
          await supabase.from('generated_sites').update({ status: 'watermarked' }).eq('id', site.id);
          logger.info(`[CLEANUP] Watermarked site ${site.netlify_site_id} (${ageHours.toFixed(0)}h old)`);
        } catch (err) {
          logger.error(`[CLEANUP] Failed to watermark site ${site.netlify_site_id}:`, err.message);
        }
      }
    }
  } catch (err) {
    logger.error('[CLEANUP] Site cleanup error:', err.message);
  }
}

function startSiteCleanup() {
  const INTERVAL = 15 * 60 * 1000; // 15 minutes

  // Run once on startup after a delay
  setTimeout(() => {
    runSiteCleanup().catch(err => logger.error('[CLEANUP] Initial run error:', err.message));
  }, 60000); // 1 min after server start

  setInterval(() => {
    runSiteCleanup().catch(err => logger.error('[CLEANUP] Scheduled run error:', err.message));
  }, INTERVAL);

  logger.info('[CLEANUP] Site cleanup job started (interval: 15m, watermark after 1h)');
}

module.exports = { startSiteCleanup };
