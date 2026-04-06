const { sendTextMessage, sendInteractiveButtons } = require('../../messages/sender');
const { logMessage } = require('../../db/conversations');
const { updateUserMetadata } = require('../../db/users');
const { getLatestSite, updateSite } = require('../../db/sites');
const { checkDomainAvailability, getPurchaseLinks, verifyDNS } = require('../../website-gen/domainChecker');
const { addCustomDomainToNetlify } = require('../../website-gen/deployer');
const { logger } = require('../../utils/logger');
const { STATES } = require('../states');

async function handleCustomDomain(user, message) {
  switch (user.state) {
    case STATES.DOMAIN_OFFER:
      return handleDomainOffer(user, message);
    case STATES.DOMAIN_SEARCH:
      return handleDomainSearch(user, message);
    case STATES.DOMAIN_PURCHASE_WAIT:
      return handlePurchaseWait(user, message);
    case STATES.DOMAIN_DNS_GUIDE:
      return handleDNSGuide(user, message);
    case STATES.DOMAIN_VERIFY:
      return handleVerify(user, message);
    default:
      return STATES.GENERAL_CHAT;
  }
}

// ─── DOMAIN_OFFER ──────────────────────────────────────────────────
async function handleDomainOffer(user, message) {
  const buttonId = message.buttonId || '';
  const text = (message.text || '').trim().toLowerCase();

  const isYes = buttonId === 'domain_yes' || /^(yes|yeah|yep|sure|ok|okay|y)$/i.test(text);
  const isNo = buttonId === 'domain_no' || /^(no|nah|nope|later|not now|n|skip)$/i.test(text);

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
    // Use existing business name to search for domains
    const businessName = user.metadata?.websiteData?.businessName || '';
    const sanitized = businessName.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (!sanitized || sanitized.length < 2) {
      await sendTextMessage(user.phone_number, "What name would you like for your domain? (e.g., mybusiness)");
      return STATES.DOMAIN_SEARCH;
    }

    return runDomainSearch(user, sanitized);
  }

  // If user typed something else, treat it as a domain name to search
  const cleaned = text.replace(/[^a-z0-9-]/g, '');
  if (cleaned.length >= 2) {
    return runDomainSearch(user, cleaned);
  }

  await sendInteractiveButtons(user.phone_number, 'Would you like to set up a custom domain?', [
    { id: 'domain_yes', title: 'Yes, set up domain' },
    { id: 'domain_no', title: 'No, maybe later' },
  ]);
  return STATES.DOMAIN_OFFER;
}

// ─── DOMAIN_SEARCH ─────────────────────────────────────────────────
async function handleDomainSearch(user, message) {
  const text = (message.text || '').trim().toLowerCase();
  const cleaned = text.replace(/[^a-z0-9-]/g, '');

  if (!cleaned || cleaned.length < 2) {
    await sendTextMessage(user.phone_number, "Please enter a name for your domain (e.g., mybusiness):");
    return STATES.DOMAIN_SEARCH;
  }

  return runDomainSearch(user, cleaned);
}

async function runDomainSearch(user, baseName) {
  await sendTextMessage(user.phone_number, `Checking domain availability for *${baseName}*...`);

  const results = await checkDomainAvailability(baseName);
  const available = results.filter(r => r.available);
  const taken = results.filter(r => !r.available);

  let msg = '*Domain Availability:*\n\n';
  results.forEach(r => {
    msg += r.available ? `✅ ${r.domain} — *Available*\n` : `❌ ${r.domain} — Taken\n`;
  });

  if (available.length === 0) {
    msg += '\nNo domains available with that name. Try a different name:';
    await sendTextMessage(user.phone_number, msg);
    return STATES.DOMAIN_SEARCH;
  }

  // Generate purchase links for available domains
  const topDomain = available[0];
  const links = getPurchaseLinks(topDomain.domain);

  msg += '\n*To purchase a domain:*\n\n';
  msg += `1. Namecheap (~$9/yr):\n${links.namecheap}\n\n`;
  msg += `2. Porkbun (~$10/yr):\n${links.porkbun}\n\n`;

  if (available.length > 1) {
    msg += '_You can search for any of the available domains above on either site._\n\n';
  }

  msg += 'Once you\'ve purchased your domain, just send me the domain name (e.g., mybusiness.com) and I\'ll help you connect it!';

  await sendTextMessage(user.phone_number, msg);

  // Store domain options in metadata
  await updateUserMetadata(user.id, {
    domainOptions: results,
    domainSearchName: baseName,
  });

  await logMessage(user.id, `Domain search: ${available.map(r => r.domain).join(', ')} available`, 'assistant');
  return STATES.DOMAIN_PURCHASE_WAIT;
}

// ─── DOMAIN_PURCHASE_WAIT ──────────────────────────────────────────
async function handlePurchaseWait(user, message) {
  const text = (message.text || '').trim();

  // Check if user wants to search for a different name
  const searchAgain = /\b(try|search|different|another|change)\b/i.test(text);
  if (searchAgain) {
    await sendTextMessage(user.phone_number, "No problem! What name would you like to search for?");
    return STATES.DOMAIN_SEARCH;
  }

  // Try to extract a domain from their message
  const domainMatch = text.match(/([\w-]+\.[\w]{2,})/);
  if (!domainMatch) {
    await sendTextMessage(
      user.phone_number,
      "Waiting for you to purchase your domain! Once you've bought it, send me the domain name (e.g., mybusiness.com) and I'll help you set it up.\n\nOr type *\"search\"* to look for a different domain name."
    );
    return STATES.DOMAIN_PURCHASE_WAIT;
  }

  const domain = domainMatch[1].toLowerCase();

  // Store the custom domain
  await updateUserMetadata(user.id, { customDomain: domain });

  // Get the site's Netlify info
  const site = await getLatestSite(user.id);
  const netlifySubdomain = site?.netlify_subdomain || 'your-site';

  // Add the custom domain to Netlify
  try {
    if (site?.netlify_site_id) {
      await addCustomDomainToNetlify(site.netlify_site_id, domain);
      await updateSite(site.id, { custom_domain: domain });
    }
  } catch (error) {
    logger.error('Failed to add domain to Netlify:', error.message);
    // Continue anyway — the DNS instructions are still valid
  }

  // Send DNS instructions
  const instructions =
    `Great! Let's connect *${domain}* to your website.\n\n` +
    `*Follow these steps:*\n\n` +
    `*Step 1:* Log into the site where you bought your domain (Namecheap, Porkbun, etc.)\n\n` +
    `*Step 2:* Go to *DNS Settings* (sometimes called "DNS Management" or "DNS Records")\n\n` +
    `*Step 3:* Add these 2 records:\n\n` +
    `📌 *Record 1 (for www):*\n` +
    `  • Type: *CNAME*\n` +
    `  • Name/Host: *www*\n` +
    `  • Value: *${netlifySubdomain}.netlify.app*\n\n` +
    `📌 *Record 2 (for root domain):*\n` +
    `  • Type: *A*\n` +
    `  • Name/Host: *@*\n` +
    `  • Value: *75.2.60.5*\n\n` +
    `DNS changes usually take 5-30 minutes to work. Once you've added them, let me know and I'll verify the connection!\n\n` +
    `_Need help? Just send "help" and I'll guide you step by step._`;

  await sendTextMessage(user.phone_number, instructions);
  await logMessage(user.id, `Custom domain ${domain} — DNS instructions sent`, 'assistant');

  return STATES.DOMAIN_DNS_GUIDE;
}

// ─── DOMAIN_DNS_GUIDE ──────────────────────────────────────────────
async function handleDNSGuide(user, message) {
  const text = (message.text || '').trim().toLowerCase();

  if (/help/i.test(text)) {
    const domain = user.metadata?.customDomain || 'yourdomain.com';
    const registrar = domain.includes('.') ? '' : '';

    const helpMsg =
      `Here's a more detailed guide:\n\n` +
      `*For Namecheap:*\n` +
      `1. Go to namecheap.com → Dashboard → Domain List\n` +
      `2. Click "Manage" next to your domain\n` +
      `3. Click "Advanced DNS" tab\n` +
      `4. Click "Add New Record" and add the 2 records I sent above\n` +
      `5. If there's an existing A record pointing to a parking page, delete it\n\n` +
      `*For Porkbun:*\n` +
      `1. Go to porkbun.com → Domain Management\n` +
      `2. Click "DNS" next to your domain\n` +
      `3. Add the 2 records from my previous message\n` +
      `4. Delete any default A/CNAME records that were pre-set\n\n` +
      `Once you're done, just say *"done"* or *"check"* and I'll verify!`;

    await sendTextMessage(user.phone_number, helpMsg);
    return STATES.DOMAIN_DNS_GUIDE;
  }

  const done = /\b(done|check|verify|finished|updated|added|set|ready|configured)\b/i.test(text);
  if (done) {
    return runVerification(user);
  }

  await sendTextMessage(
    user.phone_number,
    'No rush! Just send *"done"* when you\'ve updated the DNS records and I\'ll check the connection.\n\nSend *"help"* if you need more detailed instructions.'
  );
  return STATES.DOMAIN_DNS_GUIDE;
}

// ─── DOMAIN_VERIFY ─────────────────────────────────────────────────
async function handleVerify(user, message) {
  const text = (message.text || '').trim().toLowerCase();

  if (/\b(check|verify|again|retry|try)\b/i.test(text)) {
    return runVerification(user);
  }

  await sendTextMessage(
    user.phone_number,
    'Send *"check"* when you\'re ready and I\'ll verify the DNS connection again.'
  );
  return STATES.DOMAIN_VERIFY;
}

async function runVerification(user) {
  const domain = user.metadata?.customDomain;
  if (!domain) {
    await sendTextMessage(user.phone_number, "I don't have a domain on file. What domain did you purchase?");
    return STATES.DOMAIN_PURCHASE_WAIT;
  }

  const site = await getLatestSite(user.id);
  const netlifySubdomain = site?.netlify_subdomain || '';

  await sendTextMessage(user.phone_number, `Checking DNS for *${domain}*...`);

  const result = await verifyDNS(domain, netlifySubdomain);

  if (result.verified) {
    const returnToSales = user.metadata?.returnToSales;

    await sendTextMessage(
      user.phone_number,
      `✅ *DNS verified!* Your website is now live at:\n\n` +
      `🌐 *https://${domain}*\n\n` +
      `Netlify will automatically set up HTTPS (SSL) — this may take a few minutes.\n\n` +
      `Congratulations on launching your website! 🎉`
    );
    await logMessage(user.id, `Custom domain verified: ${domain}`, 'assistant');

    if (site) {
      await updateSite(site.id, { custom_domain: domain, status: 'live' });
    }

    return returnToSales ? STATES.SALES_CHAT : STATES.GENERAL_CHAT;
  }

  await sendTextMessage(
    user.phone_number,
    `DNS hasn't propagated yet for *${domain}*. This is normal — it can take 5-30 minutes (sometimes up to a few hours).\n\n` +
    `Just send *"check"* again in a few minutes and I'll verify it.\n\n` +
    `_Make sure you've added both records:_\n` +
    `• CNAME: www → ${netlifySubdomain}.netlify.app\n` +
    `• A: @ → 75.2.60.5`
  );
  await logMessage(user.id, `DNS verification pending for ${domain}`, 'assistant');

  return STATES.DOMAIN_VERIFY;
}

module.exports = { handleCustomDomain };
