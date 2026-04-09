const { sendTextMessage } = require('../../messages/sender');
const { logMessage } = require('../../db/conversations');
const { updateUserMetadata } = require('../../db/users');
const { getLatestSite, updateSite } = require('../../db/sites');
const { checkDomainAvailability } = require('../../website-gen/domainChecker');
const { addCustomDomainToNetlify } = require('../../website-gen/deployer');
const { sendDomainRequestNotification } = require('../../notifications/email');
const { logger } = require('../../utils/logger');
const { env } = require('../../config/env');
const { STATES } = require('../states');

async function handleCustomDomain(user, message) {
  switch (user.state) {
    case STATES.DOMAIN_OFFER:
      return handleDomainOffer(user, message);
    case STATES.DOMAIN_SEARCH:
      return handleDomainSearch(user, message);
    case STATES.DOMAIN_PURCHASE_WAIT:
    case STATES.DOMAIN_DNS_GUIDE:
    case STATES.DOMAIN_VERIFY:
      // Legacy states — check if domain is set up
      if (user.metadata?.selectedDomain) {
        await sendTextMessage(user.phone_number, "Your domain setup is in progress. We'll update you when it's live! Anything else I can help with?");
      } else {
        await sendTextMessage(user.phone_number, "Would you like to set up a custom domain? Just say *\"yes\"*!");
        return STATES.DOMAIN_OFFER;
      }
      return STATES.GENERAL_CHAT;
    default:
      return STATES.GENERAL_CHAT;
  }
}

// ─── DOMAIN_OFFER ──────────────────────────────────────────────────
async function handleDomainOffer(user, message) {
  const text = (message.text || '').trim().toLowerCase();

  const isYes = /^(yes|yeah|yep|sure|ok|okay|y|domain|set up|set it up)$/i.test(text);
  const isNo = /^(no|nah|nope|later|not now|n|skip|maybe later)$/i.test(text);

  if (isNo) {
    const returnToSales = user.metadata?.returnToSales;
    await sendTextMessage(
      user.phone_number,
      "No problem! Your website preview is still live. You can always come back and set up a domain later. Just send a message anytime!"
    );
    await logMessage(user.id, 'User declined custom domain setup', 'assistant');
    return returnToSales ? STATES.SALES_CHAT : STATES.GENERAL_CHAT;
  }

  if (isYes) {
    const businessName = user.metadata?.websiteData?.businessName || '';
    const sanitized = businessName.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (!sanitized || sanitized.length < 2) {
      await sendTextMessage(user.phone_number, "What name would you like for your domain? (e.g., mybusiness)");
      return STATES.DOMAIN_SEARCH;
    }

    return runDomainSearch(user, sanitized);
  }

  // Treat other text as a domain name to search
  const cleaned = text.replace(/[^a-z0-9-]/g, '');
  if (cleaned.length >= 2) {
    return runDomainSearch(user, cleaned);
  }

  await sendTextMessage(
    user.phone_number,
    'Would you like to set up a custom domain? Just say *"yes"* and I\'ll help you find one, or *"no"* if you want to do it later.'
  );
  return STATES.DOMAIN_OFFER;
}

// ─── DOMAIN_SEARCH ─────────────────────────────────────────────────
async function handleDomainSearch(user, message) {
  const text = (message.text || '').trim();

  // Check if user picked a number from the list
  const domainOptions = user.metadata?.domainOptions || [];
  const numMatch = text.match(/^(\d+)$/);
  if (numMatch && domainOptions.length > 0) {
    const idx = parseInt(numMatch[1], 10) - 1;
    if (idx >= 0 && idx < domainOptions.length && domainOptions[idx].available) {
      return processDomainSelection(user, domainOptions[idx].domain);
    }
    if (idx >= 0 && idx < domainOptions.length && !domainOptions[idx].available) {
      await sendTextMessage(user.phone_number, 'That domain is taken. Please pick an available one, or type a different name to search.');
      return STATES.DOMAIN_SEARCH;
    }
  }

  // Check if user typed a full domain (e.g., mybusiness.com)
  const fullDomainMatch = text.match(/([\w-]+\.[\w]{2,})/);
  if (fullDomainMatch) {
    return processDomainSelection(user, fullDomainMatch[1].toLowerCase());
  }

  const cleaned = text.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!cleaned || cleaned.length < 2) {
    await sendTextMessage(user.phone_number, 'Please enter a name for your domain (e.g., mybusiness):');
    return STATES.DOMAIN_SEARCH;
  }

  return runDomainSearch(user, cleaned);
}

async function runDomainSearch(user, baseName) {
  await sendTextMessage(user.phone_number, `Checking domain availability for *${baseName}*...`);

  const results = await checkDomainAvailability(baseName);
  const available = results.filter(r => r.available && !r.premium);

  let msg = '*Domain Availability:*\n\n';
  results.forEach((r, i) => {
    if (r.premium) {
      msg += `${i + 1}. ⚠️ ${r.domain} — Premium (not available for auto-setup)\n`;
    } else {
      msg += r.available ? `${i + 1}. ✅ ${r.domain} — *Available*\n` : `${i + 1}. ❌ ${r.domain} — Taken\n`;
    }
  });

  if (available.length === 0) {
    msg += '\nNo domains available with that name. Try a different name:';
    await sendTextMessage(user.phone_number, msg);
    return STATES.DOMAIN_SEARCH;
  }

  msg += '\nJust reply with the *number* or *domain name* you want, or type a different name to search again.';
  msg += '\n\n_The domain is included in your package — we\'ll handle everything for you._';

  await sendTextMessage(user.phone_number, msg);

  await updateUserMetadata(user.id, {
    domainOptions: results,
    domainSearchName: baseName,
  });

  await logMessage(user.id, `Domain search: ${available.map(r => r.domain).join(', ')} available`, 'assistant');
  return STATES.DOMAIN_SEARCH;
}

// ─── Domain selection + auto-purchase ──────────────────────────────
async function processDomainSelection(user, domain) {
  const site = await getLatestSite(user.id);
  const netlifySubdomain = site?.netlify_subdomain || '';
  const netlifySiteId = site?.netlify_site_id || '';

  await updateUserMetadata(user.id, { selectedDomain: domain });

  // Try automated purchase if Namecheap API is configured
  if (env.namecheap.apiKey) {
    await sendTextMessage(user.phone_number, `Setting up *${domain}* for you now — this will take a moment...`);

    try {
      const { purchaseAndConfigureDomain } = require('../../integrations/namecheap');
      const result = await purchaseAndConfigureDomain(domain, netlifySubdomain);

      if (result.success) {
        // Add domain to Netlify
        if (netlifySiteId) {
          try {
            await addCustomDomainToNetlify(netlifySiteId, domain);
          } catch (err) {
            logger.error(`[DOMAIN] Netlify domain add failed:`, err.message);
          }
        }

        // Update DB
        if (site) {
          await updateSite(site.id, {
            custom_domain: domain,
            status: 'domain_setup_complete',
          });
        }

        await updateUserMetadata(user.id, {
          domainStatus: 'purchased',
          domainPurchasedAt: new Date().toISOString(),
          domainChargedAmount: result.chargedAmount,
        });

        await sendTextMessage(
          user.phone_number,
          `✅ *${domain}* has been registered and configured!\n\n` +
          `DNS is being set up now — your website will be live at *${domain}* within 5-60 minutes (sometimes up to a few hours for DNS to fully propagate).\n\n` +
          `We'll have it on HTTPS automatically. You don't need to do anything!`
        );
        await logMessage(user.id, `Domain auto-purchased: ${domain} ($${result.chargedAmount})`, 'assistant');

        // Still notify team for records
        notifyTeam(user, domain, site, 'auto_purchased');

        const returnToSales = user.metadata?.returnToSales;
        return returnToSales ? STATES.SALES_CHAT : STATES.GENERAL_CHAT;
      } else {
        // Auto-purchase failed — fall through to manual
        logger.warn(`[DOMAIN] Auto-purchase failed for ${domain}: ${result.error}`);
        await sendTextMessage(
          user.phone_number,
          `I wasn't able to auto-register *${domain}* (${result.error}). Our team will handle this manually — it'll take about 2 business days.`
        );
      }
    } catch (err) {
      logger.error(`[DOMAIN] Auto-purchase error for ${domain}:`, err.message);
      await sendTextMessage(
        user.phone_number,
        `There was an issue with the automatic setup. No worries — our team will handle *${domain}* manually within 2 business days.`
      );
    }
  } else {
    // No Namecheap API — manual flow
    await sendTextMessage(
      user.phone_number,
      `Great choice! We'll set up *${domain}* for your website.\n\n` +
      `Domain setup takes about *2 business days*. We'll handle everything — purchase, DNS configuration, and SSL.\n\n` +
      `We'll send you an update once it's live!`
    );
  }

  // Manual fallback — notify team
  if (site) {
    await updateSite(site.id, { custom_domain: domain, status: 'domain_setup_pending' });
  }
  await logMessage(user.id, `Domain selected: ${domain} — team notified for manual setup`, 'assistant');
  notifyTeam(user, domain, site, 'manual_setup_needed');

  const returnToSales = user.metadata?.returnToSales;
  return returnToSales ? STATES.SALES_CHAT : STATES.GENERAL_CHAT;
}

/**
 * Send email notification to the team.
 */
async function notifyTeam(user, domain, site, type) {
  try {
    await sendDomainRequestNotification({
      userName: user.name || user.metadata?.websiteData?.businessName || '',
      userPhone: user.phone_number,
      userEmail: user.metadata?.email || '',
      selectedDomain: domain,
      sitePreviewUrl: site?.preview_url || '',
      netlifySiteId: site?.netlify_site_id || '',
    });
  } catch (err) {
    logger.error('[DOMAIN] Email notification failed:', err.message);
  }
}

module.exports = { handleCustomDomain };
