const { sendTextMessage, sendCTAButton } = require('../../messages/sender');
const { logMessage } = require('../../db/conversations');
const { updateUserMetadata } = require('../../db/users');
const { getLatestSite, updateSite } = require('../../db/sites');
const { checkDomainAvailability } = require('../../website-gen/domainChecker');
const { logger } = require('../../utils/logger');
const { env } = require('../../config/env');
const { STATES } = require('../states');
const { classifyIntent } = require('../../llm/intentClassifier');

// Legacy handler — only reached by in-flight users in DOMAIN_OFFER /
// DOMAIN_SEARCH states. New flow routes domain selection BEFORE preview
// generation via the WEB_DOMAIN_* states in webDev.js, with a single
// combined Stripe link. The base website price is admin-managed via
// the admin_settings table (key=`website_price`); env var still acts
// as the fallback default for fresh installs / before the cache warms.
const { getNumberSetting } = require('../../db/settings');
const SITE_COST_DEFAULT = parseInt(process.env.DEFAULT_ACTIVATION_PRICE || '199', 10);

async function handleCustomDomain(user, message) {
  // Defensive guard: if a user somehow lands in DOMAIN_OFFER or
  // DOMAIN_SEARCH after they already answered the pre-build domain
  // question (WEB_DOMAIN_CHOICE: need / own / skip), short-circuit
  // the legacy re-pitch. The primary fix lives in webDev.js#handleRevisions
  // — this is just a safety net so no future code path drops a user
  // who has already made their choice back into the legacy flow.
  const hasSelectedDomain = !!user.metadata?.selectedDomain;
  const skippedDomain = user.metadata?.domainChoice === 'skip';
  const alreadyAnswered = hasSelectedDomain || skippedDomain;
  const inLegacyEntry =
    user.state === STATES.DOMAIN_OFFER || user.state === STATES.DOMAIN_SEARCH;
  if (alreadyAnswered && inLegacyEntry) {
    logger.info(
      `[DOMAIN] Skipping legacy ${user.state} for ${user.phone_number} ` +
        `— domainChoice=${user.metadata.domainChoice || '?'}, selectedDomain=${user.metadata.selectedDomain || 'none'}`
    );
    const body = hasSelectedDomain
      ? `You've already got *${user.metadata.selectedDomain}* locked in — no need to pick again. Your activation link was in the preview message; let me know if you'd like any changes to the site.`
      : `You already said you'd skip a custom domain, so the site's set to launch on its preview URL. Your activation link was in the preview message above — let me know if you'd like any changes to the site.`;
    await sendTextMessage(user.phone_number, body);
    await logMessage(
      user.id,
      `Legacy domain state hit (domainChoice=${user.metadata.domainChoice || 'none'}) — bounced back to revisions`,
      'assistant'
    );
    return STATES.WEB_REVISIONS;
  }

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

// LLM-backed classifier for the three reply shapes we care about across
// both DOMAIN_OFFER and DOMAIN_SEARCH:
//   - wantsDomain: user is agreeing / proceeding ("yes", "let's do it",
//     "set it up", "haan", "I want one")
//   - declines:    user wants to skip or bail out of the flow ("no",
//     "skip", "nah", "forget it", "later", "thanks I'm good", "never mind")
//   - confused:    user is asking what a domain is or expressing
//     uncertainty ("what is a domain?", "explain", "huh?", "I don't get it")
//
// Pre-filters keep the LLM out of obvious structured cases — pure digits
// (option pick), full domain names ("brand.com"), or empty text. Anchored
// regex fast-paths in the handlers below also skip this for the common
// one-word "yes" / "no" answers, so this only runs on ambiguous replies.
async function classifyDomainIntent(text) {
  const t = String(text || '').trim();
  if (!t) return { wantsDomain: false, declines: false, confused: false };
  if (/^\d+$/.test(t)) return { wantsDomain: false, declines: false, confused: false };
  if (/[\w-]+\.[\w]{2,}/.test(t)) return { wantsDomain: false, declines: false, confused: false };
  if (t.length > 80) return { wantsDomain: false, declines: false, confused: false };

  return classifyIntent(t, {
    wantsDomain: 'User wants to set up a custom domain — affirming, agreeing to proceed, or asking to pick one. Examples: "yes", "yeah", "sure", "ok let\'s do it", "set it up", "I want one", "go ahead", in any language including Roman Urdu/Hindi ("haan", "theek hai", "chalo").',
    declines: 'User does NOT want a domain right now or wants to bail out of this step — declining, deferring, asking to skip, "not now", "maybe later", "I\'ll pass", "forget it", "never mind", "thanks I\'m good", "let\'s come back to this", in any language. Do NOT match if the user is asking what a domain is.',
    confused: 'User is asking what a domain is, how it works, or expressing confusion / uncertainty about the concept. Examples: "what is a domain?", "how does this work?", "I don\'t understand", "explain please", "I\'m confused", "huh?", "what does that mean?", "tell me more first".',
  }, { operation: 'domain_intent' });
}

async function sendDomainExplainer(user) {
  await sendTextMessage(
    user.phone_number,
    "A *custom domain* is your own web address — like *glowstudio.com* instead of the long preview URL we built on. " +
      "Visitors type it into their browser to reach your site, and it makes your brand look way more professional.\n\n" +
      "Would you like one? Reply *yes* to pick one out, or *no* if you'd rather skip it for now."
  );
  await logMessage(user.id, 'Explained what a domain is', 'assistant');
  return STATES.DOMAIN_OFFER;
}

async function handleDomainOffer(user, message) {
  const rawText = (message.text || '').trim();
  const text = rawText.toLowerCase();

  // Anchored fast-path for the obvious one-word answers — instant, no
  // API call. These match the same shapes the regex always handled
  // ("yes", "no", "skip", etc.), so the common case stays free.
  let isYes = /^(yes|yeah|yep|sure|ok|okay|y|domain|set up|set it up)$/i.test(text);
  let isNo = /^(no|nah|nope|later|not now|n|skip|maybe later)$/i.test(text);
  let isConfused = false;

  // Off-keyword reply (e.g. "let's do it please", "I want a domain plz",
  // "haan", "actually I'll pass", "what is this thing?") — fall through
  // to the LLM so the wording variation doesn't leave the user stuck or
  // accidentally search for "haan.com".
  if (!isYes && !isNo && rawText) {
    const intents = await classifyDomainIntent(rawText);
    isYes = intents.wantsDomain;
    isNo = intents.declines;
    isConfused = intents.confused;
  }

  // Confusion takes precedence over yes/no — "yes but what is a domain?"
  // should explain first, not start a search.
  if (isConfused) {
    return sendDomainExplainer(user);
  }

  if (isNo) {
    // No domain — the site is already priced at $199 via the activation
    // link sent on the preview. The old "$100 flat" pitch was a legacy
    // discount pricing that no longer matches anything else in the flow;
    // quoting it here contradicted what the user already saw. Just ack
    // and point them back to their existing activation link.
    let activationUrl = null;
    try {
      const { getLatestPendingPayment } = require('../../db/payments');
      const pending = await getLatestPendingPayment(user.id);
      activationUrl = pending?.stripe_payment_link_url || null;
    } catch (err) {
      logger.warn(`[DOMAIN_OFFER] Pending payment lookup failed: ${err.message}`);
    }
    const tail = activationUrl
      ? `Your activation link is still live:\n\n👉 ${activationUrl}`
      : `Your activation link is in the preview message above.`;
    await sendTextMessage(
      user.phone_number,
      `No worries on the domain — your site will launch on its preview URL. ${tail}\n\nOr tell me if you'd like any changes to the site.`
    );
    await logMessage(user.id, 'User declined domain — pointed back to existing activation link', 'assistant');
    return STATES.WEB_REVISIONS;
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

  // (Confusion is already handled by the classifier branch above — used
  // to be a separate regex check here, now folded into classifyDomainIntent.)

  // Fall-through to search ONLY if the input looks like a plausible single-word
  // domain name (no spaces, alphanumerics + hyphens, reasonable length).
  const noSpaces = !/\s/.test(rawText);
  const cleaned = text.replace(/[^a-z0-9-]/g, '');
  if (noSpaces && cleaned.length >= 2 && cleaned.length <= 30) {
    return runDomainSearch(user, cleaned);
  }

  await sendTextMessage(
    user.phone_number,
    "Would you like to set up a custom domain? Reply *yes* to pick one out, or *no* to skip it."
  );
  return STATES.DOMAIN_OFFER;
}

// ─── DOMAIN_SEARCH ─────────────────────────────────────────────────

// Anchored fast-path for the most common one-word exits — instant, no
// API call. Anything more nuanced ("actually never mind", "thanks I'm
// good", "let's leave it for now", "kar do skip") falls through to
// classifyDomainIntent below.
const FAST_EXIT_RE = /^(skip|nah|nope|cancel|stop|exit|back|menu|bail|never\s*mind|nvm|done)\.?$/i;

async function exitDomainFlow(user) {
  await sendTextMessage(
    user.phone_number,
    "No problem — we'll skip the custom domain for now. Your site is still live on its preview URL, and you can always grab a domain later. Anything else I can help with?"
  );
  await logMessage(user.id, 'User exited domain search', 'assistant');
  return STATES.SALES_CHAT;
}

async function handleDomainSearch(user, message) {
  const text = (message.text || '').trim();

  // Run the structured matchers (option pick by number/ordinal, full
  // domain like "mybrand.com") FIRST — they're the dominant interaction
  // and skipping the classifier on them keeps the common case free.

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

  // No structured match — figure out what the user actually meant.
  // Anchored fast-path catches the obvious one-word exits ("skip",
  // "cancel", "nope") with no API call. Everything else (e.g. "actually
  // never mind", "thanks let me think about it", "what is this thing?",
  // "kar do skip") goes to the classifier so off-keyword phrasings don't
  // become a search for *thanksletmethink.com*.
  let isExit = FAST_EXIT_RE.test(text);
  let isConfused = false;
  if (!isExit && text) {
    const intents = await classifyDomainIntent(text);
    isExit = intents.declines;
    isConfused = intents.confused;
  }

  if (isConfused) return sendDomainExplainer(user);
  if (isExit) return exitDomainFlow(user);

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
    const priceLabel = r.price ? ` — $${r.price}/yr` : '';
    if (r.premium) {
      msg += `${i + 1}. ⚠️ ${r.domain} — Premium${priceLabel} (not available)\n`;
    } else if (r.available) {
      msg += `${i + 1}. ✅ ${r.domain} — *Available*${priceLabel}\n`;
    } else {
      msg += `${i + 1}. ❌ ${r.domain} — Taken\n`;
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

  // Look up this domain's actual registration cost from the search results.
  const domainOptions = user.metadata?.domainOptions || [];
  const match = domainOptions.find(d => d.domain.toLowerCase() === domain.toLowerCase());
  const rawDomainCost = match?.price ? parseFloat(match.price) : 0;
  const domainCharge = Math.ceil(rawDomainCost);
  const siteCost = await getNumberSetting('website_price', SITE_COST_DEFAULT);
  const fullAmount = siteCost + domainCharge;
  const tld = domain.split('.').pop();

  const totalLine = domainCharge > 0
    ? `The total is *$${fullAmount}* — $${siteCost} for the website plus $${domainCharge} for the *.${tld}* domain registration.`
    : `The total is *$${fullAmount}* for the website (domain registration billed separately once confirmed).`;

  // No split payments — the activation price is low enough that splitting
  // adds friction instead of value. Customers who push back get the 22h
  // discount instead (handled by the follow-up scheduler).
  await sendTextMessage(
    user.phone_number,
    `Great choice — *${domain}*!\n\n` +
    `${totalLine}\n\n` +
    `Once you pay, I'll register your domain, set everything up, and your site will be live at *${domain}* — usually within the hour.`
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
