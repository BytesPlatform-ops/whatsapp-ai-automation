/**
 * Domain DNS Verification Job
 *
 * Periodically checks domains that were recently purchased/configured
 * to verify DNS has propagated. Once verified:
 * - Marks site as 'live' in DB
 * - Notifies the user via WhatsApp that their domain is active
 *
 * Runs every 5 minutes.
 */

const { supabase } = require('../config/database');
const { verifyDNS } = require('../website-gen/domainChecker');
const { sendTextMessage } = require('../messages/sender');
const { runWithChannel } = require('../messages/channelContext');
const { logMessage } = require('../db/conversations');
const { logger } = require('../utils/logger');

async function runDomainVerificationCycle() {
  try {
    // Get sites that have a domain but aren't live yet
    const { data: sites, error } = await supabase
      .from('generated_sites')
      .select('id, user_id, custom_domain, netlify_subdomain, status, updated_at')
      .not('custom_domain', 'is', null)
      .eq('status', 'domain_setup_complete')
      .order('updated_at', { ascending: false });

    if (error || !sites || sites.length === 0) return;

    for (const site of sites) {
      try {
        const result = await verifyDNS(site.custom_domain);

        if (result.verified) {
          // Update site status to live
          await supabase
            .from('generated_sites')
            .update({ status: 'live' })
            .eq('id', site.id);

          // Get user info to notify them
          const { data: user } = await supabase
            .from('users')
            .select('id, phone_number, channel')
            .eq('id', site.user_id)
            .single();

          if (user) {
            await runWithChannel(user.channel || 'whatsapp', () =>
              sendTextMessage(
                user.phone_number,
                `🎉 Great news! Your website is now live at:\n\n` +
                `🌐 *https://${site.custom_domain}*\n\n` +
                `HTTPS is set up automatically. Share it with your customers!`
              )
            );
            await logMessage(user.id, `Domain live: ${site.custom_domain}`, 'assistant');
          }

          logger.info(`[DNS] Domain verified and live: ${site.custom_domain}`);
        }
      } catch (err) {
        // Non-critical — will retry next cycle
        logger.debug(`[DNS] Verification pending for ${site.custom_domain}`);
      }
    }
  } catch (err) {
    logger.error('[DNS] Verification cycle error:', err.message);
  }
}

function startDomainVerifier() {
  const INTERVAL = 5 * 60 * 1000; // 5 minutes

  setInterval(() => {
    runDomainVerificationCycle().catch(err =>
      logger.error('[DNS] Scheduled verification error:', err.message)
    );
  }, INTERVAL);

  logger.info('[DNS] Domain verification job started (interval: 5 min)');
}

module.exports = { startDomainVerifier };
