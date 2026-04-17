const {
  sendTextMessage,
  sendInteractiveButtons,
  sendCTAButton,
} = require('../../messages/sender');
const { logMessage, getConversationHistory } = require('../../db/conversations');
const { updateUserMetadata, updateUserState } = require('../../db/users');
const { createSite, updateSite, getLatestSite } = require('../../db/sites');
const { logger } = require('../../utils/logger');
const { generateResponse } = require('../../llm/provider');
const { STATES } = require('../states');
const { isAffirmative, isSkip, isNegative, isChangeRequest } = require('../../utils/intentHelpers');
const { buildDirective: languageDirective } = require('../../llm/languageDirective');
const { withProgress } = require('../progressIndicator');

// ═══════════════════════════════════════════════════════════════════════════
// SMART MULTI-FIELD EXTRACTOR (Path B — natural-conversation collector)
//
// Many users dump multiple fields into a single message. Rather than asking
// each field one at a time like a form, we run an extractor on every free-
// text answer and fast-forward past steps whose fields are already filled.
//
// Cheap regex pre-pass catches the obvious stuff (email, phone). LLM is
// only invoked when the message looks like it MIGHT contain richer info
// (long-ish, has commas, mentions a place, etc.) so most short single-field
// answers stay free of an extra LLM round-trip.
// ═══════════════════════════════════════════════════════════════════════════

const EMAIL_RX = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RX = /(?:\+?\d[\d\s\-().]{6,}\d)/;

// Returns only fields newly extracted (not already populated in `known`).
async function extractWebsiteFields(text, known, user) {
  const raw = String(text || '').trim();
  if (!raw) return {};
  const out = {};

  // Cheap regex pre-pass — no LLM cost.
  if (!known.contactEmail) {
    const m = raw.match(EMAIL_RX);
    if (m) out.contactEmail = m[0];
  }
  if (!known.contactPhone) {
    const m = raw.match(PHONE_RX);
    // Avoid matching dates like "16/04/2026" — require at least one separator OR length >=10
    if (m && (m[0].length >= 10 || /[\s\-+().]/.test(m[0]))) out.contactPhone = m[0].trim();
  }

  // Decide if it's worth running the LLM extractor. Skip on short replies
  // that almost certainly only answer the current question.
  const looksRich =
    raw.length >= 18 ||
    /[,;]/.test(raw) ||
    /\b(in|at|serving|near)\s+[A-Z]/.test(raw) ||
    /[\n]/.test(raw);
  if (!looksRich) {
    return out;
  }

  // LLM extraction — focused, JSON-only, told to omit unknown fields.
  const missing = [];
  if (!known.businessName) missing.push('businessName');
  if (!known.industry) missing.push('industry');
  if (!known.primaryCity) missing.push('primaryCity');
  if (!Array.isArray(known.serviceAreas) || !known.serviceAreas.length) missing.push('serviceAreas');
  if (!Array.isArray(known.services) || !known.services.length) missing.push('services');
  if (!known.contactAddress) missing.push('contactAddress');

  if (!missing.length) return out;

  const prompt = `You are a structured-data extractor. Read the user's message and return ONLY valid JSON with any of the listed fields you can confidently extract. Omit fields not clearly stated. Never guess or hallucinate. Never include a field that's already known.

Fields you may extract (only the ones in this list — ignore others):
${missing.map((f) => `- ${f}`).join('\n')}

Field rules:
- businessName: the trade name of the business (NOT the user's personal name unless explicitly stated as the business name).
- industry: 1-3 word niche label, e.g. "HVAC", "Salon", "Restaurant", "Real estate".
- primaryCity: the city the business is based in.
- serviceAreas: array of cities/neighborhoods they serve. May overlap with primaryCity.
- services: array of services or products offered.
- contactAddress: physical street address.

Already known (do NOT re-extract these): ${JSON.stringify({
    businessName: known.businessName || undefined,
    industry: known.industry || undefined,
    primaryCity: known.primaryCity || undefined,
    serviceAreas: (known.serviceAreas && known.serviceAreas.length) ? known.serviceAreas : undefined,
    services: (known.services && known.services.length) ? known.services : undefined,
    contactEmail: known.contactEmail || undefined,
    contactPhone: known.contactPhone || undefined,
    contactAddress: known.contactAddress || undefined,
  })}

Return JSON like {"industry":"HVAC","primaryCity":"Austin"} or {} if nothing found. No commentary.`;

  try {
    const response = await generateResponse(prompt, [{ role: 'user', content: raw }], {
      userId: user?.id,
      operation: 'webdev_field_extract',
    });
    const m = response.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      for (const k of missing) {
        const v = parsed[k];
        if (v == null) continue;
        if (typeof v === 'string') {
          const trimmed = v.trim();
          if (trimmed.length >= 2 && trimmed.length < 120) out[k] = trimmed;
        } else if (Array.isArray(v)) {
          const cleaned = v
            .map((x) => (typeof x === 'string' ? x.trim() : ''))
            .filter((x) => x && x.length < 80);
          if (cleaned.length) out[k] = cleaned;
        }
      }
    }
  } catch (err) {
    logger.warn(`[WEBDEV-EXTRACT] LLM extraction failed: ${err.message}`);
  }

  return out;
}

// Walk the website-dev checklist and return the first state whose field
// is still missing. Used to fast-forward past steps already covered. Email
// is stored at top-level metadata.email by the legacy handler, so we accept
// either location as "collected".
function nextMissingWebDevState(websiteData, fullMetadata = {}) {
  const { isHvac } = require('../../website-gen/templates');
  if (!websiteData.businessName) return STATES.WEB_COLLECT_NAME;
  const emailCollected =
    fullMetadata.email != null || websiteData.contactEmail != null || websiteData.email != null || fullMetadata.emailSkipped === true;
  if (!emailCollected) return STATES.WEB_COLLECT_EMAIL;
  if (!websiteData.industry) return STATES.WEB_COLLECT_INDUSTRY;
  if (isHvac(websiteData.industry) && !websiteData.primaryCity && (!websiteData.serviceAreas || !websiteData.serviceAreas.length)) {
    return STATES.WEB_COLLECT_AREAS;
  }
  if (websiteData.services == null) return STATES.WEB_COLLECT_SERVICES;
  // Phone is critical (especially for HVAC). Email alone is not enough — make
  // sure we collect at least a phone OR address before confirming.
  if (!websiteData.contactPhone && !websiteData.contactAddress) return STATES.WEB_COLLECT_CONTACT;
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
  const merged = { ...known };
  const captured = [];
  for (const [k, v] of Object.entries(extracted)) {
    if (v == null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (merged[k] && (Array.isArray(merged[k]) ? merged[k].length > 0 : String(merged[k]).length > 0)) continue;
    merged[k] = v;
    captured.push(k);
  }

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
  const base = ack ? `${ack}\n\n${nextQuestion}` : nextQuestion;
  // Append a progress marker so the user knows how much is left.
  const fullMsg = withProgress(base, 'webdev', merged);

  await sendTextMessage(user.phone_number, fullMsg);
  return nextState;
}

function questionForState(state, websiteData) {
  switch (state) {
    case STATES.WEB_COLLECT_NAME: return "What's your business name?";
    case STATES.WEB_COLLECT_EMAIL: return "Before we continue, what's a good email to reach you at? We'll send you updates about your site there. No worries if you'd rather skip it.";
    case STATES.WEB_COLLECT_INDUSTRY: return 'What industry are you in? For example - tech, healthcare, restaurant, real estate, creative, etc.';
    case STATES.WEB_COLLECT_AREAS: return 'Which city are you based in, and which areas do you serve? Example: *Austin — Round Rock, Cedar Park, Pflugerville*';
    case STATES.WEB_COLLECT_SERVICES: {
      const { isHvac } = require('../../website-gen/templates');
      if (isHvac(websiteData.industry)) {
        return "Which HVAC services do you offer? Just list them out. If you'd rather I use a default list (AC repair, heating, heat pumps, duct cleaning, thermostats, and more), that's fine too.";
      }
      return 'What services or products do you offer? Just list them out.';
    }
    case STATES.WEB_COLLECT_CONTACT: return "Last thing — what contact info do you want on the site? Send your email, phone, and/or address.";
    default: return '';
  }
}

// Forward declaration shim — sendConfirmation is defined below in the file.
async function sendConfirmation(user, websiteData) {
  // Reuse the confirmation message that handleCollectContact would build.
  // We do a minimal version here so the flow can jump straight to confirm
  // when the extractor fills in all required fields.
  const lines = ['Here\'s a summary of your website details:', ''];
  if (websiteData.businessName) lines.push(`*Business Name:* ${websiteData.businessName}`);
  if (websiteData.industry) lines.push(`*Industry:* ${websiteData.industry}`);
  if (websiteData.primaryCity) lines.push(`*City:* ${websiteData.primaryCity}`);
  if (Array.isArray(websiteData.serviceAreas) && websiteData.serviceAreas.length) lines.push(`*Service Areas:* ${websiteData.serviceAreas.join(', ')}`);
  if (Array.isArray(websiteData.services) && websiteData.services.length) lines.push(`*Services:* ${websiteData.services.join(', ')}`);
  const contact = [websiteData.contactEmail, websiteData.contactPhone, websiteData.contactAddress].filter(Boolean).join(' | ');
  if (contact) lines.push(`*Contact:* ${contact}`);
  lines.push('', "Does everything look good? Let me know if you want to change anything, or we can start building!");
  await sendTextMessage(user.phone_number, lines.join('\n'));
  return STATES.WEB_CONFIRM;
}

async function handleWebDev(user, message) {
  switch (user.state) {
    case STATES.WEB_COLLECTING:
      return handleWebCollecting(user, message);
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
    case STATES.WEB_COLLECT_COLORS:
    case STATES.WEB_COLLECT_LOGO:
      // Legacy: skip straight to contact if stuck in old states
      return STATES.WEB_COLLECT_CONTACT;
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
  // ── Auto-prefill from earlier conversation ──────────────────────────────
  // If the messageAnalyzer captured a business name during sales chat
  // ("we're Fresh Cuts, a barbershop"), use it instead of asking again.
  const prefilledName = user.metadata?.extractedBusinessName;
  const existingWebsiteData = user.metadata?.websiteData || {};
  if (prefilledName && !existingWebsiteData.businessName) {
    if (!user.metadata?.currentSiteId) {
      const site = await createSite(user.id, 'business-starter');
      await updateUserMetadata(user.id, { currentSiteId: site.id });
      user.metadata = { ...(user.metadata || {}), currentSiteId: site.id };
    }
    const websiteData = { ...existingWebsiteData, businessName: prefilledName };
    await updateUserMetadata(user.id, { websiteData });
    user.metadata = { ...(user.metadata || {}), websiteData };
    logger.info(`[ENTITY-PREFILL] Auto-filled businessName for ${user.phone_number}: "${prefilledName}"`);
    await sendTextMessage(
      user.phone_number,
      `I'll use *${prefilledName}* as your business name!`
    );
    await logMessage(user.id, `Auto-filled business name: ${prefilledName}`, 'assistant');
    const nextState = nextMissingWebDevState(websiteData, user.metadata || {});
    if (nextState !== STATES.WEB_COLLECT_NAME) {
      const q = questionForState(nextState, websiteData);
      if (q) {
        await sendTextMessage(user.phone_number, q);
        await logMessage(user.id, q, 'assistant');
      }
      return nextState;
    }
  }

  const text = (message.text || '').trim();
  if (!text || text.length < 2) {
    await sendTextMessage(user.phone_number, 'Please enter your business name:');
    return STATES.WEB_COLLECT_NAME;
  }

  // Create site record if not yet
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

  if (isSkip(message) || isNegative(message)) {
    await updateUserMetadata(user.id, { emailSkipped: true });
    user.metadata = { ...(user.metadata || {}), emailSkipped: true };
    await logMessage(user.id, 'Email skipped', 'assistant');
  } else if (emailMatch) {
    await updateUserMetadata(user.id, { email: emailMatch[0] });
    user.metadata = { ...(user.metadata || {}), email: emailMatch[0] };
    await logMessage(user.id, `Email collected: ${emailMatch[0]}`, 'assistant');
  } else {
    // Not a valid email and not a skip — ask again gently
    await sendTextMessage(
      user.phone_number,
      "Hmm, that doesn't look like an email. Could you double-check? Totally fine to skip it if you'd rather not share one."
    );
    return STATES.WEB_COLLECT_EMAIL;
  }

  const ackPrefix = emailMatch ? `Got it, saved *${emailMatch[0]}*!` : 'No worries — we can add it later.';
  return smartAdvance(user, message, ackPrefix);
}

async function handleCollectIndustry(user, message) {
  // ── Auto-prefill from earlier conversation ──────────────────────────────
  // If the messageAnalyzer captured the industry during sales chat
  // ("I'm a plumber"), use it instead of asking again.
  const prefilledIndustry = user.metadata?.extractedIndustry;
  const existingWd = user.metadata?.websiteData || {};
  if (prefilledIndustry && !existingWd.industry) {
    const websiteData = { ...existingWd, industry: prefilledIndustry };
    await updateUserMetadata(user.id, { websiteData });
    user.metadata = { ...(user.metadata || {}), websiteData };
    logger.info(`[ENTITY-PREFILL] Auto-filled industry for ${user.phone_number}: "${prefilledIndustry}"`);
    await sendTextMessage(
      user.phone_number,
      `I remember you mentioned *${prefilledIndustry}* — I'll design around that! 🎯`
    );
    await logMessage(user.id, `Auto-filled industry: ${prefilledIndustry}`, 'assistant');
    const nextState = nextMissingWebDevState(websiteData, user.metadata || {});
    if (nextState !== STATES.WEB_COLLECT_INDUSTRY) {
      const q = questionForState(nextState, websiteData);
      if (q) {
        await sendTextMessage(user.phone_number, q);
        await logMessage(user.id, q, 'assistant');
      }
      return nextState;
    }
  }

  let industry = message.listId
    ? message.text // Use the title from the list selection
    : (message.text || '').trim();

  if (!industry) {
    await sendTextMessage(user.phone_number, 'Please select or type your industry:');
    return STATES.WEB_COLLECT_INDUSTRY;
  }

  // Handle name corrections: "the name should be X" or "change name to X"
  const nameCorrection = industry.match(/(?:name\s*(?:should be|is|to)|change.*name.*to|actually.*called|it'?s\s+called)\s*["']?(.+?)["']?\s*$/i);
  if (nameCorrection) {
    const newName = nameCorrection[1].trim();
    await updateUserMetadata(user.id, {
      websiteData: { ...(user.metadata?.websiteData || {}), businessName: newName },
    });
    await sendTextMessage(user.phone_number, `Updated to *${newName}*! Now, what industry are you in?`);
    return STATES.WEB_COLLECT_INDUSTRY;
  }

  // If the user asks the bot to figure it out, infer from conversation context
  const inferPhrases = /figure.?it.?out|you.?tell.?me|i.?don.?t.?know|idk|from.?(the|my).?(idea|description|above|prev)|you.?already.?know|can.?t.?figure|same.?as/i;
  if (inferPhrases.test(industry)) {
    try {
      const history = await getConversationHistory(user.id, 10);
      const websiteData = user.metadata?.websiteData || {};
      const context = history.map(m => `${m.role}: ${m.message_text}`).join('\n');
      const inferred = await generateResponse(
        `Based on the conversation below and the business name "${websiteData.businessName || ''}", determine the most appropriate industry/niche for this business. Return ONLY the industry name (1-3 words, e.g. "Education", "Poetry & Literature", "Food & Beverage"). No explanation.\n\nConversation:\n${context}`,
        [{ role: 'user', content: industry }],
        { userId: user.id, operation: 'webdev_industry_infer' }
      );
      if (inferred && inferred.trim().length > 1) {
        industry = inferred.trim().replace(/^["']|["']$/g, '');
        await sendTextMessage(user.phone_number, `Got it - I'll go with *${industry}*!`);
      } else {
        await sendTextMessage(user.phone_number, "I couldn't figure that out from our conversation. Could you just type the industry? For example: tech, education, food, creative, etc.");
        return STATES.WEB_COLLECT_INDUSTRY;
      }
    } catch (error) {
      logger.error('Industry inference error:', error);
      await sendTextMessage(user.phone_number, "Could you just type the industry? For example: tech, education, food, creative, etc.");
      return STATES.WEB_COLLECT_INDUSTRY;
    }
  }

  const websiteData = { ...(user.metadata?.websiteData || {}), industry };
  await updateUserMetadata(user.id, { websiteData });
  user.metadata = { ...(user.metadata || {}), websiteData };
  await logMessage(user.id, `Industry: ${industry}`, 'assistant');

  return smartAdvance(user, message);
}

// ─── HVAC: city + service areas ──────────────────────────────────────────────
async function handleCollectAreas(user, message) {
  const raw = (message.text || '').trim();
  if (!raw) {
    await sendTextMessage(
      user.phone_number,
      'Please tell me your city and service areas. Example: *Austin — Round Rock, Cedar Park*'
    );
    return STATES.WEB_COLLECT_AREAS;
  }

  // Allow skip — treat as "we'll fill in later".
  if (isSkip(message)) {
    const websiteData = {
      ...(user.metadata?.websiteData || {}),
      primaryCity: user.metadata?.websiteData?.primaryCity || null,
      serviceAreas: [],
      areasSkipped: true,
    };
    await updateUserMetadata(user.id, { websiteData });
    user.metadata = { ...(user.metadata || {}), websiteData };
    return smartAdvance(user, message, 'No problem — we can add areas later.');
  }

  // Parse: split on newline, em/en dash, colon, pipe, or "serving". Newline
  // first so users typing on two lines (city on line 1, areas on line 2) work.
  const parts = raw.split(/\r?\n+|\s*[—\-–:|]\s+|\s+serving\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  let primaryCity = (parts[0] || '').replace(/[,.]$/, '');
  let areasStr = parts.slice(1).join(', ').trim();
  let serviceAreas = areasStr
    ? areasStr.split(/[,;]|\band\b/i).map((s) => s.trim()).filter(Boolean)
    : [];

  // If the user gave a single value only, treat it as both primaryCity and the
  // sole service area.
  if (!serviceAreas.length && primaryCity) {
    // But first check: the single value might itself be a comma-separated
    // list with no city header, e.g. "Karachi, Gulshan, Pechs". In that case
    // first element = primary city, rest = service areas.
    if (primaryCity.includes(',')) {
      const tokens = primaryCity.split(',').map((s) => s.trim()).filter(Boolean);
      if (tokens.length > 1) {
        primaryCity = tokens[0];
        serviceAreas = tokens;
      } else {
        serviceAreas = [primaryCity];
      }
    } else {
      serviceAreas = [primaryCity];
    }
  }

  // If parsing clearly failed (primaryCity looks like a sentence), ask LLM to
  // extract structured fields.
  if (!primaryCity || primaryCity.length > 40) {
    try {
      const extracted = await generateResponse(
        `Extract the primary city and the list of service areas from this HVAC business owner message. Return ONLY JSON: {"primaryCity":"...","serviceAreas":["..."]}. If unclear, make reasonable guesses.`,
        [{ role: 'user', content: raw }],
        { userId: user.id, operation: 'webdev_hvac_areas' }
      );
      const m = extracted.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (parsed.primaryCity) primaryCity = String(parsed.primaryCity).trim();
        if (Array.isArray(parsed.serviceAreas)) serviceAreas = parsed.serviceAreas.map((s) => String(s).trim()).filter(Boolean);
        if (!serviceAreas.length && primaryCity) serviceAreas = [primaryCity];
      }
    } catch (err) {
      logger.warn(`[HVAC] LLM area extraction failed: ${err.message}`);
    }
  }

  const websiteData = {
    ...(user.metadata?.websiteData || {}),
    primaryCity: primaryCity || null,
    serviceAreas,
  };
  await updateUserMetadata(user.id, { websiteData });
  user.metadata = { ...(user.metadata || {}), websiteData };
  await logMessage(user.id, `HVAC areas: ${primaryCity} / ${serviceAreas.join(', ')}`, 'assistant');

  const ackPrefix = `Got it — based in *${primaryCity || 'your area'}* serving *${serviceAreas.slice(0, 4).join(', ')}${serviceAreas.length > 4 ? '…' : ''}*.`;
  return smartAdvance(user, message, ackPrefix);
  await logMessage(user.id, `HVAC areas: ${primaryCity} / ${serviceAreas.join(', ')}`, 'assistant');

  return STATES.WEB_COLLECT_SERVICES;
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
  real_estate: { primaryColor: '#2D3436', secondaryColor: '#1A1D1E', accentColor: '#B8860B' },
  realestate:  { primaryColor: '#2D3436', secondaryColor: '#1A1D1E', accentColor: '#B8860B' },
  property:    { primaryColor: '#2D3436', secondaryColor: '#1A1D1E', accentColor: '#B8860B' },
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
};
const DEFAULT_COLORS = { primaryColor: '#1E293B', secondaryColor: '#0F172A', accentColor: '#6366F1' };

function getColorsForIndustry(industry) {
  const key = (industry || '').toLowerCase().replace(/[\s\-_\/]+/g, '_').trim();
  // Try exact match first, then partial match
  if (INDUSTRY_COLORS[key]) return INDUSTRY_COLORS[key];
  const match = Object.keys(INDUSTRY_COLORS).find(k => key.includes(k) || k.includes(key));
  return match ? INDUSTRY_COLORS[match] : DEFAULT_COLORS;
}

// A "salon-like" business gets the dedicated salon template with its booking flow.
function isSalonIndustry(industry) {
  if (!industry) return false;
  return /\b(salon|beauty|barber|spa|nail|hair|lash|brow|makeup)\b/i.test(industry);
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
  // ── Auto-prefill from earlier conversation ──────────────────────────────
  // If the messageAnalyzer already captured services from earlier text,
  // use them instead of re-asking. Note: extractedServices is a comma-or-
  // semicolon-separated string (per messageAnalyzer schema).
  const prefilledServices = user.metadata?.extractedServices;
  const existingWdSvc = user.metadata?.websiteData || {};
  if (
    prefilledServices &&
    (!Array.isArray(existingWdSvc.services) || existingWdSvc.services.length === 0)
  ) {
    const services = String(prefilledServices)
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (services.length > 0) {
      const industry = existingWdSvc.industry || '';
      const colors = getColorsForIndustry(industry);
      const websiteData = { ...existingWdSvc, services, ...colors };
      await updateUserMetadata(user.id, { websiteData });
      user.metadata = { ...(user.metadata || {}), websiteData };
      logger.info(`[ENTITY-PREFILL] Auto-filled services for ${user.phone_number}: "${services.join(', ')}"`);
      await sendTextMessage(
        user.phone_number,
        `I've got your services as *${services.slice(0, 4).join(', ')}${services.length > 4 ? '…' : ''}* — I'll use those!`
      );
      await logMessage(user.id, `Auto-filled services: ${services.join(', ')}`, 'assistant');

      // Salons need their own sub-flow even when services are pre-filled.
      if (isSalonIndustry(industry)) return startSalonFlow(user);

      const nextState = nextMissingWebDevState(websiteData, user.metadata || {});
      if (nextState !== STATES.WEB_COLLECT_SERVICES) {
        const q = questionForState(nextState, websiteData);
        if (q) {
          await sendTextMessage(user.phone_number, q);
          await logMessage(user.id, q, 'assistant');
        }
        return nextState;
      }
    }
  }

  const servicesText = (message.text || '').trim();
  if (!servicesText || servicesText.length < 2) {
    await sendTextMessage(
      user.phone_number,
      "Just list your services or products out. If you don't have specific services to list, let me know and I'll set up the page without one."
    );
    return STATES.WEB_COLLECT_SERVICES;
  }

  // Extra phrases beyond the core skip helper — longer statements like
  // "I don't offer any services" that should still count as "no services".
  const skipPhrases = /\b(no services|no products|don'?t (offer|have|provide)|dont (offer|have|provide))\b/i;
  const industry = user.metadata?.websiteData?.industry || '';
  const colors = getColorsForIndustry(industry);

  if (isSkip(message) || skipPhrases.test(servicesText)) {
    const websiteData = { ...(user.metadata?.websiteData || {}), services: [], ...colors };
    await updateUserMetadata(user.id, { websiteData });
    user.metadata = { ...(user.metadata || {}), websiteData };
    await logMessage(user.id, `Services: skipped | Colors auto-assigned for ${industry}`, 'assistant');
    if (isSalonIndustry(industry)) return startSalonFlow(user);
    return smartAdvance(user, message, 'No worries — we\'ll use a sensible default.');
  }

  const services = servicesText.split(',').map((s) => s.trim()).filter(Boolean);

  const websiteData = { ...(user.metadata?.websiteData || {}), services, ...colors };
  await updateUserMetadata(user.id, { websiteData });
  user.metadata = { ...(user.metadata || {}), websiteData };
  await logMessage(user.id, `Services: ${services.join(', ')} | Colors auto-assigned for ${industry}`, 'assistant');

  if (isSalonIndustry(industry)) return startSalonFlow(user);

  return smartAdvance(user, message, `Got it — *${services.slice(0, 4).join(', ')}${services.length > 4 ? '…' : ''}*.`);
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
  await sendTextMessage(
    user.phone_number,
    'Do you already use a booking tool (Fresha, Booksy, Vagaro, Calendly, etc.)?\n\n' +
      '• If yes, just paste the link and I\'ll embed it on your site.\n' +
      '• If not, no worries — just let me know and I\'ll build a booking system right into your site.'
  );
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
  await sendTextMessage(
    user.phone_number,
    'Last thing — what contact info do you want on the site? Just send your email, phone, and/or address.'
  );
  return STATES.WEB_COLLECT_CONTACT;
}

/**
 * Re-render the confirmation summary (used when we loop back to CONFIRM after
 * collecting salon-specific details mid-flow). Mirrors the message in
 * handleCollectContact so users see the same structure.
 */
async function showConfirmSummary(user) {
  const freshUser = await require('../../db/users').findOrCreateUser(user.phone_number, user.channel, user.via_phone_number_id);
  const wd = freshUser.metadata?.websiteData || {};
  const servicesList = (wd.services || []).length > 0 ? wd.services.join(', ') : 'None (skipped)';
  const contactInfo = [wd.contactEmail, wd.contactPhone, wd.contactAddress].filter(Boolean).join(' | ') || 'None';
  const bookingLine = wd.bookingMode === 'embed'
    ? `\n*Booking:* External link (${wd.bookingUrl || 'set'})`
    : wd.bookingMode === 'native'
      ? `\n*Booking:* Built-in system${wd.weeklyHours ? ' · hours set' : ''}${Array.isArray(wd.salonServices) && wd.salonServices.length > 0 ? ` · ${wd.salonServices.length} priced services` : ''}`
      : '';
  const igLine = wd.instagramHandle ? `\n*Instagram:* @${wd.instagramHandle}` : '';

  const summary =
    `Updated. Here's the current summary:\n\n` +
    `*Business Name:* ${wd.businessName || '-'}\n` +
    `*Industry:* ${wd.industry || '-'}\n` +
    `*Services:* ${servicesList}` +
    bookingLine +
    igLine +
    `\n*Contact:* ${contactInfo}\n\n` +
    `Want me to build it, or should I tweak anything?`;

  await sendTextMessage(user.phone_number, summary);
  return STATES.WEB_CONFIRM;
}

async function handleSalonBookingTool(user, message) {
  const text = (message.text || '').trim();
  const wd = { ...(user.metadata?.websiteData || {}) };
  const urlMatch = text.match(/https?:\/\/\S+/i);

  if (urlMatch) {
    wd.bookingMode = 'embed';
    wd.bookingUrl = urlMatch[0].replace(/[)\]]+$/, '');
    await updateUserMetadata(user.id, { websiteData: wd });
    await logMessage(user.id, `Booking mode: embed (${wd.bookingUrl})`, 'assistant');
    await sendTextMessage(
      user.phone_number,
      `Got it — I'll embed *${wd.bookingUrl}* on your booking page.\n\nWhat's your Instagram handle? (e.g. @glowstudio). No worries if you don't have one.`
    );
    return STATES.SALON_INSTAGRAM;
  }

  if (isNegative(message) || isSkip(message) || /\bnot yet\b/i.test(text)) {
    wd.bookingMode = 'native';
    await updateUserMetadata(user.id, { websiteData: wd });
    await logMessage(user.id, 'Booking mode: native', 'assistant');
    await sendTextMessage(
      user.phone_number,
      "Perfect — I'll build you a booking system. What's your Instagram handle? (e.g. @glowstudio). No worries if you don't have one."
    );
    return STATES.SALON_INSTAGRAM;
  }

  await sendTextMessage(
    user.phone_number,
    "Paste your booking tool link (Fresha/Booksy/Vagaro/etc.) if you have one — or just let me know you don't and I'll build one into the site."
  );
  return STATES.SALON_BOOKING_TOOL;
}

async function handleSalonInstagram(user, message) {
  const text = (message.text || '').trim();
  const wd = { ...(user.metadata?.websiteData || {}) };

  if (!isSkip(message) && !isNegative(message) && text.length > 0) {
    // Accept @handle, bare handle, or full URL — normalise to handle.
    const urlHandle = text.match(/instagram\.com\/([\w.]+)/i);
    const raw = urlHandle ? urlHandle[1] : text.replace(/^@/, '').split(/\s/)[0];
    if (raw && /^[\w.]{1,30}$/.test(raw)) {
      wd.instagramHandle = raw;
    }
  }
  await updateUserMetadata(user.id, { websiteData: wd });
  await logMessage(user.id, `Instagram: ${wd.instagramHandle || '(skipped)'}`, 'assistant');

  if (wd.bookingMode === 'native') {
    await sendTextMessage(
      user.phone_number,
      "What are your opening hours? A quick line is fine — for example: *\"Tue-Sat 9-7, Sun-Mon closed\"*. If you want me to just use standard salon hours (Tue-Sat 9-7), type *default*."
    );
    return STATES.SALON_HOURS;
  }

  // Embed mode — skip hours/durations and finish the salon sub-flow.
  return finishSalonFlow(user);
}

async function handleSalonHours(user, message) {
  const text = (message.text || '').trim();
  const wd = { ...(user.metadata?.websiteData || {}) };
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
    await sendTextMessage(user.phone_number, prefix.trim());
    return finishSalonFlow(user);
  }
  await sendTextMessage(
    user.phone_number,
    prefix +
      `How long does each service take, and what's the price?\n\n` +
      `Example: *"Haircut 30min €25, Colour 90min €85, Nails 45min €35"*.\n\n` +
      `Your services: ${services.join(', ')}.\n\n` +
      `If you want me to use 30min with no price, just type *default*.`
  );
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
  const useDefault = /^(default|skip|idk|dunno|not sure|30)$/i.test(text);
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
  // Stops at the next known label or end of string.
  const labeledAddressMatch = text.match(
    /(?:address|location|addr)\s*[:\-]?\s*([^\n]+?)(?=\s*(?:email|phone|tel|mobile|e-?mail)\s*[:\-]|$)/i
  );

  let addressValue = '';
  if (labeledAddressMatch) {
    addressValue = labeledAddressMatch[1].trim();
  } else {
    // Fallback: strip the matched email/phone and any leftover label words, return the rest.
    addressValue = text
      .replace(emailMatch?.[0] || '', '')
      .replace(phoneMatch?.[0] || '', '')
      .replace(/\b(email|e-?mail|phone|tel|mobile|address|location|addr)\s*[:\-]?/gi, '')
      .replace(/[,\n\r]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  return {
    contactEmail: emailMatch?.[0] || '',
    contactPhone: phoneMatch?.[0]?.trim() || '',
    contactAddress: addressValue,
  };
}

async function handleCollectContact(user, message) {
  const meta = user.metadata || {};
  const existingContactWd = meta.websiteData || {};
  const contactText = (message.text || '').trim();

  // ── Auto-prefill from earlier conversation ──────────────────────────────
  // First time we hit this state with previously-extracted contact info
  // and nothing already saved, pre-populate and ask for additions/confirm.
  // The `contactPrefillShown` flag prevents re-showing the prefill on
  // subsequent turns within this state.
  const prefillEmail = meta.extractedEmail || meta.email;
  const prefillPhone = meta.extractedPhone;
  const prefillLocation = meta.extractedLocation;
  const haveAnyPrefill = prefillEmail || prefillPhone || prefillLocation;
  const contactEmpty =
    !existingContactWd.contactEmail &&
    !existingContactWd.contactPhone &&
    !existingContactWd.contactAddress;

  if (haveAnyPrefill && contactEmpty && !meta.contactPrefillShown) {
    const prefillData = {
      contactEmail: prefillEmail || '',
      contactPhone: prefillPhone || '',
      contactAddress: prefillLocation || '',
    };
    const websiteData = { ...existingContactWd, ...prefillData };
    await updateUserMetadata(user.id, { websiteData, contactPrefillShown: true });
    user.metadata = { ...meta, websiteData, contactPrefillShown: true };

    const filled = [];
    if (prefillData.contactEmail) filled.push(`email *${prefillData.contactEmail}*`);
    if (prefillData.contactPhone) filled.push(`phone *${prefillData.contactPhone}*`);
    if (prefillData.contactAddress) filled.push(`location *${prefillData.contactAddress}*`);

    logger.info(
      `[ENTITY-PREFILL] Auto-filled contact for ${user.phone_number}: ${filled.join(', ')}`
    );
    await sendTextMessage(
      user.phone_number,
      `I already have ${filled.join(', ')} from earlier. Anything else to add (a different phone, address, etc.) or is that good to go?`
    );
    await logMessage(user.id, `Showed contact prefill: ${filled.join(', ')}`, 'assistant');
    return STATES.WEB_COLLECT_CONTACT;
  }

  // Edit-intent escape hatch: if the user says something like "actually the
  // name is X" or "change the industry" while we're sitting at the contact
  // step, do NOT parse it as contact info (it used to land as the address).
  // Jump to WEB_CONFIRM and let that handler's LLM edit-parser process it.
  const hasEmailInText = /[\w.-]+@[\w.-]+\.\w+/.test(contactText);
  const hasPhoneInText = /[\+]?[\d][\d\s\-()]{6,}/.test(contactText);
  if (
    contactText &&
    !hasEmailInText &&
    !hasPhoneInText &&
    isChangeRequest(message)
  ) {
    logger.info(`[CONTACT-EDIT] ${user.phone_number}: routing edit "${contactText.slice(0, 80)}" to WEB_CONFIRM`);
    // Hand the original message text forward so WEB_CONFIRM's parser sees
    // the edit verbatim.
    return handleConfirm(user, message);
  }

  // Confirmation of prefilled contact → jump to confirmation summary.
  if (meta.contactPrefillShown && (isAffirmative(message) || /^(good|all good|that'?s?\s+it|no more|use that|use it|done)$/i.test(contactText))) {
    const wd = existingContactWd;
    const servicesList = (wd.services || []).length > 0 ? wd.services.join(', ') : 'None (skipped)';
    const contactInfo =
      [wd.contactEmail, wd.contactPhone, wd.contactAddress].filter(Boolean).join(' | ') ||
      'None';
    const summary =
      `Here's a summary of your website details:\n\n` +
      `*Business Name:* ${wd.businessName || '-'}\n` +
      `*Industry:* ${wd.industry || '-'}\n` +
      `*Services:* ${servicesList}\n` +
      `*Contact:* ${contactInfo}\n\n` +
      `Does everything look good? Let me know if you want to change anything, or we can start building!`;
    await sendTextMessage(user.phone_number, summary);
    await logMessage(user.id, 'Contact confirmed from prefill, showing summary', 'assistant');
    return STATES.WEB_CONFIRM;
  }

  let contactData;
  if (!contactText || contactText.length < 3 || isSkip(message) || isNegative(message)) {
    contactData = { contactEmail: '', contactPhone: '', contactAddress: '' };
  } else {
    contactData = parseContactFields(contactText);
  }

  // If we already prefilled, MERGE with any new info (don't blank out the
  // prefilled fields just because user didn't repeat them).
  if (meta.contactPrefillShown) {
    contactData = {
      contactEmail: contactData.contactEmail || existingContactWd.contactEmail || '',
      contactPhone: contactData.contactPhone || existingContactWd.contactPhone || '',
      contactAddress: contactData.contactAddress || existingContactWd.contactAddress || '',
    };
  }

  await updateUserMetadata(user.id, {
    websiteData: { ...(user.metadata?.websiteData || {}), ...contactData },
  });

  // Show confirmation summary before generating
  const wd = { ...(user.metadata?.websiteData || {}), ...contactData };
  const servicesList = (wd.services || []).length > 0 ? wd.services.join(', ') : 'None (skipped)';
  const contactInfo = [wd.contactEmail, wd.contactPhone, wd.contactAddress].filter(Boolean).join(' | ') || 'None';

  const summary =
    `Here's a summary of your website details:\n\n` +
    `*Business Name:* ${wd.businessName || '-'}\n` +
    `*Industry:* ${wd.industry || '-'}\n` +
    `*Services:* ${servicesList}\n` +
    `*Contact:* ${contactInfo}\n\n` +
    `Does everything look good? Let me know if you want to change anything, or we can start building!`;

  await sendTextMessage(user.phone_number, summary);
  await logMessage(user.id, 'Contact info collected, showing confirmation', 'assistant');

  return STATES.WEB_CONFIRM;
}

async function handleConfirm(user, message) {
  const originalText = (message.text || '').trim();
  if (!originalText) {
    await sendTextMessage(user.phone_number, "Ready to build, or want me to tweak something first?");
    return STATES.WEB_CONFIRM;
  }

  // Fast path — obvious confirmations skip the LLM round-trip entirely.
  if (isAffirmative(message)) {
    await sendTextMessage(
      user.phone_number,
      'Alright, give me about 30-60 seconds to build your site...'
    );
    await logMessage(user.id, 'Confirmed (fast path), generating website', 'assistant');
    return generateWebsite(user);
  }

  const wd = { ...(user.metadata?.websiteData || {}) };
  const contactInfo =
    [wd.contactEmail, wd.contactPhone, wd.contactAddress].filter(Boolean).join(' | ') || 'None';

  // LLM-driven intent parser (gpt-4o). Replaces the old regex cascade that
  // mis-stored "add my number to contact" → phone:"contact". This returns a
  // structured decision: confirm | edit | unclear, plus the exact edits the
  // user asked for and a `useWhatsappNumber` flag for the common case where
  // they want us to use their WhatsApp number without repeating the digits.
  const systemPrompt = `You are parsing the user's reply in a WEB_CONFIRM step. They are reviewing their website details and must either confirm the build or tell us what to change.

CURRENT DETAILS:
- Business Name: ${wd.businessName || '-'}
- Industry: ${wd.industry || '-'}
- Services: ${(wd.services || []).join(', ') || '-'}
- Contact: ${contactInfo}

Return ONLY a single JSON object (no markdown, no commentary) in this exact shape:
{
  "action": "confirm" | "edit" | "unclear",
  "edits": {
    "businessName": string,
    "industry": string,
    "services": string[],
    "email": string,
    "phone": string,
    "address": string
  },
  "useWhatsappNumber": boolean
}

RULES:
- If the user affirms ("yes", "yeah", "yep", "looks good", "perfect", "go ahead", "proceed", "build it", "let's go", "lgtm") → action:"confirm", edits:{}, useWhatsappNumber:false.
- If they want to change something → action:"edit". Include ONLY the fields they changed inside "edits" — omit anything they didn't mention. Never include unchanged fields.
- If they say "add my number", "use my number", "my phone number", "my contact", "use my whatsapp", "add my whatsapp" WITHOUT explicit phone digits → useWhatsappNumber:true and action:"edit" (system will substitute their real WhatsApp number).
- If they give explicit phone digits along with that phrase, put the digits in edits.phone and set useWhatsappNumber:false.
- For "services", normalise to an array of Title Case strings, split commas / "and".
- NEVER write affirmation words (yes/ok/sure) or meta-descriptions ("contact", "number", "info") into any edits field.
- NEVER store button titles ("✅ Continue", "⏭ Skip") as field values.
- If the user's intent is ambiguous → action:"unclear", edits:{}, useWhatsappNumber:false.`;

  let parsed = null;
  try {
    const raw = await generateResponse(
      systemPrompt,
      [{ role: 'user', content: originalText }],
      {
        userId: user.id,
        operation: 'web_confirm_parse',
        // Intent classification for edit vs confirm needs reliable
        // reasoning over tricky phrasings ("add my number to contact") —
        // 4o-mini misreads these. Pin to gpt-4o.
        model: 'gpt-4o',
      }
    );
    parsed = safeParseJson(raw);
  } catch (err) {
    logger.warn(`[WEB-CONFIRM] Parser LLM failed: ${err.message}`);
  }

  const action = (parsed && parsed.action) || 'unclear';

  // ── Confirm → generate ───────────────────────────────────────────────────
  if (action === 'confirm') {
    await sendTextMessage(
      user.phone_number,
      'Alright, give me about 30-60 seconds to build your site...'
    );
    await logMessage(user.id, 'Confirmed, generating website', 'assistant');
    return generateWebsite(user);
  }

  // ── Edit → apply and re-show summary ─────────────────────────────────────
  if (action === 'edit') {
    const edits = (parsed.edits && typeof parsed.edits === 'object') ? parsed.edits : {};
    const changes = [];
    let industryChangedToSalon = false;

    if (typeof edits.businessName === 'string' && edits.businessName.trim()) {
      wd.businessName = edits.businessName.trim();
      changes.push(`business name to *${wd.businessName}*`);
    }
    if (typeof edits.industry === 'string' && edits.industry.trim()) {
      const newIndustry = edits.industry.trim();
      wd.industry = newIndustry;
      changes.push(`industry to *${newIndustry}*`);
      if (
        isSalonIndustry(newIndustry) &&
        !wd.bookingMode &&
        (!Array.isArray(wd.salonServices) || wd.salonServices.length === 0)
      ) {
        industryChangedToSalon = true;
      }
    }
    if (Array.isArray(edits.services) && edits.services.length) {
      wd.services = edits.services
        .map((s) => String(s).trim())
        .filter(Boolean);
      if (wd.services.length) changes.push(`services to *${wd.services.join(', ')}*`);
    }
    if (typeof edits.email === 'string' && edits.email.trim()) {
      const m = edits.email.trim().match(/[\w.-]+@[\w.-]+\.\w+/);
      if (m) {
        wd.contactEmail = m[0];
        changes.push(`email to *${wd.contactEmail}*`);
      }
    }
    // Phone — WhatsApp sentinel takes priority. Accepts useWhatsappNumber:true
    // OR an explicit phone:"USE_WHATSAPP_NUMBER" sentinel (both paths handled
    // so the LLM can't slip either way).
    const wantsWhatsApp =
      parsed.useWhatsappNumber === true ||
      (typeof edits.phone === 'string' && edits.phone.trim().toUpperCase() === 'USE_WHATSAPP_NUMBER');
    if (wantsWhatsApp) {
      wd.contactPhone = formatWhatsAppNumber(user.phone_number);
      changes.push(`your WhatsApp number (*${wd.contactPhone}*)`);
    } else if (typeof edits.phone === 'string' && edits.phone.trim()) {
      // Explicit digits. Guard against junk like "contact" / "number".
      const digits = edits.phone.trim();
      if (/\d{4,}/.test(digits)) {
        wd.contactPhone = digits;
        changes.push(`phone to *${wd.contactPhone}*`);
      }
    }
    if (typeof edits.address === 'string' && edits.address.trim()) {
      wd.contactAddress = edits.address.trim();
      changes.push(`address to *${wd.contactAddress}*`);
    }

    if (changes.length === 0) {
      // Edit intent but nothing extracted — nudge for specifics.
      await sendTextMessage(
        user.phone_number,
        'I caught that you want to change something but couldn\'t pin it down. Could you be specific? e.g. *"change the name to Fresh Cuts"* or *"add my WhatsApp number"*.'
      );
      return STATES.WEB_CONFIRM;
    }

    await updateUserMetadata(user.id, { websiteData: wd });
    user.metadata = { ...(user.metadata || {}), websiteData: wd };

    if (industryChangedToSalon) {
      await updateUserMetadata(user.id, { salonFlowOrigin: 'CONFIRM' });
      await sendTextMessage(
        user.phone_number,
        `Updated ${changes.join(', ')} — a few quick salon-specific questions, then we'll build it.`
      );
      return startSalonFlow(user);
    }

    await sendTextMessage(
      user.phone_number,
      `Updated ${changes.join(', ')}. Anything else to change, or are we good to build?`
    );
    return STATES.WEB_CONFIRM;
  }

  // ── Unclear → help them out ─────────────────────────────────────────────
  await sendTextMessage(
    user.phone_number,
    "What would you like to change? You can say things like:\n\n" +
      '• "change the name to Fresh Cuts"\n' +
      '• "industry should be Plumbing"\n' +
      '• "services are pipe repair, drain cleaning"\n' +
      '• "add my WhatsApp number"\n' +
      '• "email to hello@example.com"\n\n' +
      'Or just let me know you\'re happy with the current details and I\'ll build it.'
  );
  return STATES.WEB_CONFIRM;
}

async function generateWebsite(user) {
  // Set state to GENERATING immediately to prevent duplicate builds
  const { updateUserState } = require('../../db/users');
  await updateUserState(user.id, STATES.WEB_GENERATING);

  try {
    const { generateWebsiteContent } = require('../../website-gen/generator');
    const { deployToNetlify } = require('../../website-gen/deployer');

    // Refresh user data to get full metadata
    logger.info(`[WEBGEN] Step 1/5: Fetching user data for ${user.phone_number}`);
    const { findOrCreateUser } = require('../../db/users');
    const freshUser = await findOrCreateUser(user.phone_number, user.channel, user.via_phone_number_id);
    const websiteData = freshUser.metadata?.websiteData || {};
    logger.info(`[WEBGEN] User data loaded:`, {
      businessName: websiteData.businessName,
      industry: websiteData.industry,
      hasLogo: !!websiteData.logo,
      hasContact: !!(websiteData.contactEmail || websiteData.contactPhone),
    });

    // 1. Generate content with LLM
    const templateId = isSalonIndustry(websiteData.industry) ? 'salon' : 'business-starter';
    const siteId = freshUser.metadata?.currentSiteId;
    logger.info(`[WEBGEN] Step 2/5: Generating website content via LLM for "${websiteData.businessName}" (template=${templateId})`);
    const siteConfig = await generateWebsiteContent(websiteData, { templateId, siteId, userId: user.id });
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
    await sendTextMessage(
      user.phone_number,
      `Your website is ready! Here's the preview:\n\n${previewUrl}\n\nHave a look - it's a ${(siteConfig.services||[]).length>0?'4-page site with Home, Services, About, and Contact pages':'3-page site with Home, About, and Contact pages'}.`
    );

    await logMessage(user.id, `Website deployed: ${previewUrl}`, 'assistant');
    logger.info(`[WEBGEN] ✅ Complete! Preview sent to ${user.phone_number}: ${previewUrl}`);

    // Always go to revisions state — user can approve, request changes, or reject
    await sendTextMessage(
      user.phone_number,
      "There you go! Have a look and let me know what you think — want any changes, or are you happy with it?"
    );
    await logMessage(user.id, 'Website preview sent, asking for feedback', 'assistant');

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
  await sendTextMessage(
    user.phone_number,
    '⏳ Still generating your website... Please hold on a moment.'
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
      `🎉 *Awesome!* Your website is approved.\n\nWould you like to put it on your own custom domain? (e.g., ${example})\n\nIf you want one I'll help you find it, or we can skip that for now.`
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
    const revisionText = message.text || 'I want to make changes';

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
          `🎉 *Awesome!* Your website is approved.\n\nWould you like to put it on your own custom domain? (e.g., ${example})\n\nIf you want one I'll help you find it, or we can skip that for now.`
        );
        await logMessage(user.id, 'Website approved, offering custom domain', 'assistant');
        return STATES.DOMAIN_OFFER;
      }

      if (updates._unclear) {
        await sendTextMessage(user.phone_number, updates._message);
        return STATES.WEB_REVISIONS;
      }

      // Merge updates and redeploy to the SAME site
      const updatedConfig = { ...currentConfig, ...updates };

      await sendTextMessage(user.phone_number, '🔄 Applying your changes and redeploying...');

      const existingSiteId = site?.netlify_site_id || null;
      const { previewUrl, netlifySiteId, netlifySubdomain } = await deployToNetlify(updatedConfig, existingSiteId);

      if (site) {
        await updateSite(site.id, { site_data: updatedConfig, preview_url: previewUrl, netlify_site_id: netlifySiteId, netlify_subdomain: netlifySubdomain });
      }

      await sendTextMessage(
        user.phone_number,
        `✅ Changes applied! Check out the updated preview:\n${previewUrl}`
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

// ═══════════════════════════════════════════════════════════════════════════
// NEW: Unified LLM-driven collector (WEB_COLLECTING)
//
// One state replaces the NAME/EMAIL/INDUSTRY/SERVICES/COLORS/LOGO/CONTACT
// chain. Each turn runs two LLM calls:
//   1. Structured extractor (JSON-only) to pull field values from the user's
//      message — explicitly ignores confirmations ("yes/sure/ok") and skip
//      words, so button text like "Continue" never leaks into data.
//   2. Conversational ask that acknowledges known fields and asks naturally
//      for 1-2 missing ones.
//
// Output is the SAME `websiteData` shape the existing generator.js consumes.
// Industry-specific sub-flows (salon booking/instagram/hours/durations,
// HVAC areas) are reached by routing to the legacy states once required
// fields are collected.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Merge values captured by the messageAnalyzer (`user.metadata.extracted*`)
 * into `websiteData` on first entry into WEB_COLLECTING. Never overwrites
 * values already in websiteData.
 */
async function hydrateFromExtractedMetadata(user) {
  const meta = user.metadata || {};
  const wd = { ...(meta.websiteData || {}) };
  let dirty = false;
  let metaUpdates = {};

  if (meta.extractedBusinessName && !wd.businessName) {
    wd.businessName = meta.extractedBusinessName;
    dirty = true;
  }
  if (meta.extractedIndustry && !wd.industry) {
    wd.industry = meta.extractedIndustry;
    dirty = true;
  }
  if (meta.extractedServices && (!Array.isArray(wd.services) || wd.services.length === 0)) {
    const list = String(meta.extractedServices)
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length) {
      wd.services = list;
      dirty = true;
    }
  }
  if (meta.extractedColors && !wd.colors) {
    wd.colors = meta.extractedColors;
    dirty = true;
  }
  if (meta.extractedEmail && !wd.contactEmail) {
    wd.contactEmail = meta.extractedEmail;
    dirty = true;
    if (!meta.email) metaUpdates.email = meta.extractedEmail;
  }
  if (meta.extractedPhone && !wd.contactPhone) {
    wd.contactPhone = meta.extractedPhone;
    dirty = true;
  }
  if (meta.extractedLocation && !wd.contactAddress) {
    wd.contactAddress = meta.extractedLocation;
    dirty = true;
  }

  // Auto-assign color tokens once industry is known (matches legacy path).
  if (wd.industry && !wd.primaryColor) {
    Object.assign(wd, getColorsForIndustry(wd.industry));
    dirty = true;
  }

  if (dirty) {
    metaUpdates.websiteData = wd;
    await updateUserMetadata(user.id, metaUpdates);
    user.metadata = { ...(user.metadata || {}), ...metaUpdates };
    logger.info(`[WEB-COLLECTING] Hydrated from extracted* for ${user.phone_number}: ${JSON.stringify({ businessName: wd.businessName, industry: wd.industry, hasServices: !!(wd.services && wd.services.length) })}`);
  }
}

/**
 * Safe JSON parser that strips ```json fences and pulls the first {...} block.
 */
function safeParseJson(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) s = fenced[1].trim();
  if (!s.startsWith('{')) {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) s = m[0];
  }
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * Run a tight JSON extractor on the user's latest message. Returns an
 * object with any of the WEB_COLLECTING fields the user explicitly stated.
 * Confirmations, skip words, and button text return {}.
 */
async function extractWebCollectingFields(text, user) {
  const t = String(text || '').trim();
  if (!t) return {};
  // Hard client-side guards so affirmations / skip words / button titles
  // NEVER get routed into entity fields, even if the LLM slips.
  const asMsg = { text: t };
  const BUTTON_TITLES = /^(✅ continue|⏭ skip optional steps|👤 talk to a human)$/i;
  if (isAffirmative(asMsg) || isSkip(asMsg) || isNegative(asMsg) || BUTTON_TITLES.test(t)) {
    return {};
  }

  const known = user.metadata?.websiteData || {};
  const systemPrompt = `You are a structured-data extractor for a website-setup conversation.
Return ONLY a JSON object — no commentary, no markdown fences — with any of the following fields that the user EXPLICITLY stated in their message:

{
  "businessName": string,  // the trade/brand name. "Ansh plumber" IS the full business name, keep it intact.
  "industry": string,       // 1-3 words lowercase: "plumber", "bakery", "hvac", "salon", "dentist", "real estate"
  "services": string[],     // Title Case, split comma / "and" lists
  "email": string,
  "phone": string,
  "address": string,
  "colors": string          // "blue and white", "navy + gold"
}

HARD RULES:
1. Omit any field the user did NOT clearly state. Do NOT guess, infer, or hallucinate.
2. Affirmations ("yes", "sure", "ok", "go ahead", "proceed", "continue", "sounds good") are NEVER field values — return {} if the whole message is just that.
3. Skip words ("skip", "no", "none", "n/a", "later", "dont have") are NEVER field values — omit the field.
4. WhatsApp button titles ("✅ Continue", "⏭ Skip optional steps", "👤 Talk to a human") are NEVER field values — return {}.
5. If the user says "add my number", "use my number", "my phone number", "my contact", "use my whatsapp", "add my whatsapp" WITHOUT providing explicit phone digits, set phone to the literal string "USE_WHATSAPP_NUMBER" — the system will substitute the user's real WhatsApp number. NEVER set phone to the word "contact", "number", or any other meta-description.
6. Already-known fields (below) must NOT be re-extracted — treat them as locked in:
   ${JSON.stringify({
      businessName: known.businessName || null,
      industry: known.industry || null,
      services: (known.services && known.services.length) ? known.services : null,
      email: known.contactEmail || user.metadata?.email || null,
      phone: known.contactPhone || null,
      address: known.contactAddress || null,
      colors: known.colors || null,
   })}
7. When in a WEB_COLLECTING turn and the user sends a single short phrase, that phrase is most likely answering the latest missing field — keep it intact, do not split across entities.
Return {} if nothing new was explicitly stated.`;

  try {
    const raw = await generateResponse(systemPrompt, [{ role: 'user', content: t }], {
      userId: user.id,
      operation: 'web_collecting_extract',
      // Structured JSON extraction — accuracy matters far more than cost,
      // and 4o-mini was mis-mapping short answers ("Ansh plumber" →
      // businessName:"Ansh" + industry:"plumber"). Pin to gpt-4o.
      model: 'gpt-4o',
    });
    const parsed = safeParseJson(raw) || {};
    // Sanity filter — drop empty strings, arrays of empties, and any value
    // that looks like an affirmation/skip that slipped past the LLM.
    const out = {};
    const looksLikeIntent = (s) => {
      const m = { text: s };
      return isAffirmative(m) || isSkip(m) || isNegative(m);
    };
    for (const [k, v] of Object.entries(parsed)) {
      if (v == null) continue;
      if (typeof v === 'string') {
        const trimmed = v.trim();
        if (!trimmed || looksLikeIntent(trimmed)) continue;
        out[k] = trimmed;
      } else if (Array.isArray(v)) {
        const cleaned = v
          .map((x) => (typeof x === 'string' ? x.trim() : ''))
          .filter((x) => x && !looksLikeIntent(x));
        if (cleaned.length) out[k] = cleaned;
      }
    }
    return out;
  } catch (err) {
    logger.warn(`[WEB-COLLECTING] Extractor failed: ${err.message}`);
    return {};
  }
}

/**
 * Natural, conversational ask that acknowledges what's known and asks for
 * 1-2 missing things. NOT a form. Never re-asks for info we already have.
 * Returns the response text.
 */
async function askForMissingFields(user, userMessage) {
  const wd = user.metadata?.websiteData || {};
  const known = {
    businessName: wd.businessName || null,
    industry: wd.industry || null,
    services: (wd.services && wd.services.length) ? wd.services.join(', ') : null,
    email: user.metadata?.email || wd.contactEmail || null,
    phone: wd.contactPhone || null,
    address: wd.contactAddress || null,
    colors: wd.colors || null,
  };
  const missingRequired = [];
  if (!known.businessName) missingRequired.push('business name');
  if (!known.industry) missingRequired.push('line of work');
  if (!known.services) missingRequired.push('services offered');
  const missingOptional = [];
  if (!known.email) missingOptional.push('email');
  if (!known.phone) missingOptional.push('phone');
  if (!known.address) missingOptional.push('address');
  if (!known.colors) missingOptional.push('brand colors');

  const systemPrompt = `You are Pixie, a friendly digital-agency assistant on WhatsApp, gathering details to build a website. You are a real person, NEVER reveal you are AI or a bot.

STYLE: Natural texting. 1-3 sentences max. No emojis unless the user used them first. No em/en dashes — use regular hyphens.

MULTILINGUAL: Mirror the user's language. If they write Spanish, reply entirely in Spanish. If Urdu / Roman Urdu, reply in that.

WHAT YOU ALREADY KNOW:
${JSON.stringify(known, null, 2)}

STILL NEED (required): ${missingRequired.join(', ') || '— all filled —'}
NICE TO HAVE (optional): ${missingOptional.join(', ') || '— all filled —'}

RULES:
1. First, warmly acknowledge any NEW info the user just gave (if any).
2. If the user already told you something earlier, DO NOT re-ask. Use it: "since you're a plumber, …".
3. Ask for 1-2 missing REQUIRED fields next, in one natural sentence. Never list field names like a form ("What is your industry?" — BANNED). Instead ask casually: "what's the business called, and what kind of work is it?".
4. If all required are filled but optional aren't, either weave in one optional OR offer to skip it: "any brand colors you love, or should I pick something that fits plumbing?".
5. If the user seems to have given no new info this turn, gently re-ask the single most important missing thing without sounding robotic.
6. Never mention internal field names (businessName, industry, etc.). Talk like a human.
7. Never say "What industry are you in?" and never list options like "tech, healthcare, restaurant…".`;

  const fullSystemPrompt = systemPrompt + languageDirective(user);

  try {
    const raw = await generateResponse(
      fullSystemPrompt,
      [{ role: 'user', content: userMessage || '(just entered the website-collection step — no message yet)' }],
      { userId: user.id, operation: 'web_collecting_ask' }
    );
    return String(raw || '').trim() || "What's the business called, and what do you do?";
  } catch (err) {
    logger.warn(`[WEB-COLLECTING] Ask LLM failed: ${err.message}`);
    const first = missingRequired[0] || missingOptional[0];
    return first
      ? `Could you share your ${first}?`
      : "Looks like I have what I need — one sec.";
  }
}

/**
 * Normalise a phone/WhatsApp number for display. Input is whatever's on
 * `user.phone_number` (e.g. "923323448468" or already "+923323448468").
 * Output always has a leading "+".
 */
function formatWhatsAppNumber(raw) {
  const digits = String(raw || '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  return digits.startsWith('+') ? digits : `+${digits}`;
}

/**
 * Apply an `extracted` fields object to websiteData, only filling blanks.
 * Handles the USE_WHATSAPP_NUMBER sentinel for phone — when seen, the user's
 * actual WhatsApp number (user.phone_number) is substituted.
 * Returns the merged websiteData.
 */
function mergeExtractedIntoWebsiteData(user, extracted) {
  const wd = { ...(user.metadata?.websiteData || {}) };
  if (!extracted || typeof extracted !== 'object') return wd;

  if (extracted.businessName && !wd.businessName) wd.businessName = extracted.businessName;
  if (extracted.industry && !wd.industry) wd.industry = extracted.industry;
  if (Array.isArray(extracted.services) && extracted.services.length && (!wd.services || !wd.services.length)) {
    wd.services = extracted.services;
  }
  if (extracted.colors && !wd.colors) wd.colors = extracted.colors;
  if (extracted.email && !wd.contactEmail) wd.contactEmail = extracted.email;
  if (extracted.phone && !wd.contactPhone) {
    wd.contactPhone = extracted.phone === 'USE_WHATSAPP_NUMBER'
      ? formatWhatsAppNumber(user.phone_number)
      : extracted.phone;
  }
  if (extracted.address && !wd.contactAddress) wd.contactAddress = extracted.address;

  // Auto-assign color tokens when industry lands and none were set yet.
  if (wd.industry && !wd.primaryColor) {
    Object.assign(wd, getColorsForIndustry(wd.industry));
  }
  return wd;
}

/**
 * Decide whether we're done collecting and where to send the user next.
 * Returns the next state (WEB_COLLECTING to stay, WEB_CONFIRM / salon / HVAC
 * to advance). Does NOT send any message — caller handles messaging.
 */
function decideNextStateAfterCollection(user) {
  const wd = user.metadata?.websiteData || {};
  const hasName = !!wd.businessName;
  const hasIndustry = !!wd.industry;
  const hasServices = Array.isArray(wd.services) && wd.services.length > 0;
  if (!(hasName && hasIndustry && hasServices)) return STATES.WEB_COLLECTING;

  // Salon sub-flow — needs booking tool choice before confirmation.
  if (isSalonIndustry(wd.industry) && !wd.bookingMode) return STATES.SALON_BOOKING_TOOL;

  // HVAC sub-flow — needs city + service areas before confirmation.
  const { isHvac } = require('../../website-gen/templates');
  if (isHvac(wd.industry) && !wd.primaryCity && (!wd.serviceAreas || !wd.serviceAreas.length)) {
    return STATES.WEB_COLLECT_AREAS;
  }

  return STATES.WEB_CONFIRM;
}

/**
 * Send the appropriate follow-up message when transitioning out of
 * WEB_COLLECTING into a sub-flow or the confirmation summary.
 */
async function sendTransitionMessage(user, nextState) {
  if (nextState === STATES.SALON_BOOKING_TOOL) {
    await sendTextMessage(
      user.phone_number,
      "Quick one — do you already use a booking tool (Fresha, Booksy, Vagaro, Calendly)? Paste the link if you do, or let me know you don't and I'll build one in."
    );
    await logMessage(user.id, 'Routing to salon booking tool step', 'assistant');
    return;
  }
  if (nextState === STATES.WEB_COLLECT_AREAS) {
    await sendTextMessage(
      user.phone_number,
      'Which city are you based in, and which areas do you serve? Example: *Austin — Round Rock, Cedar Park, Pflugerville*'
    );
    await logMessage(user.id, 'Routing to HVAC areas step', 'assistant');
    return;
  }
  if (nextState === STATES.WEB_CONFIRM) {
    await showConfirmSummary(user);
    return;
  }
}

/**
 * The main WEB_COLLECTING handler. Runs per inbound user turn.
 */
async function handleWebCollecting(user, message) {
  const text = (message.text || '').trim();

  // 1. Hydrate from messageAnalyzer's extracted* cache on every turn
  //    (idempotent — only fills blanks).
  await hydrateFromExtractedMetadata(user);

  // 2. Extract any new fields from the user's message this turn.
  let extracted = {};
  if (text) {
    extracted = await extractWebCollectingFields(text, user);
    if (Object.keys(extracted).length > 0) {
      const merged = mergeExtractedIntoWebsiteData(user, extracted);
      await updateUserMetadata(user.id, { websiteData: merged });
      user.metadata = { ...(user.metadata || {}), websiteData: merged };
      logger.info(`[WEB-COLLECTING] Extracted for ${user.phone_number}: ${JSON.stringify(extracted)}`);

      // Also mirror email into top-level metadata.email (legacy path).
      if (extracted.email && !user.metadata?.email) {
        await updateUserMetadata(user.id, { email: extracted.email });
        user.metadata = { ...(user.metadata || {}), email: extracted.email };
      }
    }
  }

  // 3. Ensure site record exists once we have a business name.
  if (user.metadata?.websiteData?.businessName && !user.metadata?.currentSiteId) {
    try {
      const site = await createSite(user.id, 'business-starter');
      await updateUserMetadata(user.id, { currentSiteId: site.id });
      user.metadata = { ...(user.metadata || {}), currentSiteId: site.id };
    } catch (err) {
      logger.warn(`[WEB-COLLECTING] createSite failed: ${err.message}`);
    }
  }

  // 4. Decide next state based on completeness.
  const nextState = decideNextStateAfterCollection(user);
  if (nextState !== STATES.WEB_COLLECTING) {
    await sendTransitionMessage(user, nextState);
    return nextState;
  }

  // 5. Still missing something — ask conversationally for 1-2 fields.
  const reply = await askForMissingFields(user, text);
  await sendTextMessage(user.phone_number, reply);
  await logMessage(user.id, reply, 'assistant');
  return STATES.WEB_COLLECTING;
}

/**
 * Public entry used by other flows (sales bot, service selection) to route
 * a user INTO WEB_COLLECTING. Hydrates extracted* first so the very first
 * message already reflects what the user told the sales bot earlier.
 *
 * Returns the state to set (always WEB_COLLECTING or a direct onward state
 * if everything required is already known).
 */
async function enterWebCollecting(user) {
  await hydrateFromExtractedMetadata(user);

  // Create a site record early if we already have a business name from
  // prior chat extraction.
  if (user.metadata?.websiteData?.businessName && !user.metadata?.currentSiteId) {
    try {
      const site = await createSite(user.id, 'business-starter');
      await updateUserMetadata(user.id, { currentSiteId: site.id });
      user.metadata = { ...(user.metadata || {}), currentSiteId: site.id };
    } catch (err) {
      logger.warn(`[WEB-COLLECTING] createSite failed on entry: ${err.message}`);
    }
  }

  const nextState = decideNextStateAfterCollection(user);
  if (nextState !== STATES.WEB_COLLECTING) {
    // Fast-path: everything required was already captured earlier —
    // jump straight to confirmation or the needed sub-flow.
    await sendTransitionMessage(user, nextState);
    return nextState;
  }

  // Otherwise kick off the conversational flow with the dynamic ask.
  const reply = await askForMissingFields(user, '');
  await sendTextMessage(user.phone_number, reply);
  await logMessage(user.id, reply, 'assistant');
  return STATES.WEB_COLLECTING;
}

module.exports = { handleWebDev, handleGenerationFailed, enterWebCollecting };
