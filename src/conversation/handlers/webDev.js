const {
  sendTextMessage,
  sendInteractiveButtons,
  sendCTAButton,
  sendWithMenuButton,
} = require('../../messages/sender');
const { logMessage, getConversationHistory } = require('../../db/conversations');
const { updateUserMetadata, updateUserState } = require('../../db/users');
const { createSite, updateSite, getLatestSite } = require('../../db/sites');
const { logger } = require('../../utils/logger');
const { generateResponse } = require('../../llm/provider');
const { STATES } = require('../states');
const {
  extractWebsiteFields,
  mergeWebsiteFields,
  extractIndustry,
  extractServices,
} = require('../entityAccumulator');
const { isDelegation, classifyDelegation } = require('../../config/smartDefaults');
const { localize } = require('../../utils/localizer');


// Walk the website-dev checklist and return the first state whose field
// is still missing. Used to fast-forward past steps already covered. Email
// is stored at top-level metadata.email by the legacy handler, so we accept
// either location as "collected".
function nextMissingWebDevState(websiteData, fullMetadata = {}) {
  const { needsAreaCollection, isRealEstate } = require('../../website-gen/templates');
  if (!websiteData.businessName) return STATES.WEB_COLLECT_NAME;
  const emailCollected =
    fullMetadata.email != null || websiteData.contactEmail != null || websiteData.email != null || fullMetadata.emailSkipped === true;
  if (!emailCollected) return STATES.WEB_COLLECT_EMAIL;
  if (!websiteData.industry) return STATES.WEB_COLLECT_INDUSTRY;
  // HVAC + real-estate templates both need a SERVICE AREAS list (neighborhoods
  // served), not just a primary city. "We serve Karachi" leaves the coverage
  // page empty, so we still ask when areas are missing even if the city is
  // already known. A `areasSkipped` flag lets the user opt out explicitly.
  if (
    needsAreaCollection(websiteData.industry) &&
    !websiteData.areasSkipped &&
    (!websiteData.primaryCity || !Array.isArray(websiteData.serviceAreas) || websiteData.serviceAreas.length === 0)
  ) {
    return STATES.WEB_COLLECT_AREAS;
  }
  // Real-estate flow diverges here: collect agent profile (brokerage / years /
  // designations) in place of the services list. The real-estate template has
  // no services section — whyChooseUs + featuredListings carry that load.
  if (isRealEstate(websiteData.industry)) {
    if (!websiteData.agentProfileCollected) return STATES.WEB_COLLECT_AGENT_PROFILE;
    if (!websiteData.listingsFlowDone) {
      // Phase-gated: ASK → DETAILS → PHOTOS. If agent said skip at the ask
      // step we set listingsFlowDone immediately without entering the loop.
      if (!websiteData.listingsAskAnswered) return STATES.WEB_COLLECT_LISTINGS_ASK;
      if (!websiteData.listingsDetailsDone) return STATES.WEB_COLLECT_LISTINGS_DETAILS;
      return STATES.WEB_COLLECT_LISTINGS_PHOTOS;
    }
  } else if (websiteData.services == null) {
    return STATES.WEB_COLLECT_SERVICES;
  }
  // Contact step: require an explicit phone OR email OR an explicit skip
  // signal. Address alone is NOT enough — a location pin dropped mid-flow
  // (Phase 14) auto-seeds contactAddress, which would otherwise sneak past
  // the contact ask entirely. Users expect to be asked for phone/email
  // regardless of whether their address was already captured.
  const hasPrimaryContact = !!websiteData.contactPhone || !!websiteData.contactEmail;
  const contactStepDone = hasPrimaryContact || fullMetadata.contactSkipped === true;
  if (!contactStepDone) return STATES.WEB_COLLECT_CONTACT;
  // Optional logo collection — skipped if the user already sent one or
  // explicitly opted out (logoSkipped=true). Flagged via metadata not
  // websiteData so stale sessions don't loop back.
  if (!websiteData.logoUrl && !websiteData.logoSkipped) return STATES.WEB_COLLECT_LOGO;
  return STATES.WEB_CONFIRM;
}

// Compose a friendly "got it" line listing what we just captured, then
// transition to the next missing state by sending its question. Returns
// the new state. Caller does NOT need to send any follow-up message.
async function smartAdvance(user, message, ackPrefix = null) {
  const text = (message && message.text) || '';
  const known = user.metadata?.websiteData || {};

  // Try to extract additional fields from the user's message.
  let extracted = {};
  try {
    extracted = await extractWebsiteFields(text, known, user);
  } catch (err) {
    logger.warn(`[WEBDEV-EXTRACT] threw: ${err.message}`);
  }

  // Merge new fields into metadata (only ones not already filled).
  const { merged, captured } = mergeWebsiteFields(known, extracted);

  if (captured.length > 0) {
    const update = { websiteData: merged };
    // Mirror extracted contactEmail into the legacy top-level metadata.email
    // field so the rest of the codebase (which checks user.metadata.email)
    // sees it too.
    if (captured.includes('contactEmail') && merged.contactEmail) {
      update.email = merged.contactEmail;
    }
    await updateUserMetadata(user.id, update);
    if (update.email) user.metadata = { ...(user.metadata || {}), email: update.email };
    user.metadata = { ...(user.metadata || {}), websiteData: merged };
    await logMessage(user.id, `Auto-extracted: ${captured.join(', ')}`, 'assistant');
  }

  const nextState = nextMissingWebDevState(merged, user.metadata || {});

  // All required fields filled? Send the confirmation summary.
  if (nextState === STATES.WEB_CONFIRM) {
    return await sendConfirmation(user, merged);
  }

  // Build a natural acknowledgment listing what we just captured.
  const ackParts = [];
  if (captured.includes('businessName')) ackParts.push(`*${merged.businessName}*`);
  if (captured.includes('industry')) ackParts.push(`*${merged.industry}*`);
  if (captured.includes('primaryCity')) ackParts.push(`based in *${merged.primaryCity}*`);
  if (captured.includes('serviceAreas')) ackParts.push(`serving *${merged.serviceAreas.slice(0, 3).join(', ')}${merged.serviceAreas.length > 3 ? '…' : ''}*`);
  if (captured.includes('services')) ackParts.push(`offering *${merged.services.slice(0, 3).join(', ')}${merged.services.length > 3 ? '…' : ''}*`);
  if (captured.includes('contactEmail')) ackParts.push(`email *${merged.contactEmail}*`);
  if (captured.includes('contactPhone')) ackParts.push(`phone *${merged.contactPhone}*`);
  if (captured.includes('contactAddress')) ackParts.push(`address noted`);

  let ack = ackPrefix || '';
  if (ackParts.length > 0) {
    ack = ack ? `${ack} Also got: ${ackParts.join(', ')}.` : `Got it — ${ackParts.join(', ')}.`;
  }
  ack = ack.trim();

  const nextQuestion = questionForState(nextState, merged);
  const fullMsg = ack ? `${ack}\n\n${nextQuestion}` : nextQuestion;

  // Localize to the user's language if they're chatting in something
  // other than English. Hardcoded questions like "What's your business
  // name?" get translated to Urdu / Spanish / Arabic / etc. to match.
  const userReply = (message && message.text) || '';
  const localized = await localize(fullMsg, user, userReply);

  await sendTextMessage(user.phone_number, localized);
  return nextState;
}

function questionForState(state, websiteData) {
  switch (state) {
    case STATES.WEB_COLLECT_NAME: return "What's your business name?";
    case STATES.WEB_COLLECT_EMAIL: return "Before we continue, what's your email address? We'll use it to send you updates about your website. No worries if you'd rather skip it.";
    case STATES.WEB_COLLECT_INDUSTRY: return 'What industry are you in? For example - tech, healthcare, restaurant, real estate, creative, etc.';
    case STATES.WEB_COLLECT_AREAS: {
      // If we already know the primary city, only ask for the neighborhoods
      // so we don't double-ask. Otherwise ask for both in one question.
      if (websiteData?.primaryCity) {
        return `Which areas / neighborhoods do you serve around *${websiteData.primaryCity}*? List them separated by commas. Example: *Clifton, DHA, Gulshan*. Or just skip to use *${websiteData.primaryCity}* as the only area.`;
      }
      // Suppress the "tap 📎" tip if the user already dropped a pin
      // and we couldn't auto-resolve the city — re-suggesting it
      // implies we ignored their first attempt.
      if (websiteData?.pinDropped) {
        return 'Which city are you based in, and which areas do you serve? Example: *Austin: Round Rock, Cedar Park, Pflugerville*.';
      }
      return (
        'Which city are you based in, and which areas do you serve? Example: *Austin: Round Rock, Cedar Park, Pflugerville*.\n\n' +
        '_Tip: tap 📎 → Location to drop a pin and I\'ll pick up the city from it._'
      );
    }
    case STATES.WEB_COLLECT_SERVICES: {
      const { isHvac, resolveTrade } = require('../../website-gen/templates');
      if (isHvac(websiteData.industry)) {
        const trade = resolveTrade(websiteData.industry);
        // Trade-specific prompt with example defaults — keep the example
        // lists in sync with the DEFAULT_SERVICES arrays in
        // templates/hvac/common.js so the user's mental model of what
        // they're about to get matches what actually seeds the site.
        const TRADE_PROMPT = {
          hvac: "Which HVAC services do you offer? List them separated by commas — or just skip to use our default list (AC repair, heating, heat pumps, duct cleaning, thermostats, and more).",
          plumbing: "Which plumbing services do you offer? List them separated by commas — or just skip to use our default list (leak repair, drain cleaning, water heater install, pipe repair, sewer services, and more).",
          electrical: "Which electrical services do you offer? List them separated by commas — or just skip to use our default list (panel upgrades, wiring, outlet install, EV chargers, lighting, generators, and more).",
          roofing: "Which roofing services do you offer? List them separated by commas — or just skip to use our default list (roof repair, full replacement, storm damage, shingles, gutters, inspections, and more).",
          appliance: "Which appliances do you repair? List them separated by commas — or just skip to use our default list (fridge, washer, dryer, dishwasher, oven, microwave, garbage disposal, and more).",
          'garage-door': "Which garage door services do you offer? List them separated by commas — or just skip to use our default list (spring replacement, opener repair, new install, off-track fix, smart openers, and more).",
          locksmith: "Which locksmith services do you offer? List them separated by commas — or just skip to use our default list (lockouts, rekeying, lock install, key cutting, car keys, safe opening, and more).",
          'pest-control': "Which pests do you handle? List them separated by commas — or just skip to use our default list (general pest control, termites, rodents, bed bugs, mosquitoes, bees, and more).",
          'water-damage': "Which restoration services do you offer? List them separated by commas — or just skip to use our default list (water extraction, structural drying, mold remediation, flood cleanup, sewage cleanup, and more).",
          'tree-service': "Which tree services do you offer? List them separated by commas — or just skip to use our default list (tree removal, trimming, pruning, stump grinding, storm cleanup, arborist assessments, and more).",
        };
        return TRADE_PROMPT[trade] || TRADE_PROMPT.hvac;
      }
      return "What services or products do you offer? List them separated by commas, or just skip this one.";
    }
    case STATES.WEB_COLLECT_AGENT_PROFILE:
      return (
        'Quick agent profile so the site feels authentic:\n' +
        '• Your brokerage (just tell me *solo* if independent)\n' +
        '• Years in real estate\n' +
        '• Designations (CRS, ABR, SRS, GRI, etc. — or *none*)\n\n' +
        'Answer all three in one message, or skip to use sensible defaults.'
      );
    case STATES.WEB_COLLECT_LISTINGS_ASK:
      return (
        "Any current listings you'd like to showcase? I can feature up to 3 on the homepage.\n\n" +
        '• Yes — send them now (natural language is fine, e.g. *"45 Elm St, $525k, 4 bed 3 bath, 2200 sqft"*)\n' +
        "• Skip — I'll use professional placeholder listings"
      );
    case STATES.WEB_COLLECT_LISTINGS_DETAILS: {
      const got = (websiteData.listings || []).length;
      if (got === 0) {
        return (
          'Great — send me your first listing. Natural language is fine:\n\n' +
          '*"45 Elm St, $525k, 4 bed 3 bath, 2200 sqft, for sale"*\n\n' +
          'Send one per message. Reply *done* whenever you\'re finished (up to 3).'
        );
      }
      return `Got listing ${got}. Send the next one, or reply *done* to move on.`;
    }
    case STATES.WEB_COLLECT_LISTINGS_PHOTOS: {
      const list = websiteData.listings || [];
      const pending = websiteData.pendingPhotoAssign;
      if (pending != null) {
        const options = list.map((l, i) => `*${i + 1}* — ${l.address}`).join('\n');
        return `For this photo, which listing?\n${options}\n*skip* — don\'t use this photo`;
      }
      return (
        "Want to add photos? Forward them one at a time — I'll ask which listing each one belongs to. " +
        "Or reply *skip* and I'll use professional stock photos."
      );
    }
    case STATES.WEB_COLLECT_CONTACT: {
      // If an earlier pin already seeded the address, suggesting
      // another pin is redundant — tell the user what we already
      // have and ask for email / phone specifically.
      if (websiteData?.contactAddress) {
        return (
          `Last thing — already have your address as *${websiteData.contactAddress}*. ` +
          "Anything else for the site — email or phone? Or reply *skip* to go with just the address."
        );
      }
      // Pin was dropped earlier but we couldn't resolve it to a
      // street address. Don't re-suggest dropping another pin —
      // ask them to type an address instead if they want one.
      if (websiteData?.pinDropped) {
        return (
          "Last thing — contact info for the site. Send your email, phone, and/or a written address. " +
          "Or reply *skip* to leave contact details off."
        );
      }
      return (
        "Last thing — what contact info do you want on the site? Send your email, phone, and/or address.\n\n" +
        "_Tip: tap 📎 → Location to drop a pin and I'll use it as the address._"
      );
    }
    default: return '';
  }
}

// Thin forwarder to showConfirmSummary (defined later in this file). Kept as a
// named function so the many existing callers of sendConfirmation don't break.
// All summary rendering lives in showConfirmSummary so the two code paths
// (smartAdvance → confirm vs. contact → confirm vs. salon-loopback → confirm
// vs. salesBot trigger → confirm) never drift out of sync again.
async function sendConfirmation(user /* websiteData unused — showConfirmSummary re-fetches from DB */) {
  return showConfirmSummary(user);
}

// States where "what are my current details?" should re-render the summary.
// Excludes WEB_PREVIEW/WEB_REVISIONS (the user is viewing the live site
// there — we don't want to dump a metadata summary over that) and the
// transitional WEB_GENERATING.
const SUMMARY_REQUEST_STATES = new Set([
  STATES.WEB_COLLECT_NAME,
  STATES.WEB_COLLECT_EMAIL,
  STATES.WEB_COLLECT_INDUSTRY,
  STATES.WEB_COLLECT_AREAS,
  STATES.WEB_COLLECT_SERVICES,
  STATES.WEB_COLLECT_AGENT_PROFILE,
  STATES.WEB_COLLECT_LISTINGS_ASK,
  STATES.WEB_COLLECT_LISTINGS_DETAILS,
  STATES.WEB_COLLECT_LISTINGS_PHOTOS,
  STATES.SALON_BOOKING_TOOL,
  STATES.SALON_INSTAGRAM,
  STATES.SALON_HOURS,
  STATES.SALON_SERVICE_DURATIONS,
  STATES.WEB_COLLECT_CONTACT,
  STATES.WEB_CONFIRM,
]);

async function handleWebDev(user, message) {
  // "Show me my current details" intent — fire a summary mid-flow so the
  // user can see what's been collected. Works in any language via the LLM
  // classifier. Non-text messages (buttons, images, listings photos) skip
  // this check entirely.
  const text = (message?.text || '').trim();
  if (
    text &&
    !message.buttonId &&
    !message.listId &&
    message.type === 'text' &&
    SUMMARY_REQUEST_STATES.has(user.state)
  ) {
    const wantsSummary = await classifyShowSummaryIntent(text, user.id);
    if (wantsSummary) {
      await logMessage(user.id, 'User asked to see current details', 'assistant');
      // Only render a peek — never the full confirm-style summary, since
      // that trailing "Reply yes to build" line is misleading when we're
      // still mid-collection.
      await showSummaryPeek(user);
      // After the peek, re-send the question we were asking so the user
      // knows we haven't jumped states and can keep answering.
      const currentQuestion = questionForState(user.state, user.metadata?.websiteData || {});
      if (currentQuestion) {
        await sendTextMessage(user.phone_number, await localize(currentQuestion, user, text));
      }
      return user.state;
    }
  }

  switch (user.state) {
    case STATES.WEB_COLLECT_NAME:
      return handleCollectName(user, message);
    case STATES.WEB_COLLECT_EMAIL:
      return handleCollectEmail(user, message);
    case STATES.WEB_COLLECT_INDUSTRY:
      return handleCollectIndustry(user, message);
    case STATES.WEB_COLLECT_AREAS:
      return handleCollectAreas(user, message);
    case STATES.WEB_COLLECT_SERVICES:
      return handleCollectServices(user, message);
    case STATES.WEB_COLLECT_AGENT_PROFILE:
      return handleCollectAgentProfile(user, message);
    case STATES.WEB_COLLECT_LISTINGS_ASK:
      return handleCollectListingsAsk(user, message);
    case STATES.WEB_COLLECT_LISTINGS_DETAILS:
      return handleCollectListingsDetails(user, message);
    case STATES.WEB_COLLECT_LISTINGS_PHOTOS:
      return handleCollectListingsPhotos(user, message);
    case STATES.WEB_COLLECT_COLORS:
      // Legacy: skip straight to contact if stuck in this old state
      return STATES.WEB_COLLECT_CONTACT;
    case STATES.WEB_COLLECT_LOGO:
      return handleCollectLogo(user, message);
    case STATES.SALON_BOOKING_TOOL:
      return handleSalonBookingTool(user, message);
    case STATES.SALON_INSTAGRAM:
      return handleSalonInstagram(user, message);
    case STATES.SALON_HOURS:
      return handleSalonHours(user, message);
    case STATES.SALON_SERVICE_DURATIONS:
      return handleSalonServiceDurations(user, message);
    case STATES.WEB_COLLECT_CONTACT:
      return handleCollectContact(user, message);
    case STATES.WEB_CONFIRM:
      return handleConfirm(user, message);
    case STATES.WEB_DOMAIN_CHOICE:
      return handleDomainChoice(user, message);
    case STATES.WEB_DOMAIN_OWN_INPUT:
      return handleDomainOwnInput(user, message);
    case STATES.WEB_DOMAIN_SEARCH:
      return handleDomainSearch(user, message);
    case STATES.WEB_GENERATING:
      return handleGenerating(user, message);
    case STATES.WEB_PREVIEW:
    case STATES.WEB_REVISIONS:
      return handleRevisions(user, message);
    default:
      return STATES.WEB_COLLECT_NAME;
  }
}

async function handleCollectName(user, message) {
  const text = (message.text || '').trim();
  if (!text || text.length < 2) {
    await sendTextMessage(user.phone_number, 'Please enter your business name:');
    return STATES.WEB_COLLECT_NAME;
  }

  // Create site record if not yet
  const existingWebsiteData = user.metadata?.websiteData || {};
  if (!user.metadata?.currentSiteId) {
    const site = await createSite(user.id, 'business-starter');
    await updateUserMetadata(user.id, { currentSiteId: site.id });
    user.metadata = { ...(user.metadata || {}), currentSiteId: site.id };
  }

  // For short, simple replies (no commas, no @ sign, no "in/at city" pattern)
  // treat the whole text as the business name. Longer / multi-clause messages
  // get parsed by the extractor (which knows to find businessName + other
  // fields like industry, city, services, contact).
  const isSimple =
    text.length < 50 &&
    !/[,;\n]/.test(text) &&
    !/@/.test(text) &&
    !/\b(in|at|serving|email|phone|located|based)\b/i.test(text);

  if (isSimple) {
    const websiteData = { ...existingWebsiteData, businessName: text };
    await updateUserMetadata(user.id, { websiteData });
    user.metadata = { ...(user.metadata || {}), websiteData };
    await logMessage(user.id, `Business name: ${text}`, 'assistant');
  }

  return smartAdvance(user, message);
}

async function handleCollectEmail(user, message) {
  const text = (message.text || '').trim();
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  const skipWords = /^(skip|no|none|nah|later|n\/a|na|don'?t have|dont have)$/i;

  if (skipWords.test(text)) {
    await updateUserMetadata(user.id, { emailSkipped: true });
    user.metadata = { ...(user.metadata || {}), emailSkipped: true };
    await logMessage(user.id, 'Email skipped', 'assistant');
  } else if (emailMatch) {
    // Mirror into BOTH top-level metadata.email (legacy, used by some code
    // paths) AND websiteData.contactEmail (used by the summary renderer
    // and the site generator). Without this mirror, an email collected at
    // this step never appears in the final site or summary.
    const email = emailMatch[0];
    const websiteData = { ...(user.metadata?.websiteData || {}), contactEmail: email };
    await updateUserMetadata(user.id, { email, websiteData });
    user.metadata = { ...(user.metadata || {}), email, websiteData };
    await logMessage(user.id, `Email collected: ${email}`, 'assistant');
  } else {
    // Not a valid email and not a skip. If the reply looks like it MIGHT
    // carry other fields (multi-field dump, long-ish, commas, newlines), fall
    // through to smartAdvance so the extractor picks them up — it'll re-prompt
    // for email anyway via nextMissingWebDevState. Otherwise the reply is
    // gibberish and we ask again.
    const looksRich = text.length >= 18 || /[,;]/.test(text) || /\n/.test(text);
    if (!looksRich) {
      await sendTextMessage(
        user.phone_number,
        "That doesn't look like an email address. Could you double-check? Or just skip to continue without it."
      );
      return STATES.WEB_COLLECT_EMAIL;
    }
  }

  const ackPrefix = emailMatch
    ? `Got it, saved *${emailMatch[0]}*!`
    : skipWords.test(text)
    ? 'No worries — we can add it later.'
    : null;
  return smartAdvance(user, message, ackPrefix);
}

async function handleCollectIndustry(user, message) {
  const rawInput = message.listId
    ? message.text
    : (message.text || '').trim();

  if (!rawInput) {
    await sendTextMessage(user.phone_number, 'Please select or type your industry:');
    return STATES.WEB_COLLECT_INDUSTRY;
  }

  // List selections are trusted as-is — the user picked a pre-defined option.
  if (message.listId) {
    const websiteData = { ...(user.metadata?.websiteData || {}), industry: rawInput };
    await updateUserMetadata(user.id, { websiteData });
    user.metadata = { ...(user.metadata || {}), websiteData };
    await logMessage(user.id, `Industry: ${rawInput}`, 'assistant');
    return smartAdvance(user, message);
  }

  // Edit-intent fast path: "the name should be X" / "change name to X" —
  // user corrected business name, not an industry reply.
  const nameCorrection = rawInput.match(/(?:name\s*(?:should be|is|to)|change.*name.*to|actually.*called|it'?s\s+called)\s*["']?(.+?)["']?\s*$/i);
  if (nameCorrection) {
    const newName = nameCorrection[1].trim();
    await updateUserMetadata(user.id, {
      websiteData: { ...(user.metadata?.websiteData || {}), businessName: newName },
    });
    await sendTextMessage(user.phone_number, `Updated to *${newName}*! Now, what industry are you in?`);
    return STATES.WEB_COLLECT_INDUSTRY;
  }

  // LLM-first extraction. The extractor fast-paths clean 1-3 word answers
  // through without an LLM call; everything else (prose, delegation,
  // compound phrases) gets normalized to a clean industry label.
  const websiteData = user.metadata?.websiteData || {};
  let industry = null;
  let announcedByFallback = false;

  try {
    const history = await getConversationHistory(user.id, 10);
    const recentConversation = history.map((m) => `${m.role}: ${m.message_text}`).join('\n');
    industry = await extractIndustry(rawInput, {
      businessName: websiteData.businessName,
      recentConversation,
      userId: user.id,
    });
  } catch (err) {
    logger.error('Industry extraction error:', err.message);
  }

  // Extractor returns null when the reply was delegation/nonsense AND the
  // LLM couldn't infer from context. Fall back to a generic so the flow
  // doesn't stall — the user can fix it from the confirmation summary.
  if (!industry) {
    industry = 'General Business';
    await sendTextMessage(
      user.phone_number,
      "No worries, I'll go with a general business setup. You can tell me the industry later from the summary if you want to change it."
    );
    announcedByFallback = true;
  } else if (/^[\w\s&\-']+$/.test(rawInput.trim()) && rawInput.trim().toLowerCase() === industry.toLowerCase()) {
    // User gave a clean answer the extractor just echoed back. No need to
    // announce a "corrected" value.
  } else if (rawInput.trim().toLowerCase() !== industry.toLowerCase()) {
    // Extractor normalized the reply — tell the user what got saved so they
    // can catch it if the normalization was off.
    await sendTextMessage(user.phone_number, `Got it, I'll go with *${industry}*.`);
    announcedByFallback = true;
  }

  const merged = { ...websiteData, industry };
  await updateUserMetadata(user.id, { websiteData: merged });
  user.metadata = { ...(user.metadata || {}), websiteData: merged };
  await logMessage(user.id, `Industry: ${industry}`, 'assistant');

  return smartAdvance(user, message);
}

// ─── HVAC: city + service areas ──────────────────────────────────────────────
async function handleCollectAreas(user, message) {
  const raw = (message.text || '').trim();
  const existingCity = user.metadata?.websiteData?.primaryCity || null;

  if (!raw) {
    await sendTextMessage(
      user.phone_number,
      existingCity
        ? `Please list the areas / neighborhoods around *${existingCity}* that you serve. Comma-separated, or skip.`
        : 'Please tell me your city and service areas. Example: *Austin: Round Rock, Cedar Park*'
    );
    return STATES.WEB_COLLECT_AREAS;
  }

  // Allow skip — treat as "we'll fill in later".
  if (/^(skip|later|unsure|not sure|n\/?a)$/i.test(raw)) {
    const websiteData = {
      ...(user.metadata?.websiteData || {}),
      primaryCity: existingCity,
      serviceAreas: existingCity ? [existingCity] : [],
      areasSkipped: true,
    };
    await updateUserMetadata(user.id, { websiteData });
    user.metadata = { ...(user.metadata || {}), websiteData };
    return smartAdvance(user, message, 'No problem, we can add more areas later.');
  }

  let primaryCity;
  let serviceAreas;

  if (existingCity) {
    // City already known from sales-chat hydration. Treat the user's reply
    // as a plain list of neighborhoods. Preserve the existing city.
    primaryCity = existingCity;
    // Strip conversational lead-ins so "we serve in X and Y" → ["X", "Y"]
    // instead of ["we serve in X", "Y"]. Covers the common English +
    // Roman Urdu prefixes users actually type here.
    const stripAreaPrefix = (s) =>
      s
        .replace(/^[—\-–:|]+/, '')
        .replace(/^\s*(?:(?:we\s+(?:serve|cover|operate|work|are|'re))(?:\s+(?:in|across|around|throughout))?|serving(?:\s+(?:in|across|around))?|cover(?:ing)?(?:\s+(?:in|across))?|based\s+in|operate\s+in|mostly(?:\s+(?:in|around))?|around|in|ham\s+(?:serve|kaam)\s+karte\s+(?:hain|hai))\s+/i, '')
        .replace(/^(?:the|a|an)\s+/i, '')
        .trim();
    serviceAreas = raw
      .split(/[,;\n]|\band\b/i)
      .map((s) => stripAreaPrefix(s.trim()))
      .filter(Boolean);
    if (!serviceAreas.length) serviceAreas = [existingCity];
  } else {
    // No city yet — parse the reply as "City: Area1, Area2, ..." or
    // "City - Area1, Area2" or a bare comma/and-separated list.
    const parts = raw
      .split(/\r?\n+|\s*[—\-–:|]\s+|\s+serving\s+/i)
      .map((p) => p.trim())
      .filter(Boolean);
    primaryCity = (parts[0] || '').replace(/[,.]$/, '');
    const areasStr = parts.slice(1).join(', ').trim();
    serviceAreas = areasStr
      ? areasStr.split(/\s*[,;]\s*|\s+and\s+|\s+&\s+/i).map((s) => s.trim()).filter(Boolean)
      : [];

    // Single value — could be just a city OR a bare "A, B and C" list.
    if (!serviceAreas.length && primaryCity) {
      // Split on commas AND natural " and " / " & " connectors so
      // "Austin, New York and Texas" becomes three tokens, not two.
      const tokens = primaryCity
        .split(/\s*,\s*|\s+and\s+|\s+&\s+/i)
        .map((s) => s.trim())
        .filter(Boolean);
      if (tokens.length > 1) {
        primaryCity = tokens[0];
        // Service areas are the OTHER tokens — don't repeat the primary
        // city inside its own areas list. If the user only named one
        // place, we'll fall through to the single-value branch below.
        serviceAreas = tokens.slice(1);
      } else {
        serviceAreas = [primaryCity];
      }
    }
  }

  // If parsing clearly failed (primaryCity looks like a sentence — too long,
  // too many words, or contains non-English connectives we don't split on
  // like Urdu "aur", Spanish "y", Hindi "aur/या"), ask LLM to extract
  // structured fields. Regex-based splitting can't cover every language.
  const primaryWordCount = primaryCity ? primaryCity.trim().split(/\s+/).length : 0;
  const looksLikeSentence = primaryWordCount >= 3;
  if (!primaryCity || primaryCity.length > 40 || looksLikeSentence) {
    try {
      const extracted = await generateResponse(
        `Extract the primary city and list of service areas from the user's message. The user may write in ANY language (English, Roman Urdu, Urdu, Hindi, Spanish, Arabic, etc.) and use connectors like "and", "aur" (Urdu), "y" (Spanish), "و" (Arabic), etc. Return ONLY JSON: {"primaryCity":"<city>","serviceAreas":["<city or neighborhood>", ...]}. Rules: (1) primaryCity is the single main city they're based in — a short proper noun like "Karachi", NEVER a full phrase like "pakistan k andar karachi". (2) serviceAreas is an array of cities/neighborhoods they serve. If they named multiple cities (e.g. Karachi and Lahore), include all of them; the first becomes primaryCity and the rest go into serviceAreas. (3) Strip filler words like "based in", "pakistan k andar", "in the city of", etc. (4) If genuinely unclear, make a reasonable guess from place-name tokens you recognize.`,
        [{ role: 'user', content: raw }],
        { userId: user.id, operation: 'webdev_areas_extract' }
      );
      const m = extracted.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (parsed.primaryCity) primaryCity = String(parsed.primaryCity).trim();
        if (Array.isArray(parsed.serviceAreas)) serviceAreas = parsed.serviceAreas.map((s) => String(s).trim()).filter(Boolean);
        if (!serviceAreas.length && primaryCity) serviceAreas = [primaryCity];
      }
    } catch (err) {
      logger.warn(`[AREAS] LLM extraction failed: ${err.message}`);
    }
  }

  const websiteData = {
    ...(user.metadata?.websiteData || {}),
    primaryCity: primaryCity || null,
    serviceAreas,
  };
  await updateUserMetadata(user.id, { websiteData });
  user.metadata = { ...(user.metadata || {}), websiteData };
  await logMessage(user.id, `Areas captured: ${primaryCity} / ${serviceAreas.join(', ')}`, 'assistant');

  // De-dupe areas against primaryCity so a single-location reply like
  // "Karachi" doesn't produce an awkward "based in *Karachi* serving
  // *Karachi*" — reads as a bug even though the data is correct. Only
  // mention the "serving X" clause when we have neighborhoods beyond the
  // primary city.
  const cityLower = (primaryCity || '').toLowerCase();
  const extraAreas = (serviceAreas || []).filter((a) => a && a.toLowerCase() !== cityLower);
  const ackPrefix = extraAreas.length
    ? `Got it — based in *${primaryCity}* serving *${extraAreas.slice(0, 4).join(', ')}${extraAreas.length > 4 ? '…' : ''}*.`
    : `Got it — based in *${primaryCity || 'your area'}*.`;
  return smartAdvance(user, message, ackPrefix);
}

// Auto-assign professional color schemes based on industry
const INDUSTRY_COLORS = {
  tech:        { primaryColor: '#1E293B', secondaryColor: '#0F172A', accentColor: '#6366F1' },
  technology:  { primaryColor: '#1E293B', secondaryColor: '#0F172A', accentColor: '#6366F1' },
  software:    { primaryColor: '#1E293B', secondaryColor: '#0F172A', accentColor: '#6366F1' },
  healthcare:  { primaryColor: '#0F4C75', secondaryColor: '#0A2E4D', accentColor: '#38BDF8' },
  medical:     { primaryColor: '#0F4C75', secondaryColor: '#0A2E4D', accentColor: '#38BDF8' },
  health:      { primaryColor: '#0F4C75', secondaryColor: '#0A2E4D', accentColor: '#38BDF8' },
  finance:     { primaryColor: '#1E3A5F', secondaryColor: '#0F2440', accentColor: '#4A90D9' },
  banking:     { primaryColor: '#1E3A5F', secondaryColor: '#0F2440', accentColor: '#4A90D9' },
  // (real_estate / realestate / property entries moved below to the new
  // navy + champagne gold palette that matches the real-estate template.)
  ecommerce:   { primaryColor: '#18181B', secondaryColor: '#09090B', accentColor: '#A78BFA' },
  retail:      { primaryColor: '#18181B', secondaryColor: '#09090B', accentColor: '#A78BFA' },
  food:        { primaryColor: '#1C1917', secondaryColor: '#0C0A09', accentColor: '#D97706' },
  restaurant:  { primaryColor: '#1C1917', secondaryColor: '#0C0A09', accentColor: '#D97706' },
  education:   { primaryColor: '#1E3A5F', secondaryColor: '#0F2440', accentColor: '#60A5FA' },
  creative:    { primaryColor: '#1F2937', secondaryColor: '#111827', accentColor: '#8B5CF6' },
  design:      { primaryColor: '#1F2937', secondaryColor: '#111827', accentColor: '#8B5CF6' },
  legal:       { primaryColor: '#1C2833', secondaryColor: '#0D1B2A', accentColor: '#7F8C8D' },
  law:         { primaryColor: '#1C2833', secondaryColor: '#0D1B2A', accentColor: '#7F8C8D' },
  construction:{ primaryColor: '#2C3E50', secondaryColor: '#1A252F', accentColor: '#E67E22' },
  fitness:     { primaryColor: '#18181B', secondaryColor: '#09090B', accentColor: '#EF4444' },
  beauty:      { primaryColor: '#1F2937', secondaryColor: '#111827', accentColor: '#EC4899' },
  salon:       { primaryColor: '#1F2937', secondaryColor: '#111827', accentColor: '#EC4899' },
  automotive:  { primaryColor: '#1E293B', secondaryColor: '#0F172A', accentColor: '#DC2626' },
  travel:      { primaryColor: '#0F4C75', secondaryColor: '#0A2E4D', accentColor: '#06B6D4' },
  // HVAC: trust blue dominant + orange CTA accent. Emergency red is hard-coded
  // inside the HVAC template itself (reserved for the emergency strip only).
  hvac:        { primaryColor: '#1E3A5F', secondaryColor: '#0F172A', accentColor: '#F97316' },
  heating:     { primaryColor: '#1E3A5F', secondaryColor: '#0F172A', accentColor: '#F97316' },
  cooling:     { primaryColor: '#1E3A5F', secondaryColor: '#0F172A', accentColor: '#F97316' },
  // Real estate: deep navy + champagne gold (luxury / editorial feel).
  real_estate: { primaryColor: '#1A2B45', secondaryColor: '#0F1B30', accentColor: '#C9A96E' },
  realestate:  { primaryColor: '#1A2B45', secondaryColor: '#0F1B30', accentColor: '#C9A96E' },
  realtor:     { primaryColor: '#1A2B45', secondaryColor: '#0F1B30', accentColor: '#C9A96E' },
  realty:      { primaryColor: '#1A2B45', secondaryColor: '#0F1B30', accentColor: '#C9A96E' },
  broker:      { primaryColor: '#1A2B45', secondaryColor: '#0F1B30', accentColor: '#C9A96E' },
  property:    { primaryColor: '#1A2B45', secondaryColor: '#0F1B30', accentColor: '#C9A96E' },
};
const DEFAULT_COLORS = { primaryColor: '#1E293B', secondaryColor: '#0F172A', accentColor: '#6366F1' };

// Researched template palettes. When a template claims an industry (HVAC
// claims plumbing + heating + cooling, Real Estate claims realty/broker
// terms, Salon claims barber/spa/nail/etc.), we short-circuit the
// keyword lookup and return the template's researched palette directly.
// That way "Plumbing services" — which has no `plumbing` entry in the
// old INDUSTRY_COLORS table — still lands on HVAC navy + orange instead
// of the generic indigo default.
const HVAC_PALETTE = { primaryColor: '#1E3A5F', secondaryColor: '#0F172A', accentColor: '#F97316' };
const REAL_ESTATE_PALETTE = { primaryColor: '#1A2B45', secondaryColor: '#0F1B30', accentColor: '#C9A96E' };
const SALON_PALETTE = { primaryColor: '#1F2937', secondaryColor: '#111827', accentColor: '#EC4899' };

function getColorsForIndustry(industry) {
  // Template-matched industries take precedence — they share a template
  // and must share the template's researched palette (plumbing + HVAC
  // use the same nav/CTA chrome, so they must use the same colours).
  const { isHvac, isRealEstate } = require('../../website-gen/templates');
  if (isHvac(industry)) return HVAC_PALETTE;
  if (isRealEstate(industry)) return REAL_ESTATE_PALETTE;
  if (isSalonIndustry(industry)) return SALON_PALETTE;

  // Non-templated industries — keyword lookup, then partial match, then
  // the generic default palette.
  const key = (industry || '').toLowerCase().replace(/[\s\-_\/]+/g, '_').trim();
  if (INDUSTRY_COLORS[key]) return INDUSTRY_COLORS[key];
  const match = Object.keys(INDUSTRY_COLORS).find(k => key.includes(k) || k.includes(key));
  return match ? INDUSTRY_COLORS[match] : DEFAULT_COLORS;
}

// Named-color lookup for the revision follow-up flow. Each named color
// maps to a full three-color palette — primary (dominant hue), secondary
// (deeper companion for footers / dark sections), and accent (brighter
// counterpoint for CTAs / highlights). Palettes are designer-picked so
// a user who just says "blue" gets a coherent site, not a primary-only
// swap that clashes with the leftover accent from the previous palette.
//
// heroTextOverride: 'dark' is set on very light palettes so hero text
// (white by default) flips to near-black for readability.
const NAMED_COLOR_PALETTES = {
  blue:         { primary: '#1E3A8A', secondary: '#0F172A', accent: '#3B82F6' },
  navy:         { primary: '#0F172A', secondary: '#020617', accent: '#38BDF8' },
  'royal blue': { primary: '#1E40AF', secondary: '#1E3A8A', accent: '#60A5FA' },
  'dark blue':  { primary: '#1E3A8A', secondary: '#172554', accent: '#60A5FA' },
  'sky blue':   { primary: '#0EA5E9', secondary: '#0369A1', accent: '#7DD3FC' },
  teal:         { primary: '#0F766E', secondary: '#134E4A', accent: '#2DD4BF' },
  cyan:         { primary: '#0891B2', secondary: '#164E63', accent: '#67E8F9' },
  turquoise:    { primary: '#14B8A6', secondary: '#0F766E', accent: '#99F6E4' },
  green:        { primary: '#059669', secondary: '#064E3B', accent: '#10B981' },
  'forest green': { primary: '#064E3B', secondary: '#022C22', accent: '#34D399' },
  'dark green': { primary: '#14532D', secondary: '#052E16', accent: '#22C55E' },
  olive:        { primary: '#4D7C0F', secondary: '#365314', accent: '#84CC16' },
  emerald:      { primary: '#059669', secondary: '#064E3B', accent: '#6EE7B7' },
  red:          { primary: '#B91C1C', secondary: '#7F1D1D', accent: '#EF4444' },
  crimson:      { primary: '#991B1B', secondary: '#450A0A', accent: '#DC2626' },
  maroon:       { primary: '#7F1D1D', secondary: '#450A0A', accent: '#DC2626' },
  burgundy:     { primary: '#7F1D1D', secondary: '#450A0A', accent: '#B91C1C' },
  purple:       { primary: '#6D28D9', secondary: '#4C1D95', accent: '#A78BFA' },
  violet:       { primary: '#5B21B6', secondary: '#3B0764', accent: '#8B5CF6' },
  indigo:       { primary: '#4338CA', secondary: '#312E81', accent: '#818CF8' },
  pink:         { primary: '#DB2777', secondary: '#831843', accent: '#F472B6' },
  'hot pink':   { primary: '#DB2777', secondary: '#9D174D', accent: '#EC4899' },
  magenta:      { primary: '#C026D3', secondary: '#86198F', accent: '#E879F9' },
  orange:       { primary: '#C2410C', secondary: '#7C2D12', accent: '#FB923C' },
  amber:        { primary: '#D97706', secondary: '#92400E', accent: '#FBBF24' },
  yellow:       { primary: '#CA8A04', secondary: '#854D0E', accent: '#FACC15' },
  gold:         { primary: '#A16207', secondary: '#713F12', accent: '#EAB308' },
  brown:        { primary: '#78350F', secondary: '#451A03', accent: '#F97316' },
  black:        { primary: '#0F172A', secondary: '#020617', accent: '#64748B' },
  charcoal:     { primary: '#1F2937', secondary: '#111827', accent: '#6B7280' },
  gray:         { primary: '#4B5563', secondary: '#1F2937', accent: '#9CA3AF' },
  grey:         { primary: '#4B5563', secondary: '#1F2937', accent: '#9CA3AF' },
  white:        { primary: '#F8FAFC', secondary: '#E2E8F0', accent: '#64748B', heroTextOverride: 'dark' },
  mint:         { primary: '#A7F3D0', secondary: '#6EE7B7', accent: '#059669', heroTextOverride: 'dark' },
  pastel:       { primary: '#FBCFE8', secondary: '#F472B6', accent: '#831843', heroTextOverride: 'dark' },
};

// Derive a reasonable palette from a raw hex. Darken for secondary
// (multiply RGB by 0.55), lighten for accent (mix 60% of original with
// 40% white). Good enough to avoid a clashing leftover accent when the
// user gives us something arbitrary.
function derivePaletteFromHex(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const darken = (v) => Math.max(0, Math.round(v * 0.55));
  const lighten = (v) => Math.min(255, Math.round(v * 0.6 + 255 * 0.4));
  const toHex = (r2, g2, b2) =>
    '#' + [r2, g2, b2].map((n) => n.toString(16).padStart(2, '0').toUpperCase()).join('');
  // Luminance proxy so we can hint hero text flip for light primaries
  // (the revision parser uses 0.55 as the pastel threshold; mirroring it).
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return {
    primary: toHex(r, g, b),
    secondary: toHex(darken(r), darken(g), darken(b)),
    accent: toHex(lighten(r), lighten(g), lighten(b)),
    ...(lum > 0.55 ? { heroTextOverride: 'dark' } : {}),
  };
}

// Resolve a short user color reply ("blue", "navy", "#1e40af", "forest
// green") into a full three-color palette. Returns null if nothing
// recognized so the caller can fall back to LLM parsing.
function resolveColorReply(text) {
  const clean = String(text || '').trim().toLowerCase();
  if (!clean) return null;
  // Direct hex (with or without leading #) → derived palette.
  const hexMatch = clean.match(/^#?([0-9a-f]{6})\b/i);
  if (hexMatch) return derivePaletteFromHex(`#${hexMatch[1].toUpperCase()}`);
  // Exact named match.
  if (NAMED_COLOR_PALETTES[clean]) return NAMED_COLOR_PALETTES[clean];
  // Longest-matching phrase wins ("dark green" beats "green").
  const sortedNames = Object.keys(NAMED_COLOR_PALETTES).sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    const pattern = new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (pattern.test(clean)) return NAMED_COLOR_PALETTES[name];
  }
  return null;
}

// A "salon-like" business gets the dedicated salon template with its booking flow.
function isSalonIndustry(industry) {
  if (!industry) return false;
  // Allow "Barbershop" / "Hairstylist" / "Nailstudio" as one-word forms — the
  // \b at the end of the keyword would otherwise require a non-word char
  // after it, which single-word compounds don't provide.
  return /\b(salon|beauty|barber|spa|nail|hair|lash|brow|makeup)/i.test(industry);
}

// Turn "Bytes Salon" into a reasonable example domain like "bytessalon.com"
// for use in the domain-offer message. Falls back to "yourbusiness.com" if the
// business name yields nothing usable (all symbols, empty, etc.).
function domainExampleFor(businessName) {
  const slug = String(businessName || '')
    .normalize('NFD')            // Separate accents from letters...
    .replace(/[\u0300-\u036f]/g, '')  // ...then drop the combining marks so "Café" → "Cafe".
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '');
  if (!slug || slug.length < 2) return 'yourbusiness.com';
  return `${slug}.com`;
}

// Turn "Fresh Cuts" into "@freshcuts" for the Instagram-handle prompt example.
// Uses the same slugification as domainExampleFor so the two stay consistent.
// Falls back to "@yourhandle" when the name doesn't yield a usable slug.
function instagramHandleExampleFor(businessName) {
  const slug = String(businessName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '');
  if (!slug || slug.length < 2) return '@yourhandle';
  // Instagram caps at 30 characters for usernames.
  return `@${slug.slice(0, 30)}`;
}

async function handleCollectServices(user, message) {
  const servicesText = (message.text || '').trim();
  if (!servicesText || servicesText.length < 2) {
    await sendTextMessage(
      user.phone_number,
      'Please list your services/products separated by commas, or skip if you don\'t have specific ones:'
    );
    return STATES.WEB_COLLECT_SERVICES;
  }

  const wd = user.metadata?.websiteData || {};
  const industry = wd.industry || '';
  const colors = getColorsForIndustry(industry);

  // LLM-first extraction. The extractor fast-paths clean comma lists through
  // without an LLM call, normalizes prose like "we just rent trucks" →
  // ["Truck rental"], and returns an empty array for delegation / skip
  // phrases. Falls back to a direct comma split if the LLM call fails so
  // we never silently lose the user's answer.
  let services = null;
  try {
    services = await extractServices(servicesText, {
      businessName: wd.businessName,
      industry,
      userId: user.id,
    });
  } catch (err) {
    logger.warn(`[WEBDEV] extractServices threw: ${err.message}`);
  }
  if (services === null) {
    services = servicesText
      .split(/\s*,\s*|\s+(?:and|&)\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const skipped = services.length === 0;
  const websiteData = { ...wd, services, ...colors };
  await updateUserMetadata(user.id, { websiteData });
  user.metadata = { ...(user.metadata || {}), websiteData };
  await logMessage(
    user.id,
    `Services: ${skipped ? 'skipped' : services.join(', ')} | Colors auto-assigned for ${industry}`,
    'assistant'
  );

  if (isSalonIndustry(industry)) return startSalonFlow(user);

  const ack = skipped
    ? "No worries, we'll use a sensible default."
    : `Got it — *${services.slice(0, 4).join(', ')}${services.length > 4 ? '…' : ''}*.`;
  return smartAdvance(user, message, ack);
}

// ═══════════════════════════════════════════════════════════════════════════
// REAL-ESTATE AGENT PROFILE COLLECTION
// Asks brokerage + years + designations in one message, extracts via LLM.
// Sets agentProfileCollected=true so nextMissingWebDevState advances even if
// some fields are empty (user said "skip" or only partially answered).
// ═══════════════════════════════════════════════════════════════════════════
async function handleCollectAgentProfile(user, message) {
  const raw = (message.text || '').trim();
  const wd = { ...(user.metadata?.websiteData || {}) };
  const industry = wd.industry || '';
  const colors = getColorsForIndustry(industry);

  // Fast regex + LLM fallback covers both the short "skip / idk" phrasings
  // and natural prose like "i have no idea about this" / "just use whatever
  // sounds right" that the regex can't enumerate.
  const agentQuestion = 'What is your brokerage, years in real estate, and any designations (CRS, ABR, etc.)?';
  if (await classifyDelegation(raw, agentQuestion)) {
    const merged = {
      ...wd,
      ...colors,
      agentProfileCollected: true,
      // Mark services as skipped so the generator doesn't loop asking for them.
      services: Array.isArray(wd.services) ? wd.services : [],
    };
    await updateUserMetadata(user.id, { websiteData: merged });
    user.metadata = { ...(user.metadata || {}), websiteData: merged };
    await logMessage(user.id, 'Agent profile: skipped (using defaults)', 'assistant');
    return smartAdvance(user, message, "No problem, we'll go with solo / no designations. You can add details from the summary later.");
  }

  // Regex pre-pass for years (common patterns: "10 years", "10+ years", "a decade").
  let yearsExperience = null;
  const yrsMatch = raw.match(/(\d{1,2})\s*\+?\s*(?:years?|yrs?|y\b)/i);
  if (yrsMatch) {
    const n = parseInt(yrsMatch[1], 10);
    if (n > 0 && n < 80) yearsExperience = n;
  } else if (/\bdecade\b/i.test(raw)) {
    yearsExperience = 10;
  }

  // Regex pre-pass for well-known designation tokens.
  const DESIGNATION_RX = /\b(CRS|ABR|SRS|GRI|SRES|RENE|e-?Pro|CIPS|SFR|MRP|ABRM|CCIM|AHWD|CPM|CRB)\b/gi;
  let designations = [];
  const designMatches = raw.match(DESIGNATION_RX);
  if (designMatches) {
    designations = Array.from(new Set(designMatches.map((d) => d.toUpperCase().replace('-', ''))));
  } else if (/\b(no|none)\s+(?:designations?|creds?|certifications?)?\b/i.test(raw) || /^none\b/i.test(raw)) {
    designations = [];
  }

  // Brokerage: solo vs named. Look for "solo", "independent", "by myself", or a
  // quoted/clear name. Fallback: LLM extraction.
  let brokerageName = null;
  if (/\b(solo|independent|by myself|on my own|no brokerage|freelance|self[- ]employed)\b/i.test(raw)) {
    brokerageName = null; // explicit solo — keep null
  }

  // LLM extraction for anything missing (especially brokerageName which is hard
  // to pattern-match reliably).
  const needsLlm = brokerageName === null && !/\b(solo|independent)\b/i.test(raw);
  if (needsLlm || yearsExperience == null || (!designations.length && !/\bnone\b/i.test(raw))) {
    try {
      const extractPrompt = `You are a structured-data extractor for a real-estate agent onboarding flow. Read the agent's message and return ONLY JSON with these fields:

{
  "brokerageName": "<the brokerage/firm name they work at, or null if they said solo/independent, or null if not mentioned>",
  "yearsExperience": <integer if clearly stated, otherwise null>,
  "designations": ["CRS", "ABR", ...] (common ones: CRS, ABR, SRS, GRI, SRES, RENE, ePro, CIPS, SFR, MRP, ABRM, CCIM). Return [] if they said none. Omit the field if not mentioned at all.
}

Rules:
- brokerageName: real firm names only. "solo", "independent", "by myself" → null.
- Never invent data. Omit unknown fields.
- Keep brokerageName under 60 chars.`;
      const response = await generateResponse(
        extractPrompt,
        [{ role: 'user', content: raw }],
        { userId: user.id, operation: 'webdev_agent_profile' }
      );
      const m = response.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (parsed.brokerageName && typeof parsed.brokerageName === 'string') {
          const bn = parsed.brokerageName.trim();
          if (bn && bn.length < 60 && !/^(solo|independent|null|none)$/i.test(bn)) {
            brokerageName = bn;
          }
        }
        if (yearsExperience == null && Number.isInteger(parsed.yearsExperience) && parsed.yearsExperience > 0 && parsed.yearsExperience < 80) {
          yearsExperience = parsed.yearsExperience;
        }
        if (!designations.length && Array.isArray(parsed.designations)) {
          designations = parsed.designations
            .map((d) => String(d || '').trim().toUpperCase().replace(/[^A-Z]/g, ''))
            .filter((d) => d.length >= 2 && d.length <= 8);
        }
      }
    } catch (err) {
      logger.warn(`[WEBDEV-AGENT] LLM extraction failed: ${err.message}`);
    }
  }

  const merged = {
    ...wd,
    ...colors,
    agentProfileCollected: true,
    services: Array.isArray(wd.services) ? wd.services : [],
  };
  if (brokerageName) merged.brokerageName = brokerageName;
  if (yearsExperience != null) merged.yearsExperience = yearsExperience;
  if (designations.length) merged.designations = designations;

  await updateUserMetadata(user.id, { websiteData: merged });
  user.metadata = { ...(user.metadata || {}), websiteData: merged };
  await logMessage(
    user.id,
    `Agent profile: brokerage=${brokerageName || 'solo'}, years=${yearsExperience || 'n/a'}, designations=${designations.join(', ') || 'none'}`,
    'assistant'
  );

  const ackBits = [];
  if (brokerageName) ackBits.push(`at *${brokerageName}*`);
  else if (/\b(solo|independent)\b/i.test(raw)) ackBits.push('*solo agent*');
  if (yearsExperience != null) ackBits.push(`*${yearsExperience} years* in real estate`);
  if (designations.length) ackBits.push(`designations: *${designations.join(', ')}*`);
  const ackPrefix = ackBits.length ? `Got it — ${ackBits.join(', ')}.` : 'Thanks for the details.';

  return smartAdvance(user, message, ackPrefix);
}

// ═══════════════════════════════════════════════════════════════════════════
// REAL-ESTATE LISTINGS COLLECTION (optional, 3-phase: ASK → DETAILS → PHOTOS)
// If agent skips at any point we mark listingsFlowDone=true and the
// generator falls back to LLM-hallucinated defaults + Unsplash.
// ═══════════════════════════════════════════════════════════════════════════

const MAX_LISTINGS = 3;

/**
 * Parse a free-text listing description into structured fields. Regex pulls
 * the obvious numerics fast (price / beds / baths / sqft) and LLM fills in
 * address + status + anything missing. Returns {} if nothing usable.
 */
// Currency code → display symbol. Falls through to the ISO code itself
// (e.g. "AED") when we don't have a specific symbol.
const CURRENCY_SYMBOLS = {
  USD: '$', CAD: 'CA$', AUD: 'A$',
  GBP: '£', EUR: '€',
  PKR: 'Rs', INR: '₹', BDT: '৳', LKR: 'Rs',
  AED: 'AED', SAR: 'SAR', QAR: 'QAR', KWD: 'KWD', OMR: 'OMR', BHD: 'BHD',
};

// Well-known city → currency lookup. Only cities where the correct currency
// is unambiguous and the city name is unlikely to clash. Expand as needed.
const CITY_TO_CURRENCY = {
  karachi: 'PKR', lahore: 'PKR', islamabad: 'PKR', rawalpindi: 'PKR',
  faisalabad: 'PKR', peshawar: 'PKR', quetta: 'PKR', multan: 'PKR', hyderabad: 'PKR',
  delhi: 'INR', mumbai: 'INR', bangalore: 'INR', bengaluru: 'INR', kolkata: 'INR',
  chennai: 'INR', pune: 'INR', ahmedabad: 'INR', jaipur: 'INR',
  london: 'GBP', manchester: 'GBP', birmingham: 'GBP', glasgow: 'GBP', edinburgh: 'GBP',
  paris: 'EUR', madrid: 'EUR', barcelona: 'EUR', berlin: 'EUR', munich: 'EUR',
  rome: 'EUR', milan: 'EUR', amsterdam: 'EUR', dublin: 'EUR', lisbon: 'EUR',
  dubai: 'AED', 'abu dhabi': 'AED', sharjah: 'AED',
  riyadh: 'SAR', jeddah: 'SAR', mecca: 'SAR',
  doha: 'QAR', toronto: 'CAD', vancouver: 'CAD', montreal: 'CAD',
  sydney: 'AUD', melbourne: 'AUD', brisbane: 'AUD', perth: 'AUD',
  dhaka: 'BDT', colombo: 'LKR',
};

function detectCurrency(text, primaryCity) {
  const t = String(text || '').toLowerCase();
  // Explicit currency markers in the message win.
  if (/\bpkr\b|\brs\.?\b|\brupees?\b|₨/i.test(t) && !/indian\s+rupee/i.test(t)) return 'PKR';
  if (/\binr\b|indian\s+rupees?|₹/i.test(t)) return 'INR';
  if (/\bgbp\b|\bpounds?\b|£/i.test(t)) return 'GBP';
  if (/\beur\b|\beuros?\b|€/i.test(t)) return 'EUR';
  if (/\baed\b|\bdirhams?\b/i.test(t)) return 'AED';
  if (/\bsar\b|\briyals?\b/i.test(t)) return 'SAR';
  if (/\bcad\b/i.test(t)) return 'CAD';
  if (/\baud\b/i.test(t)) return 'AUD';
  if (/\busd\b|\bdollars?\b|\$/i.test(t)) return 'USD';
  // Fall back to inferred currency from the user's primary city.
  if (primaryCity) {
    const code = CITY_TO_CURRENCY[String(primaryCity).trim().toLowerCase()];
    if (code) return code;
  }
  return 'USD';
}

// Plausible price ranges per currency. Rentals can land at the bottom of
// the range and full sales at the top. Widened relative to the old
// USD-only bounds so PKR rent (~100k) and INR rent (~10k) aren't rejected.
function priceRangeFor(currency) {
  switch ((currency || 'USD').toUpperCase()) {
    case 'PKR': return { min: 20000, max: 2_000_000_000 };
    case 'INR': return { min: 5000, max: 500_000_000 };
    case 'BDT': return { min: 5000, max: 500_000_000 };
    case 'LKR': return { min: 10000, max: 500_000_000 };
    case 'AED': return { min: 500, max: 100_000_000 };
    case 'SAR': case 'QAR': return { min: 500, max: 100_000_000 };
    case 'GBP': case 'EUR': case 'USD': case 'CAD': case 'AUD':
    default:
      return { min: 300, max: 50_000_000 };
  }
}

// Format a price with the right currency symbol, falling back to the code.
function formatPrice(price, currency) {
  if (!price && price !== 0) return 'price on request';
  const code = (currency || 'USD').toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code];
  const formatted = Number(price).toLocaleString();
  if (!symbol) return `${code} ${formatted}`;
  // Letter-prefix symbols (Rs, AED, SAR, ...) read better with a space;
  // sign symbols ($, £, €, ₹) are flush.
  return /^[A-Z]/.test(symbol) ? `${symbol} ${formatted}` : `${symbol}${formatted}`;
}

async function parseListingText(raw, user) {
  const text = String(raw || '').trim();
  if (!text) return {};
  const out = {};

  // Currency detection — explicit mention wins, then infer from primaryCity,
  // then default USD. We try this BEFORE price so validator ranges can scale
  // to the currency (PKR rent is ~100k; USD rent is ~1k; a single int range
  // can't cover both honestly).
  out.currency = detectCurrency(text, user?.metadata?.websiteData?.primaryCity);

  // Price — accept both sale ($525k, PKR 1.2M, ₹45L) and rental figures
  // (100000pkr, 85k rent). The numeric extractor is currency-agnostic; the
  // validator range is widened when a non-USD currency was detected since
  // rentals in PKR/INR/etc. are a valid much-smaller number.
  const priceMatch = text.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*([kKmMlL])?/);
  if (priceMatch) {
    let n = parseFloat(priceMatch[1].replace(/,/g, ''));
    const suffix = (priceMatch[2] || '').toLowerCase();
    if (suffix === 'k') n *= 1000;
    else if (suffix === 'm') n *= 1000000;
    // South Asian "lakh" (1L = 100,000) — common in PKR/INR listings
    else if (suffix === 'l') n *= 100000;
    else if (n < 1000 && !suffix) n = null; // probably beds/sqft, not price
    const { min, max } = priceRangeFor(out.currency);
    if (n && n >= min && n <= max) out.price = Math.round(n);
  }
  // Beds/baths: "4 bed 3 bath", "4bd/3ba", "4/3"
  const bbMatch = text.match(/(\d+)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (bbMatch) {
    out.beds = parseInt(bbMatch[1], 10);
    out.baths = parseFloat(bbMatch[2]);
  } else {
    const bedMatch = text.match(/(\d+)\s*(?:bed|bd|br)\b/i);
    if (bedMatch) out.beds = parseInt(bedMatch[1], 10);
    const bathMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:bath|ba|bth)\b/i);
    if (bathMatch) out.baths = parseFloat(bathMatch[1]);
  }
  // Sqft: "1800 sqft", "1,800 sf", "2200 square feet"
  const sqftMatch = text.match(/([\d,]+)\s*(?:sqft|sf|sq\s*ft|square\s*feet)\b/i);
  if (sqftMatch) {
    const n = parseInt(sqftMatch[1].replace(/,/g, ''), 10);
    if (n >= 200 && n <= 20000) out.sqft = n;
  }
  // Status
  if (/\bpending\b/i.test(text)) out.status = 'Pending';
  else if (/\b(just\s*listed|new\s*listing)\b/i.test(text)) out.status = 'Just Listed';
  else if (/\bsold\b/i.test(text)) out.status = 'Sold';
  else if (/\bfor\s*sale\b/i.test(text)) out.status = 'For Sale';

  // LLM pass for address (and anything missing). Always run — regex can't
  // reliably find street addresses.
  try {
    const missingList = [];
    if (!out.address) missingList.push('address');
    if (!out.price) missingList.push('price');
    if (out.beds == null) missingList.push('beds');
    if (out.baths == null) missingList.push('baths');
    if (out.sqft == null) missingList.push('sqft');
    if (!out.status) missingList.push('status');
    if (!missingList.length) return out;

    const prompt = `Extract real-estate listing fields from the message. Return ONLY JSON with the requested fields. Omit fields you can't confidently extract. Never guess.

Requested: ${missingList.join(', ')}

Rules:
- address: street address only (e.g. "45 Elm Street"). No city/state unless clearly part of address.
- price: integer numeric amount. "$525k" → 525000. "1.2M" → 1200000. "45L" (lakh) → 4500000. Omit if unclear.
- currency: ISO currency code the listing is in — USD, PKR, INR, GBP, EUR, AED, SAR, CAD, AUD, etc. Detect from explicit markers in the message ("pkr", "rs", "rupees", "₹", "£", "€", "$", "AED", ...) OR infer from the business location context. Omit only if genuinely indeterminable.
- beds, baths: numbers. baths can be .5.
- sqft: integer square feet.
- status: one of "For Sale", "Just Listed", "Pending", "Sold". Default "For Sale" only if message implies active listing.

Return like {"address":"45 Elm St","price":525000,"currency":"USD","beds":4,"baths":3} or {} if nothing usable.`;
    const resp = await generateResponse(prompt, [{ role: 'user', content: text }], {
      userId: user?.id,
      operation: 'webdev_listing_parse',
    });
    const m = resp.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      // Accept an LLM-supplied currency before validating price, so the
      // price range is scaled to the right currency.
      if (parsed.currency && typeof parsed.currency === 'string') {
        const code = parsed.currency.trim().toUpperCase();
        if (/^[A-Z]{3}$/.test(code)) out.currency = code;
      }
      const { min, max } = priceRangeFor(out.currency);
      for (const k of missingList) {
        const v = parsed[k];
        if (v == null) continue;
        if (k === 'address' && typeof v === 'string' && v.trim().length >= 4 && v.trim().length < 100) out.address = v.trim();
        else if (k === 'price' && Number.isFinite(v) && v >= min && v <= max) out.price = Math.round(v);
        else if (k === 'beds' && Number.isInteger(v) && v >= 0 && v < 20) out.beds = v;
        else if (k === 'baths' && Number.isFinite(v) && v >= 0 && v < 20) out.baths = v;
        else if (k === 'sqft' && Number.isInteger(v) && v >= 200 && v <= 20000) out.sqft = v;
        else if (k === 'status' && typeof v === 'string' && /^(For Sale|Just Listed|Pending|Sold)$/i.test(v.trim())) {
          out.status = v.trim().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/For sale/i, 'For Sale').replace(/Just listed/i, 'Just Listed');
        }
      }
    }
  } catch (err) {
    logger.warn(`[WEBDEV-LISTING] LLM parse failed: ${err.message}`);
  }

  return out;
}

/**
 * Classify a short reply as yes / skip / unclear using the LLM. Works for
 * ANY language — English, Roman Urdu, Urdu, Hindi, Spanish, Arabic, French,
 * etc. — so we don't need to maintain a keyword list per language. Falls
 * back to 'unclear' on any LLM failure so we re-ask instead of guessing
 * wrong. Empty input is treated as unclear.
 */
async function classifyYesSkip(text, userId) {
  const t = String(text || '').trim();
  if (!t) return 'unclear';
  // Long free-text almost always carries real content (a listing, a
  // question, a long refusal). Treat as unclear so the handler either
  // re-asks or the structured-listing fast-path picks it up first.
  if (t.length > 80) return 'unclear';

  try {
    const prompt = `A chatbot just asked the user: "Do you want to send your property listings now, or skip and use placeholder listings?"

Classify the user's reply into ONE of:
- "yes": user wants to send / share / add their listings (in any language — "yes", "yeah add them", "haan bhai bhejta hoon", "sí, los tengo", "oui je veux", "نعم, أريد").
- "skip": user wants to skip / use placeholders / doesn't have listings / not now (in any language — "skip", "skip kar do", "no", "nahi", "later", "no thanks", "dont have any", "saltar", "non merci", "لا, تخطى").
- "unclear": anything else — a question, garbage text, "?", an off-topic reply, or anything ambiguous.

The user said: "${t}"

Respond with ONLY one word: yes, skip, or unclear.`;

    const response = await generateResponse(
      prompt,
      [{ role: 'user', content: t }],
      { userId, operation: 'yes_skip_classify' }
    );
    const clean = String(response || '').trim().toLowerCase().replace(/[^a-z]/g, '');
    if (clean === 'yes') return 'yes';
    if (clean === 'skip') return 'skip';
    return 'unclear';
  } catch (err) {
    logger.warn(`[YES_SKIP] LLM classify failed: ${err.message}`);
    return 'unclear';
  }
}

/**
 * Classify a reply to the WEB_CONFIRM summary as confirm / edit / unclear.
 * LLM-based so it works for any language ("perfect hai", "sí dale",
 * "parfait allons-y", etc.) without per-language keyword lists. Returns
 * 'unclear' on any failure so the caller falls through to edit-parsing
 * instead of silently mis-building.
 */
async function classifyConfirmIntent(text, userId) {
  const t = String(text || '').trim();
  if (!t) return 'unclear';
  // Long replies are almost always edit instructions ("change name to X,
  // update the email too") or free-text corrections. Skip the classifier.
  if (t.length > 120) return 'edit';

  try {
    const prompt = `A chatbot showed the user a summary of their website details and asked "Does this look right? Reply yes to build, or tell me what to change."

Classify the user's reply into ONE of:
- "confirm": user is approving the summary and wants to proceed / build the site (in any language — "yes", "perfect", "perfect hai", "looks good", "dale", "parfait allons-y", "sí, construye", "تمام, ابن").
- "edit": user wants to change a specific field ("change the name to X", "email should be Y", "naam X kar do", "cambia el email", etc.) OR is correcting a value.
- "unclear": anything else — a question, off-topic reply, or genuinely ambiguous.

The user said: "${t}"

Respond with ONLY one word: confirm, edit, or unclear.`;

    const response = await generateResponse(
      prompt,
      [{ role: 'user', content: t }],
      { userId, operation: 'confirm_intent_classify' }
    );
    const clean = String(response || '').trim().toLowerCase().replace(/[^a-z]/g, '');
    if (clean === 'confirm') return 'confirm';
    if (clean === 'edit') return 'edit';
    return 'unclear';
  } catch (err) {
    logger.warn(`[CONFIRM_INTENT] LLM classify failed: ${err.message}`);
    return 'unclear';
  }
}

/**
 * Detect whether the user is asking to see a summary of what the bot has
 * collected so far ("what are my current details?", "mere details kya hain",
 * "show me the summary", "¿qué tienes de mí?", etc.). LLM-based so it works
 * in any language. Returns false on any LLM failure so the flow continues.
 */
async function classifyShowSummaryIntent(text, userId) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (t.length > 120) return false;

  try {
    const prompt = `A chatbot is collecting info from a user to build their business website (name, industry, services, hours, contact, etc.).

Classify whether the user's message is asking to SEE / RECAP / SHOW the information they've given so far. Examples in any language count:
- "what are my current details?" / "what do you have so far?" / "show me what you've got" / "what have i told you?" / "can you show me the summary?" / "recap please" → yes
- "mere details kya hain" / "abhi tak kya collect kiya hai" / "summary dikhao" → yes
- "¿qué tienes de mí?" / "muéstrame el resumen" / "qu'est-ce que tu as de moi?" → yes

NOT this intent (return no):
- user is answering the current question
- user is asking an unrelated question ("do you do SEO?")
- user is confirming / approving / editing a field
- user is saying skip / default / whatever

The user said: "${t}"

Respond with ONLY: yes or no.`;

    const response = await generateResponse(
      prompt,
      [{ role: 'user', content: t }],
      { userId, operation: 'show_summary_classify' }
    );
    const clean = String(response || '').trim().toLowerCase().replace(/[^a-z]/g, '');
    return clean === 'yes';
  } catch (err) {
    logger.warn(`[SHOW_SUMMARY] LLM classify failed: ${err.message}`);
    return false;
  }
}

/**
 * Detect whether the user is asking us to reuse the phone number they're
 * messaging from (their WhatsApp number) as the contact number on the site.
 * LLM-based so it works in any language ("use my whatsapp number", "mera
 * yahi number use kar lo", "usa este mismo número", "utilise mon numéro",
 * "استخدم رقمي", etc.). Returns true / false; false on any LLM failure.
 */
async function classifyUseOwnNumber(text, userId) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (t.length > 120) return false; // long text is almost never this intent

  try {
    const prompt = `A chatbot just asked the user for their contact info (email, phone, and/or address) for their business website.

Classify whether the user is telling us to REUSE the phone number they're messaging us from (their WhatsApp / current / same number) as the contact phone on the site. Examples in any language count:
- "use my whatsapp number" / "use this number" / "same number" / "my current number" → yes
- "mera yahi number use karo" / "whatsapp wala number use kar lo" / "isi number pe" → yes
- "usa mi número de whatsapp" / "este mismo número" / "mi número actual" → yes
- "utilise mon numéro whatsapp" / "le même numéro" → yes
- "استخدم رقم الواتساب" / "نفس الرقم" → yes

NOT this intent (return no):
- user typed a different phone number
- user provided an email or address
- user said skip / nothing / "I don't want to share"
- user is asking a question

The user said: "${t}"

Respond with ONLY: yes or no.`;

    const response = await generateResponse(
      prompt,
      [{ role: 'user', content: t }],
      { userId, operation: 'use_own_number_classify' }
    );
    const clean = String(response || '').trim().toLowerCase().replace(/[^a-z]/g, '');
    return clean === 'yes';
  } catch (err) {
    logger.warn(`[USE_OWN_NUMBER] LLM classify failed: ${err.message}`);
    return false;
  }
}

async function handleCollectListingsAsk(user, message) {
  const raw = (message.text || '').trim();
  const wd = { ...(user.metadata?.websiteData || {}) };

  // Classify the user's reply as yes / skip / unclear. We use the LLM so
  // this works for ANY language the user might reply in ("skip kar do",
  // "sí, los tengo", "لا", "non merci", "haan bhai", etc.) without a
  // language-by-language regex list. Long messages that look like actual
  // listings (addresses, prices, bed/bath counts) bypass the classifier
  // and drop straight into the details parser.
  const looksLikeListing =
    /\$|\d+\s*(bed|bd|ba|sqft|sf)\b/i.test(raw) ||
    /\b(listing|property|home|house|condo)\b/i.test(raw);

  if (looksLikeListing) {
    const merged = { ...wd, listingsAskAnswered: true, listings: wd.listings || [] };
    await updateUserMetadata(user.id, { websiteData: merged });
    user.metadata = { ...(user.metadata || {}), websiteData: merged };
    return handleCollectListingsDetails(user, message);
  }

  const intent = await classifyYesSkip(raw, user.id);

  if (intent === 'skip') {
    const merged = { ...wd, listingsAskAnswered: true, listingsDetailsDone: true, listingsFlowDone: true, listings: [] };
    await updateUserMetadata(user.id, { websiteData: merged });
    user.metadata = { ...(user.metadata || {}), websiteData: merged };
    await logMessage(user.id, 'Listings: skipped (using LLM defaults)', 'assistant');
    return smartAdvance(user, message, 'No problem — I\'ll use professional placeholder listings.');
  }

  if (intent === 'yes') {
    const merged = { ...wd, listingsAskAnswered: true, listings: wd.listings || [] };
    await updateUserMetadata(user.id, { websiteData: merged });
    user.metadata = { ...(user.metadata || {}), websiteData: merged };
    await sendTextMessage(
      user.phone_number,
      await localize(questionForState(STATES.WEB_COLLECT_LISTINGS_DETAILS, merged), user, raw)
    );
    return STATES.WEB_COLLECT_LISTINGS_DETAILS;
  }

  // Unclear answer — re-ask. Localize so we don't accidentally drop back to
  // English mid-conversation when the user is chatting in Roman Urdu / etc.
  await sendTextMessage(
    user.phone_number,
    await localize(
      'Just to confirm — *yes* to send your listings, or *skip* to use professional placeholder listings?',
      user,
      raw
    )
  );
  return STATES.WEB_COLLECT_LISTINGS_ASK;
}

async function handleCollectListingsDetails(user, message) {
  const raw = (message.text || '').trim();
  const wd = { ...(user.metadata?.websiteData || {}) };
  const listings = Array.isArray(wd.listings) ? [...wd.listings] : [];
  const doneWords = /^(done|finished|that'?s (it|all)|stop|enough|no more|bas|khatam)$/i;
  const skipWords = /^(skip|cancel)$/i;

  if (skipWords.test(raw)) {
    // Skip mid-flow — keep what we have (if any), fall back for the rest.
    const merged = { ...wd, listings, listingsDetailsDone: true, listingsFlowDone: true };
    await updateUserMetadata(user.id, { websiteData: merged });
    user.metadata = { ...(user.metadata || {}), websiteData: merged };
    return smartAdvance(user, message, listings.length ? `Got ${listings.length} listing(s), using defaults for the rest.` : 'No problem — using professional placeholder listings.');
  }

  if (doneWords.test(raw)) {
    if (listings.length === 0) {
      // User said "done" with zero listings — treat as skip
      const merged = { ...wd, listingsDetailsDone: true, listingsFlowDone: true, listings: [] };
      await updateUserMetadata(user.id, { websiteData: merged });
      user.metadata = { ...(user.metadata || {}), websiteData: merged };
      return smartAdvance(user, message, 'No problem — using professional placeholder listings.');
    }
    // Move to photos phase
    const merged = { ...wd, listings, listingsDetailsDone: true };
    await updateUserMetadata(user.id, { websiteData: merged });
    user.metadata = { ...(user.metadata || {}), websiteData: merged };
    await sendTextMessage(user.phone_number, questionForState(STATES.WEB_COLLECT_LISTINGS_PHOTOS, merged));
    return STATES.WEB_COLLECT_LISTINGS_PHOTOS;
  }

  // Parse the listing
  const parsed = await parseListingText(raw, user);
  if (!parsed.address && !parsed.price) {
    await sendTextMessage(
      user.phone_number,
      'I couldn\'t pick up an address or price. Try again like *"45 Elm St, $525k, 4 bed 3 bath, 2200 sqft"* — or reply *done* to stop.'
    );
    return STATES.WEB_COLLECT_LISTINGS_DETAILS;
  }

  // Sensible defaults for missing fields
  const listing = {
    address: parsed.address || 'Address on request',
    price: parsed.price || 0,
    currency: parsed.currency || 'USD',
    beds: parsed.beds != null ? parsed.beds : 3,
    baths: parsed.baths != null ? parsed.baths : 2,
    sqft: parsed.sqft != null ? parsed.sqft : 1800,
    status: parsed.status || 'For Sale',
    photoUrl: null,
    neighborhood: '',
  };
  listings.push(listing);

  const reachedMax = listings.length >= MAX_LISTINGS;
  const merged = { ...wd, listings };
  if (reachedMax) merged.listingsDetailsDone = true;
  await updateUserMetadata(user.id, { websiteData: merged });
  user.metadata = { ...(user.metadata || {}), websiteData: merged };
  const priceStr = formatPrice(listing.price, listing.currency);
  await logMessage(user.id, `Listing ${listings.length} captured: ${listing.address} / ${priceStr}`, 'assistant');

  const ack = `Got it — *${listing.address}*, ${priceStr}, ${listing.beds}bd/${listing.baths}ba${listing.sqft ? `, ${listing.sqft.toLocaleString()}sf` : ''}.`;

  if (reachedMax) {
    await sendTextMessage(
      user.phone_number,
      `${ack}\n\nMax 3 reached — moving to photos.\n\n${questionForState(STATES.WEB_COLLECT_LISTINGS_PHOTOS, merged)}`
    );
    return STATES.WEB_COLLECT_LISTINGS_PHOTOS;
  }

  await sendTextMessage(user.phone_number, `${ack}\n\nSend the next listing, or reply *done* to move on.`);
  return STATES.WEB_COLLECT_LISTINGS_DETAILS;
}

async function handleCollectListingsPhotos(user, message) {
  const raw = (message.text || '').trim();
  const wd = { ...(user.metadata?.websiteData || {}) };
  const listings = Array.isArray(wd.listings) ? [...wd.listings] : [];
  const skipWords = /^(skip|done|no more|bas|khatam|stock|use stock|placeholder)$/i;
  const pendingIdx = wd.pendingPhotoAssign; // null when waiting for next image

  // If we're waiting for an assignment number ("1", "2", "3", or skip)
  if (pendingIdx != null) {
    if (/^skip$/i.test(raw) || /^discard$/i.test(raw)) {
      const merged = { ...wd, pendingPhotoAssign: null };
      await updateUserMetadata(user.id, { websiteData: merged });
      user.metadata = { ...(user.metadata || {}), websiteData: merged };
      await sendTextMessage(user.phone_number, 'Skipped. Send another photo or reply *done* to finish.');
      return STATES.WEB_COLLECT_LISTINGS_PHOTOS;
    }
    const numMatch = raw.match(/^([1-9])$/);
    if (!numMatch) {
      await sendTextMessage(user.phone_number, `Please reply with just a number: ${listings.map((_, i) => i + 1).join(', ')}, or *skip*.`);
      return STATES.WEB_COLLECT_LISTINGS_PHOTOS;
    }
    const n = parseInt(numMatch[1], 10);
    if (n < 1 || n > listings.length) {
      await sendTextMessage(user.phone_number, `Pick a valid number: ${listings.map((_, i) => i + 1).join(', ')}, or *skip*.`);
      return STATES.WEB_COLLECT_LISTINGS_PHOTOS;
    }
    // Upload the stored buffer to Supabase now that we know where it belongs.
    try {
      const { uploadListingPhoto } = require('../../website-gen/listingPhotoUploader');
      const { downloadMedia } = require('../../messages/sender');
      const mediaId = wd.pendingPhotoMediaId;
      if (!mediaId) throw new Error('no pending media id');
      const { buffer, mimeType } = await downloadMedia(mediaId);
      const url = await uploadListingPhoto(buffer, mimeType || 'image/jpeg');
      listings[n - 1].photoUrl = url;
      const merged = { ...wd, listings, pendingPhotoAssign: null, pendingPhotoMediaId: null };
      await updateUserMetadata(user.id, { websiteData: merged });
      user.metadata = { ...(user.metadata || {}), websiteData: merged };
      await logMessage(user.id, `Listing ${n} photo uploaded: ${url}`, 'assistant');
      await sendTextMessage(user.phone_number, `Attached to *${listings[n - 1].address}*. Send another photo or reply *done* to finish.`);
      return STATES.WEB_COLLECT_LISTINGS_PHOTOS;
    } catch (err) {
      logger.error('[WEBDEV-LISTING] photo upload failed:', err);
      const merged = { ...wd, pendingPhotoAssign: null, pendingPhotoMediaId: null };
      await updateUserMetadata(user.id, { websiteData: merged });
      user.metadata = { ...(user.metadata || {}), websiteData: merged };
      await sendTextMessage(user.phone_number, 'Upload failed — stock photo will be used for that one. Try another, or reply *done*.');
      return STATES.WEB_COLLECT_LISTINGS_PHOTOS;
    }
  }

  // Not waiting for assignment: either image arrived, or user said done/skip/text
  if (message.mediaId && message.type === 'image') {
    // If only one listing, auto-assign and skip the question.
    if (listings.length === 1) {
      try {
        const { uploadListingPhoto } = require('../../website-gen/listingPhotoUploader');
        const { downloadMedia } = require('../../messages/sender');
        const { buffer, mimeType } = await downloadMedia(message.mediaId);
        const url = await uploadListingPhoto(buffer, mimeType || 'image/jpeg');
        listings[0].photoUrl = url;
        const merged = { ...wd, listings };
        await updateUserMetadata(user.id, { websiteData: merged });
        user.metadata = { ...(user.metadata || {}), websiteData: merged };
        await sendTextMessage(user.phone_number, `Attached to *${listings[0].address}*. Send another photo or reply *done* to finish.`);
        return STATES.WEB_COLLECT_LISTINGS_PHOTOS;
      } catch (err) {
        logger.error('[WEBDEV-LISTING] photo upload failed:', err);
        await sendTextMessage(user.phone_number, 'Upload failed — stock photo will be used. Reply *done* to continue.');
        return STATES.WEB_COLLECT_LISTINGS_PHOTOS;
      }
    }
    // Multiple listings — ask which one
    const merged = { ...wd, pendingPhotoAssign: 0, pendingPhotoMediaId: message.mediaId };
    await updateUserMetadata(user.id, { websiteData: merged });
    user.metadata = { ...(user.metadata || {}), websiteData: merged };
    await sendTextMessage(user.phone_number, questionForState(STATES.WEB_COLLECT_LISTINGS_PHOTOS, merged));
    return STATES.WEB_COLLECT_LISTINGS_PHOTOS;
  }

  if (skipWords.test(raw)) {
    const merged = { ...wd, listingsFlowDone: true, pendingPhotoAssign: null, pendingPhotoMediaId: null };
    await updateUserMetadata(user.id, { websiteData: merged });
    user.metadata = { ...(user.metadata || {}), websiteData: merged };
    const withPhotos = listings.filter((l) => l.photoUrl).length;
    const ack = withPhotos > 0
      ? `Got ${withPhotos} photo${withPhotos === 1 ? '' : 's'} — stock photos for the rest.`
      : 'Using professional stock photos for all listings.';
    return smartAdvance(user, message, ack);
  }

  // Any other text — gentle nudge
  await sendTextMessage(
    user.phone_number,
    'Send a listing photo (image), or reply *done* / *skip* to use stock photos.'
  );
  return STATES.WEB_COLLECT_LISTINGS_PHOTOS;
}

// ═══════════════════════════════════════════════════════════════════════════
// SALON-SPECIFIC COLLECTION
// Only reached when industry matches salon/beauty/barber/spa/etc.
// Flow: services -> booking tool -> instagram -> (if native) hours -> durations -> contact
// ═══════════════════════════════════════════════════════════════════════════

async function startSalonFlow(user) {
  // Mark this site as using the salon template so the deployer picks the salon renderer.
  const siteId = user.metadata?.currentSiteId;
  if (siteId) {
    try {
      await updateSite(siteId, { template_id: 'salon' });
    } catch (err) {
      logger.warn(`[SALON] Could not update template_id on site ${siteId}: ${err.message}`);
    }
  }
  const msg = 'Do you already use a booking tool (Fresha, Booksy, Vagaro, Calendly, etc.)?\n\n' +
    '• If yes, just paste the link and we\'ll embed it on your site.\n' +
    '• If not, type *"no"* and we\'ll build a built-in booking system for you.';
  await sendTextMessage(user.phone_number, await localize(msg, user));
  return STATES.SALON_BOOKING_TOOL;
}

/**
 * Finish the salon sub-flow. If we entered from the confirm step (industry
 * correction), return to WEB_CONFIRM with a refreshed summary instead of
 * asking for contact info again. Otherwise proceed to contact collection.
 */
async function finishSalonFlow(user) {
  const origin = user.metadata?.salonFlowOrigin;
  if (origin === 'CONFIRM') {
    // Clear the flag, re-show the updated summary so they can approve.
    await updateUserMetadata(user.id, { salonFlowOrigin: null });
    return showConfirmSummary(user);
  }

  // If the user already gave contact info in sales chat (and we pre-seeded
  // it into websiteData), don't re-ask — jump straight to the confirmation
  // summary. Otherwise collect contact the normal way.
  const wd = user.metadata?.websiteData || {};
  const hasContact = !!(wd.contactEmail || wd.contactPhone || wd.contactAddress);
  if (hasContact) {
    return showConfirmSummary(user);
  }

  await sendTextMessage(
    user.phone_number,
    await localize(
      "Last thing — what contact info do you want on the site? Just send your email, phone, and/or address.",
      user
    )
  );
  return STATES.WEB_COLLECT_CONTACT;
}

async function handleSalonBookingTool(user, message) {
  const text = (message.text || '').trim();
  const wd = { ...(user.metadata?.websiteData || {}) };
  const urlMatch = text.match(/https?:\/\/\S+/i);

  const igExample = instagramHandleExampleFor(wd.businessName);

  if (urlMatch) {
    wd.bookingMode = 'embed';
    wd.bookingUrl = urlMatch[0].replace(/[)\]]+$/, '');
    await updateUserMetadata(user.id, { websiteData: wd });
    await logMessage(user.id, `Booking mode: embed (${wd.bookingUrl})`, 'assistant');
    const msg = `Got it, we'll embed *${wd.bookingUrl}* on your booking page.\n\nWhat's your Instagram handle? (e.g. ${igExample}). Just skip if you don't have one.`;
    await sendTextMessage(user.phone_number, await localize(msg, user, text));
    return STATES.SALON_INSTAGRAM;
  }

  // Any form of "no / I don't have one / whatever / idk / haven't got one
  // yet / I have no idea about this" lands on the built-in booking system.
  // Regex handles the common phrasings; LLM covers natural prose the regex
  // inevitably misses. Without the fallback the user stalls in a re-prompt
  // loop on anything outside the keyword list.
  const bookingQuestion =
    'Do you already use a booking tool like Fresha, Booksy, Vagaro, or Calendly for appointments?';
  if (await classifyDelegation(text, bookingQuestion)) {
    wd.bookingMode = 'native';
    await updateUserMetadata(user.id, { websiteData: wd });
    await logMessage(user.id, 'Booking mode: native', 'assistant');
    const msg = `Perfect, we'll build you a booking system. What's your Instagram handle? (e.g. ${igExample}). Just skip if you don't have one.`;
    await sendTextMessage(user.phone_number, await localize(msg, user, text));
    return STATES.SALON_INSTAGRAM;
  }

  await sendTextMessage(
    user.phone_number,
    await localize(
      'Please either paste your booking tool link (Fresha/Booksy/Vagaro/etc.) or type *"no"* and we\'ll build one for you.',
      user,
      text
    )
  );
  return STATES.SALON_BOOKING_TOOL;
}

async function handleSalonInstagram(user, message) {
  const text = (message.text || '').trim();
  const wd = { ...(user.metadata?.websiteData || {}) };

  // Only accept an obvious handle shape: an instagram.com URL, a @-prefixed
  // token (either standalone or embedded in a sentence like "han, X kar do
  // @asnhbukharu"), or a single bare handle-shaped word. Anything else
  // (delegation, prose, "i dont have one") is treated as skip.
  const urlHandle = text.match(/instagram\.com\/([\w.]+)/i);
  const inlineAt = text.match(/@([\w.]{3,30})\b/);
  let candidate = null;
  if (urlHandle) {
    candidate = urlHandle[1];
  } else if (inlineAt) {
    candidate = inlineAt[1];
  } else if (/^[\w.]{3,30}$/.test(text)) {
    candidate = text;
  }
  if (candidate && /^[\w.]{3,30}$/.test(candidate)) {
    wd.instagramHandle = candidate;
  }
  await updateUserMetadata(user.id, { websiteData: wd });
  await logMessage(user.id, `Instagram: ${wd.instagramHandle || '(skipped)'}`, 'assistant');

  // Announce what got saved so the user knows we moved on.
  const ack = wd.instagramHandle
    ? `Got it — @${wd.instagramHandle}.`
    : `No worries, no Instagram link on the site.`;
  await sendTextMessage(user.phone_number, await localize(ack, user, text));

  if (wd.bookingMode === 'native') {
    await sendTextMessage(
      user.phone_number,
      await localize(
        'What are your opening hours? A quick line is fine — for example: *"Tue-Sat 9-7, Sun-Mon closed"*.\n\nOr just tell me *default* for standard salon hours (Tue-Sat 9-7).',
        user,
        text
      )
    );
    return STATES.SALON_HOURS;
  }

  // Embed mode — skip hours/durations and finish the salon sub-flow.
  return finishSalonFlow(user);
}

async function handleSalonHours(user, message) {
  const text = (message.text || '').trim();
  const wd = { ...(user.metadata?.websiteData || {}) };

  // Defensive guard: an empty / too-short text that isn't a button or list
  // press should NOT auto-apply the default schedule. The hours parser
  // treats empty input as delegation → default hours, which is fine when
  // the user typed "skip" but disastrous if we ever got here with no real
  // input (ghost webhook, race, retry). Re-ask instead of silently moving on.
  if (!text && !message.buttonId && !message.listId) {
    await sendTextMessage(
      user.phone_number,
      await localize(
        'What are your opening hours? A quick line is fine — for example: *"Tue-Sat 9-7, Sun-Mon closed"*.\n\nOr just reply *default* for standard salon hours (Tue-Sat 9-7).',
        user
      )
    );
    return STATES.SALON_HOURS;
  }

  const { parseWeeklyHours, formatHoursForDisplay } = require('../../website-gen/hoursParser');
  const { hours, usedDefault } = await parseWeeklyHours(text);
  wd.weeklyHours = hours;
  await updateUserMetadata(user.id, { websiteData: wd });
  await logMessage(user.id, `Hours${usedDefault ? ' (default)' : ''}:\n${formatHoursForDisplay(hours)}`, 'assistant');

  const prefix = usedDefault
    ? 'Using standard salon hours (Tue-Sat 9-7). You can edit these later.\n\n'
    : `Got it:\n${formatHoursForDisplay(hours)}\n\n`;
  const services = (wd.services || []);
  if (services.length === 0) {
    // No services to price/tag — wrap up the salon flow.
    await sendTextMessage(user.phone_number, await localize(prefix.trim(), user, text));
    return finishSalonFlow(user);
  }
  const fullMsg = prefix +
    `How long does each service take, and what's the price?\n\n` +
    `Example: *"Haircut 30min €25, Colour 90min €85, Nails 45min €35"*.\n\n` +
    `Your services: ${services.join(', ')}.\n\n` +
    `Or just reply *default* to use 30min with no price.`;
  await sendTextMessage(user.phone_number, await localize(fullMsg, user, text));
  return STATES.SALON_SERVICE_DURATIONS;
}

// Extract optional currency-prefixed or suffixed prices from the remainder of
// a parsed service chunk. Accepts €25, $30, £40, ₹500, "25 euro", "from €20".
const PRICE_RE = /(from\s*)?([€$£₹]\s*\d{1,5}(?:\.\d{1,2})?|\d{1,5}(?:\.\d{1,2})?\s*(?:eur|usd|gbp|inr|aed|euros?|dollars?|pounds?|rupees?))/i;

function parseServiceDurations(text, servicesList) {
  // Split the message into chunks by comma or newline and try to extract
  // duration + price per chunk. Each chunk is matched back to a service name
  // by lowercased exact/partial match.
  const chunks = String(text || '')
    .split(/[,;\n]+|\s+\|\s+/)
    .map((c) => c.trim())
    .filter(Boolean);

  const byName = {}; // { loweredName: { duration, price } }

  for (const chunk of chunks) {
    const durMatch = chunk.match(/(\d{1,3})\s*(?:mins?|minutes|m)\b/i);
    const priceMatch = chunk.match(PRICE_RE);

    // The "name" is whatever precedes the duration or, failing that, the price.
    let name = chunk;
    const firstMeta = [durMatch?.index, priceMatch?.index].filter((x) => typeof x === 'number').sort((a, b) => a - b)[0];
    if (typeof firstMeta === 'number') name = chunk.slice(0, firstMeta);
    name = name.replace(/[:\-—]\s*$/, '').trim().toLowerCase();
    if (!name) continue;

    const entry = {};
    if (durMatch) {
      const mins = parseInt(durMatch[1], 10);
      if (mins > 0 && mins <= 600) entry.duration = mins;
    }
    if (priceMatch) {
      // Normalise: keep the raw symbol+number, strip trailing comma/period.
      entry.price = priceMatch[0].trim().replace(/[,.]$/, '');
    }
    if (Object.keys(entry).length > 0) byName[name] = entry;
  }

  return servicesList.map((s) => {
    const key = s.toLowerCase();
    let hit = byName[key];
    if (!hit) {
      const partial = Object.keys(byName).find((k) => key.includes(k) || k.includes(key));
      if (partial) hit = byName[partial];
    }
    return {
      name: s,
      durationMinutes: hit?.duration || 30,
      priceText: hit?.price || '',
    };
  });
}

async function handleSalonServiceDurations(user, message) {
  const text = (message.text || '').trim();
  const wd = { ...(user.metadata?.websiteData || {}) };
  const services = wd.services || [];
  // Delegation ("whatever you think" / "default" / "idk" / etc.) or a bare
  // "30" both mean "apply the 30min-no-price default to every service."
  const useDefault = isDelegation(text) || /^30$/.test(text);
  const salonServices = useDefault
    ? services.map((s) => ({ name: s, durationMinutes: 30, priceText: '' }))
    : parseServiceDurations(text, services);
  wd.salonServices = salonServices;
  await updateUserMetadata(user.id, { websiteData: wd });
  await logMessage(
    user.id,
    `Salon services: ${salonServices.map((s) => `${s.name} ${s.durationMinutes}m${s.priceText ? ' ' + s.priceText : ''}`).join(', ')}`,
    'assistant'
  );

  // Announce what we picked so the user isn't left wondering what got saved.
  let ackMsg;
  if (useDefault) {
    ackMsg = `Got it, I'll set every service to *30 minutes with no price listed*. You can tweak durations and prices later from the summary.`;
  } else {
    const preview = salonServices
      .slice(0, 3)
      .map((s) => `${s.name} ${s.durationMinutes}m${s.priceText ? ' ' + s.priceText : ''}`)
      .join(', ');
    ackMsg = `Got it — ${preview}${salonServices.length > 3 ? '…' : ''}.`;
  }
  await sendTextMessage(user.phone_number, await localize(ackMsg, user, text));

  return finishSalonFlow(user);
}

/**
 * Detect an edit-intent message targeting a specific previously-collected
 * field (business name, industry, services, email, phone, address). Returns
 * { field, value } if one was detected, or null otherwise.
 *
 * Permissive enough to catch phrasings like
 *   "actually the business name is wrong, it should be Glow Salon"
 *   "change the name to Glow Salon"
 *   "name: Glow Salon"
 *   "the industry is actually food"
 * without stealing plain contact-info entries.
 */
function detectFieldEdit(text) {
  if (!text) return null;
  const t = String(text).trim();

  // Field anchor — must match somewhere in the message. If no field keyword
  // appears at all, it's not an edit. We require the anchor to either start
  // the line or follow an edit verb / "the|my" so plain contact input like
  // "address: 123 Main" still matches but arbitrary mentions don't.
  const fieldAnchor = (fieldRegex) =>
    new RegExp(
      `^\\s*(?:actually[,\\s]+|change\\s+|update\\s+|fix\\s+|correct\\s+|set\\s+|make\\s+|the\\s+|my\\s+)*${fieldRegex}\\b`,
      'i'
    );

  // Separator (greedy left → rightmost match) picks the LAST "should be|is|
  // are|to|:" so "name is wrong, it should be X" captures "X" not
  // "wrong, it should be X".
  const tailPattern = /.*(?:should\s+be|are|is|to|:)\s+(.+)$/i;

  const fields = [
    { field: 'businessName',   re: fieldAnchor('(?:business\\s*)?name') },
    { field: 'industry',       re: fieldAnchor('industry') },
    { field: 'services',       re: fieldAnchor('services?') },
    { field: 'contactEmail',   re: fieldAnchor('e-?mail') },
    { field: 'contactPhone',   re: fieldAnchor('(?:phone|tel|mobile|number)') },
    { field: 'contactAddress', re: fieldAnchor('(?:address|location|addr)') },
  ];

  for (const { field, re } of fields) {
    if (!re.test(t)) continue;
    const m = t.match(tailPattern);
    if (!m) continue;
    let value = m[1].trim().replace(/^["']|["'\.]$/g, '');
    // Strip a leading "actually" if it leaked through into the value
    // (e.g. "industry is actually food" → "food", not "actually food").
    value = value.replace(/^(?:actually|really|now|just)[,\s]+/i, '').trim();
    if (!value) continue;
    return { field, value };
  }
  return null;
}

/**
 * Parse a free-text contact blob into { contactEmail, contactPhone, contactAddress }.
 * Handles both labeled input ("email: x, phone: y, address: z") and unlabeled input.
 */
function parseContactFields(text) {
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  const phoneMatch = text.match(/[\+]?[\d][\d\s\-()]{6,}/);

  // Try labeled address first — handles "address: 123 Main St" on its own line or inline.
  // Stops at the next known label word (with OR without a colon) or end of
  // string, so prose like "address is X email Y@Z.com phone 555" splits
  // cleanly into the three fields instead of collapsing into the address.
  const labeledAddressMatch = text.match(
    /(?:address|location|addr)\s*[:\-=]?\s*([^\n]+?)(?=\s*(?:email|e-?mail|phone|tel|mobile|contact)\b|$)/i
  );

  // Clean a captured address: strip a leading copula/separator that sneaks in
  // when the user writes prose ("the address is ABC, Street" captures "is
  // ABC, Street" without this), plus trailing punctuation and stray "and"
  // connectors ("123 Main St, and" → "123 Main St"). Covers common copulas
  // from Roman Urdu / Hindi / Spanish / French too so "address hai X" /
  // "direccion es X" / "l'adresse est X" don't leak the verb into the value.
  const stripAddressSeparator = (v) =>
    v
      .replace(/^(?:is|are|=|:|-|at|of|for|hai|hain|ka|ki|ke|ye|yeh|es|son|est|sont|ist|sind)\s+/i, '')
      .replace(/\s+(?:and|plus|aur|y|et|und)\s*$/i, '')
      .replace(/[,;.\s=:\-]+$/, '')
      .trim();

  // Reject addresses that look like leftover junk from a labeled message
  // (e.g. "contact =", "email", "phone") or filler-word residue after the
  // parser stripped out matched email/phone values ("yeah the is and
  // number is" left over from "yeah the email is X and number is Y"). An
  // address worth keeping must have EITHER a digit OR a recognizable
  // street keyword — pure-prose strings have neither and are almost
  // always residue.
  const isPlausibleAddress = (v) => {
    if (!v) return false;
    if (/\d/.test(v)) return true;
    if (/\b(?:st|street|ave|avenue|road|rd|blvd|boulevard|lane|ln|drive|dr|way|plaza|suite|apt|floor|block|sector|phase|building|tower|mall|market|colony|bazaar|bazar|nagar|society|square|sq)\b/i.test(v)) return true;
    return false;
  };

  let addressValue = '';
  if (labeledAddressMatch) {
    addressValue = stripAddressSeparator(labeledAddressMatch[1].trim());
  } else {
    // Fallback: strip the matched email/phone and any leftover label words, return the rest.
    // Expanded label list includes "contact" (common when users write
    // "contact = 555-1234" to mean phone) and accepts = as a separator too.
    addressValue = text
      .replace(emailMatch?.[0] || '', '')
      .replace(phoneMatch?.[0] || '', '')
      .replace(/\b(email|e-?mail|phone|tel|mobile|contact|contact\s*number|address|location|addr)\s*[:\-=]?/gi, '')
      .replace(/[,\n\r]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    addressValue = stripAddressSeparator(addressValue);
  }

  // Final junk filter: if what we captured doesn't look like a real address,
  // discard it rather than showing "contact =" in the summary.
  if (!isPlausibleAddress(addressValue)) addressValue = '';

  return {
    contactEmail: emailMatch?.[0] || '',
    contactPhone: phoneMatch?.[0]?.trim() || '',
    contactAddress: addressValue,
  };
}

async function handleCollectContact(user, message) {
  const contactText = (message.text || '').trim();
  const skipWords = /^(nothing|none|no|skip|n\/a|na|nah|nope|don'?t|dont|no thanks)$/i;

  // "Use my WhatsApp / current / this number" intent — save the number they're
  // messaging from as contactPhone without making them type it out. LLM-based
  // so it works in any language ("use my whatsapp number", "mera yahi
  // number use kar lo", "usa mi número de whatsapp", "cet numéro", etc.).
  // Gated by length + no @ / no multi-digit run so we don't waste a call
  // when the user is clearly pasting a real email/phone/address.
  const looksLikeRealContact =
    /@/.test(contactText) ||
    /\d{5,}/.test(contactText) ||
    contactText.length > 80;
  if (contactText && !looksLikeRealContact && user.phone_number) {
    const wantsOwnNumber = await classifyUseOwnNumber(contactText, user.id);
    if (wantsOwnNumber) {
      const wd = { ...(user.metadata?.websiteData || {}) };
      wd.contactPhone = user.phone_number;
      // Preserve any email / address they may have already given earlier
      // (via hydration or a prior turn). Don't overwrite those.
      await updateUserMetadata(user.id, { websiteData: wd });
      user.metadata = { ...(user.metadata || {}), websiteData: wd };
      await logMessage(user.id, `Contact phone: ${wd.contactPhone} (user asked to reuse WhatsApp number)`, 'assistant');
      await sendTextMessage(
        user.phone_number,
        await localize(
          `Got it — using *${wd.contactPhone}* as the contact number on your site.`,
          user,
          contactText
        )
      );
      // If we still don't have an email or address, stay in contact-collection
      // so the user can add them; otherwise move on to the summary.
      if (!wd.contactEmail && !wd.contactAddress) {
        await sendTextMessage(
          user.phone_number,
          await localize(
            'Anything else you want on the site — email or address? Or reply *skip* to use just the phone number.',
            user,
            contactText
          )
        );
        return STATES.WEB_COLLECT_CONTACT;
      }
      return showConfirmSummary(user);
    }
  }

  // If the input is a multi-field contact blob (2+ labeled fields like
  // "address: X, email: Y, phone: Z" OR "email is X and phone is Y"), skip
  // the single-field edit detector — otherwise the greedy tail regex
  // inside detectFieldEdit picks the LAST "is|:" in the message and
  // misreads "phone is 09876544567" as the email value. The regex below
  // counts labels followed by ANY of (colon, hyphen, "is", "are") so
  // prose-style multi-field input is caught too.
  // Expanded label list: users commonly write "contact is X" and
  // "number is Y" to mean phone. Without those in the list, an input
  // like "email is test@gmail.com and contact is 02928373993" counts
  // as only 1 label, detectFieldEdit runs, its greedy tail-match
  // picks the LAST "is" value (the phone) as the email, and we
  // misroute a two-field input into a single-field edit.
  const labelCount = (contactText.match(/\b(?:email|e-?mail|phone|tel|mobile|contact|number|address|location|addr)\s+(?:is|are)\b|\b(?:email|e-?mail|phone|tel|mobile|contact|number|address|location|addr)\s*[:\-]/gi) || []).length;

  // Delegation path: the user doesn't want to provide contact info and is
  // saying so in a non-literal way ("surprise me", "just add something
  // random", "make something up", "whatever you think", etc.). Store empty
  // contact (site will just omit the contact line) and move on.
  // Fast regex first; LLM fallback for prose the regex can't enumerate.
  // Gate the check with a cheap "does this LOOK like real contact info?" test
  // so we don't waste an LLM call on obvious emails/phones/addresses.
  const hasContactSignal =
    /@/.test(contactText) ||
    /\d{3,}/.test(contactText) ||
    /\b(?:st|street|ave|avenue|road|rd|blvd|boulevard|lane|ln|drive|dr|way|plaza|suite|apt|floor|block|sector|phase)\b/i.test(contactText);
  if (contactText && labelCount === 0 && !hasContactSignal) {
    const contactQuestion = 'What contact info do you want on the site? (email, phone, and/or address)';
    const delegated = await classifyDelegation(contactText, contactQuestion);
    if (delegated) {
      // Delegation ("whatever", "you pick", "up to you") means "use
      // defaults". If we already have something from a location pin
      // or an earlier turn, that IS the default — preserve it. Only
      // null-out fields that weren't populated yet so
      // nextMissingWebDevState knows we're past this step.
      const prev = user.metadata?.websiteData || {};
      const wd = {
        ...prev,
        contactEmail: prev.contactEmail || '',
        contactPhone: prev.contactPhone || '',
        contactAddress: prev.contactAddress || '',
      };
      await updateUserMetadata(user.id, { websiteData: wd, contactSkipped: true });
      user.metadata = { ...(user.metadata || {}), websiteData: wd, contactSkipped: true };
      await sendTextMessage(
        user.phone_number,
        `No problem, I'll leave contact details off the site. You can add them later from the summary.`
      );
      await logMessage(user.id, 'Contact: skipped via delegation', 'assistant');
      return showConfirmSummary(user);
    }
  }

  // Edit-intent guard: if the user is trying to correct an EARLIER
  // field ("actually the name should be Glow Salon"), update that
  // field and bounce to WEB_CONFIRM. IMPORTANT: exclude contact
  // fields — at this step, "email is X" / "phone is Y" / "address
  // is Z" are the user's FIRST-TIME contact input, NOT corrections
  // of a prior value. Treating them as edits would skip the logo
  // step entirely (showConfirmSummary transitions to WEB_CONFIRM).
  // So the guard only fires for edits to businessName / industry /
  // services — genuine corrections to fields collected upstream.
  const EDIT_ALLOWED_AT_CONTACT_STEP = new Set(['businessName', 'industry', 'services']);
  if (contactText && contactText.length >= 3 && !skipWords.test(contactText) && labelCount < 2) {
    const edit = detectFieldEdit(contactText);
    if (edit && EDIT_ALLOWED_AT_CONTACT_STEP.has(edit.field)) {
      const wd = { ...(user.metadata?.websiteData || {}) };
      let ackValue = edit.value;
      if (edit.field === 'services') {
        wd.services = edit.value.split(',').map((s) => s.trim()).filter(Boolean);
        ackValue = wd.services.join(', ');
      } else {
        wd[edit.field] = edit.value;
      }
      await updateUserMetadata(user.id, { websiteData: wd });
      user.metadata = { ...(user.metadata || {}), websiteData: wd };

      const fieldLabel = {
        businessName: 'business name',
        industry: 'industry',
        services: 'services',
      }[edit.field] || edit.field;
      await sendTextMessage(
        user.phone_number,
        `Got it — updated ${fieldLabel} to *${ackValue}*. Let's take one more look before we build.`
      );
      await logMessage(user.id, `Edit at contact step: ${edit.field} → ${ackValue}`, 'assistant');

      // Show the confirmation summary by re-entering WEB_CONFIRM's summary display.
      // Re-use the summary block by calling into the same code path: bump state
      // and let handleConfirm render on the next turn — but we also want to
      // proactively show the summary now so the user knows where they are.
      return showConfirmSummary(user);
    }
  }

  let contactData;
  if (!contactText || contactText.length < 3 || skipWords.test(contactText)) {
    contactData = { contactEmail: '', contactPhone: '', contactAddress: '' };
  } else {
    contactData = parseContactFields(contactText);

    // Reject junk / stray replies like "hello?", "?", "im waiting". If we
    // got no email, no phone, and the "address" we parsed looks like
    // conversational filler (no digits, no street keyword, very short, or
    // matches a common non-contact word), don't store it — re-prompt.
    const hasEmail = !!contactData.contactEmail;
    const hasPhone = !!contactData.contactPhone;
    const addr = contactData.contactAddress || '';
    const addrHasDigits = /\d/.test(addr);
    const addrHasStreetKeyword = /\b(?:st|street|ave|avenue|road|rd|blvd|boulevard|lane|ln|drive|dr|way|plaza|square|sq|apt|suite|floor|block|sector|phase)\b/i.test(addr);
    const addrLooksLikeJunk =
      /^(?:hello\??|hi\??|hey\??|waiting|im\s+waiting|what\??|huh\??|eh\??|um+|uh+|ok\??|sure\??|yeah\??|yes\??|no\??)$/i.test(addr);
    const addrTooShort = addr.length < 8;

    if (!hasEmail && !hasPhone && (addrLooksLikeJunk || (addrTooShort && !addrHasStreetKeyword && !addrHasDigits))) {
      await sendTextMessage(
        user.phone_number,
        "Didn't catch any contact info there. Send your email, phone, and/or address — any format is fine, or just skip if you'd rather not add contact details."
      );
      return STATES.WEB_COLLECT_CONTACT;
    }
  }

  // Merge carefully: don't overwrite an existing contactAddress (often
  // seeded from a location pin dropped in a previous step) with an
  // empty string just because the user's reply only contained email +
  // phone. Apply the same rule to email + phone — if the user gave us
  // a reply that parsed only some fields, preserve what we already had
  // for the missing ones. skipWords path (above) still clears all
  // three intentionally, via contactData = { '', '', '' }.
  const prevWd = user.metadata?.websiteData || {};
  const mergedContact = {
    contactEmail: contactData.contactEmail || prevWd.contactEmail || '',
    contactPhone: contactData.contactPhone || prevWd.contactPhone || '',
    contactAddress: contactData.contactAddress || prevWd.contactAddress || '',
  };
  // User tapped skip — three empty strings signal "really clear it".
  const userExplicitlySkipped = (
    !contactData.contactEmail &&
    !contactData.contactPhone &&
    !contactData.contactAddress &&
    (!contactText || contactText.length < 3 || skipWords.test(contactText))
  );
  const effectiveContact = userExplicitlySkipped ? contactData : mergedContact;
  const mergedWebsiteData = { ...prevWd, ...effectiveContact };
  // Mark the contact step completed so nextMissingWebDevState doesn't loop
  // back on users who provided only an address (or skipped). Setting this
  // unconditionally once handleCollectContact finishes is safe — we've
  // asked the user once, that's the UX contract.
  await updateUserMetadata(user.id, {
    websiteData: mergedWebsiteData,
    contactSkipped: true,
  });
  user.metadata = {
    ...(user.metadata || {}),
    websiteData: mergedWebsiteData,
    contactSkipped: true,
  };

  // Optional logo step — runs between contact and the confirmation summary
  // unless the user already uploaded one or opted out. Previously
  // handleCollectContact skipped straight to showConfirmSummary regardless
  // of the logo state, so nextMissingState's logo check never fired.
  const wdAfter = user.metadata.websiteData;
  if (!wdAfter.logoUrl && !wdAfter.logoSkipped) {
    const prompt = "Got a logo? Send it as an image (JPG or PNG) — I'll clean up the background automatically. Or reply *skip* and I'll use a text logo with your brand initial.";
    await sendTextMessage(user.phone_number, await localize(prompt, user));
    await logMessage(user.id, 'Asking for logo upload', 'assistant');
    return STATES.WEB_COLLECT_LOGO;
  }

  return showConfirmSummary(user);
}

// Render the pre-generation confirmation summary. Shared by handleCollectContact,
// the edit-intent fast-path, the salon-flow loopback, and the sales bot's
// website-demo trigger when everything is already known.
/**
 * Build the "*Services:*" line for both summary views. When the user
 * supplied services, show them verbatim. When they skipped AND the
 * industry resolves to a trade template (HVAC, plumbing, electrical,
 * roofing, etc.), preview the trade's default list so "None" never
 * appears in the summary — the generator will auto-seed those defaults
 * at build time, so the preview is accurate. Non-trade industries that
 * skipped get a truthful note about how the generic template handles it.
 */
function renderServicesLine(wd) {
  if (Array.isArray(wd.services) && wd.services.length > 0) {
    return `*Services:* ${wd.services.join(', ')}`;
  }
  try {
    const { isHvac, resolveTrade } = require('../../website-gen/templates');
    if (isHvac(wd.industry)) {
      const trade = resolveTrade(wd.industry);
      const { TRADE_COPY } = require('../../website-gen/templates/hvac/common');
      const entry = TRADE_COPY[trade];
      if (entry && Array.isArray(entry.defaultServices) && entry.defaultServices.length > 0) {
        const titles = entry.defaultServices.map((s) => s.title);
        const previewN = 5;
        const preview = titles.slice(0, previewN).join(', ');
        const remaining = titles.length - previewN;
        const tail = remaining > 0 ? `, and ${remaining} more` : '';
        return `*Services:* using our default ${entry.label.toLowerCase()} list (${preview}${tail})`;
      }
    }
  } catch {
    // Fall through to the generic note.
  }
  return `*Services:* None — we'll skip a dedicated services page`;
}

/**
 * Read-only peek at the current website-details summary — used when the
 * user asks "what are my current details?" mid-flow. Same content as
 * showConfirmSummary but without the "Reply *yes* to build it" trailing
 * line and without forcing a state transition, because we're still in the
 * middle of collecting.
 */
async function showSummaryPeek(user) {
  const { isRealEstate, isHvac } = require('../../website-gen/templates');

  let wd;
  try {
    const { findOrCreateUser } = require('../../db/users');
    const fresh = await findOrCreateUser(user.phone_number, user.channel, user.via_phone_number_id);
    wd = { ...(fresh.metadata?.websiteData || {}) };
    user.metadata = fresh.metadata || {};
  } catch (err) {
    logger.warn(`[WEBDEV] showSummaryPeek DB refetch failed, falling back to in-memory: ${err.message}`);
    wd = { ...(user.metadata?.websiteData || {}) };
  }

  const realEstate = isRealEstate(wd.industry);
  const hvac = !realEstate && isHvac(wd.industry);
  const contactInfo = [wd.contactEmail, wd.contactPhone, wd.contactAddress].filter(Boolean).join(' | ') || 'Not yet';

  const lines = [`Here's what I've got so far:`, ``];
  lines.push(`*${realEstate ? 'Agent' : 'Business'} Name:* ${wd.businessName || '-'}`);
  lines.push(`*Industry:* ${wd.industry || '-'}`);

  if (realEstate) {
    if (wd.primaryCity) lines.push(`*City:* ${wd.primaryCity}`);
    const extraAreas = (Array.isArray(wd.serviceAreas) ? wd.serviceAreas : [])
      .filter((a) => a && a.toLowerCase() !== (wd.primaryCity || '').toLowerCase());
    if (extraAreas.length) lines.push(`*Neighborhoods:* ${extraAreas.join(', ')}`);
    if (wd.brokerageName) lines.push(`*Brokerage:* ${wd.brokerageName}`);
    if (wd.yearsExperience != null) lines.push(`*Years:* ${wd.yearsExperience}`);
    if (Array.isArray(wd.designations) && wd.designations.length) lines.push(`*Designations:* ${wd.designations.join(', ')}`);
    if (Array.isArray(wd.listings) && wd.listings.length) {
      lines.push(`*Listings:* ${wd.listings.length}`);
    }
  } else {
    if (hvac && wd.primaryCity) lines.push(`*City:* ${wd.primaryCity}`);
    if (hvac && Array.isArray(wd.serviceAreas) && wd.serviceAreas.length) {
      const extraAreas = wd.serviceAreas.filter((a) => a && a.toLowerCase() !== (wd.primaryCity || '').toLowerCase());
      if (extraAreas.length) lines.push(`*Service Areas:* ${extraAreas.join(', ')}`);
    }
    // Always show the services line now — empty+trade shows the default
    // preview, empty+generic says we'll skip the page. Hiding it used to
    // leave the summary ambiguous about what services would actually
    // appear on the generated site.
    lines.push(renderServicesLine(wd));
  }

  if (wd.bookingMode === 'embed') lines.push(`*Booking:* External link (${wd.bookingUrl || 'set'})`);
  else if (wd.bookingMode === 'native') lines.push(`*Booking:* Built-in system`);
  if (wd.weeklyHours) lines.push(`*Hours:* set`);
  if (Array.isArray(wd.salonServices) && wd.salonServices.length) lines.push(`*Priced services:* ${wd.salonServices.length}`);
  if (wd.instagramHandle) lines.push(`*Instagram:* @${wd.instagramHandle}`);
  lines.push(`*Contact:* ${contactInfo}`);

  // localize() handles the English-override safety net internally by
  // fetching the latest user message when none is passed.
  const summary = lines.join('\n');
  const localized = await localize(summary, user);
  await sendTextMessage(user.phone_number, localized);
  // Log the actual peek text so the admin conversation page shows what the
  // user saw on WhatsApp, not a placeholder label.
  await logMessage(user.id, localized, 'assistant');
}

async function showConfirmSummary(user, prefix = '') {
  const { isRealEstate, isHvac } = require('../../website-gen/templates');

  // Re-fetch from DB so we never render stale data after a sub-flow updated
  // metadata without touching the in-memory user object.
  let wd;
  try {
    const { findOrCreateUser } = require('../../db/users');
    const fresh = await findOrCreateUser(user.phone_number, user.channel, user.via_phone_number_id);
    wd = { ...(fresh.metadata?.websiteData || {}) };
    user.metadata = fresh.metadata || {};
  } catch (err) {
    logger.warn(`[WEBDEV] showConfirmSummary DB refetch failed, falling back to in-memory: ${err.message}`);
    wd = { ...(user.metadata?.websiteData || {}) };
  }

  const realEstate = isRealEstate(wd.industry);
  const hvac = !realEstate && isHvac(wd.industry);
  const contactInfo = [wd.contactEmail, wd.contactPhone, wd.contactAddress].filter(Boolean).join(' | ') || 'None';

  const lines = [
    `Here's a summary of your website details:`,
    ``,
    `*${realEstate ? 'Agent' : 'Business'} Name:* ${wd.businessName || '-'}`,
    `*Industry:* ${wd.industry || '-'}`,
  ];

  if (realEstate) {
    if (wd.primaryCity) lines.push(`*City:* ${wd.primaryCity}`);
    if (Array.isArray(wd.serviceAreas) && wd.serviceAreas.length) lines.push(`*Neighborhoods:* ${wd.serviceAreas.join(', ')}`);
    lines.push(`*Brokerage:* ${wd.brokerageName || 'Solo / independent'}`);
    if (wd.yearsExperience != null) lines.push(`*Years:* ${wd.yearsExperience}`);
    if (Array.isArray(wd.designations) && wd.designations.length) lines.push(`*Designations:* ${wd.designations.join(', ')}`);
    if (Array.isArray(wd.listings) && wd.listings.length) {
      const withPhotos = wd.listings.filter((l) => l.photoUrl).length;
      lines.push(`*Listings:* ${wd.listings.length}${withPhotos ? ` (${withPhotos} with photos)` : ''}`);
    } else {
      lines.push(`*Listings:* professional placeholders`);
    }
  } else {
    // HVAC template has a Service Areas page, so show city + areas. For
    // generic business-starter templates these fields are usually absent
    // (the line is skipped).
    if (hvac) {
      if (wd.primaryCity) lines.push(`*City:* ${wd.primaryCity}`);
      if (Array.isArray(wd.serviceAreas) && wd.serviceAreas.length) {
        lines.push(`*Service Areas:* ${wd.serviceAreas.join(', ')}`);
      }
    }
    lines.push(renderServicesLine(wd));
  }

  // Salon extras (booking mode + Instagram) so salon users see their setup.
  if (wd.bookingMode === 'embed') {
    lines.push(`*Booking:* External link (${wd.bookingUrl || 'set'})`);
  } else if (wd.bookingMode === 'native') {
    const parts = ['Built-in system'];
    if (wd.weeklyHours) parts.push('hours set');
    if (Array.isArray(wd.salonServices) && wd.salonServices.length > 0) {
      parts.push(`${wd.salonServices.length} priced services`);
    }
    lines.push(`*Booking:* ${parts.join(' · ')}`);
  }
  if (wd.instagramHandle) lines.push(`*Instagram:* @${wd.instagramHandle}`);

  lines.push(`*Contact:* ${contactInfo}`);
  lines.push(``, `Does everything look good? Reply *yes* to build it, or tell me what you'd like to change.`);

  // Localize the summary (all labels + prompt are hardcoded English).
  // The actual stored values stay verbatim — the localizer prompt preserves
  // placeholder values via "keep URLs / @handles / phone numbers as-is".
  //
  // Ack prefix (e.g. "✅ Business name updated to X.") is folded into the
  // SAME send as the summary. Earlier they were two sequential sends and
  // if the second one ever failed, the user saw "Here's the updated
  // summary:" with no summary under it — confusing and blocked progress.
  // localize() auto-fetches the latest user message from history when no
  // `latestUserMessage` is passed, so the English-override safety net
  // fires and stale preferredLanguage caches can't translate the summary
  // into the wrong language.
  const summary = lines.join('\n');
  const combined = prefix ? `${prefix.trim()}\n\n${summary}` : summary;
  const localized = await localize(combined, user);
  await sendTextMessage(user.phone_number, localized);
  // Log the ACTUAL summary text so the admin conversation page shows what
  // the user saw on WhatsApp, not a placeholder label.
  await logMessage(user.id, localized, 'assistant');

  return STATES.WEB_CONFIRM;
}

// ─── Logo collection ───────────────────────────────────────────────────────
// Optional step — runs after contact, before the confirmation summary.
// Accepts either an image message (JPG/PNG) or a "skip" reply. On image,
// downloads the WhatsApp media, runs it through the three-tier logo
// processor (transparent passthrough → remove.bg API → original upload)
// and stores the resulting public URL in websiteData.logoUrl. On skip,
// sets websiteData.logoSkipped=true so nextMissingState() stops asking.
async function handleCollectLogo(user, message) {
  const text = (message.text || '').trim();

  // Skip path — explicit opt-out in any language we can reasonably detect
  // via keyword. Keeping this regex-based instead of LLM since the user
  // is answering a very specific yes/no-ish prompt.
  if (text && /^(skip|no|nope|nah|no thanks|don'?t have|none|n\/a|na|nahi|baad may|baad|later)$/i.test(text)) {
    const wd = { ...(user.metadata?.websiteData || {}) };
    wd.logoSkipped = true;
    await updateUserMetadata(user.id, { websiteData: wd });
    user.metadata = { ...(user.metadata || {}), websiteData: wd };
    await sendTextMessage(user.phone_number, await localize("No problem — I'll use a clean text logo with your brand initial.", user, text));
    await logMessage(user.id, 'User skipped logo upload', 'assistant');
    return smartAdvance(user, message, null);
  }

  // Image path — the sender captured the message with `type: 'image'` and
  // a mediaId. downloadMedia pulls the bytes from WhatsApp's CDN.
  const hasImage = message.type === 'image' && (message.mediaId || message.mediaUrl);
  if (!hasImage) {
    await sendTextMessage(
      user.phone_number,
      await localize(
        "I didn't catch an image there. Send your logo as an image (JPG or PNG), or reply *skip* to use a text logo.",
        user,
        text
      )
    );
    return STATES.WEB_COLLECT_LOGO;
  }

  await sendTextMessage(user.phone_number, await localize('Got it — processing your logo...', user, text));

  let mediaBuffer = null;
  let mediaMime = 'image/png';
  try {
    const { downloadMedia } = require('../../messages/sender');
    const media = await downloadMedia(message.mediaId || message.mediaUrl);
    if (media?.buffer) {
      mediaBuffer = media.buffer;
      mediaMime = media.mimeType || mediaMime;
    }
  } catch (err) {
    logger.error(`[LOGO-COLLECT] Media download failed: ${err.message}`);
  }

  if (!mediaBuffer) {
    await sendTextMessage(
      user.phone_number,
      await localize(
        "I couldn't download that image — can you try sending it again? Or reply *skip* to move on without a logo.",
        user,
        text
      )
    );
    return STATES.WEB_COLLECT_LOGO;
  }

  let result = null;
  try {
    const { processLogo } = require('../../website-gen/logoProcessor');
    result = await processLogo(mediaBuffer, mediaMime);
  } catch (err) {
    logger.error(`[LOGO-COLLECT] processLogo threw: ${err.message}`);
  }

  if (!result?.url) {
    // Processing failed entirely (upload error, all tiers gave up). Treat
    // it as skip so the flow doesn't stall — better to ship a text logo
    // than get stuck.
    const wd = { ...(user.metadata?.websiteData || {}) };
    wd.logoSkipped = true;
    await updateUserMetadata(user.id, { websiteData: wd });
    user.metadata = { ...(user.metadata || {}), websiteData: wd };
    await sendTextMessage(
      user.phone_number,
      await localize("Something went wrong processing that image — I'll use a text logo for now. You can always send one later.", user, text)
    );
    return smartAdvance(user, message, null);
  }

  const wd = { ...(user.metadata?.websiteData || {}) };
  wd.logoUrl = result.url;
  wd.logoSkipped = false;
  await updateUserMetadata(user.id, { websiteData: wd });
  user.metadata = { ...(user.metadata || {}), websiteData: wd };

  const ack = result.wasProcessed
    ? "Logo saved — background cleaned up and ready to go."
    : "Logo saved.";
  await sendTextMessage(user.phone_number, await localize(ack, user, text));
  await logMessage(user.id, `Logo uploaded (${result.source})`, 'assistant');
  return smartAdvance(user, message, null);
}

async function handleConfirm(user, message) {
  const originalText = (message.text || '').trim();

  // Is the user confirming (approve and build) vs. asking to edit something?
  // LLM-classified so it works for ANY language — "yes", "perfect hai", "sí
  // dale", "parfait", "تمام, ابن", etc. — without us maintaining a keyword
  // list per language.
  const confirmIntent = await classifyConfirmIntent(originalText, user.id);

  if (confirmIntent === 'confirm') {
    // Before building, ask about domain. Combined Stripe link needs the
    // domain price locked in so the activation banner matches the chat link.
    await logMessage(user.id, 'Confirmed, asking about domain before build', 'assistant');
    return askDomainChoice(user);
  }

  // User wants to change something — use originalText to preserve capitalization
  const wd = user.metadata?.websiteData || {};

  // Helper: persist the edit, ack it, and re-render the full summary so the
  // user sees the updated state at a glance instead of having to remember
  // which fields were changed. The ack is folded into the same send as the
  // summary — earlier it was two sends, and if the second (summary) ever
  // failed the user was left staring at "Here's the updated summary:" with
  // nothing underneath, unable to proceed.
  const applyAndReshow = async (ackLabel) => {
    await updateUserMetadata(user.id, { websiteData: wd });
    user.metadata = { ...(user.metadata || {}), websiteData: wd };
    const ackPrefix = `✅ ${ackLabel}. Here's the updated summary:`;
    return showConfirmSummary(user, ackPrefix);
  };

  // Try regex first (fast path, covers English "address to X" / "name: X" etc).
  // If nothing matches, fall through to the LLM classifier below for natural
  // prose in any language — "address ko Gulshan Iqbal kr do" / "cambia el
  // email a foo@bar.com" / "change name please to MyCo".
  //
  // Areas MUST be matched before services, because "Service areas: tariq"
  // otherwise fell into the services regex (the `are` in `areas` matched
  // the `are` alternation) and dumped the area list into services.
  const areasChange = originalText.match(/(?:service\s+)?areas?\s*(?:to|:|should be|are|change)\s*(.+)/i);
  // Services regex now requires a word boundary + non-"area" lookahead so
  // "Service areas" stops being mis-parsed as "Service" + "are" + "as...".
  const servicesChange = originalText.match(/\bservices?\b(?!\s+areas?)\s*(?:to|:|should be|are|change)\s*(.+)/i);
  const nameChange = originalText.match(/(?:business\s*)?name\s*(?:to|:|should be|is)\s*(.+)/i);
  const industryChange = originalText.match(/industry\s*(?:to|:|should be|is)\s*(.+)/i);
  const emailChange = originalText.match(/e-?mail\s*(?:to|:|should be|is)\s*(.+)/i);
  const phoneChange = originalText.match(/(?:phone|tel|mobile|number)\s*(?:to|:|should be|is)\s*(.+)/i);
  const addressChange = originalText.match(/(?:address|location|addr)\s*(?:to|:|should be|is)\s*(.+)/i);
  const contactChange = originalText.match(/contact\s*(?:to|:|should be|is)\s*(.+)/i);

  // Mutates wd in place for one field. Returns a short ack string like
  // "business name → *MyCo*" or null if the value wasn't applicable. Shared
  // by the single-edit and multi-edit paths below.
  const mutateWdForField = (field, value) => {
    const v = String(value || '').trim();
    if (!v) return null;
    switch (field) {
      case 'businessName':
      case 'name':
        wd.businessName = v;
        return `business name → *${wd.businessName}*`;
      case 'industry':
        wd.industry = v;
        return `industry → *${wd.industry}*`;
      case 'services':
        wd.services = v
          .split(/\s*,\s*|\s+(?:and|&|aur|y|et|und)\s+/i)
          .map((s) => s.trim())
          .filter(Boolean);
        return `services → *${wd.services.join(', ')}*`;
      case 'areas':
      case 'serviceAreas':
        wd.serviceAreas = v
          .split(/\s*,\s*|\s+(?:and|&|aur|y|et|und)\s+/i)
          .map((s) => s.trim())
          .filter(Boolean);
        return `service areas → *${wd.serviceAreas.join(', ')}*`;
      case 'email':
      case 'contactEmail': {
        const m = v.match(/[\w.-]+@[\w.-]+\.\w+/);
        wd.contactEmail = m ? m[0] : v;
        return `email → *${wd.contactEmail}*`;
      }
      case 'phone':
      case 'contactPhone':
        wd.contactPhone = v;
        return `phone → *${wd.contactPhone}*`;
      case 'address':
      case 'contactAddress':
        wd.contactAddress = v;
        return `address → *${wd.contactAddress}*`;
      case 'contact': {
        const parsed = parseContactFields(v);
        const applied = [];
        if (parsed.contactEmail) { wd.contactEmail = parsed.contactEmail; applied.push(`email → *${wd.contactEmail}*`); }
        if (parsed.contactPhone) { wd.contactPhone = parsed.contactPhone; applied.push(`phone → *${wd.contactPhone}*`); }
        if (parsed.contactAddress) { wd.contactAddress = parsed.contactAddress; applied.push(`address → *${wd.contactAddress}*`); }
        return applied.length ? applied.join('; ') : null;
      }
      default:
        return null;
    }
  };

  // Apply a single field, save, and re-show the summary. Used by the LLM
  // fallback path below (which only identifies one field at a time) and
  // for the industry→salon-flow special case.
  const applyFieldEdit = async (field, value) => {
    // Industry changing to a salon-ish value kicks off the salon-specific
    // wizard (services, hours, booking mode). Don't batch this with other
    // fields — the flow jump would be jarring mid-edit.
    if (field === 'industry') {
      const v = String(value || '').trim();
      if (!v) return null;
      wd.industry = v;
      const needsSalonFlow =
        isSalonIndustry(v) &&
        !wd.bookingMode &&
        (!Array.isArray(wd.salonServices) || wd.salonServices.length === 0);
      if (needsSalonFlow) {
        await updateUserMetadata(user.id, { websiteData: wd, salonFlowOrigin: 'CONFIRM' });
        user.metadata = { ...(user.metadata || {}), websiteData: wd };
        const txt = `Updated industry to *${v}* — a few quick salon-specific questions, then we'll build it.`;
        await sendTextMessage(user.phone_number, await localize(txt, user, originalText));
        return startSalonFlow(user);
      }
      return applyAndReshow(`Industry updated to *${wd.industry}*`);
    }
    const label = mutateWdForField(field, value);
    if (!label) return null;
    return applyAndReshow(label.charAt(0).toUpperCase() + label.slice(1));
  };

  // Collect ALL regex matches on the user's message, then apply them as a
  // batch. Previously each matcher `return`ed early on first hit, so a user
  // who wrote "Business name: X\nServices: Y" only got the name changed —
  // the services line was silently dropped. Dispatch order still matters
  // for disambiguation (areas before services so "Service areas:" doesn't
  // fall into the services matcher).
  const matches = [];
  if (areasChange) matches.push({ field: 'areas', value: areasChange[1] });
  if (nameChange) matches.push({ field: 'businessName', value: nameChange[1] });
  if (industryChange) matches.push({ field: 'industry', value: industryChange[1] });
  if (servicesChange) matches.push({ field: 'services', value: servicesChange[1] });
  if (emailChange) matches.push({ field: 'email', value: emailChange[1] });
  if (phoneChange) matches.push({ field: 'phone', value: phoneChange[1] });
  if (addressChange) matches.push({ field: 'address', value: addressChange[1] });
  if (contactChange) matches.push({ field: 'contact', value: contactChange[1] });

  // Industry-to-salon edge case (side-effect flow transition): only single-edit.
  const singleIndustrySalon =
    matches.length === 1 &&
    matches[0].field === 'industry' &&
    isSalonIndustry(matches[0].value) &&
    !wd.bookingMode &&
    (!Array.isArray(wd.salonServices) || wd.salonServices.length === 0);
  if (singleIndustrySalon) {
    const r = await applyFieldEdit(matches[0].field, matches[0].value);
    if (r !== null) return r;
  }

  if (matches.length > 0) {
    const labels = [];
    for (const m of matches) {
      const label = mutateWdForField(m.field, m.value);
      if (label) labels.push(label);
    }
    if (labels.length > 0) {
      const ackPrefix = labels.length === 1
        ? `✅ ${labels[0].charAt(0).toUpperCase() + labels[0].slice(1)}. Here's the updated summary:`
        : `✅ Updated ${labels.length} fields: ${labels.join('; ')}. Here's the updated summary:`;
      await updateUserMetadata(user.id, { websiteData: wd });
      user.metadata = { ...(user.metadata || {}), websiteData: wd };
      return showConfirmSummary(user, ackPrefix);
    }
  }

  // Regex didn't match. Try the LLM — catches natural prose in any language:
  // "address ko Gulshan Iqbal kr do" (Urdu), "cambia el email a X" (Spanish),
  // "change the name please to MyCo", etc.
  try {
    const prompt = `The user is reviewing a website-setup summary and may want to change ONE specific field. Identify which field (if any) and the exact new value they provided.

Fields: businessName, industry, services, areas, email, phone, address, contact

Rules:
- Extract only if the user is clearly asking to change/update/set a field.
- Understand any language: English, Roman Urdu, Urdu, Hindi, Spanish, Arabic, etc.
- Preserve emails / phone numbers / URLs / addresses exactly as written.
- Distinguish "services" (what the business DOES — e.g. plumbing, haircuts) from "areas" (where it operates — neighborhoods or cities). "Service areas" = areas, NOT services.
- For areas with multiple items, keep the whole comma/and-separated list as the value.
- If the user is NOT asking to change a field (e.g. they're saying "yes", "looks good", "cancel", a question, or something unrelated), return {"field": null}.

User said: "${originalText}"

Return JSON ONLY. Examples:
{"field": "address", "value": "Gulshan Iqbal, Karachi"}
{"field": "businessName", "value": "MyCo"}
{"field": "email", "value": "test@example.com"}
{"field": "services", "value": "Web design, SEO, Branding"}
{"field": "areas", "value": "Tariq Road, PECHS"}
{"field": null}`;

    const response = await generateResponse(
      prompt,
      [{ role: 'user', content: originalText }],
      { userId: user.id, operation: 'confirm_edit_classify' }
    );
    const m = (response || '').match(/\{[\s\S]*?\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      if (parsed.field && parsed.value) {
        const r = await applyFieldEdit(parsed.field, parsed.value);
        if (r !== null) return r;
      }
    }
  } catch (err) {
    logger.warn(`[WEBDEV-CONFIRM] Edit-intent LLM classify failed: ${err.message}`);
  }

  // Phase 12/13: before falling back to the edit-hint, check if the user
  // is actually trying to switch to a different service ("skip this, can
  // you make a chatbot?", "forget the website, do a logo instead", "i
  // need a logo and some ads too"). WEB_CONFIRM isn't in COLLECTION_STATES
  // so the router's menu-intent branch doesn't fire — we have to do the
  // flow-switch check here.
  //
  // Gate on EXPLICIT skip phrasing to avoid false positives — a message
  // like "add chatbot features to the site" should NOT jump to chatbot
  // mode, but "skip this, make a chatbot" should.
  const explicitSwitchRx = /\b(skip\s+(?:this|it|that)|forget\s+(?:this|it|that|the)|scrap\s+(?:this|it|that)|cancel\s+(?:this|it|that)|drop\s+(?:this|it|that)|nevermind|never\s*mind|instead\s*of|rather\s+than|nvm)\b/i;
  const hasExplicitSwitch = explicitSwitchRx.test(originalText);
  if (hasExplicitSwitch) {
    try {
      const { detectServiceQueue, startServiceQueue } = require('../serviceQueue');
      const queue = await detectServiceQueue(originalText, user.id);
      if (queue.length >= 2) {
        const { updateUserState } = require('../../db/users');
        await updateUserState(user.id, STATES.SERVICE_SELECTION);
        const newState = await startServiceQueue({ ...user, state: STATES.SERVICE_SELECTION }, queue);
        return newState || STATES.SERVICE_SELECTION;
      }

      const { pickServiceFromSwitch, handleServiceSelection } = require('./serviceSelection');
      const target = await pickServiceFromSwitch(originalText, user.id);
      if (target) {
        const { updateUserState } = require('../../db/users');
        await updateUserState(user.id, STATES.SERVICE_SELECTION);
        const newState = await handleServiceSelection(
          { ...user, state: STATES.SERVICE_SELECTION },
          { buttonId: target, listId: '', text: '', type: 'text' }
        );
        return newState || STATES.SERVICE_SELECTION;
      }
    } catch (err) {
      logger.warn(`[WEBDEV-CONFIRM] Flow-switch check failed: ${err.message}`);
    }
  }

  // Still nothing — ask the user to be more specific. Localize the hint.
  const fallback =
    'What would you like to change? You can say things like:\n\n' +
    '• "Name to MyBusiness"\n' +
    '• "Industry to Tech"\n' +
    '• "Services to Web Design, SEO, Branding"\n' +
    '• "Email to hello@example.com"\n' +
    '• "Phone to +1 555 123 4567"\n' +
    '• "Address to 123 Main St, City"\n\n' +
    'Or just reply *yes* to proceed with the current details.';
  await sendTextMessage(user.phone_number, await localize(fallback, user, originalText));
  return STATES.WEB_CONFIRM;
}

// Returns the user-facing page list for the template we just generated, so
// the "your site is ready" message matches reality instead of guessing
// "3-page site". Thank-you / thank-you-cma pages are excluded — they're
// utility pages not in the nav.
function describePages(industry, websiteData, templateId) {
  const { isHvac, isRealEstate } = require('../../website-gen/templates');
  const hasServices = Array.isArray(websiteData?.services) && websiteData.services.length > 0;
  if (isHvac(industry)) return ['Home', 'Services', 'Areas', 'About', 'Contact'];
  if (isRealEstate(industry)) return ['Home', 'Listings', 'Neighborhoods', 'About', 'Contact'];
  if (templateId === 'salon') {
    const pages = ['Home', 'Booking'];
    if (hasServices) pages.push('Services');
    pages.push('About', 'Contact');
    return pages;
  }
  // Generic business-starter
  const pages = ['Home'];
  if (hasServices) pages.push('Services');
  pages.push('About', 'Contact');
  return pages;
}

function joinWithAnd(items) {
  if (!items || items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

async function generateWebsite(user) {
  // Set state to GENERATING immediately to prevent duplicate builds
  const { updateUserState } = require('../../db/users');
  await updateUserState(user.id, STATES.WEB_GENERATING);
  // Stamp the start time so handleGenerating can detect a stuck build and
  // offer the user a way out instead of infinitely replying "Still generating…".
  await updateUserMetadata(user.id, { webGenStartedAt: new Date().toISOString() });

  try {
    const { generateWebsiteContent } = require('../../website-gen/generator');
    const { deployToNetlify } = require('../../website-gen/deployer');

    // Refresh user data to get full metadata
    logger.info(`[WEBGEN] Step 1/5: Fetching user data for ${user.phone_number}`);
    const { findOrCreateUser } = require('../../db/users');
    const freshUser = await findOrCreateUser(user.phone_number, user.channel, user.via_phone_number_id);
    const websiteData = freshUser.metadata?.websiteData || {};

    // Industry-matched default palette. getColorsForIndustry runs when
    // WEB_COLLECT_SERVICES or WEB_COLLECT_AGENT_PROFILE execute — but
    // those handlers are skipped entirely when the sales bot pre-seeds
    // services via TRIGGER_WEBSITE_DEMO. Without this fallback merge, a
    // plumbing / HVAC / realtor lead that came through sales chat would
    // reach the generator with no primaryColor/accentColor/secondaryColor,
    // and the template's buildTokens() would fall back to its own
    // defaults (which don't match the researched per-industry palettes).
    // Only sets colors the user hasn't explicitly overridden via revision.
    if (!websiteData.primaryColor || !websiteData.accentColor) {
      const industryPalette = getColorsForIndustry(websiteData.industry || '');
      if (!websiteData.primaryColor) websiteData.primaryColor = industryPalette.primaryColor;
      if (!websiteData.accentColor) websiteData.accentColor = industryPalette.accentColor;
      if (!websiteData.secondaryColor) websiteData.secondaryColor = industryPalette.secondaryColor;
      logger.info(`[WEBGEN] Applied industry palette for "${websiteData.industry}": ${JSON.stringify(industryPalette)}`);
    }

    logger.info(`[WEBGEN] User data loaded:`, {
      businessName: websiteData.businessName,
      industry: websiteData.industry,
      hasLogo: !!(websiteData.logoUrl || websiteData.logo),
      hasContact: !!(websiteData.contactEmail || websiteData.contactPhone),
    });

    // 1. Generate content with LLM
    const templateId = isSalonIndustry(websiteData.industry) ? 'salon' : 'business-starter';
    const siteId = freshUser.metadata?.currentSiteId;
    logger.info(`[WEBGEN] Step 2/5: Generating website content via LLM for "${websiteData.businessName}" (template=${templateId})`);

    // 1a. Create the activation Stripe link for this build. Website+domain
    // combined flow: the link amount = website price + domain price, and the
    // same URL is surfaced both on the preview banner and in chat. The
    // domain price was locked in during the WEB_DOMAIN_CHOICE step (stored
    // in user.metadata). A prior pending link (if any) gets auto-superseded
    // by createPaymentLink so the new combined link is the only one live.
    const websitePrice = parseInt(process.env.DEFAULT_ACTIVATION_PRICE || '199', 10);
    const domainPrice = parseInt(freshUser.metadata?.domainPrice || 0, 10);
    const selectedDomain = freshUser.metadata?.selectedDomain || null;
    const activationTotal = websitePrice + domainPrice;

    // Banner URL (for the site) uses the idempotent Pixie /pay/:id wrapper —
    // if someone re-clicks the banner after paying, they get an "already
    // paid" page instead of a second checkout.
    // Chat URL uses the raw Stripe link — customers expect to see a
    // recognizable buy.stripe.com URL in WhatsApp, and the chat link is
    // conceptually one-time-use (they click it once and pay).
    let bannerPaymentUrl = null;
    let chatPaymentUrl = null;
    try {
      const { createPaymentLink } = require('../../payments/stripe');

      const description = selectedDomain && domainPrice > 0
        ? `Website activation + domain ${selectedDomain} — ${websiteData.businessName || 'site'}`
        : selectedDomain
          ? `Website activation (DNS for ${selectedDomain}) — ${websiteData.businessName || 'site'}`
          : `Website activation — ${websiteData.businessName || 'site'}`;

      const linkResult = await createPaymentLink({
        userId: user.id,
        phoneNumber: user.phone_number,
        amount: activationTotal,
        serviceType: 'website',
        packageTier: 'activation',
        description,
        customerEmail: user.metadata?.email || websiteData.contactEmail || null,
        customerName: websiteData.businessName || null,
        websiteAmount: websitePrice,
        domainAmount: domainPrice,
        selectedDomain,
        originalAmount: activationTotal,
      });
      bannerPaymentUrl = linkResult?.pixieUrl || linkResult?.url || null;
      chatPaymentUrl = linkResult?.url || linkResult?.pixieUrl || null;
      logger.info(
        `[WEBGEN] Activation link created: $${activationTotal} ` +
          `(website $${websitePrice} + domain $${domainPrice} for ${selectedDomain || 'no domain'})`
      );
    } catch (err) {
      // Non-fatal — banner will fall back to a WhatsApp CTA if no link
      logger.warn(`[WEBGEN] Activation payment link setup failed: ${err.message}`);
    }
    const paymentLinkUrl = bannerPaymentUrl; // backwards-compat alias for the banner

    // Banner shows the same dollar figure the chat CTA charges. At initial
    // build there's no discount yet — originalAmount matches activationAmount
    // and discountPct is 0 until the 22h discount job fires.
    const siteConfig = await generateWebsiteContent(websiteData, {
      templateId,
      siteId,
      userId: user.id,
      paymentStatus: 'preview',
      paymentLinkUrl,
      activationAmount: activationTotal,
      originalAmount: activationTotal,
      discountPct: 0,
    });
    logger.info(`[WEBGEN] Content generated:`, {
      headline: siteConfig.headline,
      servicesCount: siteConfig.services?.length,
    });

    // 2. Deploy to Netlify
    logger.info(`[WEBGEN] Step 3/5: Deploying to Netlify...`);
    const { previewUrl, netlifySiteId, netlifySubdomain } = await deployToNetlify(siteConfig);
    logger.info(`[WEBGEN] Deployed successfully: ${previewUrl}`);

    // 3. Update site record
    logger.info(`[WEBGEN] Step 4/5: Updating site record in DB`);
    if (siteId) {
      const updateFields = {
        site_data: siteConfig,
        preview_url: previewUrl,
        netlify_site_id: netlifySiteId,
        netlify_subdomain: netlifySubdomain,
        status: 'preview',
        template_id: templateId,
      };
      // Salon: persist booking settings in dedicated columns so the booking API
      // can look them up by site_id without parsing site_data.
      if (templateId === 'salon') {
        updateFields.booking_mode = siteConfig.bookingMode || null;
        updateFields.booking_url = siteConfig.bookingUrl || null;
        updateFields.booking_settings = {
          timezone: siteConfig.timezone || null,
          instagramHandle: siteConfig.instagramHandle || null,
          weeklyHours: siteConfig.weeklyHours || null,
          slotMinutes: 30,
          services: siteConfig.salonServices || [],
        };
      }
      await updateSite(siteId, updateFields);
      logger.info(`[WEBGEN] Site record ${siteId} updated`);
    } else {
      logger.warn(`[WEBGEN] No currentSiteId found in user metadata - skipping DB update`);
    }

    // 4. Send preview link
    logger.info(`[WEBGEN] Step 5/5: Sending preview URL to user`);
    const pages = describePages(websiteData.industry, websiteData, templateId);
    const pageSummary = `${pages.length}-page site with ${joinWithAnd(pages)} pages`;
    await sendTextMessage(
      user.phone_number,
      `Your website is ready! Here's the preview:\n\n${previewUrl}\n\nHave a look - it's a ${pageSummary}.`
    );

    // Send the Stripe activation link as its own message so the user sees
    // the EXACT same URL in chat that the "Activate Now" button on the
    // site points to. One tap either way — same outcome. The total includes
    // the domain price if one was selected, so the chat CTA and the banner
    // always match.
    if (chatPaymentUrl) {
      const priceLine = domainPrice > 0 && selectedDomain
        ? `*$${activationTotal}* — $${websitePrice} website + $${domainPrice} for *${selectedDomain}*.`
        : selectedDomain
          ? `*$${activationTotal}* — I'll point *${selectedDomain}* at your new site right after payment.`
          : `*$${activationTotal}*.`;
      await sendTextMessage(
        user.phone_number,
        `🔒 *Preview mode.* ${priceLine}\n\nActivate to make it live and unlock the contact form:\n\n👉 ${chatPaymentUrl}\n\nSame checkout as the *Activate Now* button on your site.`
      );
      await logMessage(
        user.id,
        `Activation link sent (Stripe direct): $${activationTotal} (${selectedDomain || 'no domain'}) ${chatPaymentUrl}`,
        'assistant'
      );
    }

    await logMessage(user.id, `Website deployed: ${previewUrl}`, 'assistant');
    logger.info(`[WEBGEN] ✅ Complete! Preview sent to ${user.phone_number}: ${previewUrl}`);

    // Always go to revisions state — user can approve, request changes, or reject.
    // Tell them upfront how many free rounds of changes they get — surfacing
    // the cap here avoids the trust-breaking moment of discovering it only
    // after they've already hit the wall on revision #3.
    await sendTextMessage(
      user.phone_number,
      "There you go! Have a look and let me know what you think — want any changes, or are you happy with it?\n\n_You get *2 free rounds of revisions*; anything beyond that we'd handle as custom work from $200._"
    );
    await logMessage(user.id, 'Website preview sent, asking for feedback (with revision cap note)', 'assistant');

    return STATES.WEB_REVISIONS;
  } catch (error) {
    logger.error('[WEBGEN] ❌ Website generation failed:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      stack: error.stack,
    });

    await sendTextMessage(
      user.phone_number,
      '😔 Sorry, there was an issue generating your website. Our team has been notified.\n\n' +
        'Would you like to try again or chat with our team?'
    );
    await sendInteractiveButtons(user.phone_number, 'What would you like to do?', [
      { id: 'web_retry', title: '🔄 Try Again' },
      { id: 'svc_general', title: '💬 Chat with Us' },
    ]);
    await logMessage(user.id, 'Website generation failed', 'assistant');
    return STATES.WEB_GENERATION_FAILED;
  }
}

async function handleGenerating(user, message) {
  const text = (message.text || '').trim().toLowerCase();
  const startedAt = user.metadata?.webGenStartedAt;
  const ageMs = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;
  const STUCK_THRESHOLD_MS = 5 * 60 * 1000;
  const isStuck = ageMs > STUCK_THRESHOLD_MS;

  // Explicit user escape hatches: retry / cancel / reset. Let them out of the
  // "Still generating…" loop even if the build genuinely hung.
  if (/^(?:retry|try\s*again|reset|cancel|stuck|start\s*over)$/i.test(text) || isStuck) {
    logger.warn(
      `[WEBGEN] Recovering user ${user.phone_number} from stuck WEB_GENERATING (age=${Math.round(ageMs / 1000)}s, input="${text.slice(0, 30)}")`
    );
    await sendTextMessage(
      user.phone_number,
      isStuck
        ? "Looks like the build stalled — sorry about that. Want me to try again?"
        : "Cancelling the current build. Want me to try again, or go back to the details?"
    );
    await sendInteractiveButtons(user.phone_number, 'What would you like to do?', [
      { id: 'web_retry', title: '🔄 Try Again' },
      { id: 'svc_general', title: '💬 Chat with Us' },
    ]);
    await logMessage(user.id, `Recovered from stuck WEB_GENERATING (age=${Math.round(ageMs / 1000)}s)`, 'assistant');
    return STATES.WEB_GENERATION_FAILED;
  }

  await sendTextMessage(
    user.phone_number,
    `⏳ Still generating your website — hang tight. If this feels stuck, reply *retry* and I'll start over.`
  );
  return STATES.WEB_GENERATING;
}

async function handleGenerationFailed(user, message) {
  const buttonId = message.buttonId || '';

  // Route to general chat
  if (buttonId === 'svc_general') {
    await updateUserState(user.id, STATES.GENERAL_CHAT);
    const { handleGeneralChat } = require('./generalChat');
    return handleGeneralChat(user, message);
  }

  // Retry generation
  if (buttonId === 'web_retry') {
    await sendTextMessage(user.phone_number, '🔄 Let me try generating your website again...');
    return generateWebsite(user);
  }

  // Any other text - re-show the options
  await sendTextMessage(
    user.phone_number,
    '😔 Your website generation didn\'t complete. Would you like to try again?'
  );
  await sendInteractiveButtons(user.phone_number, 'What would you like to do?', [
    { id: 'web_retry', title: '🔄 Try Again' },
    { id: 'svc_general', title: '💬 Chat with Us' },
  ]);
  return STATES.WEB_GENERATION_FAILED;
}

async function handleRevisions(user, message) {
  const buttonId = message.buttonId || '';

  // Route svc_general to general chat (from error retry menu)
  if (buttonId === 'svc_general') {
    await updateUserState(user.id, STATES.GENERAL_CHAT);
    const { handleGeneralChat } = require('./generalChat');
    return handleGeneralChat(user, message);
  }

  if (buttonId === 'web_approve') {
    const siteId = user.metadata?.currentSiteId;
    if (siteId) await updateSite(siteId, { status: 'approved' });

    const example = domainExampleFor(user.metadata?.websiteData?.businessName);
    await sendTextMessage(
      user.phone_number,
      `🎉 *Awesome!* Your website is approved.\n\nWould you like to put it on your own custom domain? (e.g., ${example})\n\nReply *yes* and I'll help you find one, or *no* to skip it for now.`
    );
    await logMessage(user.id, 'Website approved, offering custom domain', 'assistant');
    return STATES.DOMAIN_OFFER;
  }

  if (buttonId === 'web_restart') {
    await sendTextMessage(user.phone_number, 'No problem! Let\'s start fresh.\n\nWhat\'s your business name?');
    await logMessage(user.id, 'Restarting website creation', 'assistant');
    return STATES.WEB_COLLECT_NAME;
  }

  if (buttonId === 'web_retry') {
    await sendTextMessage(user.phone_number, '🔄 Let me try generating your website again...');
    return generateWebsite(user);
  }

  // Handle revision requests via LLM
  if (buttonId === 'web_revise' || message.text) {
    let revisionText = message.text || 'I want to make changes';

    // Follow-up color answer: last turn we asked "which color?" and set
    // awaitingColor=true. If the user replied with a short color-ish
    // message ("blue", "#1E40AF", "navy", "dark green"), rewrite it
    // into an explicit FULL-PALETTE revision request so the LLM parser
    // catches all three of primaryColor/secondaryColor/accentColor at
    // once. A single-color primary swap leaves the old accent behind,
    // which clashes with the new palette; shipping a coherent designer
    // palette keeps the site professional even after recolors.
    if (user.metadata?.awaitingColor && message.text && message.text.trim().length <= 40) {
      const palette = resolveColorReply(message.text);
      if (palette) {
        const parts = [
          `change primaryColor to ${palette.primary}`,
          `secondaryColor to ${palette.secondary}`,
          `accentColor to ${palette.accent}`,
        ];
        if (palette.heroTextOverride) {
          parts.push(`and set heroTextOverride to ${palette.heroTextOverride}`);
        }
        revisionText = parts.join(', ');
        logger.info(`[WEBDEV-REVISE] awaitingColor resolved "${message.text.trim()}" → palette ${JSON.stringify(palette)}`);
      }
      // Clear the flag whether we parsed a color or not — if they gave us
      // a non-color reply ("nevermind", "actually change the headline"),
      // fall through to the normal parser and let it handle the pivot.
      await updateUserMetadata(user.id, { awaitingColor: false });
    }

    // Only process free text if a website was actually generated
    if (!buttonId) {
      const site = await getLatestSite(user.id);
      if (!site?.preview_url) {
        // No website generated yet - don't treat free text as revision/approval
        await sendTextMessage(
          user.phone_number,
          '🤔 I don\'t have a generated website for you yet. Would you like to start over?'
        );
        await sendInteractiveButtons(user.phone_number, 'What would you like to do?', [
          { id: 'web_restart', title: '🔄 Start Over' },
          { id: 'svc_general', title: '💬 Chat with Us' },
        ]);
        return STATES.WEB_REVISIONS;
      }

      // Short-circuit clear approval sentiment BEFORE running the heavy
      // REVISION_PARSER_PROMPT. "i love the website", "perfect hai", "sí
      // genial", etc. are unambiguous approvals — the revision parser has
      // been inconsistent about classifying them (returns _unclear for
      // sentiment it doesn't recognize). LLM classifier handles any
      // language without a keyword list. Gated at ≤80 chars so long
      // revision requests like "i love the website but change..." still
      // go through the full parser.
      if (revisionText.trim().length <= 80) {
        const approvalIntent = await classifyConfirmIntent(revisionText, user.id);
        if (approvalIntent === 'confirm') {
          const siteId = user.metadata?.currentSiteId;
          if (siteId) await updateSite(siteId, { status: 'approved' });

          const example = domainExampleFor(user.metadata?.websiteData?.businessName);
          await sendTextMessage(
            user.phone_number,
            await localize(
              `🎉 *Awesome!* Your website is approved.\n\nWould you like to put it on your own custom domain? (e.g., ${example})\n\nReply *yes* and I'll help you find one, or *no* to skip it for now.`,
              user,
              revisionText
            )
          );
          await logMessage(user.id, 'Website approved (sentiment classifier), offering custom domain', 'assistant');
          return STATES.DOMAIN_OFFER;
        }
      }
    }

    if (buttonId === 'web_revise') {
      await sendTextMessage(
        user.phone_number,
        '✏️ Sure! Tell me what you\'d like to change. For example:\n\n' +
          '• "Change the headline to..."\n' +
          '• "Make the color scheme warmer"\n' +
          '• "Add a testimonials section"\n' +
          '• "Update the about text"'
      );
      await logMessage(user.id, 'User wants revisions', 'assistant');
      return STATES.WEB_REVISIONS;
    }

    // Process the revision request — track revision count
    const revisionCount = (user.metadata?.revisionCount || 0) + 1;
    await updateUserMetadata(user.id, { revisionCount });

    // After 2 free revisions, assess complexity before proceeding
    if (revisionCount > 2) {
      try {
        const { generateResponse: classifyLLM } = require('../../llm/provider');
        const classifyResponse = await classifyLLM(
          `Classify this website revision request as LIGHT, MEDIUM, or HEAVY.\nLIGHT: color change, text edit, small tweaks\nMEDIUM: new section, layout change, significant content rewrite, font changes\nHEAVY: completely different design, major restructure, complex features, booking systems, e-commerce\nReturn ONLY one word: LIGHT, MEDIUM, or HEAVY.`,
          [{ role: 'user', content: revisionText }],
          { userId: user.id, operation: 'webdev_revision_complexity' }
        );
        const complexity = (classifyResponse || '').trim().toUpperCase();
        await updateUserMetadata(user.id, { lastRevisionComplexity: complexity });

        if (complexity === 'HEAVY') {
          await sendTextMessage(
            user.phone_number,
            "This sounds like a custom project — let me set you up with our design team so we can scope it out properly. Pricing is determined on the call based on what you need."
          );
          await sendCTAButton(
            user.phone_number,
            'Tap below to book a call with our team 👇',
            '📅 Book a Call',
            require('../../config/env').env.calendlyUrl
          );
          await logMessage(user.id, `Revision ${revisionCount} classified as HEAVY — sent to Calendly`, 'assistant');
          return STATES.SALES_CHAT;
        }

        if (complexity === 'MEDIUM' && !user.metadata?.bonusRevisionUsed) {
          // Allow one more free regeneration for medium changes
          await updateUserMetadata(user.id, { bonusRevisionUsed: true });
          await sendTextMessage(user.phone_number, "Let me apply those changes — this will be the last free revision round. After this, customization work starts at $200.");
          await logMessage(user.id, `Revision ${revisionCount} classified as MEDIUM — bonus revision used`, 'assistant');
          // Fall through to normal revision processing below
        } else if (complexity === 'MEDIUM' && user.metadata?.bonusRevisionUsed) {
          await sendTextMessage(
            user.phone_number,
            "For these kinds of changes, we'd need to do a custom build — that starts at $200 on top of the base price. Would you like to proceed, or would you prefer to hop on a call to discuss?"
          );
          await sendCTAButton(
            user.phone_number,
            'Or book a call to discuss the customization 👇',
            '📅 Book a Call',
            require('../../config/env').env.calendlyUrl
          );
          await logMessage(user.id, `Revision ${revisionCount} — bonus already used, pitched $200+ customization`, 'assistant');
          return STATES.SALES_CHAT;
        }
        // LIGHT changes continue to normal processing
      } catch (classifyErr) {
        logger.error('Revision classification failed:', classifyErr.message);
        // Fall through to normal processing on error
      }
    }

    try {
      const { generateResponse } = require('../../llm/provider');
      const { REVISION_PARSER_PROMPT } = require('../../llm/prompts');
      const { deployToNetlify } = require('../../website-gen/deployer');
      const { findOrCreateUser } = require('../../db/users');

      const freshUser = await findOrCreateUser(user.phone_number, user.channel, user.via_phone_number_id);
      const site = await getLatestSite(user.id);
      const currentConfig = site?.site_data || freshUser.metadata?.websiteData || {};

      const response = await generateResponse(
        REVISION_PARSER_PROMPT,
        [{ role: 'user', content: `Current config: ${JSON.stringify(currentConfig)}\n\nUser request: ${revisionText}` }],
        { userId: user.id, operation: 'webdev_revision_parse' }
      );

      let updates;
      try {
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, response];
        updates = JSON.parse(jsonMatch[1]);
      } catch {
        await sendTextMessage(
          user.phone_number,
          'I\'m not sure what to change. Could you be more specific? For example:\n' +
            '"Change the color to blue" or "Update headline to: Your New Headline"'
        );
        return STATES.WEB_REVISIONS;
      }

      // User is happy with the website - treat as approval → offer custom domain
      if (updates._approved) {
        const siteId = user.metadata?.currentSiteId;
        if (siteId) await updateSite(siteId, { status: 'approved' });

        const example = domainExampleFor(currentConfig?.businessName || user.metadata?.websiteData?.businessName);
        await sendTextMessage(
          user.phone_number,
          `🎉 *Awesome!* Your website is approved.\n\nWould you like to put it on your own custom domain? (e.g., ${example})\n\nReply *yes* and I'll help you find one, or *no* to skip it for now.`
        );
        await logMessage(user.id, 'Website approved, offering custom domain', 'assistant');
        return STATES.DOMAIN_OFFER;
      }

      if (updates._unclear) {
        // If the clarification question is specifically about colors, set a
        // follow-up flag so the NEXT user reply — which will likely be a
        // short answer like "blue" or "#1E40AF" — gets interpreted as a
        // color change without the LLM needing any extra context.
        const isColorQuestion = /colou?r/i.test(String(updates._message || ''));
        if (isColorQuestion) {
          await updateUserMetadata(user.id, { awaitingColor: true });
        }
        await sendTextMessage(user.phone_number, updates._message);
        return STATES.WEB_REVISIONS;
      }

      // Hero-image swap: intercept before the normal merge flow so we can
      // fetch a fresh Unsplash photo for the user's query and then fall
      // through to the standard deploy path with the new heroImage.
      if (updates._imageQuery !== undefined) {
        const query = String(updates._imageQuery || '').trim();
        if (!query) {
          await sendTextMessage(
            user.phone_number,
            "Sure — what should the new hero image show? A short description works best (e.g. *coffee shop interior*, *city skyline at night*, *happy dentist*)."
          );
          // Don't consume a revision for just asking the clarifying question
          await updateUserMetadata(user.id, { revisionCount: Math.max(0, revisionCount - 1) });
          return STATES.WEB_REVISIONS;
        }

        await sendTextMessage(user.phone_number, `Looking for a hero image of *${query}*...`);

        const { getHeroImage } = require('../../website-gen/heroImage');
        let newHero = null;
        try {
          newHero = await getHeroImage(query);
        } catch (imgErr) {
          logger.warn(`[WEB_REVISIONS] Hero image fetch threw for "${query}": ${imgErr.message}`);
        }

        if (!newHero || !newHero.url) {
          await sendTextMessage(
            user.phone_number,
            `Couldn't find a good image for *${query}*. Try a different description — something specific like a scene, object, or setting.`
          );
          // Don't consume a revision on a failed lookup
          await updateUserMetadata(user.id, { revisionCount: Math.max(0, revisionCount - 1) });
          return STATES.WEB_REVISIONS;
        }

        updates = { heroImage: newHero };
      }

      // Merge updates and redeploy to the SAME site
      const updatedConfig = { ...currentConfig, ...updates };

      // Pick a natural-sounding "working on it" message that varies each
      // time so the bot doesn't feel like a stuck script. Same for the
      // done message, which also references what changed when it's a
      // single obvious field (color, services, etc.).
      const workingVariants = [
        'on it — updating the site now...',
        'got it, pushing the update...',
        'sure thing, rebuilding now...',
        'one sec, applying that...',
        'alright, redeploying...',
        'okay, regenerating the site...',
        'doing it now, gimme a few seconds...',
      ];
      await sendTextMessage(
        user.phone_number,
        workingVariants[Math.floor(Math.random() * workingVariants.length)]
      );

      const existingSiteId = site?.netlify_site_id || null;
      const { previewUrl, netlifySiteId, netlifySubdomain } = await deployToNetlify(updatedConfig, existingSiteId);

      if (site) {
        await updateSite(site.id, { site_data: updatedConfig, preview_url: previewUrl, netlify_site_id: netlifySiteId, netlify_subdomain: netlifySubdomain });
      }

      // Describe what actually changed in human terms so the follow-up
      // doesn't always read the same.
      const changedKeys = Object.keys(updates || {});
      let changeHint = '';
      if (changedKeys.length === 1) {
        const k = changedKeys[0];
        if (k === 'primaryColor' || k === 'secondaryColor' || k === 'accentColor') changeHint = 'new colour is in';
        else if (k === 'services') changeHint = 'services updated';
        else if (k === 'headline') changeHint = 'new headline is in';
        else if (k === 'tagline') changeHint = 'tagline updated';
        else if (k === 'businessName') changeHint = 'name updated';
        else if (k === 'testimonials') changeHint = 'testimonials updated';
        else if (k === 'faq') changeHint = 'FAQs updated';
        else if (k === 'aboutText' || k === 'aboutTitle') changeHint = 'about section updated';
        else if (k === 'contactEmail' || k === 'contactPhone' || k === 'contactAddress') changeHint = 'contact info updated';
        else if (k === 'heroImage') changeHint = 'new hero image is in';
      }
      const doneVariants = changeHint
        ? [
            `done, ${changeHint} — have a look:\n${previewUrl}`,
            `${changeHint} — refresh to see it:\n${previewUrl}`,
            `${changeHint.charAt(0).toUpperCase() + changeHint.slice(1)}. Fresh version:\n${previewUrl}`,
            `all set, ${changeHint}:\n${previewUrl}`,
          ]
        : [
            `done — take another look:\n${previewUrl}`,
            `updated, refresh to see it:\n${previewUrl}`,
            `all good, fresh version:\n${previewUrl}`,
            `new version is live:\n${previewUrl}`,
            `redeploy's done — have a look:\n${previewUrl}`,
          ];
      await sendTextMessage(
        user.phone_number,
        doneVariants[Math.floor(Math.random() * doneVariants.length)]
      );

      await logMessage(user.id, `Revision applied, redeployed: ${previewUrl}`, 'assistant');
      return STATES.WEB_REVISIONS;
    } catch (error) {
      logger.error('Revision failed:', error);
      await sendTextMessage(
        user.phone_number,
        '😔 Sorry, I had trouble applying that change. Could you try rephrasing your request?'
      );
      return STATES.WEB_REVISIONS;
    }
  }

  return STATES.WEB_REVISIONS;
}

// ─── DOMAIN CHOICE (pre-build) ─────────────────────────────────────
// After WEB_CONFIRM approval, we ask about the domain BEFORE building the
// site. The domain price gets folded into the activation Stripe link so
// the preview banner and the chat CTA are always in sync.
//
// Three branches:
//   "new" / "yes"  → Namecheap search → user picks one → generate
//   "own" / "have" → collect their existing domain   → generate
//   "skip" / "no"  → skip, no domain                 → generate

const { checkDomainAvailability } = require('../../website-gen/domainChecker');

async function askDomainChoice(user) {
  const { updateUserState } = require('../../db/users');
  await updateUserState(user.id, STATES.WEB_DOMAIN_CHOICE);

  const businessName = user.metadata?.websiteData?.businessName || '';
  const sanitized = businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const example = sanitized && sanitized.length >= 2 ? `${sanitized}.com` : 'yourbusiness.com';

  await sendTextMessage(
    user.phone_number,
    await localize(
      `Before I build — what do you want to do about a domain?\n\n` +
        `• *new* — I'll find one for you (e.g. ${example})\n` +
        `• *own* — you already have a domain\n` +
        `• *skip* — just host it on a free preview URL for now`,
      user
    )
  );
  await logMessage(user.id, 'Asking domain choice (new/own/skip)', 'assistant');
  return STATES.WEB_DOMAIN_CHOICE;
}

async function handleDomainChoice(user, message) {
  const raw = (message.text || '').trim();
  const text = raw.toLowerCase();

  // Skip path — no domain.
  if (/^(skip|no|nope|nah|later|pass|not now|maybe later)$/i.test(text)) {
    await updateUserMetadata(user.id, {
      domainChoice: 'skip',
      selectedDomain: null,
      domainPrice: 0,
    });
    await sendTextMessage(
      user.phone_number,
      await localize("No problem — going straight to building.", user, raw)
    );
    await logMessage(user.id, 'Domain choice: skip', 'assistant');
    return generateWebsite(user);
  }

  // "I already own one" path.
  if (/^(own|have|mine|my|i\s*(?:have|own))\b/i.test(text)) {
    await updateUserMetadata(user.id, { domainChoice: 'own' });
    const { updateUserState } = require('../../db/users');
    await updateUserState(user.id, STATES.WEB_DOMAIN_OWN_INPUT);
    await sendTextMessage(
      user.phone_number,
      await localize("Great — what's your domain? (e.g. glowstudio.com)", user, raw)
    );
    return STATES.WEB_DOMAIN_OWN_INPUT;
  }

  // "Find one" path.
  if (/^(new|yes|yeah|yep|sure|ok|okay|find|search|look|help)\b/i.test(text)) {
    const businessName = user.metadata?.websiteData?.businessName || '';
    const sanitized = businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
    await updateUserMetadata(user.id, { domainChoice: 'need' });

    if (sanitized && sanitized.length >= 2) {
      return runDomainSearchInline(user, sanitized);
    }
    const { updateUserState } = require('../../db/users');
    await updateUserState(user.id, STATES.WEB_DOMAIN_SEARCH);
    await sendTextMessage(
      user.phone_number,
      await localize("What name should I search for? (e.g. mybusiness)", user, raw)
    );
    return STATES.WEB_DOMAIN_SEARCH;
  }

  // Full domain typed — treat as "own".
  const fullMatch = raw.match(/([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/i);
  if (fullMatch) {
    return saveOwnDomain(user, fullMatch[1].toLowerCase());
  }

  // Plausible single-word name with no spaces → treat as search term.
  const cleaned = text.replace(/[^a-z0-9-]/g, '');
  if (!/\s/.test(raw) && cleaned.length >= 2 && cleaned.length <= 30) {
    await updateUserMetadata(user.id, { domainChoice: 'need' });
    return runDomainSearchInline(user, cleaned);
  }

  // Fallback — reprompt.
  await sendTextMessage(
    user.phone_number,
    await localize(
      "Just reply *new*, *own*, or *skip* — or type the domain you want.",
      user,
      raw
    )
  );
  return STATES.WEB_DOMAIN_CHOICE;
}

async function handleDomainOwnInput(user, message) {
  const raw = (message.text || '').trim();
  const text = raw.toLowerCase();

  // Exit — user changed their mind.
  if (/^(skip|cancel|back|never\s*mind|nvm|forget\s*it)$/i.test(text)) {
    await updateUserMetadata(user.id, {
      domainChoice: 'skip',
      selectedDomain: null,
      domainPrice: 0,
    });
    await sendTextMessage(
      user.phone_number,
      await localize("All good — skipping the domain and building now.", user, raw)
    );
    return generateWebsite(user);
  }

  // Validate domain format.
  const match = raw.match(/([a-z0-9][a-z0-9-]*\.[a-z]{2,}(?:\.[a-z]{2,})?)/i);
  if (match) {
    return saveOwnDomain(user, match[1].toLowerCase());
  }

  await sendTextMessage(
    user.phone_number,
    await localize(
      "Doesn't look like a domain. Try something like *glowstudio.com* — or reply *skip*.",
      user,
      raw
    )
  );
  return STATES.WEB_DOMAIN_OWN_INPUT;
}

async function saveOwnDomain(user, domain) {
  await updateUserMetadata(user.id, {
    domainChoice: 'own',
    selectedDomain: domain,
    domainPrice: 0, // Already owned — no registration charge.
  });
  await sendTextMessage(
    user.phone_number,
    await localize(
      `Got it — *${domain}*. After payment I'll send DNS instructions so you can point it at your new site. Building now...`,
      user
    )
  );
  await logMessage(user.id, `Domain choice: own (${domain})`, 'assistant');
  return generateWebsite(user);
}

async function handleDomainSearch(user, message) {
  const raw = (message.text || '').trim();
  const text = raw.toLowerCase();

  // Exit phrases — bail out of domain flow, build with no domain.
  if (/\b(skip|nah|nope|forget\s*it|never\s*mind|nvm|not\s*now|cancel|stop|exit|back|no\s*thanks?)\b/i.test(text) &&
      !/[\w-]+\.[a-z]{2,}/i.test(raw)) {
    await updateUserMetadata(user.id, {
      domainChoice: 'skip',
      selectedDomain: null,
      domainPrice: 0,
    });
    await sendTextMessage(
      user.phone_number,
      await localize("No problem — skipping domain and building now.", user, raw)
    );
    return generateWebsite(user);
  }

  const domainOptions = user.metadata?.domainOptions || [];

  // Pick by number.
  const numMatch = text.match(/^(\d+)$/);
  if (numMatch && domainOptions.length > 0) {
    const idx = parseInt(numMatch[1], 10) - 1;
    if (idx >= 0 && idx < domainOptions.length &&
        domainOptions[idx].available && !domainOptions[idx].premium) {
      return selectDomainInline(user, domainOptions[idx]);
    }
    await sendTextMessage(
      user.phone_number,
      await localize("That one's not available. Try another number or a new name.", user, raw)
    );
    return STATES.WEB_DOMAIN_SEARCH;
  }

  // Pick by ordinal word.
  const ordinalMap = { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2, fourth: 3, '4th': 3, fifth: 4, '5th': 4 };
  const ordMatch = text.match(/\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th)\b/);
  if (ordMatch && domainOptions.length > 0) {
    const idx = ordinalMap[ordMatch[1]];
    if (idx !== undefined && idx < domainOptions.length &&
        domainOptions[idx].available && !domainOptions[idx].premium) {
      return selectDomainInline(user, domainOptions[idx]);
    }
  }

  // Full domain typed (e.g. "mybiz.ai"). Two sub-cases:
  //   1. Already in the current options list → pick it.
  //   2. Not in options → do a targeted single-domain lookup so we can
  //      show the real price for the exact TLD they asked for (previously
  //      we stripped the TLD and re-searched the default list, which was
  //      the "user typed .ai, got same .com/.co/.io list again" bug).
  const fullMatch = raw.match(/([a-z0-9-]+\.[a-z]{2,})/i);
  if (fullMatch) {
    const typedDomain = fullMatch[1].toLowerCase();
    const fromOptions = domainOptions.find(d => d.domain.toLowerCase() === typedDomain);
    if (fromOptions && fromOptions.available && !fromOptions.premium) {
      return selectDomainInline(user, fromOptions);
    }
    return runSpecificDomainLookup(user, typedDomain);
  }

  // New base name for search.
  const cleaned = text.replace(/[^a-z0-9-]/g, '');
  if (cleaned.length >= 2 && cleaned.length <= 30 && !/\s/.test(raw)) {
    return runDomainSearchInline(user, cleaned);
  }

  await sendTextMessage(
    user.phone_number,
    await localize(
      "Reply with the *number* of a domain above, or type a new name to search again.",
      user,
      raw
    )
  );
  return STATES.WEB_DOMAIN_SEARCH;
}

// Widened TLD pool for default searches. We query all of these in one
// Namecheap/NameSilo call, then filter to affordable results and show the
// 5 best. Skews toward recognizable + cheap — avoids quoting a $95 .ai
// or $50 .tech in the suggestion list.
const DEFAULT_TLD_POOL = [
  'com', 'co', 'net', 'org', 'app',
  'dev', 'xyz', 'shop', 'store', 'me',
  'biz', 'info',
];
const MAX_PRICE_USD = 25;
const MAX_RESULTS = 5;
// .com gets priority — most recognizable to customers. Remaining slots
// filled by cheapest alternatives under the price cap.
const PRIORITY_TLDS = ['com', 'net', 'org', 'co'];

/**
 * Rank + trim results:
 *   1. Drop unavailable, premium, or over-priced.
 *   2. Surface .com first if available (most recognizable).
 *   3. Fill remaining slots with cheapest alternatives.
 */
function pickTopDomains(results) {
  const affordable = results.filter(
    (r) =>
      r.available &&
      !r.premium &&
      r.price &&
      parseFloat(r.price) > 0 &&
      parseFloat(r.price) <= MAX_PRICE_USD
  );
  if (affordable.length === 0) return [];

  const tldOf = (d) => (d.domain.split('.').pop() || '').toLowerCase();

  // Bucket priority TLDs in their fixed order, then sort the rest by price.
  const priority = [];
  for (const p of PRIORITY_TLDS) {
    const hit = affordable.find((r) => tldOf(r) === p);
    if (hit) priority.push(hit);
  }
  const rest = affordable
    .filter((r) => !PRIORITY_TLDS.includes(tldOf(r)))
    .sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

  return [...priority, ...rest].slice(0, MAX_RESULTS);
}

/**
 * Ask the LLM for 5 similar-but-distinct base names when the user's first
 * choice is taken. Constrained to: close to the original (suffixes,
 * related terms, industry words), short, domain-safe. Not random.
 *
 * Returns up to 5 affordable available rows (≤$25), same shape as
 * checkDomainAvailability results — callers drop them straight into the
 * domainOptions list.
 */
async function findAlternativeDomains(baseName, industry) {
  const prompt =
    `The business wants a domain but "${baseName}" is taken across common TLDs.\n` +
    `Business context: "${baseName}"${industry ? ` — ${industry}` : ''}.\n\n` +
    `Suggest 5 DOMAIN-SAFE alternative base names that are:\n` +
    `- Similar to the original (suffixes like "co", "hq", "pro", "hub", or ` +
    `industry-adjacent words)\n` +
    `- NOT random or unrelated — a human should recognize they belong to the ` +
    `same business\n` +
    `- Lowercase, alphanumeric only (no hyphens, no spaces, no dots)\n` +
    `- Between 4 and 20 characters each\n` +
    `- Distinct from each other\n\n` +
    `Return ONLY the 5 names, one per line, nothing else.\n\n` +
    `Example — for "glowstudio" (salon): glowstudioco, trulyglow, glowbeauty, ` +
    `glowsalon, glowbar`;

  let raw;
  try {
    raw = await generateResponse(
      'You are a domain naming consultant. Keep suggestions close to the brand.',
      [{ role: 'user', content: prompt }],
      { operation: 'domain_alternatives' }
    );
  } catch (err) {
    logger.warn(`[WEBDEV-DOMAIN] LLM alternatives call failed: ${err.message}`);
    return [];
  }

  const candidates = String(raw || '')
    .split(/\r?\n/)
    .map((s) => s.trim().toLowerCase())
    .map((s) => s.replace(/^[\d\.\-\*\)\s]+/, '')) // strip numbering/bullets
    .map((s) => s.replace(/[^a-z0-9]/g, ''))
    .filter((s) => s.length >= 4 && s.length <= 20)
    .filter((s) => s !== baseName.toLowerCase())
    .slice(0, 5);

  if (candidates.length === 0) {
    logger.warn(`[WEBDEV-DOMAIN] LLM returned no usable alternatives for ${baseName}`);
    return [];
  }

  // Query each candidate × top 3 priority TLDs in one batch call.
  const domains = [];
  for (const c of candidates) {
    for (const t of ['com', 'net', 'co']) {
      domains.push(`${c}.${t}`);
    }
  }

  let rows;
  try {
    const namesilo = require('../../integrations/namesilo');
    rows = await namesilo.checkDomainsExact(domains);
  } catch (err) {
    logger.warn(`[WEBDEV-DOMAIN] Batch lookup for alternatives failed: ${err.message}`);
    return [];
  }

  // Filter to affordable + available, prefer .com within each suggestion,
  // cap at 5 total.
  const affordable = rows.filter(
    (r) =>
      r.available &&
      !r.premium &&
      r.price &&
      parseFloat(r.price) > 0 &&
      parseFloat(r.price) <= MAX_PRICE_USD
  );

  // Group by base name, pick cheapest TLD for each, then flatten.
  const byBase = new Map();
  for (const r of affordable) {
    const base = r.domain.split('.')[0];
    const cur = byBase.get(base);
    if (!cur || parseFloat(r.price) < parseFloat(cur.price)) {
      byBase.set(base, r);
    }
  }

  logger.info(
    `[WEBDEV-DOMAIN] LLM alternatives for "${baseName}": ` +
      `candidates=[${candidates.join(',')}], affordable=${byBase.size}`
  );

  // Preserve LLM's ordering (most recommended first).
  const result = [];
  for (const c of candidates) {
    if (byBase.has(c)) result.push(byBase.get(c));
  }
  return result.slice(0, 5);
}

async function runDomainSearchInline(user, baseName) {
  const { updateUserState } = require('../../db/users');
  await updateUserState(user.id, STATES.WEB_DOMAIN_SEARCH);
  await sendTextMessage(
    user.phone_number,
    await localize(`Checking domain availability for *${baseName}*...`, user)
  );

  let results = [];
  try {
    results = await checkDomainAvailability(baseName, DEFAULT_TLD_POOL);
  } catch (err) {
    logger.error(`[WEBDEV-DOMAIN] search failed: ${err.message} (code=${err.code || 'unknown'})`);

    // DomainLookupUnavailable = registrar API is down or returned no prices.
    // We REFUSE to quote a made-up price, so the only sane options are
    // "use a domain you already own" or "skip for now". Route back to
    // WEB_DOMAIN_CHOICE so both paths are available in a single prompt.
    if (err.code === 'DOMAIN_LOOKUP_UNAVAILABLE') {
      const { updateUserState } = require('../../db/users');
      await updateUserState(user.id, STATES.WEB_DOMAIN_CHOICE);
      await sendTextMessage(
        user.phone_number,
        await localize(
          "Our domain registrar is temporarily unreachable so I can't pull live prices right now.\n\n" +
            "I don't want to quote a price we can't honor — two options:\n\n" +
            "• *own* — use a domain you already own (just needs DNS pointing after payment)\n" +
            "• *skip* — launch on the free preview URL for now, add a domain anytime",
          user
        )
      );
      return STATES.WEB_DOMAIN_CHOICE;
    }

    // Generic failure (network blip) — let user retry with a different name.
    await sendTextMessage(
      user.phone_number,
      await localize(
        "Couldn't reach the registrar right now. Try a different name, or reply *skip* / *own* to proceed without a new domain.",
        user
      )
    );
    return STATES.WEB_DOMAIN_SEARCH;
  }

  // Filter → rank → top 5 (≤ $25, prefer .com).
  let top = pickTopDomains(results);

  // Nothing affordable under the original base name — ask the LLM for 5
  // similar-but-distinct alternatives and search those. Keeps the UX
  // forward-moving instead of a dead "nothing available" message.
  if (top.length === 0) {
    await sendTextMessage(
      user.phone_number,
      await localize(
        `*${baseName}* is all taken. Let me find you something close…`,
        user
      )
    );
    const industry = user.metadata?.websiteData?.industry || '';
    top = await findAlternativeDomains(baseName, industry);

    if (top.length === 0) {
      await sendTextMessage(
        user.phone_number,
        await localize(
          `Couldn't find good alternatives either. Try typing a different base name, or reply *skip*.`,
          user
        )
      );
      await updateUserMetadata(user.id, { domainOptions: [], domainSearchName: baseName });
      return STATES.WEB_DOMAIN_SEARCH;
    }
  }

  let msg = '*Available domains:*\n\n';
  top.forEach((r, i) => {
    msg += `${i + 1}. ✅ ${r.domain} — $${r.price}/yr\n`;
  });
  msg += '\nReply with a *number* to pick one, or type a specific domain (e.g. *mybiz.ai*) and I\'ll look up its price. Or *skip*.';

  await sendTextMessage(user.phone_number, await localize(msg, user));
  // Save only the top 5 to domainOptions — that's the list the user sees
  // and can reference by number. Keeps index math consistent.
  await updateUserMetadata(user.id, {
    domainOptions: top,
    domainSearchName: baseName,
  });
  await logMessage(
    user.id,
    `Domain search: ${top.map((r) => r.domain + '@$' + r.price).join(', ')}`,
    'assistant'
  );
  return STATES.WEB_DOMAIN_SEARCH;
}

/**
 * Targeted lookup for a specific full domain the user typed (e.g. they
 * want anshplumbing.ai even though .ai wasn't in the default list). We
 * hit NameSilo for just that one domain, show its real price (no $25 cap
 * because they asked for it explicitly), and let them confirm or back
 * out to the main list.
 *
 * Replaces the old "strip the TLD and re-search the default 5" behavior
 * which silently ignored what the user asked for.
 */
async function runSpecificDomainLookup(user, domain) {
  const { updateUserState } = require('../../db/users');
  await updateUserState(user.id, STATES.WEB_DOMAIN_SEARCH);
  await sendTextMessage(
    user.phone_number,
    await localize(`Checking *${domain}*...`, user)
  );

  let result;
  try {
    const namesilo = require('../../integrations/namesilo');
    result = await namesilo.checkSingleDomain(domain);
  } catch (err) {
    logger.error(`[WEBDEV-DOMAIN] specific lookup failed for ${domain}: ${err.message}`);
    await sendTextMessage(
      user.phone_number,
      await localize(
        `Couldn't check *${domain}* right now. Try a different domain or reply *skip*.`,
        user
      )
    );
    return STATES.WEB_DOMAIN_SEARCH;
  }

  if (!result || !result.available) {
    await sendTextMessage(
      user.phone_number,
      await localize(
        `*${domain}* isn't available. Pick one from the list above, or try a different name.`,
        user
      )
    );
    return STATES.WEB_DOMAIN_SEARCH;
  }

  if (result.premium) {
    await sendTextMessage(
      user.phone_number,
      await localize(
        `*${domain}* is a premium domain — I can't auto-register those. Pick from the list above or try a different name.`,
        user
      )
    );
    return STATES.WEB_DOMAIN_SEARCH;
  }

  // Replace the domainOptions list with just this single domain at index 1
  // so the user can confirm by typing "1" or "yes" (existing handler picks
  // option[0] on "first"/"1"). Previous list options become stale — that's
  // fine, user explicitly pivoted to this specific domain.
  const price = parseFloat(result.price) || 0;
  const singleOption = {
    domain: result.domain,
    available: true,
    premium: false,
    price: price.toFixed(2),
  };
  await updateUserMetadata(user.id, {
    domainOptions: [singleOption],
    domainSearchName: domain,
  });

  const expensiveNote = price > MAX_PRICE_USD
    ? `\n\n_Heads up — this one's pricier than our typical suggestions (usually ≤$${MAX_PRICE_USD}/yr), but it's what you asked for._`
    : '';

  await sendTextMessage(
    user.phone_number,
    await localize(
      `1. ✅ *${result.domain}* — *$${price.toFixed(2)}/yr*${expensiveNote}\n\n` +
        `Reply *yes* (or *1*) to pick it, type a different domain, or *skip*.`,
      user
    )
  );
  await logMessage(user.id, `Specific domain lookup: ${result.domain} @ $${price}`, 'assistant');
  return STATES.WEB_DOMAIN_SEARCH;
}

async function selectDomainInline(user, option) {
  const price = option.price ? parseFloat(option.price) : 0;
  await updateUserMetadata(user.id, {
    domainChoice: 'need',
    selectedDomain: option.domain.toLowerCase(),
    domainPrice: Math.ceil(price), // whole USD — Namecheap returns 12.88 etc.
  });
  await sendTextMessage(
    user.phone_number,
    await localize(
      `Locked in *${option.domain}* — $${Math.ceil(price)}/yr. Building your site now…`,
      user
    )
  );
  await logMessage(
    user.id,
    `Domain selected: ${option.domain} ($${Math.ceil(price)}/yr)`,
    'assistant'
  );
  return generateWebsite(user);
}

/**
 * Cross-flow entry (Phase 11 / Phase 12). Start or RESUME the webdev flow,
 * honoring any shared business context already accumulated (from a previous
 * webdev attempt OR from the cross-flow pool populated by other flows).
 *
 * - Fresh user (no businessName): standard "what's your business name?" opener.
 * - Returning user with partial webdev progress OR carryover from another
 *   flow: acknowledge what we already have and jump to the first missing
 *   step via nextMissingWebDevState — so a user who switched to logo/ads
 *   and came back doesn't get re-asked for data they already provided.
 *
 * Called by serviceSelection.js (direct menu tap / flow-switch target) and
 * serviceQueue.js (queue advance).
 */
async function startWebdevFlow(user) {
  const { getSharedBusinessContext } = require('../entityAccumulator');
  const shared = getSharedBusinessContext(user);

  if (!shared.businessName) {
    await sendWithMenuButton(
      user.phone_number,
      '🌐 *Website Development*\n\n' +
        "I'll help you create a professional website! I just need a few details about your business.\n\n" +
        "First, what's your *business name*?"
    );
    await logMessage(user.id, 'Starting website development flow', 'assistant');
    return STATES.WEB_COLLECT_NAME;
  }

  // Resume — figure out the first missing field and ask that, acknowledging
  // what we already have so the user knows we didn't forget.
  const wd = user.metadata?.websiteData || {};
  const nextState = nextMissingWebDevState(wd, user.metadata || {}) || STATES.WEB_CONFIRM;

  if (nextState === STATES.WEB_CONFIRM) {
    // Everything's already collected — jump to the confirm summary.
    await logMessage(user.id, `Resuming webdev with full context, showing confirm`, 'assistant');
    return showConfirmSummary(user);
  }

  const question = questionForState(nextState, wd);
  const ctxLines = [];
  if (shared.businessName) ctxLines.push(`*${shared.businessName}*`);
  if (shared.industry) ctxLines.push(`_${shared.industry}_`);
  const carriedNote = ctxLines.length ? `Picking up with ${ctxLines.join(' · ')}.\n\n` : '';

  await sendWithMenuButton(
    user.phone_number,
    `🌐 *Website Development*\n\n${carriedNote}${question}`
  );
  await logMessage(
    user.id,
    `Resuming webdev at ${nextState} (name=${shared.businessName}, industry=${shared.industry || 'none'})`,
    'assistant'
  );
  return nextState;
}

module.exports = {
  handleWebDev,
  handleGenerationFailed,
  // Exposed so salesBot can pre-seed webdev fields from its trigger tag and
  // route to the correct next step instead of always asking for industry first.
  nextMissingWebDevState,
  questionForState,
  isSalonIndustry,
  startSalonFlow,
  startWebdevFlow,
  showConfirmSummary,
};
