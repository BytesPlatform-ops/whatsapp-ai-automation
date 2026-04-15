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
  const { needsAreaCollection } = require('../../website-gen/templates');
  if (!websiteData.businessName) return STATES.WEB_COLLECT_NAME;
  const emailCollected =
    fullMetadata.email != null || websiteData.contactEmail != null || websiteData.email != null || fullMetadata.emailSkipped === true;
  if (!emailCollected) return STATES.WEB_COLLECT_EMAIL;
  if (!websiteData.industry) return STATES.WEB_COLLECT_INDUSTRY;
  if (needsAreaCollection(websiteData.industry) && !websiteData.primaryCity && (!websiteData.serviceAreas || !websiteData.serviceAreas.length)) {
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
  const fullMsg = ack ? `${ack}\n\n${nextQuestion}` : nextQuestion;

  await sendTextMessage(user.phone_number, fullMsg);
  return nextState;
}

function questionForState(state, websiteData) {
  switch (state) {
    case STATES.WEB_COLLECT_NAME: return "What's your business name?";
    case STATES.WEB_COLLECT_EMAIL: return "Before we continue, what's your email address? We'll use it to send you updates about your website. (Or say *skip*.)";
    case STATES.WEB_COLLECT_INDUSTRY: return 'What industry are you in? For example - tech, healthcare, restaurant, real estate, creative, etc.';
    case STATES.WEB_COLLECT_AREAS: return 'Which city are you based in, and which areas do you serve? Example: *Austin — Round Rock, Cedar Park, Pflugerville*';
    case STATES.WEB_COLLECT_SERVICES: {
      const { isHvac } = require('../../website-gen/templates');
      if (isHvac(websiteData.industry)) {
        return 'Which HVAC services do you offer? List them separated by commas, or say *skip* to use our default list (AC repair, heating, heat pumps, duct cleaning, thermostats, and more).';
      }
      return 'What services or products do you offer? List them separated by commas, or say *skip*.';
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
  lines.push('', 'Does everything look good? Say *"yes"* to proceed, or tell me what to change.');
  await sendTextMessage(user.phone_number, lines.join('\n'));
  return STATES.WEB_CONFIRM;
}

async function handleWebDev(user, message) {
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
    await updateUserMetadata(user.id, { email: emailMatch[0] });
    user.metadata = { ...(user.metadata || {}), email: emailMatch[0] };
    await logMessage(user.id, `Email collected: ${emailMatch[0]}`, 'assistant');
  } else {
    // Not a valid email and not a skip — ask again gently
    await sendTextMessage(
      user.phone_number,
      "That doesn't look like an email address. Could you double-check? Or say *\"skip\"* to continue without it."
    );
    return STATES.WEB_COLLECT_EMAIL;
  }

  const ackPrefix = emailMatch ? `Got it, saved *${emailMatch[0]}*!` : 'No worries — we can add it later.';
  return smartAdvance(user, message, ackPrefix);
}

async function handleCollectIndustry(user, message) {
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
  if (/^(skip|later|unsure|not sure|n\/?a)$/i.test(raw)) {
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
  await logMessage(user.id, `Areas captured: ${primaryCity} / ${serviceAreas.join(', ')}`, 'assistant');

  const ackPrefix = `Got it — based in *${primaryCity || 'your area'}* serving *${serviceAreas.slice(0, 4).join(', ')}${serviceAreas.length > 4 ? '…' : ''}*.`;
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
  const servicesText = (message.text || '').trim();
  if (!servicesText || servicesText.length < 2) {
    await sendTextMessage(
      user.phone_number,
      'Please list your services/products separated by commas, or say "skip" if you don\'t have specific services:'
    );
    return STATES.WEB_COLLECT_SERVICES;
  }

  const skipWords = /^(idk|i don'?t know|skip|none|no|n\/a|na|nah|nothing|not sure|no idea|no services|no products|don'?t have any|dont have any)$/i;
  // Also catch longer phrases like "I don't offer any services"
  const skipPhrases = /\b(no services|no products|don'?t (offer|have|provide)|dont (offer|have|provide)|nothing to (list|offer)|not applicable)\b/i;
  const industry = user.metadata?.websiteData?.industry || '';
  const colors = getColorsForIndustry(industry);

  if (skipWords.test(servicesText) || skipPhrases.test(servicesText)) {
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
      '• If yes, just paste the link and we\'ll embed it on your site.\n' +
      '• If not, type *"no"* and we\'ll build a built-in booking system for you.'
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
    `Say *"yes"* to build the site, or tell me what else to change.`;

  await sendTextMessage(user.phone_number, summary);
  return STATES.WEB_CONFIRM;
}

async function handleSalonBookingTool(user, message) {
  const text = (message.text || '').trim();
  const wd = { ...(user.metadata?.websiteData || {}) };
  const noWords = /^(no|none|nope|nah|n\/a|na|skip|don'?t have|dont have|not yet)$/i;
  const urlMatch = text.match(/https?:\/\/\S+/i);

  if (urlMatch) {
    wd.bookingMode = 'embed';
    wd.bookingUrl = urlMatch[0].replace(/[)\]]+$/, '');
    await updateUserMetadata(user.id, { websiteData: wd });
    await logMessage(user.id, `Booking mode: embed (${wd.bookingUrl})`, 'assistant');
    await sendTextMessage(
      user.phone_number,
      `Got it — we'll embed *${wd.bookingUrl}* on your booking page.\n\nWhat's your Instagram handle? (e.g. @glowstudio). Say *"skip"* if you don't have one.`
    );
    return STATES.SALON_INSTAGRAM;
  }

  if (noWords.test(text)) {
    wd.bookingMode = 'native';
    await updateUserMetadata(user.id, { websiteData: wd });
    await logMessage(user.id, 'Booking mode: native', 'assistant');
    await sendTextMessage(
      user.phone_number,
      'Perfect — we\'ll build you a booking system. What\'s your Instagram handle? (e.g. @glowstudio). Say *"skip"* if you don\'t have one.'
    );
    return STATES.SALON_INSTAGRAM;
  }

  await sendTextMessage(
    user.phone_number,
    'Please either paste your booking tool link (Fresha/Booksy/Vagaro/etc.) or type *"no"* and we\'ll build one for you.'
  );
  return STATES.SALON_BOOKING_TOOL;
}

async function handleSalonInstagram(user, message) {
  const text = (message.text || '').trim();
  const wd = { ...(user.metadata?.websiteData || {}) };
  const skipWords = /^(skip|no|none|n\/a|na|nah|nope|don'?t|dont)$/i;

  if (!skipWords.test(text) && text.length > 0) {
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
      'What are your opening hours? A quick line is fine — for example: *"Tue-Sat 9-7, Sun-Mon closed"*.\n\nSay *"default"* for standard salon hours (Tue-Sat 9-7).'
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
      `Say *"default"* to use 30min with no price.`
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
  const contactText = (message.text || '').trim();
  const skipWords = /^(nothing|none|no|skip|n\/a|na|nah|nope|don'?t|dont|no thanks)$/i;

  let contactData;
  if (!contactText || contactText.length < 3 || skipWords.test(contactText)) {
    contactData = { contactEmail: '', contactPhone: '', contactAddress: '' };
  } else {
    contactData = parseContactFields(contactText);
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
    `Does everything look good? You can say *"yes"* to proceed, or tell me what you'd like to change.`;

  await sendTextMessage(user.phone_number, summary);
  await logMessage(user.id, 'Contact info collected, showing confirmation', 'assistant');

  return STATES.WEB_CONFIRM;
}

async function handleConfirm(user, message) {
  const originalText = (message.text || '').trim();
  const text = originalText.toLowerCase();
  const confirmWords = /^(yes|yeah|yep|yup|y|ok|okay|sure|go|looks good|lgtm|correct|perfect|proceed|generate|build|do it|let'?s go|go ahead)$/i;

  if (confirmWords.test(text)) {
    await sendTextMessage(
      user.phone_number,
      'Alright, give me about 30-60 seconds to build your site...'
    );
    await logMessage(user.id, 'Confirmed, generating website', 'assistant');
    return generateWebsite(user);
  }

  // User wants to change something — use originalText to preserve capitalization
  const wd = user.metadata?.websiteData || {};

  // Check for specific field changes (match on originalText to preserve case)
  const nameChange = originalText.match(/(?:business\s*)?name\s*(?:to|:|should be|is)\s*(.+)/i);
  const industryChange = originalText.match(/industry\s*(?:to|:|should be|is)\s*(.+)/i);
  const servicesChange = originalText.match(/services?\s*(?:to|:|should be|are|change)\s*(.+)/i);
  const emailChange = originalText.match(/e-?mail\s*(?:to|:|should be|is)\s*(.+)/i);
  const phoneChange = originalText.match(/(?:phone|tel|mobile|number)\s*(?:to|:|should be|is)\s*(.+)/i);
  const addressChange = originalText.match(/(?:address|location|addr)\s*(?:to|:|should be|is)\s*(.+)/i);
  const contactChange = originalText.match(/contact\s*(?:to|:|should be|is)\s*(.+)/i);

  if (nameChange) {
    wd.businessName = nameChange[1].trim();
    await updateUserMetadata(user.id, { websiteData: wd });
    await sendTextMessage(user.phone_number, `Updated business name to *${wd.businessName}*. Anything else to change, or say *"yes"* to proceed.`);
    return STATES.WEB_CONFIRM;
  }
  if (industryChange) {
    const newIndustry = industryChange[1].trim();
    wd.industry = newIndustry;
    await updateUserMetadata(user.id, { websiteData: wd });
    // If the user just switched into a salon industry and we haven't yet
    // collected the salon-specific details (booking tool, hours, prices),
    // pivot into the salon sub-flow and return to CONFIRM when it's done.
    const needsSalonFlow =
      isSalonIndustry(newIndustry) &&
      !wd.bookingMode &&
      (!Array.isArray(wd.salonServices) || wd.salonServices.length === 0);
    if (needsSalonFlow) {
      await updateUserMetadata(user.id, { salonFlowOrigin: 'CONFIRM' });
      await sendTextMessage(user.phone_number, `Updated industry to *${newIndustry}* — a few quick salon-specific questions, then we'll build it.`);
      return startSalonFlow(user);
    }
    await sendTextMessage(user.phone_number, `Updated industry to *${wd.industry}*. Anything else, or say *"yes"* to proceed.`);
    return STATES.WEB_CONFIRM;
  }
  if (servicesChange) {
    wd.services = servicesChange[1].split(',').map(s => s.trim()).filter(Boolean);
    await updateUserMetadata(user.id, { websiteData: wd });
    await sendTextMessage(user.phone_number, `Updated services to *${wd.services.join(', ')}*. Anything else, or say *"yes"* to proceed.`);
    return STATES.WEB_CONFIRM;
  }
  if (emailChange) {
    const val = emailChange[1].trim();
    const m = val.match(/[\w.-]+@[\w.-]+\.\w+/);
    wd.contactEmail = m ? m[0] : val;
    await updateUserMetadata(user.id, { websiteData: wd });
    await sendTextMessage(user.phone_number, `Updated email to *${wd.contactEmail}*. Anything else, or say *"yes"* to proceed.`);
    return STATES.WEB_CONFIRM;
  }
  if (phoneChange) {
    wd.contactPhone = phoneChange[1].trim();
    await updateUserMetadata(user.id, { websiteData: wd });
    await sendTextMessage(user.phone_number, `Updated phone to *${wd.contactPhone}*. Anything else, or say *"yes"* to proceed.`);
    return STATES.WEB_CONFIRM;
  }
  if (addressChange) {
    wd.contactAddress = addressChange[1].trim();
    await updateUserMetadata(user.id, { websiteData: wd });
    await sendTextMessage(user.phone_number, `Updated address to *${wd.contactAddress}*. Anything else, or say *"yes"* to proceed.`);
    return STATES.WEB_CONFIRM;
  }
  if (contactChange) {
    const parsed = parseContactFields(contactChange[1].trim());
    if (parsed.contactEmail) wd.contactEmail = parsed.contactEmail;
    if (parsed.contactPhone) wd.contactPhone = parsed.contactPhone;
    if (parsed.contactAddress) wd.contactAddress = parsed.contactAddress;
    await updateUserMetadata(user.id, { websiteData: wd });
    await sendTextMessage(user.phone_number, `Updated contact info. Anything else, or say *"yes"* to proceed.`);
    return STATES.WEB_CONFIRM;
  }

  // Couldn't parse the change — ask them to be more specific
  await sendTextMessage(
    user.phone_number,
    'What would you like to change? You can say things like:\n\n' +
      '• "Name to MyBusiness"\n' +
      '• "Industry to Tech"\n' +
      '• "Services to Web Design, SEO, Branding"\n' +
      '• "Email to hello@example.com"\n' +
      '• "Phone to +1 555 123 4567"\n' +
      '• "Address to 123 Main St, City"\n\n' +
      'Or say *"yes"* to proceed with the current details.'
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
      `🎉 *Awesome!* Your website is approved.\n\nWould you like to put it on your own custom domain? (e.g., ${example})\n\nJust say *"yes"* and I'll help you find one, or *"no"* if you want to skip it for now.`
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
          `🎉 *Awesome!* Your website is approved.\n\nWould you like to put it on your own custom domain? (e.g., ${example})\n\nJust say *"yes"* and I'll help you find one, or *"no"* if you want to skip it for now.`
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

module.exports = { handleWebDev, handleGenerationFailed };
