const { sendTextMessage, sendCTAButton } = require('../../messages/sender');
const { logMessage } = require('../../db/conversations');
const { updateUserMetadata } = require('../../db/users');
const { getLatestSite, updateSite } = require('../../db/sites');
const { checkDomainAvailability } = require('../../website-gen/domainChecker');
const { logger } = require('../../utils/logger');
const { env } = require('../../config/env');
const { STATES } = require('../states');

const DOMAIN_COST = 10; // ~$10 for domain registration
const SITE_COST = 100;  // Total site cost
const UPFRONT_PERCENT = 0.5; // 50% upfront

async function handleCustomDomain(user, message) {
  switch (user.state) {
    case STATES.DOMAIN_OFFER:
      return handleDomainOffer(user, message);
    case STATES.DOMAIN_SEARCH:
      return handleDomainSearch(user, message);
    case STATES.DOMAIN_PURCHASE_WAIT:
    case STATES.DOMAIN_DNS_GUIDE:
    case STATES.DOMAIN_VERIFY:
      // Legacy states
      if (user.metadata?.selectedDomain) {
        await sendTextMessage(user.phone_number, "Your domain setup is in progress. We'll update you when it's live!");
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
    // No domain — offer the site for $100 flat
    await sendTextMessage(
      user.phone_number,
      "No worries on the domain! The website itself is *$100*. Want me to send the payment link?"
    );
    await logMessage(user.id, 'User declined domain — offering $100 for site only', 'assistant');
    // Stay in sales to handle the $100 payment
    return STATES.SALES_CHAT;
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

  const cleaned = text.replace(/[^a-z0-9-]/g, '');
  if (cleaned.length >= 2) {
    return runDomainSearch(user, cleaned);
  }

  await sendTextMessage(
    user.phone_number,
    'Would you like to set up a custom domain? Just say *"yes"* and I\'ll help you find one, or *"no"* if you want to skip it.'
  );
  return STATES.DOMAIN_OFFER;
}

// ─── DOMAIN_SEARCH ─────────────────────────────────────────────────
async function handleDomainSearch(user, message) {
  const text = (message.text || '').trim();

  const domainOptions = user.metadata?.domainOptions || [];
  const availableOptions = domainOptions.filter(d => d.available && !d.premium);

  if (availableOptions.length > 0) {
    // Match explicit number: "1", "2", etc.
    const numMatch = text.match(/^(\d+)$/);
    if (numMatch) {
      const idx = parseInt(numMatch[1], 10) - 1;
      if (idx >= 0 && idx < domainOptions.length && domainOptions[idx].available && !domainOptions[idx].premium) {
        return processDomainSelection(user, domainOptions[idx].domain);
      }
      if (idx >= 0 && idx < domainOptions.length) {
        await sendTextMessage(user.phone_number, 'That domain is not available. Please pick another one, or type a different name.');
        return STATES.DOMAIN_SEARCH;
      }
    }

    // Match ordinal references: "the first", "first one", "1st", "second", "third", etc.
    const ordinalMap = { 'first': 0, '1st': 0, 'second': 0 + 1, '2nd': 1, 'third': 2, '3rd': 2, 'fourth': 3, '4th': 3, 'fifth': 4, '5th': 4 };
    const ordinalMatch = text.toLowerCase().match(/\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th)\b/);
    if (ordinalMatch) {
      const idx = ordinalMap[ordinalMatch[1]];
      if (idx !== undefined && idx < domainOptions.length && domainOptions[idx].available && !domainOptions[idx].premium) {
        return processDomainSelection(user, domainOptions[idx].domain);
      }
    }
  }

  // Match full domain: "mybusiness.com"
  const fullDomainMatch = text.match(/([\w-]+\.[\w]{2,})/);
  if (fullDomainMatch) {
    return processDomainSelection(user, fullDomainMatch[1].toLowerCase());
  }

  // Don't search for random phrases — only if it looks like a domain name
  const cleaned = text.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!cleaned || cleaned.length < 2 || cleaned.length > 30) {
    await sendTextMessage(user.phone_number, 'Please reply with the *number* of the domain you want (e.g., *1*), or type a domain name to search:');
    return STATES.DOMAIN_SEARCH;
  }

  // Only search if it looks like a plausible domain name (no spaces in original, no common phrases)
  const isPhrase = /\s/.test(text.trim()) && !/\.(com|co|io|net|org)$/i.test(text.trim());
  if (isPhrase) {
    await sendTextMessage(user.phone_number, 'Please reply with the *number* of the domain you want (e.g., *1*), or type a single word for a new domain search:');
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
      msg += `${i + 1}. ⚠️ ${r.domain} — Premium (not available)\n`;
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

  await sendTextMessage(user.phone_number, msg);

  await updateUserMetadata(user.id, {
    domainOptions: results,
    domainSearchName: baseName,
  });

  await logMessage(user.id, `Domain search: ${available.map(r => r.domain).join(', ')} available`, 'assistant');
  return STATES.DOMAIN_SEARCH;
}

// ─── Domain selected → send payment link ───────────────────────────
async function processDomainSelection(user, domain) {
  const site = await getLatestSite(user.id);

  await updateUserMetadata(user.id, { selectedDomain: domain });
  if (site) {
    await updateSite(site.id, { custom_domain: domain, status: 'awaiting_payment' });
  }

  // Default: $100 full payment (website + domain included)
  const fullAmount = SITE_COST;

  await sendTextMessage(
    user.phone_number,
    `Great choice — *${domain}*!\n\n` +
    `The total is *$${fullAmount}* — that covers the website and domain, everything included.\n\n` +
    `Once you pay, I'll register your domain, set everything up, and your site will be live at *${domain}* — usually within the hour.\n\n` +
    `_If you'd prefer to split the payment, just let me know and I can do $60 now and $50 after delivery._`
  );

  // Create and send payment link for full amount
  try {
    if (env.stripe.secretKey) {
      const { createPaymentLink } = require('../../payments/stripe');
      const result = await createPaymentLink({
        userId: user.id,
        phoneNumber: user.phone_number,
        amount: fullAmount,
        serviceType: 'website',
        packageTier: 'standard',
        description: `Website + domain (${domain})`,
        customerName: user.name || user.metadata?.websiteData?.businessName || '',
      });

      await sendCTAButton(
        user.phone_number,
        `Tap below to pay $${fullAmount} and get your site live`,
        `💳 Pay $${fullAmount}`,
        result.url
      );

      await updateUserMetadata(user.id, {
        lastPaymentLinkId: result.linkId,
        lastPaymentDbId: result.paymentId,
        lastPaymentAmount: fullAmount,
        domainPaymentPending: true,
        paymentType: 'full', // 'full' or 'split'
        remainingBalance: 0,
      });

      await logMessage(user.id, `Payment link sent: $${fullAmount} for website + domain (${domain})`, 'assistant');
    }
  } catch (err) {
    logger.error('[DOMAIN] Payment link creation failed:', err.message);
    await sendTextMessage(user.phone_number, 'There was an issue creating the payment link. Our team will follow up shortly.');
  }

  // Notify team
  notifyTeam(user, domain, site);

  return STATES.GENERAL_CHAT;
}

async function notifyTeam(user, domain, site) {
  try {
    const { sendDomainRequestNotification } = require('../../notifications/email');
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
