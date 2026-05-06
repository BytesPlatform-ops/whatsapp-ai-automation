const {
  sendTextMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  sendCTAButton,
  sendWithMenuButton,
} = require('../../messages/sender');
const { logMessage, getConversationHistory } = require('../../db/conversations');
const { updateUserMetadata, updateUserState } = require('../../db/users');
const { createSite, updateSite, getLatestSite } = require('../../db/sites');
const { checkSiteCreationAllowed, formatTimeUntil } = require('../../db/siteRateLimit');
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
const { normalizeBusinessName } = require('../../utils/normalizeName');
const { classifySideChannelInCollection } = require('../sideChannel');

/**
 * Shared collection-state helper: when a state-specific extractor concludes
 * the user's reply isn't a clean answer to the current question, run the
 * LLM side-channel classifier and apply any cross-field update it detects
 * (service add, name change, industry change, contact update, question).
 *
 * Returns { ackPart, side } when an update was applied — caller should
 * combine ackPart with a re-ask of the current question (in the user's
 * language via localize) and stay in the current state. Returns null
 * when no side-channel update was detected — caller should fall back to
 * its normal "I didn't catch that" re-ask (also via localize).
 *
 * Centralizing this keeps every collection handler's side-channel
 * behavior identical — appending a service ack, persisting the patch,
 * etc. — instead of each handler reimplementing the same five branches.
 */
async function tryApplySideChannel(user, currentField, userText) {
  let side;
  try {
    side = await classifySideChannelInCollection({
      currentField,
      userText,
      websiteData: user.metadata?.websiteData || {},
      userId: user.id,
    });
  } catch (err) {
    logger.warn(`[WEBDEV-SIDECHANNEL] classify failed (${currentField}): ${err.message}`);
    return null;
  }
  if (!side || !side.kind || side.kind === 'unclear') return null;

  const before = user.metadata?.websiteData || {};
  let patch = before;
  let ackPart = null;

  if (side.kind === 'service_add' && Array.isArray(side.services) && side.services.length > 0) {
    const existing = Array.isArray(before.services) ? before.services : [];
    patch = { ...before, services: [...existing, ...side.services] };
    ackPart = `Got it — added *${side.services.join(', ')}* to your services.`;
  } else if (side.kind === 'name_change' && side.value) {
    const normalized = normalizeBusinessName(side.value);
    patch = { ...before, businessName: normalized };
    ackPart = `Updated business name to *${normalized}*.`;
  } else if (side.kind === 'industry_change' && side.value) {
    patch = { ...before, industry: side.value };
    ackPart = `Updated industry to *${side.value}*.`;
  } else if (side.kind === 'contact_update') {
    const next = { ...before };
    const bits = [];
    if (side.email) { next.contactEmail = side.email; bits.push(`email *${side.email}*`); }
    if (side.phone) { next.contactPhone = side.phone; bits.push(`phone *${side.phone}*`); }
    if (side.address) { next.contactAddress = side.address; bits.push(`address *${side.address}*`); }
    if (bits.length) {
      patch = next;
      ackPart = `Saved your ${bits.join(' / ')}.`;
    }
  } else if (side.kind === 'question') {
    ackPart = `Noted, I'll come back to that — let's finish setup first.`;
  }

  if (!ackPart) return null;

  if (patch !== before) {
    try {
      await updateUserMetadata(user.id, { websiteData: patch });
      user.metadata = { ...(user.metadata || {}), websiteData: patch };
    } catch (err) {
      logger.warn(`[WEBDEV-SIDECHANNEL] persist failed: ${err.message}`);
    }
  }
  logger.info(`[WEBDEV-SIDECHANNEL] applied "${side.kind}" while in ${currentField} step`);
  return { ackPart, side };
}

/**
 * Format-deterministic short-circuit for contact info that arrives at a
 * non-contact step (logo / salon-booking / salon-hours / etc.). A whole
 * message that's just a phone or email shape is almost always the user
 * adding contact info that didn't fit in their original CONTACT-step
 * answer — save it directly to websiteData.contactPhone / contactEmail
 * without any LLM call (matches turnClassifier's fastpath_phone_shape
 * pattern: format check, not intent).
 *
 * Returns { ackPart } when applied so the caller can compose a re-ask of
 * its own current question. Returns null when the text isn't a bare
 * contact format — caller should fall through to its normal flow
 * (typically: LLM side-channel for richer intents, then the standard
 * "didn't catch that" re-ask).
 */
async function tryApplyContactFormat(user, text) {
  const phoneShape = /^[+\d][\d\s\-().]{6,19}$/;
  const emailShape = /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/;
  const phoneHit = phoneShape.test(text) ? text : null;
  const emailHit = emailShape.test(text) ? text : null;
  if (!phoneHit && !emailHit) return null;

  const wd = { ...(user.metadata?.websiteData || {}) };
  const bits = [];
  if (phoneHit && !wd.contactPhone) { wd.contactPhone = phoneHit; bits.push(`phone *${phoneHit}*`); }
  if (emailHit && !wd.contactEmail) { wd.contactEmail = emailHit; bits.push(`email *${emailHit}*`); }
  if (!bits.length) return null;

  try {
    await updateUserMetadata(user.id, { websiteData: wd });
    user.metadata = { ...(user.metadata || {}), websiteData: wd };
  } catch (err) {
    logger.warn(`[WEBDEV-FORMAT] persist failed: ${err.message}`);
    return null;
  }
  return { ackPart: `Saved your ${bits.join(' / ')}.` };
}


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
    // Salon detour: nextMissingWebDevState only checks the generic
    // ladder (name / email / industry / services / contact / logo) and
    // has no awareness of salon-specific fields (bookingMode, weeklyHours,
    // service durations + prices). For salon businesses, the salon
    // sub-flow MUST run before confirm — without this gate, a dense
    // first-message extraction (businessName + industry + services +
    // contact all in one go) skips straight to "got everything" and
    // ships a salon site with no hours and no booking config.
    //
    // Detection falls back to the businessName when industry is missing
    // OR also matches the salon regex. We do NOT override a clear,
    // non-salon industry on the strength of the name alone — names
    // like "Hair Plus Tech" (software co) would otherwise misroute into
    // the salon flow even when industry was correctly extracted as
    // "Software". Mirrors the same gate in salesBot.js's salon trigger.
    const salonByIndustryHere = isSalonIndustry(merged.industry);
    const salonByNameHere = isSalonIndustry(merged.businessName);
    const industryUnsetOrSalonHere = !merged.industry || salonByIndustryHere;
    const looksLikeSalon =
      salonByIndustryHere || (salonByNameHere && industryUnsetOrSalonHere);
    if (looksLikeSalon && !merged.bookingMode) {
      return startSalonFlow(user);
    }
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
    case STATES.WEB_COLLECT_LOGO:
      // Kept in sync with the prompt sent by handleCollectLogo when that
      // state is entered through the normal ladder — without this case,
      // smartAdvance / salesBot fast-paths into WEB_COLLECT_LOGO emit an
      // empty question and the conversation stalls.
      return "Got a logo? Send it as an image (JPG or PNG) — I'll clean up the background automatically. Or reply *skip* and I'll use a text logo with your brand initial.";
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
    case STATES.WEB_DOMAIN_OWN_REGISTRAR:
      return handleDomainOwnRegistrar(user, message);
    case STATES.WEB_DOMAIN_SEARCH:
      return handleDomainSearch(user, message);
    case STATES.WEB_DOMAIN_LATE_SEARCH:
      return handleLateDomainSearch(user, message);
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
    await sendTextMessage(
      user.phone_number,
      await localize('Please enter your business name:', user, message.text)
    );
    return STATES.WEB_COLLECT_NAME;
  }

  // Create site record if not yet. Rate-limit gate: non-tester / non-paid
  // users are capped at WEBSITE_RATE_LIMIT_PER_DAY new sites per rolling
  // window — see src/db/siteRateLimit.js. Only checked on the first turn of
  // the flow (when no currentSiteId yet) so revisions to an existing site
  // never count against the cap.
  const existingWebsiteData = user.metadata?.websiteData || {};
  if (!user.metadata?.currentSiteId) {
    const gate = await checkSiteCreationAllowed(user);
    if (!gate.allowed) {
      const resetIn = formatTimeUntil(gate.resetAt);
      logger.info(
        `[WEBDEV] Rate-limited user ${user.phone_number} — ${gate.count}/${gate.limit} sites in last ${gate.windowHours}h, resets in ${resetIn}`
      );
      await sendTextMessage(
        user.phone_number,
        await localize(
          `You've hit the daily limit on free preview websites (${gate.limit} in ${gate.windowHours} hours). This resets in ${resetIn}.\n\nIf you'd like to keep building, you can activate one of your existing previews — just reply with the site link and I'll send you the activation link. 💡`,
          user,
          message.text
        )
      );
      await logMessage(
        user.id,
        `Website creation rate-limited (${gate.count}/${gate.limit}, resets in ${resetIn})`,
        'assistant'
      );
      return STATES.SALES_CHAT;
    }
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
    const businessName = normalizeBusinessName(text);
    const websiteData = { ...existingWebsiteData, businessName };
    await updateUserMetadata(user.id, { websiteData });
    user.metadata = { ...(user.metadata || {}), websiteData };
    await logMessage(user.id, `Business name: ${businessName}`, 'assistant');
  }

  return smartAdvance(user, message);
}

async function handleCollectEmail(user, message) {
  const text = (message.text || '').trim();
  // Email shape stays a regex — it's a deterministic format check, no
  // language nuance needed. But skip detection is now LLM-only so we
  // catch every dialect / phrasing without maintaining a keyword list
  // ("nope", "no thanks", "rehne do", "abhi nahi", "salta este", etc.).
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  let isSkip = false;
  if (!emailMatch && text && text.length <= 60) {
    try {
      isSkip = await classifyDelegation(
        text,
        "What's your email address? (or reply skip)"
      );
    } catch (err) {
      logger.warn(`[WEBDEV-EMAIL] classifyDelegation threw: ${err.message}`);
    }
  }

  if (isSkip) {
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
      // Before re-prompting, check whether the user actually meant to
      // update a different field ("change name to X", "we also do Y",
      // etc.). If so, apply that update + re-ask the email question.
      const sc = await tryApplySideChannel(user, 'contactEmail', text);
      if (sc) {
        const reask = "Now, what's your email address? (or reply *skip*)";
        await sendTextMessage(
          user.phone_number,
          await localize(`${sc.ackPart} ${reask}`, user, text)
        );
        return STATES.WEB_COLLECT_EMAIL;
      }
      await sendTextMessage(
        user.phone_number,
        await localize(
          "That doesn't look like an email address. Could you double-check? Or just skip to continue without it.",
          user,
          text
        )
      );
      return STATES.WEB_COLLECT_EMAIL;
    }
  }

  const ackPrefix = emailMatch
    ? `Got it, saved *${emailMatch[0]}*!`
    : isSkip
    ? 'No worries — we can add it later.'
    : null;
  return smartAdvance(user, message, ackPrefix);
}

async function handleCollectIndustry(user, message) {
  const rawInput = message.listId
    ? message.text
    : (message.text || '').trim();

  if (!rawInput) {
    await sendTextMessage(
      user.phone_number,
      await localize('Please select or type your industry:', user, message.text)
    );
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

  // Extractor returns null when the reply was delegation / nonsense / a
  // side-channel update (user is correcting an earlier field instead of
  // answering the industry question). Side-channel classifier handles
  // the cross-field-update case. If neither produces something usable,
  // fall back to a generic so the flow doesn't stall — the user can fix
  // it from the confirmation summary.
  if (!industry) {
    const sc = await tryApplySideChannel(user, 'industry', rawInput);
    if (sc) {
      const reask = `Now, what industry are you in?`;
      await sendTextMessage(
        user.phone_number,
        await localize(`${sc.ackPart} ${reask}`, user, rawInput)
      );
      return STATES.WEB_COLLECT_INDUSTRY;
    }
    industry = 'General Business';
    await sendTextMessage(
      user.phone_number,
      await localize(
        "No worries, I'll go with a general business setup. You can tell me the industry later from the summary if you want to change it.",
        user,
        rawInput
      )
    );
    announcedByFallback = true;
  } else if (/^[\w\s&\-']+$/.test(rawInput.trim()) && rawInput.trim().toLowerCase() === industry.toLowerCase()) {
    // User gave a clean answer the extractor just echoed back. No need to
    // announce a "corrected" value.
  } else if (rawInput.trim().toLowerCase() !== industry.toLowerCase()) {
    // Extractor normalized the reply — tell the user what got saved so they
    // can catch it if the normalization was off.
    await sendTextMessage(
      user.phone_number,
      await localize(`Got it, I'll go with *${industry}*.`, user, rawInput)
    );
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

  // One LLM call does it all — skip detection + city extraction + areas
  // extraction. Lets us handle every dialect / phrasing without a regex
  // gauntlet that's always missing some variant. Context tells the LLM
  // whether we already know the city (from sales-chat hydration) so it
  // can interpret the reply as a neighborhood list rather than a city.
  let primaryCity = existingCity || '';
  let serviceAreas = [];
  let skipIntent = false;
  let extractionUnclear = false;
  let extractionReason = '';
  // Geographic granularity hint from the extractor: 'city' | 'state' |
  // 'country' | null. When the user names a region wider than a city
  // ("Texas, USA, UK") we ask a follow-up scoped to that region instead
  // of blanket re-asking — otherwise the user repeats "USA" three times
  // and the bot keeps rejecting it.
  let extractionLevel = null;
  let extractionHint = null;

  try {
    const ctx = existingCity
      ? `\n\nContext: We already know the primary city is "${existingCity}". The user's reply is most likely a list of neighborhoods within that city, OR a skip / "use just the city" intent. Do NOT change primaryCity unless the user explicitly names a different city.`
      : `\n\nContext: We do NOT yet know the user's city. Their reply should name a CITY (and optionally neighborhoods).`;

    const extracted = await generateResponse(
      `Classify a user reply about their business's city + service areas. They may write in ANY language. Focus on intent and on the geographic granularity of any place names mentioned.${ctx}

Return ONLY JSON in this exact shape:
{"skipIntent": <true|false>, "primaryCity": "<city>" | null, "serviceAreas": ["<city or neighborhood>", ...], "level": "city"|"state"|"country"|null, "hint": "<place name>" | null, "unclear": <true|false>, "reason": "<short>"}

Decision tree:
1. **skipIntent: true** when the user wants to skip / defer / leave it for later (any language). Set primaryCity / serviceAreas null / empty.
2. **level + hint** — geographic granularity of any place(s) mentioned:
   - "city" → user named at least one CITY (Houston, Karachi, Austin, London, Dallas, Lahore).
   - "state" → user only named a STATE / PROVINCE / REGION ("Texas", "California", "Punjab", "Ontario") — NOT a city.
   - "country" → user only named a COUNTRY ("USA", "United States", "UK", "Pakistan", "India") — NOT a city.
   - null → user named no place at all OR named only a vague geography or a deflection.
3. **unclear: true** when ANY of the following:
   - level is null and skipIntent is false (no place named, not a skip).
   - level is "state" or "country" only (no city specified — we need a city to build the site).
   - Deflections / non-answers / vague geography ("everywhere", "all over", "globally", "nationwide", "wherever", "the same", "in those", "yes we do").
   - Verbatim echoes of any example we may have shown previously (e.g. exact text "Karachi: Clifton, DHA, Gulshan" — copy of an example, not a real answer).
4. **Otherwise extract**:
   - primaryCity = the single main city — a short proper noun (e.g. "Karachi"), NEVER a full phrase.
   - serviceAreas = array of cities / neighborhoods they serve. Multiple cities → first is primaryCity, rest are serviceAreas.
   - Strip filler words / language-specific copulas / connecting prepositions.
   - When context says we already have a primaryCity, leave it set and put neighborhoods in serviceAreas.
5. **hint** — when level is "state" or "country", set hint to the place the user named (e.g. "Texas" or "USA") so we can ask which CITY in that region. When level is "city", set hint to null.`,
      [{ role: 'user', content: raw }],
      { userId: user.id, operation: 'webdev_areas_extract' }
    );
    const m = extracted.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      extractionLevel = typeof parsed.level === 'string' ? parsed.level.toLowerCase() : null;
      extractionHint = typeof parsed.hint === 'string' ? parsed.hint.trim() : null;
      if (parsed.skipIntent === true) {
        skipIntent = true;
      } else if (parsed.unclear === true || (!parsed.primaryCity && !existingCity)) {
        extractionUnclear = true;
        extractionReason = String(parsed.reason || '').slice(0, 200);
      } else {
        if (parsed.primaryCity) primaryCity = String(parsed.primaryCity).trim();
        if (Array.isArray(parsed.serviceAreas)) {
          serviceAreas = parsed.serviceAreas.map((s) => String(s).trim()).filter(Boolean);
        }
        if (!serviceAreas.length && primaryCity) serviceAreas = [primaryCity];
      }
    }
  } catch (err) {
    logger.warn(`[AREAS] LLM extraction failed: ${err.message}`);
    // Conservative fallback on LLM error: if we have an existing city,
    // accept the reply as-is for areas and continue. If we don't, stay
    // in this state and ask again.
    if (existingCity) {
      serviceAreas = raw
        .split(/[,;\n]|\band\b/i)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!serviceAreas.length) serviceAreas = [existingCity];
    } else {
      extractionUnclear = true;
    }
  }

  // Skip path — same effect as the old regex skip: mark skipped, use
  // existing city (if any) as the sole area, advance.
  if (skipIntent) {
    const websiteData = {
      ...(user.metadata?.websiteData || {}),
      primaryCity: existingCity || null,
      serviceAreas: existingCity ? [existingCity] : [],
      areasSkipped: true,
    };
    await updateUserMetadata(user.id, { websiteData });
    user.metadata = { ...(user.metadata || {}), websiteData };
    return smartAdvance(user, message, 'No problem, we can add more areas later.');
  }

  // No clear city in the reply. Before falling back to a re-ask, run the
  // shared side-channel classifier — user might be updating a different
  // field ("we also do AC selling" → service add, not a city answer).
  if (extractionUnclear || !primaryCity) {
    logger.info(`[AREAS] Re-asking — raw="${raw.slice(0, 80)}" level=${extractionLevel} hint=${extractionHint} reason="${extractionReason}"`);

    const sc = await tryApplySideChannel(user, 'primaryCity', raw);
    if (sc) {
      // After a cross-field update, ask for the city using a placeholder
      // format — if we used literal city names here, users who copy-paste
      // the example would round-trip the example back to us as if it
      // were their answer.
      const reaskCity = `Now, what *city* are you based in? Just type the name of your main city.`;
      await sendTextMessage(
        user.phone_number,
        await localize(`${sc.ackPart} ${reaskCity}`, user, raw)
      );
      return STATES.WEB_COLLECT_AREAS;
    }

    // Track retries so we can escalate language if the user is stuck.
    // Stored on websiteData so it gets cleared with the rest of the
    // website context on /reset.
    const retries = Number(user.metadata?.websiteData?.areasRetryCount || 0) + 1;
    try {
      const wd = { ...(user.metadata?.websiteData || {}), areasRetryCount: retries };
      await updateUserMetadata(user.id, { websiteData: wd });
      user.metadata = { ...(user.metadata || {}), websiteData: wd };
    } catch (err) {
      logger.warn(`[AREAS] Failed to bump areasRetryCount: ${err.message}`);
    }

    let fallbackMsg;
    if (extractionLevel === 'state' || extractionLevel === 'country') {
      // User named a region wider than a city (Texas, USA, UK). Ask for
      // a city WITHIN that region rather than blanket re-asking.
      const where = extractionHint ? `in *${extractionHint}*` : 'where you operate';
      fallbackMsg = `For your website I need a CITY, not a state or country. Which city ${where} is your business based in? Just the city name.`;
    } else if (retries >= 2) {
      // Two failed attempts — escalate to a stricter, simpler instruction.
      fallbackMsg = `Let me ask one more time, simpler: *type only the name of your city* — for example a single word or two like "Houston" or "Karachi", with no other text.`;
    } else {
      fallbackMsg = `I didn't catch a city in that reply. What *city* is your business based in? Just type the city name on its own.`;
    }

    await sendTextMessage(
      user.phone_number,
      await localize(fallbackMsg, user, raw)
    );
    return STATES.WEB_COLLECT_AREAS;
  }

  // Successful capture — clear the retry counter for next time.
  if (user.metadata?.websiteData?.areasRetryCount) {
    try {
      const wd = { ...(user.metadata.websiteData || {}) };
      delete wd.areasRetryCount;
      await updateUserMetadata(user.id, { websiteData: wd });
      user.metadata = { ...(user.metadata || {}), websiteData: wd };
    } catch (err) {
      logger.warn(`[AREAS] Failed to clear areasRetryCount: ${err.message}`);
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


async function handleCollectServices(user, message) {
  const servicesText = (message.text || '').trim();
  if (!servicesText || servicesText.length < 2) {
    await sendTextMessage(
      user.phone_number,
      await localize(
        "Please list your services/products separated by commas, or skip if you don't have specific ones:",
        user,
        message.text
      )
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

  // Empty services result is ambiguous: it could be a genuine skip
  // ("none", "abhi nahi") OR a side-channel update ("actually change
  // my name to X", "we work in Karachi"). Run the side-channel
  // classifier to disambiguate before treating as skip.
  if (services.length === 0) {
    const sc = await tryApplySideChannel(user, 'services', servicesText);
    if (sc) {
      const reask = "Now, what services or products do you offer? (comma-separated, or *skip*)";
      await sendTextMessage(
        user.phone_number,
        await localize(`${sc.ackPart} ${reask}`, user, servicesText)
      );
      return STATES.WEB_COLLECT_SERVICES;
    }
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
/**
 * At the website confirmation summary, detect whether the user is asking
 * to add / upload a logo (after previously skipping it or never being
 * asked yet). Pure-LLM judgement so phrasings like "Sorry I want the
 * logo on my website", "actually I do have a logo", "logo bhejna chahta
 * hoon", "wait I have one" all route back to WEB_COLLECT_LOGO instead
 * of falling through to the generic field-edit path.
 */
async function classifyLogoRevisitIntent(text, userId) {
  const t = String(text || '').trim();
  if (!t || t.length > 200) return false;
  try {
    const resp = await generateResponse(
      `The user is at the website confirmation step (just shown a summary, asked "yes to build or tell me what to change"). Earlier they were offered the logo upload step and chose to skip it (or simply weren't ready). Classify whether their reply expresses an INTENT to add / upload a logo to the site now — regardless of any other content in the same message.

GENERAL PRINCIPLE — mixed intent: people often combine sentiments + requests in one sentence ("yeah looks good, but I want X", "everything's fine, also let me add Y"). When the message contains BOTH a positive/approval sentiment AND a logo-add request, the REQUEST wins — answer YES. The approval is conversational filler relative to the underlying ask. The same applies to negation phrases like "no the rest is fine, but I want a logo" — the "no/fine" is about the rest, not the logo, so YES.

Heuristic for YES (any natural phrasing in any language counts; do not match against examples literally):
- The user is asking to attach, send, upload, add, include, give, or revisit their logo on this website
- Or telling us they actually do have a logo / changed their mind
- Or asking permission to share their logo ("can I add it?", "kya main bhej sakta hoon?")

NO when the message contains zero logo-add request:
- Pure approval ("yes" / "build it" / "perfect") with no other content
- Field edits ("change the headline", "different color", "fix the email")
- Asking for a domain / payment / contact change
- Asking us to DESIGN a logo from scratch (different intent — not an upload, treat as NO; the upload step's no-image branch handles design intent separately)
- Off-topic, meta, or unclear

Examples (illustrative — apply the general principle, do not pattern-match):
- "send my logo" → yes
- "actually I have a logo" → yes
- "yeah looks good but I want to add my logo" → yes (mixed — request wins)
- "the rest is fine, just add my logo" → yes
- "logo bhejna chahta hoon" → yes
- "yes build it" → no (pure approval)
- "change services" → no (field edit)
- "make me a logo" → no (design request, not upload)

Reply with ONLY "yes" or "no".`,
      [{ role: 'user', content: t }],
      { userId, operation: 'logo_revisit_intent' }
    );
    return /^\s*yes\b/i.test(String(resp || ''));
  } catch (err) {
    logger.warn(`[LOGO-REVISIT] classifier threw: ${err.message}`);
    return false;
  }
}

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
 * LLM-based field-edit detector for the WEB_CONFIRM step. Replaces the
 * prior regex layer which had natural-language footguns like the `to`
 * inside "too" being consumed as a field-edit separator (capturing
 * "o nails, makeup, hairs" instead of "nails, makeup, hairs"). The
 * LLM sees the current website data + the user's message and returns
 * an array of {field, value} edits — supports MULTI-field edits in one
 * message ("name: X, services: Y"), handles typos, works in any
 * language. Returns [] on LLM failure or when no edit intent detected.
 */
async function detectFieldEditsLLM(originalText, wd, userId) {
  const t = String(originalText || '').trim();
  if (!t) return [];

  // Build a snapshot of current values so the LLM can disambiguate
  // ("change services to nails" vs "services include nails" — the
  // latter is conversational, not a replacement).
  const present = [];
  if (wd.businessName) present.push(`businessName: "${wd.businessName}"`);
  if (wd.industry) present.push(`industry: "${wd.industry}"`);
  if (Array.isArray(wd.services) && wd.services.length) {
    present.push(`services: [${wd.services.join(', ')}]`);
  }
  if (Array.isArray(wd.serviceAreas) && wd.serviceAreas.length) {
    present.push(`serviceAreas: [${wd.serviceAreas.join(', ')}]`);
  }
  if (wd.contactEmail) present.push(`contactEmail: "${wd.contactEmail}"`);
  if (wd.contactPhone) present.push(`contactPhone: "${wd.contactPhone}"`);
  if (wd.contactAddress) present.push(`contactAddress: "${wd.contactAddress}"`);

  const prompt = `The user is reviewing a website-setup summary and may want to change one or more fields. Identify which field(s) (if any) and the exact new value(s) they provided.

Available fields: businessName, industry, services, areas, email, phone, address, contact

Current values:
${present.length ? present.map((f) => '- ' + f).join('\n') : '(none yet)'}

Rules:
1. Extract ONLY when the user is clearly asking to change / update / set / write / replace a field.
2. Understand typos and casual language — "write services too nails, makeup, hairs" → field=services, value="nails, makeup, hairs" (the "too" is a typo for "to"; do NOT include "o" or "too" in the value).
3. Multi-field edits are supported: a single message can contain multiple edits — return ALL of them.
4. Distinguish "services" (what the business DOES — e.g. haircuts, plumbing) from "areas" (WHERE it operates — neighborhoods, cities). "Service areas" = areas, NOT services.
5. For lists (services / areas), keep the comma/and-separated list AS-IS as the value (e.g. "nails, makeup, hairs"). Do NOT trim items.
6. Preserve emails / phone numbers / URLs / addresses exactly as written.
7. Understand any language: English, Roman Urdu, Urdu, Hindi, Spanish, French, Arabic, etc. ("address ko Gulshan Iqbal kr do", "cambia el email a foo@bar.com").
8. If the user is NOT trying to change anything (saying "yes", "looks good", "cancel", "build it", a question, off-topic), return {"edits": []}.

User said: "${t}"

Return JSON ONLY. No prose. Examples:
{"edits": [{"field": "address", "value": "Gulshan Iqbal, Karachi"}]}
{"edits": [{"field": "businessName", "value": "MyCo"}, {"field": "services", "value": "design, SEO"}]}
{"edits": [{"field": "services", "value": "nails, makeup, hairs"}]}
{"edits": []}`;

  try {
    const response = await generateResponse(
      prompt,
      [{ role: 'user', content: t }],
      { userId, operation: 'confirm_edit_classify' }
    );
    const m = (response || '').match(/\{[\s\S]*\}/);
    if (!m) return [];
    const parsed = JSON.parse(m[0]);
    if (!Array.isArray(parsed.edits)) return [];
    return parsed.edits.filter(
      (e) => e && typeof e.field === 'string' && e.field && (typeof e.value === 'string' || Array.isArray(e.value)) && String(e.value).trim()
    );
  } catch (err) {
    logger.warn(`[WEBDEV-CONFIRM] detectFieldEditsLLM threw: ${err.message}`);
    return [];
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

  // LLM fallback for skip phrasings the narrow regex doesn't catch
  // ("skip it", "i want to skip these", "salta esto", "rehne do", etc.).
  // Gated to short replies that aren't already a clear done-signal so we
  // don't fire LLM calls on every listing description.
  let isSkip = skipWords.test(raw);
  if (!isSkip && raw && raw.length <= 60 && !doneWords.test(raw)) {
    try {
      isSkip = await classifyDelegation(
        raw,
        'Send your listing details, or skip to use placeholder listings.'
      );
    } catch (err) {
      logger.warn(`[WEBDEV-LISTINGS] classifyDelegation threw: ${err.message}`);
    }
  }

  if (isSkip) {
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
  // LLM fallback for skip phrasings the narrow regex doesn't catch
  // ("skip it", "i want to skip the photos", "use stock photos please",
  // any-language equivalents). Computed once up front so the existing
  // `skipWords.test(raw)` site below uses the LLM-aware result.
  let isSkip = skipWords.test(raw);
  if (!isSkip && raw && raw.length <= 60 && !message.mediaId) {
    try {
      isSkip = await classifyDelegation(
        raw,
        'Send a listing photo, or reply skip / done for stock photos.'
      );
    } catch (err) {
      logger.warn(`[WEBDEV-LISTINGS-PHOTOS] classifyDelegation threw: ${err.message}`);
    }
  }
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

  if (isSkip) {
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

  if (!text) {
    await sendTextMessage(
      user.phone_number,
      await localize(
        'Do you already use a booking tool (Fresha, Booksy, Vagaro, Calendly, etc.)? Paste the link if yes, or just type *"no"* and we\'ll build one for you.',
        user
      )
    );
    return STATES.SALON_BOOKING_TOOL;
  }

  // Cross-field short-circuit BEFORE the booking-intent LLM. A bare
  // phone or email at this step is never a valid booking-tool answer —
  // it's the user adding contact info that didn't fit earlier. The
  // phone/email shape can't collide with a real booking URL (URLs start
  // with http/https, not + or @).
  const reaskBooking = 'Now, do you already use a booking tool (Fresha / Booksy / Vagaro / Calendly / etc.)? Paste the link if yes, or type *"no"* and we\'ll build one for you.';
  const fmt = await tryApplyContactFormat(user, text);
  if (fmt) {
    await sendTextMessage(user.phone_number, await localize(`${fmt.ackPart} ${reaskBooking}`, user, text));
    await logMessage(user.id, 'Salon booking step: applied contact format short-circuit', 'assistant');
    return STATES.SALON_BOOKING_TOOL;
  }

  // One structured LLM call covers every phrasing in any language:
  //   • a pasted URL → embed mode
  //   • "no" / "i don't have one" / "build me one" / "rehne do" → native mode
  //   • ambiguous prose / "maybe" / unrelated text → unclear → re-ask
  // Modeled after handleCollectAreas — single call, JSON output, conservative
  // re-ask on uncertainty rather than pattern-matching keyword lists.
  let intent = 'unclear';
  let bookingUrl = null;
  let unclearReason = '';

  try {
    const extracted = await generateResponse(
      `Classify a salon owner's reply about whether they already use an online booking tool. They may write in ANY language (English, Roman Urdu, Urdu, Hindi, Spanish, Arabic, etc.).

Return ONLY JSON in this exact shape:
{"intent": "embed" | "native" | "unclear", "url": "<full https://… URL or null>", "reason": "<short>"}

Decision tree:
1. **intent: "embed"** when the user IS providing a real booking-tool URL or naming a real booking service — Fresha, Booksy, Vagaro, Calendly, Square Appointments, Acuity, Setmore, Schedulicity, Mindbody, SimplyBook, Picktime, Goldie, Boulevard, GlossGenius, Squire, Schedulista, Timely, etc. The URL takes priority. If the user types a domain WITHOUT a protocol ("fresha.com/glow-studio"), still output it in the url field WITH the https:// prefix prepended ("https://fresha.com/glow-studio") — bare-domain pastes are common and we should accept them. Only return "embed" with url:null if they clearly named a real booking service but didn't paste the link, in which case explain in the reason.

2. **intent: "native"** when the user wants the built-in booking system: any "no" / "I don't have one" / "build me one" / "we don't use any" / "abhi nahi" / "rehne do" / "no thanks" / "skip" / delegation phrases / "whatever you suggest" / "you decide" — including when they explicitly mention NOT using the named services ("I don't use calendly or fresha", "no booking tool yet").

3. **intent: "unclear"** when:
   - The message is irrelevant (smalltalk, off-topic, a question back, gibberish) and you genuinely cannot tell what they want.
   - The user pasted a URL that is NOT a booking tool — social media (instagram.com, facebook.com, twitter.com, x.com, tiktok.com, youtube.com, linkedin.com, snapchat.com), their own salon's website (their general site, not a booking page), Google Maps links, WhatsApp links, generic landing pages, etc. These are NOT booking tools — return unclear with reason explaining what they sent and asking for an actual booking-tool link or "no". DO NOT set url even if a URL was present; setting url means embed-mode, which would put a useless page on their booking page.

Hard rule: if the URL host is a known social-media or general-website host (instagram, facebook, twitter, x.com, tiktok, youtube, linkedin, snapchat, google.com/maps, wa.me, the salon's own .com/.net), it is NEVER a booking tool — return unclear, not embed.

When in doubt between "embed" and "native", lean "native" (the user can always paste a link later). Never guess a URL — set url:null unless one is literally present in the text.`,
      [{ role: 'user', content: text }],
      { userId: user.id, operation: 'salon_booking_extract', model: 'gpt-5.4-nano', timeoutMs: 8_000 }
    );
    const m = String(extracted || '').match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      if (parsed.intent === 'embed' || parsed.intent === 'native' || parsed.intent === 'unclear') {
        intent = parsed.intent;
      }
      if (parsed.url && /^https?:\/\//i.test(String(parsed.url))) {
        // Trim trailing punctuation that often sneaks in from prose context.
        bookingUrl = String(parsed.url).trim().replace(/[)\].,;:!?]+$/, '');
      }
      unclearReason = String(parsed.reason || '').slice(0, 200);
    }
  } catch (err) {
    logger.warn(`[BOOKING] LLM extraction failed: ${err.message} — re-asking`);
    intent = 'unclear';
  }

  if (intent === 'embed' && bookingUrl) {
    wd.bookingMode = 'embed';
    wd.bookingUrl = bookingUrl;
    await updateUserMetadata(user.id, { websiteData: wd });
    await logMessage(user.id, `Booking mode: embed (${wd.bookingUrl})`, 'assistant');
    await sendTextMessage(
      user.phone_number,
      await localize(`Got it, we'll embed *${wd.bookingUrl}* on your booking page.`, user, text)
    );
    // Embed mode skips hours / durations — the booking widget owns scheduling.
    return finishSalonFlow(user);
  }

  if (intent === 'native') {
    wd.bookingMode = 'native';
    await updateUserMetadata(user.id, { websiteData: wd });
    await logMessage(user.id, 'Booking mode: native', 'assistant');
    await sendTextMessage(
      user.phone_number,
      await localize(
        `Perfect, we'll build you a booking system.\n\nWhat are your opening hours? A quick line is fine — for example: *"Tue-Sat 9-7, Sun-Mon closed"*.\n\nOr just reply *default* for standard salon hours (Tue-Sat 9-7).`,
        user,
        text
      )
    );
    return STATES.SALON_HOURS;
  }

  // LLM side-channel for richer cross-field intents (name / industry /
  // service correction at the booking step) that format checks can't
  // catch. Runs only after the intent classifier said unclear or
  // emitted embed-without-URL.
  if (text && text.length >= 3) {
    const sc = await tryApplySideChannel(user, 'bookingTool', text);
    if (sc) {
      await sendTextMessage(user.phone_number, await localize(`${sc.ackPart} ${reaskBooking}`, user, text));
      await logMessage(user.id, `Salon booking step: applied side-channel ${sc.side.kind}`, 'assistant');
      return STATES.SALON_BOOKING_TOOL;
    }
  }

  // Unclear (or "embed" without a usable URL) — re-ask, naming what we
  // need explicitly so the user knows how to answer.
  if (unclearReason) {
    logger.info(`[BOOKING] Re-asking — intent=${intent} reason="${unclearReason}" raw="${text.slice(0, 80)}"`);
  }
  await sendTextMessage(
    user.phone_number,
    await localize(
      'Got you — just need a clearer answer. Either *paste your booking tool link* (Fresha / Booksy / Vagaro / Calendly / etc.) or type *"no"* and we\'ll build one in.',
      user,
      text
    )
  );
  return STATES.SALON_BOOKING_TOOL;
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

  // Cross-field short-circuit BEFORE parseWeeklyHours. A bare phone /
  // email at this step would otherwise be silently swallowed (parser
  // returns DEFAULT_WEEKLY_HOURS, the digits / dots vanish, and bot
  // moves on without saving the contact info). Phone/email shape
  // can't collide with valid hours notation.
  const reaskHours = 'Now, what are your opening hours? A quick line is fine — for example: *"Tue-Sat 9-7, Sun-Mon closed"*.\n\nOr just reply *default* for standard salon hours (Tue-Sat 9-7).';
  if (text) {
    const fmt = await tryApplyContactFormat(user, text);
    if (fmt) {
      await sendTextMessage(user.phone_number, await localize(`${fmt.ackPart} ${reaskHours}`, user, text));
      await logMessage(user.id, 'Salon hours step: applied contact format short-circuit', 'assistant');
      return STATES.SALON_HOURS;
    }
  }

  const { parseWeeklyHours, formatHoursForDisplay } = require('../../website-gen/hoursParser');
  const { hours, usedDefault } = await parseWeeklyHours(text);

  // LLM side-channel for richer cross-field corrections (name /
  // industry / service / contact-with-prose) that format checks can't
  // catch. ONLY runs when the hours parser bailed (usedDefault=true)
  // AND the user didn't explicitly delegate. This ordering matters:
  // a multilingual hours answer ("subah 9 baje se shaam 9 baje tak,
  // tue-sat") parses cleanly via the parser's own LLM, so we trust
  // that result and skip the side-channel call. Side-channel only
  // fires when the user clearly didn't give us hours — at which point
  // the question is "what DID they say?" (cross-field correction,
  // contact info, etc.) and the side-channel is the right tool.
  if (usedDefault && text && text.length >= 3 && !isDelegation(text)) {
    const sc = await tryApplySideChannel(user, 'salonHours', text);
    if (sc) {
      await sendTextMessage(user.phone_number, await localize(`${sc.ackPart} ${reaskHours}`, user, text));
      await logMessage(user.id, `Salon hours step: applied side-channel ${sc.side.kind}`, 'assistant');
      return STATES.SALON_HOURS;
    }
  }

  wd.weeklyHours = hours;
  await updateUserMetadata(user.id, { websiteData: wd });
  await logMessage(user.id, `Hours${usedDefault ? ' (default)' : ''}:\n${formatHoursForDisplay(hours)}`, 'assistant');

  const prefix = usedDefault
    ? 'Using standard salon hours (Tue-Sat 9-7). You can edit these later.\n\n'
    : `Got it:\n${formatHoursForDisplay(hours)}\n\n`;
  const services = (wd.services || []);
  if (services.length === 0) {
    // No services known — that's a contract violation: the salon sub-flow
    // assumes services were collected upstream (handleCollectServices →
    // startSalonFlow is the canonical entry, and the salesBot trigger
    // detours through WEB_COLLECT_SERVICES first when missing). Log
    // loudly so we catch any new code path that drops a user here with
    // empty services, instead of silently shipping a salon site with
    // no services page. We still finishSalonFlow rather than block the
    // user — finishing with empty services is recoverable; getting
    // stuck on a hours-step error is not.
    logger.warn(
      `[SALON-FLOW] handleSalonHours reached with empty services for user ${user.phone_number} ` +
        `(state=${user.state}, businessName=${wd.businessName || '?'}, industry=${wd.industry || '?'}). ` +
        `Some upstream path bypassed services collection — investigate.`
    );
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

/**
 * LLM-driven extraction of service durations + prices from free text.
 * Returns [{name, durationMinutes, priceText}] aligned to servicesList.
 *
 * Replaces the previous regex-based implementation that brittle-split on
 * commas, ran a price regex over each chunk, and lossy-matched service
 * names by substring. The LLM handles every phrasing — "Haircut: 30 mins
 * for 25 bucks", "manicure 30m $20, pedicure 45 mins thirty dollars",
 * "all of them are 30 minutes" — without us trying to enumerate them.
 *
 * On any failure (LLM error, malformed JSON, network), falls back to the
 * standard default of 30min/no-price per service so the flow never stalls.
 */
async function parseServiceDurations(text, servicesList, userId) {
  const services = Array.isArray(servicesList) ? servicesList : [];
  const fallback = () => services.map((s) => ({ name: s, durationMinutes: 30, priceText: '' }));
  if (!services.length) return [];
  if (!text || !String(text).trim()) return fallback();

  const systemPrompt =
    `You extract per-service duration (in minutes) and price (as the user wrote it, including currency) from a salon owner's free-text reply.\n\n` +
    `The salon offers these services in this exact order: ${JSON.stringify(services)}\n\n` +
    `Return ONLY a JSON object: {"services": [{"name": "<exact name from list>", "durationMinutes": <int>, "priceText": "<currency+amount or empty string>"}, ...]}\n\n` +
    `Rules:\n` +
    `- Always return one entry per service in the SAME ORDER as the input list.\n` +
    `- name MUST exactly match the input service name — do not rename, pluralize, or reorder.\n` +
    `- durationMinutes must be a positive integer 1-600. If the user didn't specify a duration for a service, use 30 (the default).\n` +
    `- priceText keeps the user's original currency symbol and amount (e.g. "$25", "€30", "Rs 500", "25 euros"). Empty string if no price was stated for that service.\n` +
    `- If the user says "all 30min no price" / "default" / "same for all" / a bare number, apply that uniformly across every service.\n` +
    `- Accept any language and currency.\n` +
    `- Never invent durations or prices the user didn't state — emit defaults instead.`;

  try {
    const response = await generateResponse(
      systemPrompt,
      [{ role: 'user', content: String(text).slice(0, 800) }],
      { userId, operation: 'salon_durations_extract', model: 'gpt-5.4-nano', timeoutMs: 12_000 }
    );
    const m = String(response || '').match(/\{[\s\S]*\}/);
    if (!m) {
      logger.warn('[SALON-DURATIONS] LLM returned no JSON, using defaults');
      return fallback();
    }
    const parsed = JSON.parse(m[0]);
    const arr = Array.isArray(parsed.services) ? parsed.services : [];
    const byName = {};
    for (const entry of arr) {
      if (!entry || typeof entry.name !== 'string') continue;
      byName[entry.name.toLowerCase()] = entry;
    }
    return services.map((s) => {
      const hit = byName[s.toLowerCase()];
      const rawDur = hit && Number(hit.durationMinutes);
      const dur = Number.isFinite(rawDur) && rawDur > 0 && rawDur <= 600
        ? Math.round(rawDur)
        : 30;
      const priceText = hit && typeof hit.priceText === 'string'
        ? hit.priceText.trim().slice(0, 40)
        : '';
      return { name: s, durationMinutes: dur, priceText };
    });
  } catch (err) {
    logger.warn(`[SALON-DURATIONS] Extraction failed: ${err.message} — using defaults`);
    return fallback();
  }
}

async function handleSalonServiceDurations(user, message) {
  const text = (message.text || '').trim();
  const wd = { ...(user.metadata?.websiteData || {}) };
  const services = wd.services || [];

  // Cross-field handling at the durations step. A bare phone / email
  // would otherwise be eaten by parseServiceDurations (LLM extracts
  // nothing, defaults applied, contact info lost). Run format
  // short-circuit + LLM side-channel before the durations parser.
  const reaskDurations =
    `Now, how long does each service take, and what's the price?\n\n` +
    `Example: *"Haircut 30min €25, Colour 90min €85"*. Your services: ${services.join(', ') || '(none yet)'}.\n\n` +
    `Or just reply *default* for 30min with no price.`;
  if (text) {
    const fmt = await tryApplyContactFormat(user, text);
    if (fmt) {
      await sendTextMessage(user.phone_number, await localize(`${fmt.ackPart} ${reaskDurations}`, user, text));
      await logMessage(user.id, 'Salon durations step: applied contact format short-circuit', 'assistant');
      return STATES.SALON_SERVICE_DURATIONS;
    }
  }
  if (text && text.length >= 3 && !isDelegation(text)) {
    const sc = await tryApplySideChannel(user, 'salonDurations', text);
    if (sc) {
      await sendTextMessage(user.phone_number, await localize(`${sc.ackPart} ${reaskDurations}`, user, text));
      await logMessage(user.id, `Salon durations step: applied side-channel ${sc.side.kind}`, 'assistant');
      return STATES.SALON_SERVICE_DURATIONS;
    }
  }

  // Delegation ("whatever you think" / "default" / "idk" / etc.) means
  // "apply 30min-no-price across every service" — skip the LLM call.
  const useDefault = isDelegation(text);
  const salonServices = useDefault
    ? services.map((s) => ({ name: s, durationMinutes: 30, priceText: '' }))
    : await parseServiceDurations(text, services, user.id);
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

  // Compute once with a regex fast-path + LLM fallback so all four
  // downstream sites that used to test `skipWords.test(contactText)`
  // benefit. The LLM catches "skip it", "i want to skip", "rehne do",
  // "saltar esto", any-language equivalents — without us hand-listing
  // them. Skipped when the message obviously contains real contact
  // info (email, long digit run, or long prose) so we don't waste an
  // LLM call on a clear answer.
  const looksLikeRealContact =
    /@/.test(contactText) ||
    /\d{5,}/.test(contactText) ||
    contactText.length > 80;
  let isExplicitSkip = !!contactText && skipWords.test(contactText);
  if (!isExplicitSkip && contactText && !looksLikeRealContact && contactText.length <= 60) {
    try {
      isExplicitSkip = await classifyDelegation(
        contactText,
        'What contact info do you want on the site? (email, phone, and/or address) — or reply skip.'
      );
    } catch (err) {
      logger.warn(`[WEBDEV-CONTACT] classifyDelegation threw: ${err.message}`);
    }
  }

  // "Use my WhatsApp / current / this number" intent — save the number they're
  // messaging from as contactPhone without making them type it out. LLM-based
  // so it works in any language ("use my whatsapp number", "mera yahi
  // number use kar lo", "usa mi número de whatsapp", "cet numéro", etc.).
  // Gated by length + no @ / no multi-digit run so we don't waste a call
  // when the user is clearly pasting a real email/phone/address.
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

  // Count contact-field labels in the input. Used to gate the
  // side-channel edit branch above — when the user has provided 2+
  // labeled contact fields ("email is X and phone is Y"), the side
  // channel doesn't run; the input is treated as primary contact
  // input and routed to parseContactFields instead.
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
        await localize(
          `No problem, I'll leave contact details off the site. You can add them later from the summary.`,
          user,
          contactText
        )
      );
      await logMessage(user.id, 'Contact: skipped via delegation', 'assistant');
      return showConfirmSummary(user);
    }
  }

  // Side-channel edit guard: if the user is trying to correct an
  // EARLIER field instead of providing contact info ("actually the
  // name should be X" / "we also do AC selling"), apply the update
  // via the LLM classifier and bounce to WEB_CONFIRM. We do NOT
  // auto-pick contact_update or unclear/question intents here — at
  // this step, real contact info should fall through to the primary
  // parseContactFields parser below, so the side-channel branch is
  // restricted to genuine cross-field edits.
  if (contactText && contactText.length >= 3 && !isExplicitSkip && labelCount < 2 && !hasContactSignal) {
    const sc = await tryApplySideChannel(user, 'contactInfo', contactText);
    const kind = sc?.side?.kind;
    if (sc && kind && kind !== 'contact_update' && kind !== 'question' && kind !== 'unclear') {
      await sendTextMessage(
        user.phone_number,
        await localize(
          `${sc.ackPart} Let's take one more look before we build.`,
          user,
          contactText
        )
      );
      await logMessage(user.id, `Edit at contact step: ${kind}`, 'assistant');
      // Re-enter WEB_CONFIRM's summary display so the user sees the
      // updated state and can confirm before we build.
      return showConfirmSummary(user);
    }
  }

  let contactData;
  if (!contactText || contactText.length < 3 || isExplicitSkip) {
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
      // Before re-prompting, check whether the user actually meant to
      // update a different field. Restrict to non-contact intents
      // (real contact info would have parsed above).
      const sc = await tryApplySideChannel(user, 'contactInfo', contactText);
      const kind = sc?.side?.kind;
      if (sc && kind && kind !== 'contact_update' && kind !== 'question' && kind !== 'unclear') {
        const reask = `Now, what contact info do you want on the site? (email, phone, and/or address — or *skip*)`;
        await sendTextMessage(
          user.phone_number,
          await localize(`${sc.ackPart} ${reask}`, user, contactText)
        );
        return STATES.WEB_COLLECT_CONTACT;
      }
      await sendTextMessage(
        user.phone_number,
        await localize(
          "Didn't catch any contact info there. Send your email, phone, and/or address — any format is fine, or just skip if you'd rather not add contact details.",
          user,
          contactText
        )
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
    (!contactText || contactText.length < 3 || isExplicitSkip)
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
  // sendTextMessage now auto-logs the outbound text via the sender
  // facade's autoLogOutbound (channelContext + db/conversations). The
  // earlier explicit logMessage call here was a duplicate write — the
  // admin conversation view rendered "Here's a summary..." twice on
  // every confirmation. Removed.

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

  // Decide what kind of inbound this is. Anything with a mediaId is a
  // candidate for the upload path — image (gallery), document (file
  // picker, ships PNG/JPG as type:document with mime image/*), or even
  // a stray audio/video (treated as not-a-logo by the LLM below).
  let treatAsLogoUpload = false;
  if (message.mediaId || message.mediaUrl) {
    if (message.type === 'image') {
      // Gallery uploads are unambiguous — straight to processing.
      treatAsLogoUpload = true;
    } else {
      // Document / other media — ask the LLM to judge it from the
      // metadata WhatsApp gave us. No regex, no mime-prefix check —
      // the LLM gets the raw signals and decides.
      try {
        const resp = await generateResponse(
          `The user is at the LOGO UPLOAD step of a website-builder flow. They were just asked: "Got a logo? Send it as an image (JPG or PNG) — I'll clean up the background automatically. Or reply *skip* and I'll use a text logo with your brand initial."

They've now sent a media attachment with these metadata fields:
- WhatsApp message type: ${message.type}
- File name: ${message.filename || '(none)'}
- MIME type: ${message.mimeType || '(unknown)'}
- Caption: ${message.caption ? JSON.stringify(message.caption) : '(none)'}

Decide if this attachment is the user's logo (i.e., something we should attempt to process as their brand logo) or not (e.g., a PDF résumé, a voice note, a contract, a video).

Return ONLY one word:
- logo  — if this looks like the user's logo image
- other — if this is clearly something else`,
          [{ role: 'user', content: '(media attachment)' }],
          { userId: user.id, operation: 'logo_media_classify' }
        );
        const verdict = String(resp || '').trim().toLowerCase().split(/[\s\n]/)[0];
        treatAsLogoUpload = verdict === 'logo';
      } catch (err) {
        logger.warn(`[WEBDEV-LOGO] media classifier threw: ${err.message}`);
      }
    }
  }

  if (!treatAsLogoUpload) {
    // Media-but-not-a-logo path (e.g., user dropped a PDF résumé or a
    // voice note here). The text-intent classifier below would see the
    // parser placeholder ("[Document]" / "[Image]") and emit a generic
    // "I didn't catch an image" reply, which is wrong — the user did
    // send something. Have the LLM compose a contextual reply instead.
    if (message.mediaId || message.mediaUrl) {
      let reply = '';
      try {
        reply = await generateResponse(
          `You are the assistant on a WhatsApp website-builder. The user is at the logo upload step. They were just asked to send a logo image (JPG/PNG) or reply "skip".

They've now sent a non-logo attachment:
- WhatsApp message type: ${message.type}
- File name: ${message.filename || '(none)'}
- MIME type: ${message.mimeType || '(unknown)'}
- Caption: ${message.caption ? JSON.stringify(message.caption) : '(none)'}

Write ONE short, friendly WhatsApp reply (1–2 sentences) that:
- Acknowledges what they sent (referencing it specifically — file name or kind of file).
- Tells them this isn't what's needed for the logo step.
- Reminds them they can either send a logo image (JPG/PNG) or reply *skip* to use a text logo.

Match the user's language if their caption hints at one, otherwise use English. Plain text only — no markdown headers, no emojis. Output ONLY the reply text.`,
          [{ role: 'user', content: '(non-logo attachment)' }],
          { userId: user.id, operation: 'logo_media_reject_reply' }
        );
        reply = String(reply || '').trim();
      } catch (err) {
        logger.warn(`[WEBDEV-LOGO] non-logo reply LLM threw: ${err.message}`);
      }
      if (!reply) {
        reply = "That doesn't look like a logo image — send a JPG or PNG, or reply *skip* to use a text logo.";
      }
      await sendTextMessage(user.phone_number, reply);
      await logMessage(user.id, 'Logo: non-logo attachment, replied via LLM', 'assistant');
      return STATES.WEB_COLLECT_LOGO;
    }

    // No image — classify the user's text into one of three intents:
    //   skip      — they don't have a logo / want to defer
    //   generate  — they want us to design one (we can't here)
    //   other     — anything else, re-prompt
    // One LLM call replaces a regex skip-list + a regex generate-pattern
    // + a classifyDelegation call. Handles every dialect / phrasing.
    let intent = 'other';
    if (text && text.length <= 120) {
      try {
        const resp = await generateResponse(
          `The user is replying to: "Do you have a logo? Send it as an image (JPG or PNG), or reply *skip* to use a text logo with your brand initial."

Classify their reply into ONE of: skip / generate / other.

- skip: they don't have a logo, want to skip, defer for later, or just use a text logo. Examples in any language: "skip", "no", "nope", "nahi hai mera logo", "logo nahi hai bhai", "rehne do", "abhi nahi", "later", "don't have one", "no thanks", "use a text logo", "skip krdo", "chodo bhai", "abhi nahi banaya", "nahi banaya hua".
- generate: they want US to make / design / create a logo for them. Examples: "make me a logo", "design one for me", "you create it", "can you make a logo", "surprise me", "you pick", "logo bhi banao", "logo design kr do".
- other: anything else (questions, off-topic, unclear).

Return ONLY one word: skip, generate, or other.`,
          [{ role: 'user', content: text }],
          { userId: user.id, operation: 'logo_intent_classify' }
        );
        intent = String(resp || 'other').trim().toLowerCase().split(/[\s\n]/)[0];
        if (!['skip', 'generate', 'other'].includes(intent)) intent = 'other';
      } catch (err) {
        logger.warn(`[WEBDEV-LOGO] intent classifier threw: ${err.message}`);
      }
    }

    if (intent === 'skip') {
      const wd = { ...(user.metadata?.websiteData || {}) };
      wd.logoSkipped = true;
      await updateUserMetadata(user.id, { websiteData: wd });
      user.metadata = { ...(user.metadata || {}), websiteData: wd };
      await sendTextMessage(user.phone_number, await localize("No problem — I'll use a clean text logo with your brand initial.", user, text));
      await logMessage(user.id, 'User skipped logo upload', 'assistant');
      return smartAdvance(user, message, null);
    }

    if (intent === 'generate') {
      await sendTextMessage(
        user.phone_number,
        await localize(
          "I can't auto-generate the logo here — this step is upload-or-skip only.\n\n" +
            "• Reply *skip* and I'll use a clean text logo with your brand initial (looks great on most sites, and you can swap it later)\n" +
            "• Or send your logo as an image (JPG or PNG)\n\n" +
            "_If you want a real designed logo after your site is live, just message me later and I'll spin one up for you separately._",
          user,
          text
        )
      );
      await logMessage(user.id, 'Logo: explained no auto-generation, offered upload/skip', 'assistant');
      return STATES.WEB_COLLECT_LOGO;
    }

    // Cross-field handling: the user might be sending a phone, email,
    // address, or a name/industry/service correction at the logo step
    // (e.g. they gave only an email at WEB_COLLECT_CONTACT and are now
    // sending their phone in a separate message). Apply the update + ask
    // for the logo again, instead of the blunt "didn't catch an image"
    // reply that loses the input.
    if (text && text.length >= 3) {
      const reaskLogo = "Now, got a logo? Send it as an image (JPG or PNG), or reply *skip* to use a text logo.";
      const fmt = await tryApplyContactFormat(user, text);
      if (fmt) {
        await sendTextMessage(user.phone_number, await localize(`${fmt.ackPart} ${reaskLogo}`, user, text));
        await logMessage(user.id, `Logo step: applied contact format short-circuit`, 'assistant');
        return STATES.WEB_COLLECT_LOGO;
      }
      const sc = await tryApplySideChannel(user, 'logo', text);
      if (sc) {
        await sendTextMessage(user.phone_number, await localize(`${sc.ackPart} ${reaskLogo}`, user, text));
        await logMessage(user.id, `Logo step: applied side-channel ${sc.side.kind}`, 'assistant');
        return STATES.WEB_COLLECT_LOGO;
      }
    }

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
  let unsafeReason = null;
  try {
    const { downloadMedia } = require('../../messages/sender');
    const media = await downloadMedia(message.mediaId || message.mediaUrl);
    if (media?.buffer) {
      mediaBuffer = media.buffer;
      mediaMime = media.mimeType || mediaMime;
    }
  } catch (err) {
    if (err && err.name === 'UnsafeMediaError') {
      unsafeReason = err.reason || 'unknown';
      logger.warn(`[LOGO-COLLECT] Rejected unsafe upload (${unsafeReason}, mime=${err.mimeType || 'unknown'})`);
    } else {
      logger.error(`[LOGO-COLLECT] Media download failed: ${err.message}`);
    }
  }

  if (unsafeReason) {
    await sendTextMessage(
      user.phone_number,
      await localize(
        "I can't accept that image format. Please send your logo as a JPG, PNG, or WebP — or reply *skip* to use a text logo.",
        user,
        text
      )
    );
    return STATES.WEB_COLLECT_LOGO;
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

  // Logo-revisit intent — user previously skipped logo (or never got
  // around to uploading) and is now asking to add one. Pure LLM
  // classification so any phrasing in any language gets caught
  // ("Sorry, I want the logo on my website", "logo bhejna chahta hoon",
  // "actually I do have a logo", "wait I have one"). Without this the
  // generic field-edit detection below fires and the bot replies with
  // "What would you like to change? Name to X, Industry to Y..." which
  // doesn't make sense for a logo request.
  if (originalText && originalText.length <= 140) {
    const wantsLogo = await classifyLogoRevisitIntent(originalText, user.id);
    if (wantsLogo) {
      const newWd = { ...(user.metadata?.websiteData || {}) };
      // Clear logoSkipped so nextMissingState() routes back into
      // WEB_COLLECT_LOGO. logoUrl is left unset (the upload handler
      // will fill it). After upload, smartAdvance brings the user
      // back to the confirm summary automatically.
      newWd.logoSkipped = false;
      delete newWd.logoSkipped;
      await updateUserMetadata(user.id, { websiteData: { ...newWd, logoSkipped: false } });
      user.metadata = { ...(user.metadata || {}), websiteData: { ...newWd, logoSkipped: false } };

      const { updateUserState } = require('../../db/users');
      await updateUserState(user.id, STATES.WEB_COLLECT_LOGO);
      await sendTextMessage(
        user.phone_number,
        await localize(
          "Sure — send your logo as an image (JPG or PNG) and I'll add it to the site. Or reply *skip* if you change your mind.",
          user,
          originalText
        )
      );
      await logMessage(user.id, 'User wants logo after skip — routed back to WEB_COLLECT_LOGO', 'assistant');
      return STATES.WEB_COLLECT_LOGO;
    }
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

  // Field-edit detection is LLM-only — the prior regex layer kept
  // mis-handling natural-language phrasings (e.g. "to" inside "too",
  // "is" inside "isle", `are` chewing into "area"). Even with word
  // boundaries the regexes were brittle. The LLM call below sees the
  // current website data plus the user's message and returns an array
  // of edits in any language, with typos handled, multi-field edits
  // supported. Cost: one LLM call per non-confirm WEB_CONFIRM turn —
  // acceptable since `classifyConfirmIntent` above already short-
  // circuits "yes" / "build it" / "looks good" without hitting this
  // path.
  const llmEdits = await detectFieldEditsLLM(originalText, wd, user.id);

  // Mutates wd in place for one field. Returns a short ack string like
  // "business name → *MyCo*" or null if the value wasn't applicable. Shared
  // by the single-edit and multi-edit paths below.
  const mutateWdForField = (field, value) => {
    const v = String(value || '').trim();
    if (!v) return null;
    switch (field) {
      case 'businessName':
      case 'name':
        wd.businessName = normalizeBusinessName(v);
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

  // Apply LLM-detected edits as a batch. Supports multi-field replies
  // ("name: X, services: Y") in one go — same UX the prior regex
  // pipeline gave us, but with the LLM doing the parsing instead.
  if (llmEdits.length > 0) {
    // Industry-to-salon edge case (side-effect flow transition): only fires
    // when industry is the SOLE edit AND moves to a salon-y industry that
    // needs the salon-specific sub-flow.
    const singleIndustrySalon =
      llmEdits.length === 1 &&
      llmEdits[0].field === 'industry' &&
      isSalonIndustry(llmEdits[0].value) &&
      !wd.bookingMode &&
      (!Array.isArray(wd.salonServices) || wd.salonServices.length === 0);
    if (singleIndustrySalon) {
      const r = await applyFieldEdit(llmEdits[0].field, llmEdits[0].value);
      if (r !== null) return r;
    }

    const labels = [];
    for (const m of llmEdits) {
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
    // Website price is admin-managed (admin_settings.website_price). Env
    // var DEFAULT_ACTIVATION_PRICE is now just the cold-cache fallback.
    const { getNumberSetting } = require('../../db/settings');
    const envDefaultWebsitePrice = parseFloat(process.env.DEFAULT_ACTIVATION_PRICE || '199');
    const websitePrice = await getNumberSetting('website_price', envDefaultWebsitePrice);
    // Exact NameSilo price — preserve cents. parseFloat keeps $17.29 as 17.29
    // instead of truncating to 17.
    const domainPrice = parseFloat(freshUser.metadata?.domainPrice || 0);
    const selectedDomain = freshUser.metadata?.selectedDomain || null;
    const activationTotal = +(websitePrice + domainPrice).toFixed(2);

    // Both the banner on the preview site and the chat message point to
    // the same raw Stripe checkout URL — customers consistently see a
    // recognizable buy.stripe.com URL wherever they click. The banner is
    // automatically removed from the site once payment clears
    // (redeployAsPaid), so there's no "accidental second payment" risk
    // from the banner path either.
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
      // Prefer raw Stripe URL for both — same recognizable checkout URL
      // in banner and chat. Fall back to pixieUrl only if url isn't set.
      const rawStripeUrl = linkResult?.url || linkResult?.pixieUrl || null;
      bannerPaymentUrl = rawStripeUrl;
      chatPaymentUrl = rawStripeUrl;
      logger.info(
        `[WEBGEN] Activation link created: $${activationTotal} ` +
          `(website $${websitePrice} + domain $${domainPrice} for ${selectedDomain || 'no domain'})`
      );
    } catch (err) {
      // Non-fatal — banner will fall back to a WhatsApp CTA if no link
      logger.warn(`[WEBGEN] Activation payment link setup failed: ${err.message}`);
    }
    const paymentLinkUrl = bannerPaymentUrl; // backwards-compat alias for the banner

    // Resolve the user's chat language and pass it explicitly to the
    // generator. Without this, the website-content prompt's "same
    // language as the user" instruction has nothing to anchor on (the
    // generator only sees the structured business-data block, not the
    // conversation history) — the LLM has been observed picking French
    // for businesses with words like "salon" in the name even when the
    // entire WhatsApp chat was in English. Best-effort: failure falls
    // back to 'english' inside resolveLanguage.
    let userLanguage = 'english';
    try {
      const { resolveLanguage } = require('../../utils/localizer');
      userLanguage = await resolveLanguage(freshUser, null);
    } catch (err) {
      logger.warn(`[WEBGEN] Language resolution failed, defaulting to english: ${err.message}`);
    }

    // Banner shows the same dollar figure the chat CTA charges. At initial
    // build there's no discount yet — originalAmount matches activationAmount
    // and discountPct is 0 until the 22h discount job fires.
    const siteConfig = await generateWebsiteContent(websiteData, {
      templateId,
      siteId,
      userId: user.id,
      userLanguage,
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
      // Format prices with 2 decimals when they have cents, plain integer
      // when whole-dollar (so $199 doesn't render as $199.00).
      const fmt = (n) => (Number.isInteger(n) ? `$${n}` : `$${Number(n).toFixed(2)}`);
      const priceLine = domainPrice > 0 && selectedDomain
        ? `*${fmt(activationTotal)}* — ${fmt(websitePrice)} website + ${fmt(domainPrice)} for *${selectedDomain}*.`
        : selectedDomain
          ? `*${fmt(activationTotal)}* — I'll point *${selectedDomain}* at your new site right after payment.`
          : `*${fmt(activationTotal)}*.`;
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
    // Surfacing the revision policy here avoids the trust-breaking moment of
    // hitting the wall later. The pitch is: 3 free rounds + unlimited once
    // they activate the site, which doubles as a soft conversion lever
    // (more tweaks = activate to unlock).
    await sendTextMessage(
      user.phone_number,
      `There you go! Have a look and let me know what you think — want any changes, or are you happy with it?\n\n_You get *${FREE_REVISIONS} free rounds of revisions*; once you activate the site you unlock *unlimited revisions* — keep tweaking until it's exactly right._`
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

// User is claiming they've paid the activation link. Hits when they
// write "made the payment", "i paid", "payment done", etc. — short
// replies that would otherwise be mis-classified as design approval
// (or, worse, mis-routed into the legacy DOMAIN_OFFER re-pitch). Kept
// narrow: regex first so there's no LLM latency on the fast path; the
// gating in handleRevisions already caps to ≤80 chars so long prose
// like "i paid but can you also change the headline" still goes
// through the revision parser.
const PAID_CLAIM_RX = /\b(?:i\s+(?:just\s+)?paid|paid\s+(?:it|for\s+it|the\s+(?:link|site|website|activation))?|made\s+(?:the\s+)?payment|payment\s+(?:is\s+)?(?:done|made|complete(?:d)?|sent|successful)|done\s+paying|i(?:'ve| have)\s+(?:just\s+)?paid|just\s+paid|sent\s+the\s+money|payment\s+sent)\b/i;

// Poll Stripe for a user's latest pending payment and, if paid, run
// the full post-payment flow (same path the Stripe webhook uses). In
// test mode or when webhooks aren't configured, this is the user's
// on-demand way to trigger confirmation. Returns a new state so the
// caller can just `return handlePaidClaim(user)` from its branch.
async function handlePaidClaim(user) {
  const { getLatestPendingPayment } = require('../../db/payments');
  const { env } = require('../../config/env');

  let pending = null;
  try {
    pending = await getLatestPendingPayment(user.id);
  } catch (err) {
    logger.warn(`[WEBDEV-PAID-CLAIM] Pending payment lookup failed: ${err.message}`);
  }

  const pendingUrl = pending?.stripe_payment_link_url || null;
  const restateLink = pendingUrl
    ? `Here's the activation link again just in case:\n\n👉 ${pendingUrl}`
    : `Your activation link is in the preview message above.`;

  // No pending row — either already confirmed, or was never created.
  // Be gracious: thank them and stay put. If the payment was already
  // processed, the banner was already removed and the confirmation was
  // already sent — a duplicate here would be noise.
  if (!pending?.stripe_payment_link_id) {
    await sendTextMessage(
      user.phone_number,
      `Thanks! If the payment went through you should see your site unlock shortly. If anything looks off, just let me know.`
    );
    await logMessage(user.id, 'Paid claim: no pending payment found', 'assistant');
    return STATES.WEB_REVISIONS;
  }

  // Poll Stripe for a completed session on this payment link. If found,
  // hand off to the shared post-payment handler — it's idempotent and
  // sends its own success message to the user, so we don't double-send.
  try {
    if (env.stripe?.secretKey) {
      const Stripe = require('stripe');
      const stripeClient = new Stripe(env.stripe.secretKey);
      const sessions = await stripeClient.checkout.sessions.list({
        payment_link: pending.stripe_payment_link_id,
        limit: 5,
      });
      const paidSession = sessions.data.find(
        (s) => s.payment_status === 'paid' || s.status === 'complete'
      );
      if (paidSession) {
        const { handleConfirmedPayment } = require('../../payments/postPayment');
        const result = await handleConfirmedPayment(pending, paidSession);
        logger.info(
          `[WEBDEV-PAID-CLAIM] User claim confirmed via on-demand poll for ${user.phone_number} ` +
            `(payment ${pending.id}, skipped=${!!result.skipped})`
        );
        return STATES.WEB_REVISIONS;
      }
    }
  } catch (err) {
    logger.warn(`[WEBDEV-PAID-CLAIM] Stripe poll threw: ${err.message}`);
  }

  // Not paid yet at Stripe. Could be a) mid-processing, b) the user
  // meant "I'm about to pay", or c) they paid a stale link. Give them
  // a short acknowledgement with the live link restated — the 2-minute
  // scheduler poll will catch a real payment whether or not they
  // message back.
  await sendTextMessage(
    user.phone_number,
    `Thanks! I don't see the payment landed on Stripe's side yet — it sometimes takes a minute or two to confirm. I'll unlock your site as soon as it clears. ${restateLink}`
  );
  await logMessage(user.id, 'Paid claim: not yet confirmed at Stripe — restated link', 'assistant');
  return STATES.WEB_REVISIONS;
}

// Post-approval path when the user already answered the pre-build
// domain question (WEB_DOMAIN_CHOICE → need / own / skip). In all three
// cases the legacy DOMAIN_OFFER re-pitch is noise — we already have
// their choice, the activation Stripe link, and the preview banner
// pointing at it. This helper acknowledges the approval and resurfaces
// the existing activation link so the user knows exactly what to click.
// Handles both the "domain locked in" and "skipped, site-only" shapes.
async function acknowledgeApprovalAfterDomainChoice(user) {
  const selectedDomain = user.metadata?.selectedDomain || null;
  const { getNumberSetting } = require('../../db/settings');
  const envDefaultWebsitePrice = parseInt(process.env.DEFAULT_ACTIVATION_PRICE || '199', 10);
  const websitePrice = await getNumberSetting('website_price', envDefaultWebsitePrice);
  const domainPrice = parseInt(user.metadata?.domainPrice || 0, 10);
  const total = websitePrice + domainPrice;

  // The same Stripe URL the user saw on the preview banner / activation
  // chat message — pending row was written at createPaymentLink time.
  // Fire-and-forget: a missing row still lets us send a useful ack.
  let activationUrl = null;
  try {
    const { getLatestPendingPayment } = require('../../db/payments');
    const pending = await getLatestPendingPayment(user.id);
    activationUrl = pending?.stripe_payment_link_url || null;
  } catch (err) {
    logger.warn(`[WEBDEV-APPROVE] Pending payment lookup failed: ${err.message}`);
  }

  const priceLine = domainPrice > 0 && selectedDomain
    ? `*$${total}* — $${websitePrice} website + $${domainPrice} for *${selectedDomain}*.`
    : selectedDomain
      ? `*$${total}* — I'll point *${selectedDomain}* at your site once payment clears.`
      : `*$${total}*.`;

  const tail = activationUrl
    ? `Activate to go live:\n\n👉 ${activationUrl}`
    : `Your activation link is in the preview message above — tap it to go live.`;

  await sendTextMessage(
    user.phone_number,
    `🎉 *Awesome!* Your website is approved.\n\n${priceLine}\n\n${tail}\n\nOr tell me if you'd like any changes.`
  );
  await logMessage(
    user.id,
    `Approval ack (pre-selected domain=${selectedDomain || 'none'}, link=${activationUrl ? 'resent' : 'none'})`,
    'assistant'
  );
  // Stay in WEB_REVISIONS so the user can still ask for tweaks or swap
  // the domain by replying naturally. The legacy DOMAIN_OFFER state
  // isn't the right home for a user who already has a domain locked.
  return STATES.WEB_REVISIONS;
}

/**
 * Sanitize a target id for use as a WhatsApp button/list-row id. The id we
 * store on the row is `target_<sanitized>` so we can route the reply back.
 * WhatsApp list-row ids accept up to 200 chars and allow letters/digits/
 * `_`/`-`; we play safe by replacing anything else (colons, spaces, dots,
 * etc.) with `__` so neighborhood names like "Downtown Seattle" survive.
 * Reverse with restoreTargetId().
 *
 * The roundtrip isn't lossless when the original target id contained `__`
 * — we don't, so this is fine in practice. Document so a future
 * neighborhood named "Foo__Bar" doesn't surprise anyone.
 */
function targetIdToRowId(targetId) {
  return `target_${String(targetId).replace(/[^a-zA-Z0-9_-]/g, '__')}`;
}
function restoreTargetId(rowId, availableTargets = []) {
  const tail = String(rowId).replace(/^target_/, '');
  // Direct match first (covers most ids: "hero", "logo", "service__0").
  const direct = tail.replace(/__/g, ':');
  if (availableTargets.find((t) => t.id === direct)) return direct;
  // Fallback: scan available targets and find the one whose sanitized form
  // matches. Necessary for neighborhood names with spaces / punctuation
  // where the encoding is lossy.
  const found = availableTargets.find((t) => targetIdToRowId(t.id) === rowId);
  return found ? found.id : direct;
}

/**
 * Ask a small LLM call to map an image-upload caption to one of the
 * available target ids. Returns the target id (e.g. "service:0") or null
 * if the caption is empty/ambiguous. Cheap and side-effect-free.
 */
async function classifyImageCaption(caption, targets, userId) {
  const text = String(caption || '').trim();
  if (!text || text === '[Image]' || !targets?.length) return null;
  const targetsText = targets.map((t) => `- ${t.id} — ${t.label}`).join('\n');
  const sys = `You route a single image upload to ONE slot on a small business website.\n\nAvailable slots:\n${targetsText}\n\nReply with ONLY the slot id (e.g. "hero", "logo", "service:0"). If the caption doesn't clearly point at a single slot, reply with the literal word "unclear".`;
  try {
    const { generateResponse } = require('../../llm/provider');
    const resp = await generateResponse(
      sys,
      [{ role: 'user', content: text }],
      { userId, operation: 'webdev_image_target_classify' }
    );
    const guess = String(resp || '').trim().toLowerCase().split(/[\s\n,.;]/)[0];
    if (!guess || guess === 'unclear') return null;
    return targets.find((t) => t.id.toLowerCase() === guess) ? guess : null;
  } catch (err) {
    logger.warn(`[WEB_REVISIONS] Caption classifier failed: ${err.message}`);
    return null;
  }
}

const FREE_REVISIONS = 3;

/**
 * True when the user has already paid for activation on their latest
 * generated site. Paid users get unlimited revisions — both as a sales
 * lever ("activate to unlock unlimited tweaks") and because we don't
 * want to nickel-and-dime someone who already paid.
 *
 * Detected via site_data.paymentStatus === 'paid' (set by the
 * post-payment redeploy path in src/website-gen/redeployer.js). If a
 * site is later refunded, redeployer flips the status back to
 * 'preview' and the cap re-applies — that's intentional.
 */
async function userHasPaidForSite(user) {
  try {
    const site = await getLatestSite(user.id);
    return site?.site_data?.paymentStatus === 'paid';
  } catch {
    return false;
  }
}

/**
 * Hard cap pitch — fired any time a free-tier user tries to apply
 * revision #(FREE_REVISIONS + 1) or beyond. The pitch leans on
 * "activate now and get unlimited" as the natural upgrade path,
 * not just a flat custom-work quote, since that's the one number
 * the user already saw.
 */
async function pitchRevisionUpgrade(user, count) {
  const { getNumberSetting } = require('../../db/settings');
  const websitePrice = await getNumberSetting(
    'website_price',
    parseInt(process.env.DEFAULT_ACTIVATION_PRICE || '199', 10)
  );
  const revisionFloor = await getNumberSetting('revision_price', 200);

  // Resurface the existing activation link if there's a pending payment
  // row, so the user can pay right from the cap pitch without us sending
  // them on a hunt for an old message.
  let activationUrl = null;
  try {
    const { getLatestPendingPayment } = require('../../db/payments');
    const pending = await getLatestPendingPayment(user.id);
    activationUrl = pending?.stripe_payment_link_url || null;
  } catch {
    /* fall through — pitch text still goes out */
  }

  const lines = [
    `You've already used your ${FREE_REVISIONS} free revisions for this site.`,
    '',
    `*Activate the site for $${websitePrice}* and you get *unlimited revisions* — keep tweaking until it's exactly right.`,
    '',
    `Otherwise: any further changes here are scoped as custom work (starts at $${revisionFloor}, or we can hop on a call).`,
  ];
  if (activationUrl) lines.push('', `Activate to unlock unlimited revisions:\n${activationUrl}`);
  await sendTextMessage(user.phone_number, lines.join('\n'));

  try {
    const calendlyUrl = require('../../config/env').env.calendlyUrl;
    if (calendlyUrl) {
      await sendCTAButton(
        user.phone_number,
        'Or book a call to scope custom work 👇',
        '📅 Book a Call',
        calendlyUrl
      );
    }
  } catch {
    /* CTA is optional — pitch text already went out */
  }
  await logMessage(user.id, `Revision ${count} blocked — ${FREE_REVISIONS}-revision cap reached, pitched activation`, 'assistant');
}

/**
 * Single gate that every revision-applying path must pass through. Returns
 * { ok, count, paid } where count is the projected revision number
 * (current+1) and paid is true when the user is on the unlimited tier.
 *
 * Paid users always pass — count still increments so the admin panel
 * shows their usage, but the cap is bypassed. Free users get
 * FREE_REVISIONS attempts; the (FREE_REVISIONS+1)th triggers the
 * upgrade pitch and `ok=false`.
 *
 * Caller is responsible for incrementing metadata.revisionCount AFTER
 * receiving ok=true so a later failure can refund without an extra
 * DB hit.
 */
async function gateNextRevision(user) {
  const projected = (user.metadata?.revisionCount || 0) + 1;
  const paid = await userHasPaidForSite(user);
  if (paid) return { ok: true, count: projected, paid: true };
  if (projected > FREE_REVISIONS) {
    await pitchRevisionUpgrade(user, projected);
    return { ok: false, count: projected, paid: false };
  }
  return { ok: true, count: projected };
}

/**
 * Shared deploy-and-ack path for any image revision (user-uploaded OR
 * Pexels-fetched). Refunds the revision count if the redeploy fails so
 * the user doesn't burn one of their two free revisions on something
 * they can't see.
 *
 * `image` shape: { url, photographer?, dominantColor?, source? }. For
 * the logo target, only image.url is read (logo is stored as a string).
 *
 * `additionalUpdates` (optional): a flat object of non-special parser
 * fields like { headline, primaryColor, services } that should be
 * applied IN THE SAME deploy. The user often mixes asks in one
 * message ("change headline AND swap the hero photo") — without this,
 * the image-swap branch returned early and the text changes vanished.
 */
async function applyImageRevision({ user, site, currentConfig, targetId, image, revisionCount, additionalUpdates = null, paid = false }) {
  const { applyImageToTarget, describeTarget } = require('../../website-gen/imageTargets');
  let updatedConfig = applyImageToTarget(currentConfig, targetId, image);
  const hasExtras = additionalUpdates && Object.keys(additionalUpdates).length > 0;
  if (hasExtras) {
    updatedConfig = { ...updatedConfig, ...additionalUpdates };
  }
  const where = (describeTarget(targetId, updatedConfig) || targetId).toLowerCase();

  const workingVariants = [
    `on it — putting that on the ${where}...`,
    `got it, updating the ${where}...`,
    `sure, redeploying with the new ${where}...`,
    `one sec, applying that to the ${where}...`,
  ];
  await sendTextMessage(user.phone_number, workingVariants[Math.floor(Math.random() * workingVariants.length)]);

  try {
    const { deployToNetlify } = require('../../website-gen/deployer');
    const { previewUrl, netlifySiteId, netlifySubdomain } =
      await deployToNetlify(updatedConfig, site?.netlify_site_id || null);
    if (site) {
      await updateSite(site.id, {
        site_data: updatedConfig,
        preview_url: previewUrl,
        netlify_site_id: netlifySiteId,
        netlify_subdomain: netlifySubdomain,
      });
    }

    let note;
    if (paid) {
      note = '_Unlimited revisions on this site — keep tweaking until it\'s perfect._';
    } else {
      const remaining = Math.max(0, FREE_REVISIONS - revisionCount);
      const revisionFloor = await require('../../db/settings').getNumberSetting('revision_price', 200);
      note = remaining > 0
        ? `You have *${remaining}* revision${remaining === 1 ? '' : 's'} left — or activate to unlock unlimited.`
        : `That was your last free revision — activate the site to unlock unlimited, or further changes get scoped at $${revisionFloor}.`;
    }
    const headline = hasExtras
      ? `Done — ${where} updated, plus your other changes are in.`
      : `Done — ${where} updated.`;
    await sendTextMessage(
      user.phone_number,
      `${headline} Take another look:\n\n${previewUrl}\n\n${note}\n\nWant to tweak anything else, or are we good?`
    );
    await logMessage(
      user.id,
      `Image revision applied (target=${targetId}, source=${image.source || 'pexels'}, revision ${revisionCount}${hasExtras ? `, +${Object.keys(additionalUpdates).length} field updates` : ''})`,
      'assistant'
    );
    return true;
  } catch (err) {
    logger.error(`[WEB_REVISIONS] Deploy failed for ${targetId}: ${err.message}`);
    await updateUserMetadata(user.id, { revisionCount: Math.max(0, revisionCount - 1) });
    await sendTextMessage(
      user.phone_number,
      "I uploaded the image but the redeploy failed. Try once more, or tell me to retry?"
    );
    return false;
  }
}

async function handleRevisions(user, message) {
  // Accept list-reply (listId) the same way as button-reply (buttonId) —
  // some interactive prompts (image-target picker) use lists because we
  // need more than 3 options.
  const buttonId = message.buttonId || message.listId || '';

  // Route svc_general to general chat (from error retry menu)
  if (buttonId === 'svc_general') {
    await updateUserState(user.id, STATES.GENERAL_CHAT);
    const { handleGeneralChat } = require('./generalChat');
    return handleGeneralChat(user, message);
  }

  if (buttonId === 'web_approve') {
    const siteId = user.metadata?.currentSiteId;
    if (siteId) await updateSite(siteId, { status: 'approved' });

    // Domain was already chosen pre-build — skip the legacy "want a
    // domain?" re-pitch and resurface the existing activation link.
    if (user.metadata?.selectedDomain || user.metadata?.domainChoice === 'skip') {
      return acknowledgeApprovalAfterDomainChoice(user);
    }

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

  // ── Image-target picker reply ──────────────────────────────────────────
  // User sent us a photo earlier without a clear caption, so we asked
  // "where should this go?" via an interactive list. Their list-reply id
  // is `target_<sanitized>`. Look up the pending upload, apply it.
  if (buttonId.startsWith('target_') && user.metadata?.pendingImageUpload?.url) {
    const site = await getLatestSite(user.id);
    if (!site?.preview_url) {
      await sendTextMessage(user.phone_number, "Hm — I lost track of your site. Tell me what to do?");
      await updateUserMetadata(user.id, { pendingImageUpload: null });
      return STATES.WEB_REVISIONS;
    }
    const currentConfig = site.site_data || user.metadata?.websiteData || {};
    const { getAvailableTargets } = require('../../website-gen/imageTargets');
    const targets = getAvailableTargets(currentConfig);
    const targetId = restoreTargetId(buttonId, targets);
    if (!targets.find((t) => t.id === targetId)) {
      await sendTextMessage(user.phone_number, "That slot isn't on your site — try picking another option.");
      return STATES.WEB_REVISIONS;
    }

    const pending = user.metadata.pendingImageUpload;
    await updateUserMetadata(user.id, { pendingImageUpload: null });

    // Cap at FREE_REVISIONS for free-tier users; paid users skip this
    // gate and get unlimited. The image upload already happened in a
    // prior turn (Supabase) — if we cap-block now, the URL is just
    // unused, no harm done.
    const limit = await gateNextRevision(user);
    if (!limit.ok) return STATES.SALES_CHAT;
    const revisionCount = limit.count;
    await updateUserMetadata(user.id, { revisionCount });

    await applyImageRevision({
      user,
      site,
      currentConfig,
      targetId,
      image: { url: pending.url, source: pending.source || 'user_upload' },
      revisionCount,
      paid: limit.paid,
    });
    return STATES.WEB_REVISIONS;
  }

  // ── Inbound image during revisions ─────────────────────────────────────
  // Three paths:
  //   1. We previously asked for an upload to a specific slot
  //      (metadata.awaitingImageUpload.target). Route there.
  //   2. The image carries a caption that maps to a slot via the LLM
  //      classifier ("yeh hero pe lagao" / "make this my logo").
  //   3. Otherwise stash the upload and ask "where should I put this?"
  //      via an interactive list.
  // For the logo target we run the existing remove.bg pipeline so the
  // logo lands transparent. Everything else gets a raw upload — services,
  // listings, neighborhoods, agent headshots are usually fine as-is.
  if (message.type === 'image' && (message.mediaId || message.mediaUrl)) {
    const site = await getLatestSite(user.id);
    if (!site?.preview_url) {
      await sendTextMessage(
        user.phone_number,
        "I don't have a generated website for you yet — tell me what kind of site you want and I'll start fresh."
      );
      return STATES.WEB_REVISIONS;
    }

    // Image-as-feedback vs image-as-swap classification. Users sometimes
    // upload a screenshot of a problem ("on the website it's showing X
    // — fix it") rather than an image they want placed on the site.
    // If we go straight into the target picker, the user gets a
    // confusing list when they wanted us to read their text and act.
    // Skip this when an awaiting-upload flag is already set (we're
    // waiting for the image specifically) — in that case the image is
    // unambiguously the requested upload.
    const caption = (message.caption || message.text || '').trim();
    const awaiting = user.metadata?.awaitingImageUpload?.target;
    if (caption && caption !== '[Image]' && !awaiting) {
      try {
        const intentResp = await generateResponse(
          `The user just sent an image with this caption while in the website-revisions state.

Decide what they're trying to do:

- "swap" — they want us to place this image on the site (as the hero, logo, a service photo, etc.). Examples: "use this for the hero", "this is my logo", "put this on the about page", "yeh hero pe lagao".
- "feedback" — they're sending us a screenshot of something on the site that they want us to NOTICE and fix. The text describes a PROBLEM, asks us to look at something, points at a bug, complains about a render, or contains words like "why is", "fix this", "look at", "yeh kya hai", "this is broken". The image itself is evidence, not a replacement.
- "unclear" — neither obvious. Default to swap-like flow only when there's no problem-language at all.

Caption: "${caption.slice(0, 300)}"

Reply with ONLY one word: swap, feedback, or unclear.`,
          [{ role: 'user', content: caption }],
          { userId: user.id, operation: 'image_intent_classify' }
        );
        const intent = String(intentResp || '').trim().toLowerCase().split(/[\s\n,.;]/)[0];
        if (intent === 'feedback') {
          // Don't treat as a swap — surface the caption to the LLM
          // revision parser so the user's actual ask gets handled like
          // any other revision request.
          logger.info(`[WEB_REVISIONS] Image classified as feedback, not swap. caption="${caption.slice(0, 80)}"`);
          await sendTextMessage(
            user.phone_number,
            "Got it — I'll take that as feedback rather than a new image to drop in. Tell me what to change and I'll fix it."
          );
          return STATES.WEB_REVISIONS;
        }
      } catch (err) {
        logger.warn(`[WEB_REVISIONS] Image intent classifier failed: ${err.message}`);
      }
    }

    let buffer = null;
    let mime = 'image/jpeg';
    try {
      const { downloadMedia } = require('../../messages/sender');
      const media = await downloadMedia(message.mediaId || message.mediaUrl);
      if (media?.buffer) {
        buffer = media.buffer;
        mime = media.mimeType || mime;
      }
    } catch (err) {
      logger.error(`[WEB_REVISIONS] Image download failed: ${err.message}`);
    }
    if (!buffer) {
      await sendTextMessage(user.phone_number, "I couldn't download that image. Mind sending it again?");
      return STATES.WEB_REVISIONS;
    }

    const currentConfig = site.site_data || user.metadata?.websiteData || {};
    const { getAvailableTargets } = require('../../website-gen/imageTargets');
    const targets = getAvailableTargets(currentConfig);

    // Path 1: pre-asked target
    let targetId = null;
    if (user.metadata?.awaitingImageUpload?.target) {
      const asked = user.metadata.awaitingImageUpload.target;
      if (targets.find((t) => t.id === asked)) targetId = asked;
      await updateUserMetadata(user.id, { awaitingImageUpload: null });
    }

    // Path 2: caption-driven target
    if (!targetId) {
      const caption = (message.caption || message.text || '').trim();
      if (caption && caption !== '[Image]') {
        targetId = await classifyImageCaption(caption, targets, user.id);
      }
    }

    // Upload now. Logo target gets remove.bg + transparent-PNG output;
    // everything else takes the raw upload via the same Supabase bucket.
    let uploadedImage = null;
    if (targetId === 'logo') {
      try {
        const { processLogo } = require('../../website-gen/logoProcessor');
        const result = await processLogo(buffer, mime);
        if (result?.url) uploadedImage = { url: result.url, source: 'user_upload' };
      } catch (err) {
        logger.error(`[WEB_REVISIONS] processLogo failed: ${err.message}`);
      }
    }
    if (!uploadedImage) {
      try {
        const { uploadLogoImage } = require('../../logoGeneration/imageUploader');
        const url = await uploadLogoImage(buffer.toString('base64'), mime);
        uploadedImage = { url, source: 'user_upload' };
      } catch (err) {
        logger.error(`[WEB_REVISIONS] Image upload failed: ${err.message}`);
        await sendTextMessage(user.phone_number, "Something went wrong uploading that image — try sending it again in a moment?");
        return STATES.WEB_REVISIONS;
      }
    }

    // Path 3: target still unknown → ask via interactive list. We stash
    // the upload URL so the next list-reply can route it.
    if (!targetId) {
      await updateUserMetadata(user.id, {
        pendingImageUpload: { url: uploadedImage.url, source: 'user_upload' },
      });

      // Order targets so empty slots come first (most-likely intent), cap
      // to 10 because that's WhatsApp's list-row hard limit.
      const ordered = targets
        .slice()
        .sort((a, b) => Number(!!a.currentUrl) - Number(!!b.currentUrl))
        .slice(0, 10);

      const rows = ordered.map((t) => ({
        id: targetIdToRowId(t.id),
        title: t.label.length > 24 ? `${t.label.slice(0, 23)}…` : t.label,
        description: t.currentUrl ? 'Replace current image' : 'Currently empty',
      }));

      await sendInteractiveList(
        user.phone_number,
        'Got the image — where should I put it?',
        'Pick a slot',
        [{ title: 'Image targets', rows }]
      );
      return STATES.WEB_REVISIONS;
    }

    // Paths 1 & 2: apply directly. Cap at FREE_REVISIONS for free
    // users; paid users skip the gate. If cap-blocked, the uploaded
    // image just sits unused in Supabase — no further harm.
    const limit = await gateNextRevision(user);
    if (!limit.ok) return STATES.SALES_CHAT;
    const revisionCount = limit.count;
    await updateUserMetadata(user.id, { revisionCount });

    await applyImageRevision({
      user,
      site,
      currentConfig,
      targetId,
      image: uploadedImage,
      revisionCount,
      paid: limit.paid,
    });
    return STATES.WEB_REVISIONS;
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

      // Paid-claim short-circuit — runs BEFORE the design-approval
      // classifier. "Made the payment" / "i paid" / "done paying" are
      // claims about Stripe, not about the site design. The approval
      // classifier used to read them as positive-sentiment short
      // replies and mis-route them into the approval → DOMAIN_OFFER
      // legacy flow. Instead: poll Stripe on demand. If paid, hand off
      // to handleConfirmedPayment (same code path the webhook hits);
      // if not, tell the user we haven't seen it yet and restate the
      // link.
      if (revisionText && revisionText.length <= 80 && PAID_CLAIM_RX.test(revisionText)) {
        return handlePaidClaim(user);
      }

      // Late-domain intent — user originally skipped domain (or never
      // got a selection in) and now wants one. Two scenarios share this
      // entry: pre-paid (we'll supersede the existing pending Stripe
      // link with a new combined one) and already-paid (we'll create a
      // separate domain-add-on charge). Both are handled in
      // handleLateDomainStart based on the user's current paid state.
      if (
        revisionText &&
        revisionText.length <= 120 &&
        !user.metadata?.selectedDomain &&
        await classifyLateDomainIntent(revisionText, user.id)
      ) {
        return handleLateDomainStart(user, revisionText);
      }

      // Change-domain intent — user already has a domain selected (need
      // or own) but wants something different. Same architecture as
      // late-add but with a reset-and-re-enter step first. Covers:
      //   - "actually pick a different domain" (change_domain)
      //   - "actually use my own" (switch_to_own from search-selected)
      //   - "no, find me a new one instead" (switch_to_search from
      //     own-selected)
      if (
        revisionText &&
        revisionText.length <= 140 &&
        user.metadata?.selectedDomain
      ) {
        const action = await classifyDomainMutationIntent(
          revisionText,
          user.metadata.selectedDomain,
          user.id
        );
        if (action !== 'none') {
          return handleDomainChangeStart(user, revisionText, action);
        }
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

          if (user.metadata?.selectedDomain || user.metadata?.domainChoice === 'skip') {
            return acknowledgeApprovalAfterDomainChoice(user);
          }

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

    // Free users get FREE_REVISIONS attempts; the next one triggers the
    // activation pitch. Paid users skip the cap entirely (unlimited as a
    // post-purchase perk). Approval was already short-circuited above
    // via classifyConfirmIntent, so anything reaching this point is a
    // real change request and counts.
    const limit = await gateNextRevision(user);
    if (!limit.ok) return STATES.SALES_CHAT;
    const revisionCount = limit.count;
    const paidTier = limit.paid;
    await updateUserMetadata(user.id, { revisionCount });

    try {
      const { generateResponse } = require('../../llm/provider');
      const { REVISION_PARSER_PROMPT } = require('../../llm/prompts');
      const { deployToNetlify } = require('../../website-gen/deployer');
      const { findOrCreateUser } = require('../../db/users');

      const freshUser = await findOrCreateUser(user.phone_number, user.channel, user.via_phone_number_id);
      const site = await getLatestSite(user.id);
      const currentConfig = site?.site_data || freshUser.metadata?.websiteData || {};

      // Build the image-targets list the parser will use to resolve which
      // slot the user is referring to ("first service", "logo", etc.).
      // Without this, the parser can't pick a slot for non-hero targets.
      const { getAvailableTargets } = require('../../website-gen/imageTargets');
      const availableTargets = getAvailableTargets(currentConfig);
      const targetsList = availableTargets.map((t) => `${t.id} — ${t.label}`).join('\n');

      const response = await generateResponse(
        REVISION_PARSER_PROMPT,
        [{ role: 'user', content: `Current config: ${JSON.stringify(currentConfig)}\n\nAvailable image targets:\n${targetsList}\n\nUser request: ${revisionText}` }],
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

        if (user.metadata?.selectedDomain || user.metadata?.domainChoice === 'skip') {
          return acknowledgeApprovalAfterDomainChoice(user);
        }

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

      // ── User asked to upload their own image but didn't attach one ─────
      // ("I want to use my own logo, let me send it" — possibly mixed
      // with text changes in the same message: "change headline AND let
      // me send my logo"). Stash the target so the next inbound image
      // routes to it. If the user ALSO included text-field changes,
      // apply those now (using this revision); otherwise refund — they
      // shouldn't burn a revision on just the upload-request prompt.
      // The eventual image upload counts as its own revision.
      if (updates._imageRequest && updates._imageTarget) {
        const { getAvailableTargets, describeTarget } = require('../../website-gen/imageTargets');
        const targets = getAvailableTargets(currentConfig);
        const target = String(updates._imageTarget);
        if (!targets.find((t) => t.id === target)) {
          await sendTextMessage(
            user.phone_number,
            `That slot doesn't exist on your site. You can change: ${targets.map((t) => t.label).slice(0, 6).join(', ')}.`
          );
          await updateUserMetadata(user.id, { revisionCount: Math.max(0, revisionCount - 1) });
          return STATES.WEB_REVISIONS;
        }

        const SPECIAL_KEYS = new Set([
          '_imageQuery', '_imageTarget', '_imageRequest',
          '_approved', '_unclear', '_message',
        ]);
        const textUpdates = {};
        for (const k of Object.keys(updates)) {
          if (!SPECIAL_KEYS.has(k)) textUpdates[k] = updates[k];
        }
        const hasText = Object.keys(textUpdates).length > 0;

        await updateUserMetadata(user.id, { awaitingImageUpload: { target } });

        const where = (describeTarget(target, currentConfig) || target).toLowerCase();

        if (hasText) {
          // Deploy the text changes immediately. The revision was already
          // counted; the queued image upload will count as a separate one
          // when it arrives.
          try {
            const updatedConfig = { ...currentConfig, ...textUpdates };
            const existingSiteId = site?.netlify_site_id || null;
            const { previewUrl, netlifySiteId, netlifySubdomain } =
              await deployToNetlify(updatedConfig, existingSiteId);
            if (site) {
              await updateSite(site.id, {
                site_data: updatedConfig,
                preview_url: previewUrl,
                netlify_site_id: netlifySiteId,
                netlify_subdomain: netlifySubdomain,
              });
            }
            await sendTextMessage(
              user.phone_number,
              `Got it — applied your changes. Take a look:\n\n${previewUrl}\n\nNow send me the image you'd like for the ${where} and I'll put it up.`
            );
            await logMessage(
              user.id,
              `Revision ${revisionCount} text changes applied; awaiting upload for ${target}`,
              'assistant'
            );
          } catch (deployErr) {
            logger.error(`[WEB_REVISIONS] _imageRequest pre-deploy failed: ${deployErr.message}`);
            await updateUserMetadata(user.id, { revisionCount: Math.max(0, revisionCount - 1) });
            await sendTextMessage(
              user.phone_number,
              `Trouble applying those changes — could you try again? In the meantime, you can also send me the image for the ${where}.`
            );
          }
        } else {
          // Pure upload-request — refund the revision (counts only when
          // the image actually lands).
          await updateUserMetadata(user.id, { revisionCount: Math.max(0, revisionCount - 1) });
          await sendTextMessage(
            user.phone_number,
            `Sure — send me the image you'd like for the ${where}, and I'll put it up.`
          );
        }
        return STATES.WEB_REVISIONS;
      }

      // ── Image swap (Pexels search) for ANY target ──────────────────────
      // Hero is the back-compat default when the parser only gave us a
      // query but no target. Non-hero targets bypass the generic shallow
      // merge below and apply via applyImageRevision (which uses the
      // imageTargets helper to write into nested array slots).
      if (updates._imageQuery !== undefined) {
        const query = String(updates._imageQuery || '').trim();
        const targetId = String(updates._imageTarget || 'hero');

        const { getAvailableTargets, describeTarget } = require('../../website-gen/imageTargets');
        const targets = getAvailableTargets(currentConfig);
        if (!targets.find((t) => t.id === targetId)) {
          await sendTextMessage(
            user.phone_number,
            `That image slot doesn't exist on your site. You can change: ${targets.map((t) => t.label).slice(0, 6).join(', ')}.`
          );
          await updateUserMetadata(user.id, { revisionCount: Math.max(0, revisionCount - 1) });
          return STATES.WEB_REVISIONS;
        }
        const where = (describeTarget(targetId, currentConfig) || targetId).toLowerCase();

        if (!query) {
          // No description — the user said WHICH image but not what it
          // should show. Set the awaiting flag so a follow-up image
          // upload lands on this target, AND prompt for a description in
          // case they'd rather Pexels-search for one.
          await updateUserMetadata(user.id, { awaitingImageUpload: { target: targetId } });
          await sendTextMessage(
            user.phone_number,
            `Sure — what should the new ${where} show? A short description works (e.g. *coffee shop interior*, *team in workshop*, *dental clinic exam room*). Or send me your own photo.`
          );
          await updateUserMetadata(user.id, { revisionCount: Math.max(0, revisionCount - 1) });
          return STATES.WEB_REVISIONS;
        }

        await sendTextMessage(user.phone_number, `Looking for a ${where} of *${query}*...`);

        const { getHeroImage } = require('../../website-gen/heroImage');
        let newImage = null;
        try {
          newImage = await getHeroImage(query);
        } catch (imgErr) {
          logger.warn(`[WEB_REVISIONS] Image fetch threw for "${query}" (${targetId}): ${imgErr.message}`);
        }

        if (!newImage || !newImage.url) {
          await sendTextMessage(
            user.phone_number,
            `Couldn't find a good image for *${query}*. Try a different description, or send me your own photo for the ${where}.`
          );
          // Set the awaiting flag so an immediate follow-up upload lands
          // on the right slot.
          await updateUserMetadata(user.id, { awaitingImageUpload: { target: targetId } });
          await updateUserMetadata(user.id, { revisionCount: Math.max(0, revisionCount - 1) });
          return STATES.WEB_REVISIONS;
        }

        // Strip parser-control keys; everything else is a real field
        // update the user asked for in the same message ("change headline
        // to X AND swap the hero photo to coffee beans"). Pass them
        // through so they land in the same deploy as the image swap —
        // previously they were silently dropped because this branch
        // returned before hitting the generic merge below.
        const SPECIAL_KEYS = new Set([
          '_imageQuery', '_imageTarget', '_imageRequest',
          '_approved', '_unclear', '_message',
        ]);
        const additionalUpdates = {};
        for (const k of Object.keys(updates)) {
          if (!SPECIAL_KEYS.has(k)) additionalUpdates[k] = updates[k];
        }

        await applyImageRevision({
          user,
          site,
          currentConfig,
          targetId,
          image: newImage,
          revisionCount,
          additionalUpdates: Object.keys(additionalUpdates).length ? additionalUpdates : null,
          paid: paidTier,
        });
        return STATES.WEB_REVISIONS;
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
      // Append a revision-status tail so the user always knows where
      // they stand: paid users see "unlimited", free users see how
      // many they have left + the activation upgrade nudge.
      let revisionTail;
      if (paidTier) {
        revisionTail = '\n\n_Unlimited revisions on this site — keep tweaking._';
      } else {
        const remaining = Math.max(0, FREE_REVISIONS - revisionCount);
        revisionTail = remaining > 0
          ? `\n\n_${remaining} revision${remaining === 1 ? '' : 's'} left — or activate to unlock unlimited._`
          : `\n\n_That was your last free revision. Activate the site to unlock unlimited tweaks._`;
      }
      await sendTextMessage(
        user.phone_number,
        doneVariants[Math.floor(Math.random() * doneVariants.length)] + revisionTail
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

// Shared "finalize" helpers so the fast-path and the LLM-classified path
// land on the same code. Keeps the three branches (new / own / skip)
// defined in one place instead of duplicated at each decision point.
async function proceedSkipDomain(user, raw) {
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

async function proceedAskForOwnDomain(user, raw) {
  await updateUserMetadata(user.id, { domainChoice: 'own' });
  const { updateUserState } = require('../../db/users');
  await updateUserState(user.id, STATES.WEB_DOMAIN_OWN_INPUT);
  await sendTextMessage(
    user.phone_number,
    await localize("Great — what's your domain? (e.g. glowstudio.com)", user, raw)
  );
  return STATES.WEB_DOMAIN_OWN_INPUT;
}

async function proceedSearchNewDomain(user, raw, searchBase) {
  await updateUserMetadata(user.id, { domainChoice: 'need' });
  const base = searchBase || '';
  const sanitized = base.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (sanitized && sanitized.length >= 2) {
    return runDomainSearchInline(user, sanitized);
  }
  // No searchable base — if we have a business name, use that; else ask.
  const businessName = user.metadata?.websiteData?.businessName || '';
  const bizSanitized = businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (bizSanitized && bizSanitized.length >= 2) {
    return runDomainSearchInline(user, bizSanitized);
  }
  const { updateUserState } = require('../../db/users');
  await updateUserState(user.id, STATES.WEB_DOMAIN_SEARCH);
  await sendTextMessage(
    user.phone_number,
    await localize("What name should I search for? (e.g. mybusiness)", user, raw)
  );
  return STATES.WEB_DOMAIN_SEARCH;
}

/**
 * LLM-based classifier for the domain-choice reply. Handles free-form
 * natural language ("yeah let's find a new one", "i have one already",
 * "skip it for now", "my domain is glow.com") that the regex fast-path
 * can't cover. Returns `{ intent: 'new'|'own'|'skip'|'unclear',
 * domain: string|null, searchBase: string|null }`.
 */
async function classifyDomainIntent(text, businessName) {
  const system = `You classify how a user wants to handle their domain for a new website. The three valid intents are:
- "new" — user wants us to FIND / SEARCH a new domain for them
- "own" — user already owns a domain they want to use
- "skip" — user wants to skip the domain step entirely, use the free preview URL for now
- "unclear" — ambiguous or off-topic

If the user mentions a FULL domain (with a TLD, e.g. glowstudio.com), extract it as \`domain\`.
If they mention a SPECIFIC base name to search for (not a full domain, e.g. "search for pixiehq"), extract it as \`searchBase\`.

Return STRICT JSON only, no prose, no code fences.`;

  const prompt = `Business name context: "${businessName || 'unknown'}"
User said: "${text}"

Return JSON: {"intent":"new|own|skip|unclear","domain":null|"x.com","searchBase":null|"basename"}

Examples:
- "yeah lets do new one" → {"intent":"new","domain":null,"searchBase":null}
- "find me one" → {"intent":"new","domain":null,"searchBase":null}
- "search for pixiehq" → {"intent":"new","domain":null,"searchBase":"pixiehq"}
- "i have my own" → {"intent":"own","domain":null,"searchBase":null}
- "already got a domain" → {"intent":"own","domain":null,"searchBase":null}
- "my domain is glowstudio.com" → {"intent":"own","domain":"glowstudio.com","searchBase":null}
- "use glow.io" → {"intent":"own","domain":"glow.io","searchBase":null}
- "skip for now" → {"intent":"skip","domain":null,"searchBase":null}
- "maybe later" → {"intent":"skip","domain":null,"searchBase":null}
- "not now, just build it" → {"intent":"skip","domain":null,"searchBase":null}
- "what's the weather" → {"intent":"unclear","domain":null,"searchBase":null}`;

  let response;
  try {
    response = await generateResponse(system, [{ role: 'user', content: prompt }], {
      operation: 'domain_choice_classify',
    });
  } catch (err) {
    logger.warn(`[WEBDEV-DOMAIN] LLM classifier failed: ${err.message}`);
    return { intent: 'unclear', domain: null, searchBase: null };
  }

  const jsonMatch = String(response || '').match(/\{[\s\S]*?\}/);
  if (!jsonMatch) return { intent: 'unclear', domain: null, searchBase: null };
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const intent = ['new', 'own', 'skip', 'unclear'].includes(parsed.intent)
      ? parsed.intent
      : 'unclear';
    return {
      intent,
      domain: parsed.domain && /^[a-z0-9][a-z0-9-]*\.[a-z]{2,}/i.test(parsed.domain)
        ? parsed.domain.toLowerCase()
        : null,
      searchBase: parsed.searchBase && typeof parsed.searchBase === 'string'
        ? parsed.searchBase.toLowerCase().replace(/[^a-z0-9-]/g, '')
        : null,
    };
  } catch {
    return { intent: 'unclear', domain: null, searchBase: null };
  }
}

async function handleDomainChoice(user, message) {
  const raw = (message.text || '').trim();
  const text = raw.toLowerCase();

  // One deterministic shortcut survives: a fully-typed domain
  // ("glowstudio.com") is unambiguously "I own this one already" — no
  // amount of LLM thinking will improve on a literal regex match here.
  // Everything else (skip / new / own / unclear / mixed-language prose)
  // goes through the LLM classifier so we don't maintain hand-rolled
  // keyword lists per language.
  const fullMatch = raw.match(/([a-z0-9][a-z0-9-]*\.[a-z]{2,}(?:\.[a-z]{2,})?)/i);
  if (fullMatch && !/\s/.test(raw)) {
    return saveOwnDomain(user, fullMatch[1].toLowerCase());
  }

  const businessName = user.metadata?.websiteData?.businessName || '';
  const result = await classifyDomainIntent(raw, businessName);

  if (result.intent === 'skip') return proceedSkipDomain(user, raw);

  if (result.intent === 'own') {
    if (result.domain) return saveOwnDomain(user, result.domain);
    return proceedAskForOwnDomain(user, raw);
  }

  if (result.intent === 'new') {
    return proceedSearchNewDomain(user, raw, result.searchBase);
  }

  // Unclear — but the user might have typed a bare candidate name
  // (one short token, no spaces). Treat as a new-search input so we
  // don't bounce them when their intent was "find me one with this name".
  const cleaned = text.replace(/[^a-z0-9-]/g, '');
  if (!/\s/.test(raw) && cleaned.length >= 2 && cleaned.length <= 30) {
    return proceedSearchNewDomain(user, raw, cleaned);
  }

  await sendTextMessage(
    user.phone_number,
    await localize(
      "Want me to find you a *new domain*, do you *already own one*, or *skip* for now? You can also just type the domain you want.",
      user,
      raw
    )
  );
  return STATES.WEB_DOMAIN_CHOICE;
}

async function handleDomainOwnInput(user, message) {
  const raw = (message.text || '').trim();
  const text = raw.toLowerCase();

  // Exit — user changed their mind. In late-mode (changing domain on
  // an already-built site), don't regenerate — return to revisions
  // with no domain change.
  if (/^(skip|cancel|back|never\s*mind|nvm|forget\s*it)$/i.test(text)) {
    await updateUserMetadata(user.id, {
      domainChoice: 'skip',
      selectedDomain: null,
      domainPrice: 0,
      domainChangeMode: null,
    });
    if (user.metadata?.domainChangeMode === 'late') {
      const { updateUserState } = require('../../db/users');
      await updateUserState(user.id, STATES.WEB_REVISIONS);
      await sendTextMessage(
        user.phone_number,
        await localize("No problem — sticking with the current setup. Let me know any other tweaks!", user, raw)
      );
      return STATES.WEB_REVISIONS;
    }
    await sendTextMessage(
      user.phone_number,
      await localize("All good — skipping the domain and building now.", user, raw)
    );
    return generateWebsite(user);
  }

  // Mid-flow path-switch — user is here to type their own domain but
  // wants us to find one instead. Reuse the same intent classifier
  // we use in revisions.
  if (raw.length > 4) {
    const action = await classifyDomainMutationIntent(raw, null, user.id);
    if (action === 'switch_to_search') {
      // Late vs pre-build: late-mode keeps the flag; pre-build is the
      // standard search inline.
      const businessName = user.metadata?.websiteData?.businessName || '';
      const baseName = businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 30) || 'site';
      if (user.metadata?.domainChangeMode === 'late') {
        return runLateDomainSearchInline(user, baseName);
      }
      return runDomainSearchInline(user, baseName);
    }
  }

  // Validate domain format.
  const match = raw.match(/([a-z0-9][a-z0-9-]*\.[a-z]{2,}(?:\.[a-z]{2,})?)/i);
  if (match) {
    return saveOwnDomain(user, match[1].toLowerCase());
  }

  await sendTextMessage(
    user.phone_number,
    await localize(
      "Doesn't look like a domain. Try something like *glowstudio.com* — or reply *skip*. Or say *find me one* if you'd rather we search.",
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
  // Route through WEB_DOMAIN_OWN_REGISTRAR to collect where the domain was
  // bought — registrar dashboards all differ, so DNS instructions need to
  // be tailored. Saved in metadata, used by postPayment to send tailored
  // step-by-step DNS setup after the customer pays.
  const { updateUserState } = require('../../db/users');
  await updateUserState(user.id, STATES.WEB_DOMAIN_OWN_REGISTRAR);
  const { registrarOptionsList } = require('../../website-gen/dnsInstructions');
  await sendTextMessage(
    user.phone_number,
    await localize(
      `Got it — *${domain}*. Where did you buy it? (e.g. *${registrarOptionsList()}*, or type whatever you're using)\n\n` +
        `After payment I'll send step-by-step DNS instructions for that registrar.`,
      user
    )
  );
  await logMessage(user.id, `Domain choice: own (${domain}) — asking for registrar`, 'assistant');
  return STATES.WEB_DOMAIN_OWN_REGISTRAR;
}

async function handleDomainOwnRegistrar(user, message) {
  const raw = (message.text || '').trim();
  const text = raw.toLowerCase();

  // Exit — user changed their mind mid-flow.
  if (/^(skip|cancel|back|never\s*mind|nvm|forget\s*it)$/i.test(text)) {
    await updateUserMetadata(user.id, { domainRegistrar: null });
    await sendTextMessage(
      user.phone_number,
      await localize("No problem — I'll send generic DNS steps after payment. Building now...", user, raw)
    );
    return generateWebsite(user);
  }

  // Accept pretty much anything the user types — LLM will handle obscure
  // registrar names gracefully via its generic-fallback branch.
  if (raw.length < 2 || raw.length > 60) {
    await sendTextMessage(
      user.phone_number,
      await localize(
        `Just type the registrar name — e.g. *GoDaddy*, *Namecheap*, *Cloudflare*, or whatever you use. Or reply *skip* for generic steps.`,
        user,
        raw
      )
    );
    return STATES.WEB_DOMAIN_OWN_REGISTRAR;
  }

  const registrar = raw.slice(0, 60);
  await updateUserMetadata(user.id, { domainRegistrar: registrar });

  // Late-mode: don't regenerate the site (it's already deployed). Hand
  // off to the late-finalize path which updates the Stripe link
  // (pre-paid) or sends DNS instructions immediately (already-paid).
  if (user.metadata?.domainChangeMode === 'late') {
    const domain = user.metadata?.selectedDomain;
    if (domain) {
      return selectLateOwnDomainInline(user, domain, registrar);
    }
    // No domain saved — defensive: fall back to normal build.
    logger.warn(`[OWN-REGISTRAR] domainChangeMode='late' but no selectedDomain on user ${user.id}`);
  }

  await sendTextMessage(
    user.phone_number,
    await localize(
      `Perfect — *${registrar}* noted. I'll send step-by-step DNS instructions right after payment. Building your site now...`,
      user,
      raw
    )
  );
  await logMessage(user.id, `Domain registrar recorded: ${registrar}`, 'assistant');
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

  // Single-offer confirmation. After runSpecificDomainLookup we leave
  // ONE domain in domainOptions and prompt "Reply *yes* (or *1*) to
  // pick it". Without this branch, "yes" / "yep" / "sure" fell through
  // to the new-base-name search ("yes" → registrar lookup of "yes" →
  // 500 → bot says 'registrar unreachable'). Only fires when there's
  // exactly one option, so a 5-result list isn't ambiguously confirmed.
  const positiveConfirm = /^(yes|yeah|yep|yup|sure|ok|okay|confirm|y|pick\s*it|that\s*one|got\s*it|cool|haan|han)\s*\.?!?\?*\s*$/i;
  if (domainOptions.length === 1 && positiveConfirm.test(text)) {
    const only = domainOptions[0];
    if (only.available && !only.premium) {
      return selectDomainInline(user, only);
    }
  }

  // Single-offer rejection. "no" / "nope" / "nah" at a single-domain
  // offer should re-prompt for a different name, NOT trigger a
  // registrar lookup of the literal word "no" (the previous bug).
  // The skip-phrases path above covers "no thanks" / "skip" / "nvm"; here
  // we catch the bare negation that means "show me something else".
  const negativeConfirm = /^(no|nope|nah|nahi|not\s*this|not\s*that\s*one)\s*\.?!?\?*\s*$/i;
  if (domainOptions.length === 1 && negativeConfirm.test(text)) {
    await sendTextMessage(
      user.phone_number,
      await localize(
        "No problem — type a different domain name (e.g. *mybiz.ai* or just a base like *mybiz*), or reply *skip* to launch on the free preview URL.",
        user,
        raw
      )
    );
    return STATES.WEB_DOMAIN_SEARCH;
  }

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

  // Mid-flow path-switch — user is in search but wants to use their own
  // existing domain instead. Detected via the same mutation classifier.
  if (raw.length > 4) {
    const action = await classifyDomainMutationIntent(raw, null, user.id);
    if (action === 'switch_to_own') {
      return proceedAskForOwnDomain(user, raw);
    }
  }

  await sendTextMessage(
    user.phone_number,
    await localize(
      "Reply with the *number* of a domain above, type a new name to search, or say *I have my own* if you'd rather use an existing domain.",
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
  // Store the exact registrar price — no rounding. We charge the customer
  // the same dollars-and-cents we'll be billed by NameSilo at registration,
  // so margins stay clean (no over/under-charge).
  const price = option.price ? parseFloat(option.price) : 0;
  await updateUserMetadata(user.id, {
    domainChoice: 'need',
    selectedDomain: option.domain.toLowerCase(),
    domainPrice: price,
  });
  const priceLabel = price > 0 ? `$${price.toFixed(2)}` : 'free';
  await sendTextMessage(
    user.phone_number,
    await localize(
      `Locked in *${option.domain}* — ${priceLabel}/yr. Building your site now…`,
      user
    )
  );
  await logMessage(
    user.id,
    `Domain selected: ${option.domain} (${priceLabel}/yr)`,
    'assistant'
  );
  return generateWebsite(user);
}

// ─── LATE DOMAIN ADD ────────────────────────────────────────────────────────
// Lets a user add a domain AFTER they've already approved the site — either
// before paying ("oh wait, I want a domain too") or after paying ("the site
// looks great but I want it on a real domain now"). Reuses the same domain
// search + selection UX as the pre-build flow; only the post-selection step
// differs: we either supersede the pending Stripe link with a combined one
// (pre-paid) or create a separate domain-only add-on charge (already paid).

/**
 * Detects "I want a domain" intent in the revisions chat. Small targeted
 * LLM call so the heavy REVISION_PARSER_PROMPT doesn't have to know about
 * domain semantics — keeps the parser focused on field edits.
 */
async function classifyLateDomainIntent(text, userId) {
  const t = String(text || '').trim();
  if (!t || t.length > 200) return false;
  try {
    const resp = await generateResponse(
      `Classify whether the user is asking to ADD a custom domain to their already-built website — regardless of any other content in the same message.

GENERAL PRINCIPLE — mixed intent: people often pair sentiment with requests ("looks great, now I want a domain", "the site's good but get me a domain", "yeh sahi hai, ab domain bhi le do"). When the message contains BOTH approval/feedback AND a domain-add request, the REQUEST wins — answer YES. The approval is conversational filler relative to the underlying ask. Likewise: "I'm done with revisions, let's get a domain" → YES (the revisions sentence is preface, the domain ask is the action).

Heuristic for YES (any natural phrasing, any language):
- The user is asking us to set up, find, register, attach, get, buy, secure, or hook up a custom domain for their site
- Or asking permission/wondering if they can add one ("can I get a domain?", "domain bhi mil sakta hai?")
- Or telling us "yes" / "go ahead" specifically about a domain offer that was on the table

NO only when the message contains zero domain-add request:
- Pure revisions/feedback ("change the headline", "make it darker", "looks great")
- Site approval with no domain ask ("yes build it", "perfect")
- Off-topic / unrelated
- Asking about their existing already-selected domain (e.g. "what's my domain again?")

Examples (illustrative — apply the principle, don't pattern-match):
- "actually I want a domain" → yes
- "domain bhi chahiye" → yes
- "the website looks good, now I want to add a domain" → yes (mixed — request wins)
- "looks great can we get a domain" → yes
- "yes give me a domain" → yes
- "set up the domain" → yes
- "the site's perfect" → no (no domain ask)
- "change the headline" → no (revision)
- "what's the address?" → no (off-topic)

Reply with ONLY "yes" or "no".`,
      [{ role: 'user', content: t }],
      { userId, operation: 'late_domain_intent' }
    );
    return /^\s*yes\b/i.test(String(resp || ''));
  } catch (err) {
    logger.warn(`[LATE-DOMAIN] intent classifier threw: ${err.message}`);
    return false;
  }
}

// ─── DOMAIN MUTATION INTENT (change / switch path) ──────────────────────────
// Catches every "I want a different domain decision" scenario:
//   - change_domain      — user picked X, wants different domain (any state)
//   - switch_to_own      — user is in search, wants to use their own instead
//   - switch_to_search   — user is in own-input, wants us to find one
// Detected via single LLM call; handlers route based on the action.

/**
 * @param {string} text         The user's reply
 * @param {string} currentDomain User's currently-selected domain (for prompt context); pass null/empty if none
 * @param {string|number} userId
 * @returns {Promise<'change_domain'|'switch_to_own'|'switch_to_search'|'none'>}
 */
async function classifyDomainMutationIntent(text, currentDomain, userId) {
  const t = String(text || '').trim();
  if (!t || t.length > 140) return 'none';
  try {
    const ctx = currentDomain
      ? `\nCurrent selection: "${currentDomain}". The user may want to switch away from this.`
      : `\nNo domain currently selected.`;
    const resp = await generateResponse(
      `Classify the user's intent regarding their domain decision.${ctx}

Possible actions:
- change_domain: user wants a DIFFERENT domain than the one they picked. Examples: "change the domain", "different domain please", "domain change kar do", "yeh wala nahi chahiye, alag", "switch to a different one", "actually pick something else", "let's try a new domain"
- switch_to_own: user wants to use their own existing domain instead of buying a new one. Examples: "actually I have my own", "use my existing domain", "mera khud ka domain hai", "I'll bring my own", "I already own one"
- switch_to_search: user wants us to find/search a new one instead of using their own. Examples: "actually find me one", "you search for me", "tum dhundo", "no I don't have one", "help me pick one", "look for one"
- none: anything unrelated to domain mutation

Reply with ONLY one keyword: change_domain, switch_to_own, switch_to_search, or none.`,
      [{ role: 'user', content: t }],
      { userId, operation: 'domain_mutation_intent' }
    );
    const action = String(resp || '').trim().toLowerCase().split(/[\s\n,.;]/)[0];
    if (['change_domain', 'switch_to_own', 'switch_to_search'].includes(action)) return action;
    return 'none';
  } catch (err) {
    logger.warn(`[DOMAIN-MUTATION] classifier threw: ${err.message}`);
    return 'none';
  }
}

/**
 * Entry point when user wants to change their domain (any state). Resets
 * the previous selection, cancels any pending Stripe link, and routes to
 * the right re-entry path based on action (search / own / unspecified).
 *
 * `domainChangeMode: 'late'` flag is set on metadata so downstream handlers
 * (notably handleDomainOwnRegistrar) know to skip the pre-build
 * generateWebsite call and instead update Stripe link / send DNS
 * instructions directly.
 */
async function handleDomainChangeStart(user, originalText, action) {
  // Reset selection + tag late-mode so own-domain handlers don't trigger
  // generateWebsite. Keep domainChangeMode set until the new selection
  // is finalized — cleared by selectLateOwnDomainInline / selectLateDomainInline.
  await updateUserMetadata(user.id, {
    selectedDomain: null,
    domainPrice: 0,
    domainChoice: null,
    domainOptions: [],
    domainSearchName: '',
    domainChangeMode: 'late',
  });

  // Cancel any pending Stripe link — the new selection will create a
  // fresh one. Idempotent if there's nothing pending.
  try {
    const { cancelPendingPaymentsForUser } = require('../../payments/stripe');
    await cancelPendingPaymentsForUser(user.id);
  } catch (err) {
    logger.warn(`[DOMAIN-CHANGE] Cancel pending failed: ${err.message}`);
  }

  await sendTextMessage(
    user.phone_number,
    await localize(
      `Got it — clearing the previous domain. Let me set up a new one.`,
      user,
      originalText
    )
  );

  // Route based on action.
  if (action === 'switch_to_own') {
    const { updateUserState } = require('../../db/users');
    await updateUserState(user.id, STATES.WEB_DOMAIN_OWN_INPUT);
    await sendTextMessage(
      user.phone_number,
      await localize(
        "What's your domain? Type it like *yourbiz.com*.",
        user
      )
    );
    await logMessage(user.id, 'Domain change → own-input', 'assistant');
    return STATES.WEB_DOMAIN_OWN_INPUT;
  }

  // Default: search path. Use businessName as search base.
  const businessName = user.metadata?.websiteData?.businessName || '';
  const baseName = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 30);
  if (!baseName) {
    const { updateUserState } = require('../../db/users');
    await updateUserState(user.id, STATES.WEB_DOMAIN_LATE_SEARCH);
    await updateUserMetadata(user.id, { domainOptions: [], domainSearchName: '' });
    await sendTextMessage(
      user.phone_number,
      await localize(
        "What domain name should I look up? Type something like *toorphor* or *toorphorplumbing* and I'll show you what's available.",
        user
      )
    );
    return STATES.WEB_DOMAIN_LATE_SEARCH;
  }
  return runLateDomainSearchInline(user, baseName);
}

/**
 * Late-finalize for the OWN-domain path — called by handleDomainOwnRegistrar
 * when domainChangeMode='late'. Behaves differently based on payment state:
 *   - pre-paid: cancel old Stripe link, create new $website-only link
 *               (own domain = no registration charge), refresh banner
 *   - already-paid: no Stripe charge, send DNS instructions immediately
 *                   so user can point their existing domain right away
 *
 * Clears domainChangeMode flag so subsequent flows behave normally.
 */
async function selectLateOwnDomainInline(user, domain, registrar) {
  await updateUserMetadata(user.id, {
    domainChoice: 'own',
    selectedDomain: domain,
    domainPrice: 0,
    domainRegistrar: registrar,
    domainChangeMode: null,
  });

  const { updateUserState } = require('../../db/users');
  await updateUserState(user.id, STATES.WEB_REVISIONS);

  const site = await getLatestSite(user.id);
  const alreadyPaid = site?.site_data?.paymentStatus === 'paid';

  if (alreadyPaid) {
    // Already-paid: no charge needed for own domain. Send DNS
    // instructions right now so user can point their existing domain
    // at the live site immediately.
    const { generateDnsInstructions } = require('../../website-gen/dnsInstructions');
    let instructions;
    try {
      instructions = await generateDnsInstructions({
        registrar,
        domain,
        netlifySubdomain: site?.netlify_subdomain || '',
        userId: user.id,
      });
    } catch (err) {
      logger.warn(`[LATE-OWN] DNS instructions threw: ${err.message}`);
    }

    await sendTextMessage(
      user.phone_number,
      `Got it — using *${domain}* (own domain on ${registrar}).\n\n` +
        `Since your site's already activated, no extra charge — here are the DNS steps to point *${domain}* at it:`
    );
    if (instructions) {
      await sendTextMessage(user.phone_number, instructions);
    }
    if (site) {
      const { updateSite } = require('../../db/sites');
      await updateSite(site.id, { custom_domain: domain, status: 'domain_dns_pending' });
    }
    await logMessage(
      user.id,
      `Late-domain (already-paid, own): ${domain} on ${registrar} — DNS instructions sent`,
      'assistant'
    );
    return STATES.WEB_REVISIONS;
  }

  // Pre-paid: cancel old link, create new at website-only price.
  try {
    const { getNumberSetting } = require('../../db/settings');
    const envDefault = parseInt(process.env.DEFAULT_ACTIVATION_PRICE || '199', 10);
    const websitePrice = await getNumberSetting('website_price', envDefault);
    const { createPaymentLink } = require('../../payments/stripe');
    const businessName = user.metadata?.websiteData?.businessName || 'site';
    const linkResult = await createPaymentLink({
      userId: user.id,
      phoneNumber: user.phone_number,
      amount: websitePrice,
      serviceType: 'website',
      packageTier: 'activation',
      description: `Website activation (own domain ${domain}) — ${businessName}`,
      customerEmail: user.metadata?.email || user.metadata?.websiteData?.contactEmail || null,
      customerName: businessName,
      websiteAmount: websitePrice,
      domainAmount: 0,
      selectedDomain: domain,
      originalAmount: websitePrice,
    });
    const newUrl = linkResult?.url || linkResult?.pixieUrl;

    try {
      const { updateSiteBannerPricing } = require('../../website-gen/redeployer');
      updateSiteBannerPricing(user.id, {
        paymentLinkUrl: newUrl,
        activationAmount: websitePrice,
        originalAmount: websitePrice,
      }).catch((err) =>
        logger.warn(`[LATE-OWN] Banner pricing redeploy failed: ${err.message}`)
      );
    } catch (err) {
      logger.warn(`[LATE-OWN] Could not dispatch banner update: ${err.message}`);
    }

    await sendTextMessage(
      user.phone_number,
      `Locked in *${domain}* (own domain on ${registrar}).\n\n` +
        `New activation total is *$${websitePrice}* (no extra charge for the domain since you own it).\n\n` +
        `Pay below and I'll send DNS setup steps for ${registrar} after:\n\n👉 ${newUrl}`
    );
    await logMessage(
      user.id,
      `Late-domain (pre-paid, own): ${domain} on ${registrar} → new link $${websitePrice}`,
      'assistant'
    );
  } catch (err) {
    logger.error(`[LATE-OWN] Pre-paid link creation failed: ${err.message}`);
    await sendTextMessage(
      user.phone_number,
      `I locked in *${domain}* but had trouble updating the payment link. Try saying "send me the new link" or message us and we'll resend.`
    );
  }
  return STATES.WEB_REVISIONS;
}

/**
 * Entry point — kicks off the domain search using the user's businessName
 * as the search base (same as pre-build flow). State changes to
 * WEB_DOMAIN_LATE_SEARCH so the picker handler knows to take the
 * post-selection late-add path instead of generateWebsite.
 */
async function handleLateDomainStart(user, originalText) {
  const businessName = user.metadata?.websiteData?.businessName || '';
  const cleanedBase = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 30);

  if (!cleanedBase) {
    await sendTextMessage(
      user.phone_number,
      await localize(
        "Sure — what domain name should I look up? Type something like *toorphor* or *toorphorplumbing* and I'll show you what's available.",
        user,
        originalText
      )
    );
    // Stash a flag so the next reply runs through the late-search entry
    // even though state is still WEB_REVISIONS. We do this by setting
    // state directly so the next message hits handleLateDomainSearch
    // with no domainOptions yet — that branch then runs a fresh search.
    const { updateUserState } = require('../../db/users');
    await updateUserState(user.id, STATES.WEB_DOMAIN_LATE_SEARCH);
    await updateUserMetadata(user.id, { domainOptions: [], domainSearchName: '' });
    await logMessage(user.id, 'Late-domain start: asking for search base (no business name on file)', 'assistant');
    return STATES.WEB_DOMAIN_LATE_SEARCH;
  }

  await logMessage(user.id, `Late-domain start: searching for "${cleanedBase}"`, 'assistant');
  return runLateDomainSearchInline(user, cleanedBase);
}

/**
 * Mirror of runDomainSearchInline but lands the user in
 * WEB_DOMAIN_LATE_SEARCH instead of WEB_DOMAIN_SEARCH. Two functions
 * instead of one to avoid threading a "late mode" flag through every
 * branch of the search handler.
 */
async function runLateDomainSearchInline(user, baseName) {
  const { updateUserState } = require('../../db/users');
  await updateUserState(user.id, STATES.WEB_DOMAIN_LATE_SEARCH);
  await sendTextMessage(
    user.phone_number,
    await localize(`On it — checking domain availability for *${baseName}*...`, user)
  );

  let results = [];
  try {
    results = await checkDomainAvailability(baseName, DEFAULT_TLD_POOL);
  } catch (err) {
    logger.error(`[LATE-DOMAIN] search failed: ${err.message} (code=${err.code || 'unknown'})`);
    if (err.code === 'DOMAIN_LOOKUP_UNAVAILABLE') {
      await sendTextMessage(
        user.phone_number,
        await localize(
          "Our domain registrar is temporarily unreachable so I can't pull live prices right now. Try again in a few minutes, or stick with the preview URL for now.",
          user
        )
      );
      await updateUserState(user.id, STATES.WEB_REVISIONS);
      return STATES.WEB_REVISIONS;
    }
    await sendTextMessage(
      user.phone_number,
      await localize(
        "Couldn't reach the registrar right now. Try a different name, or reply *skip* to keep the site without a domain for now.",
        user
      )
    );
    return STATES.WEB_DOMAIN_LATE_SEARCH;
  }

  let top = pickTopDomains(results);
  if (top.length === 0) {
    await sendTextMessage(
      user.phone_number,
      await localize(`*${baseName}* is all taken. Let me find you something close…`, user)
    );
    const industry = user.metadata?.websiteData?.industry || '';
    top = await findAlternativeDomains(baseName, industry);
    if (top.length === 0) {
      await sendTextMessage(
        user.phone_number,
        await localize(
          `Couldn't find good alternatives either. Try typing a different base name, or reply *skip* to keep the site as-is.`,
          user
        )
      );
      await updateUserMetadata(user.id, { domainOptions: [], domainSearchName: baseName });
      return STATES.WEB_DOMAIN_LATE_SEARCH;
    }
  }

  let msg = '*Available domains:*\n\n';
  top.forEach((r, i) => {
    msg += `${i + 1}. ✅ ${r.domain} — $${r.price}/yr\n`;
  });
  msg += '\nReply with a *number* to pick one, or type a specific domain (e.g. *mybiz.ai*) and I\'ll look up its price. Or *skip* to keep the site as-is.';

  await sendTextMessage(user.phone_number, await localize(msg, user));
  await updateUserMetadata(user.id, { domainOptions: top, domainSearchName: baseName });
  await logMessage(
    user.id,
    `Late-domain search: ${top.map((r) => r.domain + '@$' + r.price).join(', ')}`,
    'assistant'
  );
  return STATES.WEB_DOMAIN_LATE_SEARCH;
}

/**
 * Handle replies while user is in WEB_DOMAIN_LATE_SEARCH. Mirrors
 * handleDomainSearch's selection logic but routes "skip" back to
 * WEB_REVISIONS (the site is already approved, we're not building) and
 * routes selections through selectLateDomainInline.
 */
async function handleLateDomainSearch(user, message) {
  const raw = (message.text || '').trim();
  const text = raw.toLowerCase();

  // Exit phrases — bail out, return to revisions with no domain change.
  if (/\b(skip|nah|nope|forget\s*it|never\s*mind|nvm|not\s*now|cancel|stop|exit|back|no\s*thanks?)\b/i.test(text) &&
      !/[\w-]+\.[a-z]{2,}/i.test(raw)) {
    const { updateUserState } = require('../../db/users');
    await updateUserState(user.id, STATES.WEB_REVISIONS);
    await sendTextMessage(
      user.phone_number,
      await localize("No problem — sticking with the current setup. Let me know any other tweaks!", user, raw)
    );
    return STATES.WEB_REVISIONS;
  }

  const domainOptions = user.metadata?.domainOptions || [];

  // Single-offer confirmation/rejection — same fix as handleDomainSearch.
  // Without these guards, "yes" or "no" at a single-domain offer would
  // be treated as a fresh base-name and sent to the registrar (which
  // either fails or runs a useless lookup of the literal word).
  const positiveConfirmLate = /^(yes|yeah|yep|yup|sure|ok|okay|confirm|y|pick\s*it|that\s*one|got\s*it|cool|haan|han)\s*\.?!?\?*\s*$/i;
  if (domainOptions.length === 1 && positiveConfirmLate.test(text)) {
    const only = domainOptions[0];
    if (only.available && !only.premium) {
      return selectLateDomainInline(user, only);
    }
  }
  const negativeConfirmLate = /^(no|nope|nah|nahi|not\s*this|not\s*that\s*one)\s*\.?!?\?*\s*$/i;
  if (domainOptions.length === 1 && negativeConfirmLate.test(text)) {
    await sendTextMessage(
      user.phone_number,
      await localize(
        "No problem — type a different domain name (e.g. *mybiz.ai* or a base like *mybiz*), or reply *skip* to keep the current preview URL.",
        user,
        raw
      )
    );
    return STATES.WEB_DOMAIN_LATE_SEARCH;
  }

  // Pick by number.
  const numMatch = text.match(/^(\d+)$/);
  if (numMatch && domainOptions.length > 0) {
    const idx = parseInt(numMatch[1], 10) - 1;
    if (idx >= 0 && idx < domainOptions.length &&
        domainOptions[idx].available && !domainOptions[idx].premium) {
      return selectLateDomainInline(user, domainOptions[idx]);
    }
    await sendTextMessage(
      user.phone_number,
      await localize("That one's not available. Try another number or a new name.", user, raw)
    );
    return STATES.WEB_DOMAIN_LATE_SEARCH;
  }

  // Pick by ordinal word.
  const ordinalMap = { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2, fourth: 3, '4th': 3, fifth: 4, '5th': 4 };
  const ordMatch = text.match(/\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th)\b/);
  if (ordMatch && domainOptions.length > 0) {
    const idx = ordinalMap[ordMatch[1]];
    if (idx !== undefined && idx < domainOptions.length &&
        domainOptions[idx].available && !domainOptions[idx].premium) {
      return selectLateDomainInline(user, domainOptions[idx]);
    }
  }

  // Full domain typed (e.g. "mybiz.ai") — either pick from options or
  // run a targeted single-domain lookup. Lookup re-uses the
  // pre-build version which lands the user in WEB_DOMAIN_SEARCH; we
  // override state back to LATE before returning so the late-flow
  // continues on next reply.
  const fullMatch = raw.match(/([a-z0-9-]+\.[a-z]{2,})/i);
  if (fullMatch) {
    const typedDomain = fullMatch[1].toLowerCase();
    const fromOptions = domainOptions.find(d => d.domain.toLowerCase() === typedDomain);
    if (fromOptions && fromOptions.available && !fromOptions.premium) {
      return selectLateDomainInline(user, fromOptions);
    }
    await runSpecificDomainLookup(user, typedDomain);
    const { updateUserState } = require('../../db/users');
    await updateUserState(user.id, STATES.WEB_DOMAIN_LATE_SEARCH);
    return STATES.WEB_DOMAIN_LATE_SEARCH;
  }

  // New base name for search.
  const cleaned = text.replace(/[^a-z0-9-]/g, '');
  if (cleaned.length >= 2 && cleaned.length <= 30 && !/\s/.test(raw)) {
    return runLateDomainSearchInline(user, cleaned);
  }

  // Mid-flow path-switch — late-search but user wants to use their own.
  // Set the late-mode flag so the own-domain handlers route correctly
  // (no generateWebsite at exit).
  if (raw.length > 4) {
    const action = await classifyDomainMutationIntent(raw, null, user.id);
    if (action === 'switch_to_own') {
      await updateUserMetadata(user.id, { domainChangeMode: 'late' });
      const { updateUserState } = require('../../db/users');
      await updateUserState(user.id, STATES.WEB_DOMAIN_OWN_INPUT);
      await sendTextMessage(
        user.phone_number,
        await localize("Got it — what's the domain? Type it like *yourbiz.com*.", user, raw)
      );
      return STATES.WEB_DOMAIN_OWN_INPUT;
    }
  }

  await sendTextMessage(
    user.phone_number,
    await localize(
      "Reply with the *number* of a domain above, type a different name to search, say *I have my own* to use an existing domain, or *skip* to keep the site as-is.",
      user,
      raw
    )
  );
  return STATES.WEB_DOMAIN_LATE_SEARCH;
}

/**
 * Apply a late-domain selection. Branches on whether the user has
 * already paid for the website:
 *   pre-paid    → cancel the existing pending Stripe link, create a
 *                 new combined link (website + domain), refresh banner
 *   already-paid → create a separate domain-only Stripe link
 *                  (service_type='domain_addon'); postPayment.js
 *                  handles the purchase + Netlify attach without
 *                  touching the existing paid site.
 */
async function selectLateDomainInline(user, option) {
  const price = option.price ? parseFloat(option.price) : 0;
  const domain = option.domain.toLowerCase();
  const priceLabel = price > 0 ? `$${price.toFixed(2)}` : 'free';

  const { getNumberSetting } = require('../../db/settings');
  const envDefaultWebsitePrice = parseInt(process.env.DEFAULT_ACTIVATION_PRICE || '199', 10);
  const websitePrice = await getNumberSetting('website_price', envDefaultWebsitePrice);

  // Persist the choice in metadata so the existing post-payment domain
  // pipeline (in postPayment.js handleConfirmedPayment) sees it on the
  // user record when the new payment lands.
  await updateUserMetadata(user.id, {
    domainChoice: 'need',
    selectedDomain: domain,
    domainPrice: price,
  });

  // Determine paid state by checking the latest site's site_data.
  const site = await getLatestSite(user.id);
  const alreadyPaid = site?.site_data?.paymentStatus === 'paid';

  const { updateUserState } = require('../../db/users');
  await updateUserState(user.id, STATES.WEB_REVISIONS);

  if (!alreadyPaid) {
    // ── Scenario A: pre-paid — supersede pending link with new total ──
    try {
      const { createPaymentLink } = require('../../payments/stripe');
      const businessName = user.metadata?.websiteData?.businessName || 'site';
      const total = +(websitePrice + price).toFixed(2);
      const linkResult = await createPaymentLink({
        userId: user.id,
        phoneNumber: user.phone_number,
        amount: total,
        serviceType: 'website',
        packageTier: 'activation',
        description: `Website activation + domain ${domain} — ${businessName}`,
        customerEmail: user.metadata?.email || user.metadata?.websiteData?.contactEmail || null,
        customerName: businessName,
        websiteAmount: websitePrice,
        domainAmount: price,
        selectedDomain: domain,
        originalAmount: total,
      });
      // createPaymentLink already cancels prior pending payments via
      // cancelPendingPaymentsForUser, so we don't need to do that here.
      const newUrl = linkResult?.url || linkResult?.pixieUrl;

      // Update the live preview banner so a visitor clicking "Activate"
      // pays the new combined total, not the old website-only amount.
      try {
        const { updateSiteBannerPricing } = require('../../website-gen/redeployer');
        updateSiteBannerPricing(user.id, {
          paymentLinkUrl: newUrl,
          activationAmount: total,
          originalAmount: total,
        }).catch((err) =>
          logger.warn(`[LATE-DOMAIN] Banner pricing redeploy failed: ${err.message}`)
        );
      } catch (err) {
        logger.warn(`[LATE-DOMAIN] Could not dispatch banner update: ${err.message}`);
      }

      await sendTextMessage(
        user.phone_number,
        await localize(
          `Locked in *${domain}* — ${priceLabel}/yr.\n\n` +
            `Your new total is *$${total}* (website $${websitePrice} + domain $${price}).\n\n` +
            `Activate to go live on *${domain}*:\n\n👉 ${newUrl}\n\n` +
            `_The activation button on your preview site has been updated to the same link._`,
          user
        )
      );
      await logMessage(
        user.id,
        `Late-domain (pre-paid): ${domain} @ $${price}/yr → new combined link $${total}`,
        'assistant'
      );
    } catch (err) {
      logger.error(`[LATE-DOMAIN] Pre-paid link creation failed: ${err.message}`);
      await sendTextMessage(
        user.phone_number,
        await localize(
          `I locked in *${domain}* but had trouble updating the payment link. Try saying "send me the new link" or message us and we'll resend.`,
          user
        )
      );
    }
    return STATES.WEB_REVISIONS;
  }

  // ── Scenario B: already paid — separate domain add-on charge ────────
  try {
    const { createPaymentLink } = require('../../payments/stripe');
    const businessName = user.metadata?.websiteData?.businessName || 'site';
    const linkResult = await createPaymentLink({
      userId: user.id,
      phoneNumber: user.phone_number,
      amount: price,
      serviceType: 'domain_addon',
      packageTier: 'addon',
      description: `Domain add-on: ${domain} — ${businessName}`,
      customerEmail: user.metadata?.email || user.metadata?.websiteData?.contactEmail || null,
      customerName: businessName,
      websiteAmount: 0,
      domainAmount: price,
      selectedDomain: domain,
      originalAmount: price,
    });
    const newUrl = linkResult?.url || linkResult?.pixieUrl;

    await sendTextMessage(
      user.phone_number,
      await localize(
        `Got it — *${domain}* (${priceLabel}/yr).\n\n` +
          `Your website's already activated, so this is a separate charge for just the domain.\n\n` +
          `Pay below and I'll register *${domain}* + point it at your site automatically:\n\n👉 ${newUrl}\n\n` +
          `_DNS propagation usually takes 5–60 minutes after payment._`,
        user
      )
    );
    await logMessage(
      user.id,
      `Late-domain (post-paid): ${domain} @ $${price}/yr → addon link sent`,
      'assistant'
    );
  } catch (err) {
    logger.error(`[LATE-DOMAIN] Post-paid addon link failed: ${err.message}`);
    await sendTextMessage(
      user.phone_number,
      await localize(
        `I picked *${domain}* but had trouble creating the payment link. Message us and we'll resend.`,
        user
      )
    );
  }
  return STATES.WEB_REVISIONS;
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

// ─── Cross-state field correction ────────────────────────────────────────────
// Applies a {field, op, value} correction surfaced by correctionDetector.js.
// `op` is "replace" (default) for scalar fields and replace-list intents,
// or "add" / "remove" for list fields (services / serviceAreas) when the
// user is appending or pruning specific items rather than overwriting the
// whole list.
//
// Returns the human-readable acknowledgment string, or null if the value
// failed validation / normalization (in which case the router falls back
// to the regular state handler).
async function applyFieldCorrection(user, field, rawValue, op = 'replace') {
  const wd = { ...(user.metadata?.websiteData || {}) };
  const value = String(rawValue || '').trim();
  if (!value) return null;

  const updates = { websiteData: wd };
  let ack = null;

  // Helper: split a comma-separated value into clean items.
  const splitItems = (v) =>
    String(v).split(/\s*,\s*|\s+(?:and|&)\s+/i).map((s) => s.trim()).filter(Boolean);

  // Helper: apply add/remove/replace to a list field.
  const applyListOp = (existing, items, op) => {
    const existingArr = Array.isArray(existing) ? existing : [];
    if (op === 'add') {
      const lower = new Set(existingArr.map((s) => String(s).toLowerCase().trim()));
      const fresh = items.filter((s) => !lower.has(s.toLowerCase().trim()));
      return { next: [...existingArr, ...fresh], affected: fresh, kind: 'add' };
    }
    if (op === 'remove') {
      const lower = new Set(items.map((s) => String(s).toLowerCase().trim()));
      const next = existingArr.filter((s) => !lower.has(String(s).toLowerCase().trim()));
      const affected = existingArr.filter((s) => lower.has(String(s).toLowerCase().trim()));
      return { next, affected, kind: 'remove' };
    }
    // replace
    return { next: items, affected: items, kind: 'replace' };
  };

  switch (field) {
    case 'businessName': {
      const normalized = normalizeBusinessName(value);
      wd.businessName = normalized;
      ack = `Got it — updated business name to *${normalized}*.`;
      break;
    }
    case 'industry':
      wd.industry = value;
      ack = `Got it — updated industry to *${value}*.`;
      break;
    case 'contactEmail': {
      // Loose email shape — must look like name@host.tld.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
      wd.contactEmail = value;
      // Mirror to legacy top-level metadata.email; other paths read it.
      updates.email = value;
      ack = `Got it — updated email to *${value}*.`;
      break;
    }
    case 'contactPhone':
      wd.contactPhone = value;
      ack = `Got it — updated phone to *${value}*.`;
      break;
    case 'contactAddress':
      wd.contactAddress = value;
      ack = `Got it — updated address to *${value}*.`;
      break;
    case 'primaryCity':
      wd.primaryCity = value;
      ack = `Got it — updated city to *${value}*.`;
      break;
    case 'services': {
      const items = splitItems(value);
      if (!items.length) return null;
      const { next, affected, kind } = applyListOp(wd.services, items, op);
      // Nothing actually changed — guard against silent no-ops (e.g.
      // remove-of-non-existent, add-of-already-present).
      if (kind !== 'replace' && affected.length === 0) return null;
      wd.services = next;
      const preview = (affected.length ? affected : next).slice(0, 4).join(', ');
      const ellipsis = (affected.length ? affected.length : next.length) > 4 ? '…' : '';
      if (kind === 'add') ack = `Got it — added *${preview}${ellipsis}* to your services.`;
      else if (kind === 'remove') ack = `Got it — removed *${preview}${ellipsis}* from your services.`;
      else ack = `Got it — updated services to *${preview}${ellipsis}*.`;
      break;
    }
    case 'serviceAreas': {
      const items = splitItems(value);
      if (!items.length) return null;
      const { next, affected, kind } = applyListOp(wd.serviceAreas, items, op);
      if (kind !== 'replace' && affected.length === 0) return null;
      wd.serviceAreas = next;
      const preview = (affected.length ? affected : next).slice(0, 4).join(', ');
      const ellipsis = (affected.length ? affected.length : next.length) > 4 ? '…' : '';
      if (kind === 'add') ack = `Got it — added *${preview}${ellipsis}* to your service areas.`;
      else if (kind === 'remove') ack = `Got it — removed *${preview}${ellipsis}* from your service areas.`;
      else ack = `Got it — updated service areas to *${preview}${ellipsis}*.`;
      break;
    }
    default:
      return null;
  }

  await updateUserMetadata(user.id, updates);
  user.metadata = { ...(user.metadata || {}), websiteData: wd };
  if (updates.email) user.metadata.email = updates.email;
  await logMessage(
    user.id,
    `Correction applied (${op}): ${field} → ${
      Array.isArray(wd[field]) ? wd[field].join(', ') : value
    }`,
    'assistant'
  );

  return ack;
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
  // Cross-state correction handler — called from the router when
  // correctionDetector flags a previously-answered field.
  applyFieldCorrection,
  // Exposed so router's intent classifier can fast-path paid-claim
  // phrasings as 'answer' — otherwise the LLM classifier sometimes
  // reads them as 'menu' and routes the user to service-selection
  // instead of the paid-claim handler inside handleRevisions.
  PAID_CLAIM_RX,
};
