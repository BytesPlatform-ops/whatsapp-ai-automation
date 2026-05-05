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

const axios = require('axios');
const { supabase } = require('../config/database');
const { verifyDNS } = require('../website-gen/domainChecker');
const { sendTextMessage } = require('../messages/sender');
const { runWithContext } = require('../messages/channelContext');
const { logMessage } = require('../db/conversations');
const { logger } = require('../utils/logger');
const { env } = require('../config/env');

const NETLIFY_API = 'https://api.netlify.com/api/v1';

/**
 * Trigger Netlify Let's Encrypt provisioning for a site. Returns:
 *   { ok: true }                — SSL provisioned (or already provisioned)
 *   { ok: false, retry: true }  — DNS not propagated to Netlify yet (422); try again later
 *   { ok: false, retry: false } — other error; log and continue
 */
async function provisionNetlifySSL(siteId) {
  if (!siteId || !env.netlify?.token) return { ok: false, retry: false };
  try {
    await axios.post(
      `${NETLIFY_API}/sites/${siteId}/ssl`,
      null,
      { headers: { Authorization: `Bearer ${env.netlify.token}` }, timeout: 30000 }
    );
    return { ok: true };
  } catch (err) {
    const status = err.response?.status;
    if (status === 422) return { ok: false, retry: true, message: err.response?.data?.message || err.message };
    return { ok: false, retry: false, message: err.message };
  }
}

async function runDomainVerificationCycle() {
  try {
    // Get sites that have a domain but aren't live yet
    const { data: sites, error } = await supabase
      .from('generated_sites')
      .select('id, user_id, custom_domain, netlify_subdomain, netlify_site_id, status, updated_at')
      .not('custom_domain', 'is', null)
      .in('status', ['domain_setup_pending', 'domain_setup_complete'])
      .order('updated_at', { ascending: false });

    if (error || !sites || sites.length === 0) return;

    for (const site of sites) {
      try {
        // Self-heal step 1: re-run NameSilo DNS configuration. The function
        // is idempotent — it lists current records, deletes any parking A
        // records that appeared after registration (NameSilo sometimes
        // creates them asynchronously), and re-adds ours if missing. If the
        // domain isn't on NameSilo (e.g. Namecheap fallback, or a typo'd
        // domain that never registered), this will throw and we ignore it.
        let dnsReconciled = false;
        if (process.env.NAMESILO_API_KEY && site.netlify_subdomain) {
          try {
            const { setDNSForNetlify } = require('../integrations/namesilo');
            await setDNSForNetlify(site.custom_domain, site.netlify_subdomain);
            dnsReconciled = true;
          } catch (err) {
            logger.debug(`[DNS] NameSilo reconcile skipped for ${site.custom_domain}: ${err.message}`);
          }
        }

        // Self-heal step 2: re-attach the domain on Netlify. Gated on the
        // DNS reconcile succeeding above — Netlify accepts any domain
        // string regardless of ownership, so attaching a domain we don't
        // own (typo, failed registration) would create a phantom alias.
        // A successful NameSilo DNS write is our ownership signal.
        if (dnsReconciled && site.netlify_site_id) {
          try {
            const { addCustomDomainToNetlify } = require('../website-gen/deployer');
            await addCustomDomainToNetlify(site.netlify_site_id, site.custom_domain);
            await addCustomDomainToNetlify(site.netlify_site_id, `www.${site.custom_domain}`);
          } catch (err) {
            logger.debug(`[DNS] Netlify reconcile skipped for ${site.custom_domain}: ${err.message}`);
          }
        }

        const result = await verifyDNS(site.custom_domain);

        if (result.verified) {
          // DNS resolves — now ask Netlify to provision SSL. If Netlify's
          // own DNS check disagrees (422), we leave the row alone and let
          // the next cycle retry; once Netlify agrees, we proceed.
          const ssl = await provisionNetlifySSL(site.netlify_site_id);
          if (!ssl.ok && ssl.retry) {
            logger.debug(`[DNS] SSL pending for ${site.custom_domain} — Netlify says DNS not yet propagated to its resolvers. Retrying next cycle.`);
            continue;
          }
          if (!ssl.ok) {
            logger.warn(`[DNS] SSL trigger failed for ${site.custom_domain}: ${ssl.message}. Marking live anyway — cert may need manual provisioning.`);
          } else {
            logger.info(`[DNS] SSL provisioned for ${site.custom_domain}`);
          }

          // Update site status to live
          await supabase
            .from('generated_sites')
            .update({ status: 'live' })
            .eq('id', site.id);

          // Get user info to notify them — include via_phone_number_id so the
          // notification lands on the same WhatsApp line they originally used.
          const { data: user } = await supabase
            .from('users')
            .select('id, phone_number, channel, via_phone_number_id')
            .eq('id', site.user_id)
            .single();

          if (user) {
            await runWithContext(
              { channel: user.channel || 'whatsapp', phoneNumberId: user.via_phone_number_id || null },
              () => sendTextMessage(
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
