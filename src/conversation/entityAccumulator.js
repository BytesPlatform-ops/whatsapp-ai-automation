// Cross-flow entity extraction. Moves the extraction pass that used to live
// inside webDev.js into its own module so the ad / logo / chatbot flows can
// eventually reuse it, and so the router can hydrate entities from SALES_CHAT
// messages into metadata before the user even lands in a collection state.
//
// The extractor runs on every free-text answer during a collection flow.
// Cheap regex pre-pass catches email + phone; the LLM is only invoked when
// the message looks like it MIGHT carry richer multi-field info (long-ish,
// has commas, mentions a place, multi-line), so short single-field answers
// don't pay for an extra round-trip.

const { generateResponse } = require('../llm/provider');
const { updateUserMetadata } = require('../db/users');
const { logger } = require('../utils/logger');

// Email regex — requires word-char parts between every dot, so trailing
// sentence punctuation like "write me at foo@bar.com." doesn't end up
// stored as "foo@bar.com." with a trailing period.
const EMAIL_RX = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE_RX = /(?:\+?\d[\d\s\-().]{6,}\d)/;

/**
 * Extract any website-relevant fields from a free-text message. Returns only
 * fields that weren't already present in `known` — callers merge the result
 * into existing metadata.
 *
 * Fields handled: businessName, industry, primaryCity, serviceAreas,
 * services, contactEmail, contactPhone, contactAddress.
 */
async function extractWebsiteFields(text, known = {}, user = null) {
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
    // Avoid matching dates like "16/04/2026" — require at least one separator
    // OR length >= 10.
    if (m && (m[0].length >= 10 || /[\s\-+().]/.test(m[0]))) out.contactPhone = m[0].trim();
  }

  // Decide if it's worth running the LLM extractor. Skip on short replies
  // that almost certainly only answer the current question.
  //
  // Exception: short inputs that contain a trade-word ("Hasnain Plumbing",
  // "Bright Dental") carry enough signal that the LLM can usefully pull
  // both businessName AND industry in one shot. Without this, the flow
  // would ask "what industry?" for a name that obviously implies it.
  const TRADE_IN_NAME_RX = /\b(plumb(?:ing|er)?|electric(?:al|ian)?|hvac|roof(?:ing|er)?|dental|dentist|salon|barber|spa|bakery|bakers?|restaurant|kitchen|diner|cafe|café|catering|law|legal|attorney|lawyer|cleaning|cleaners?|janitorial|landscap\w*|lawn\s*care|photograph\w*|videograph\w*|locksmith|pest\s*control|appliance\s*repair|garage\s*door|auto\s*repair|mechanic|realt\w*|real\s*estate|accounting|accountant|bookkeep\w*|marketing\s*(?:agency|firm)?|consult\w*|fitness|gym|tutor\w*|moving|movers|hvac|contractor|construction|coaching)\b/i;
  const looksRich =
    raw.length >= 18 ||
    /[,;]/.test(raw) ||
    /\b(in|at|serving|near)\s+[A-Z]/.test(raw) ||
    /[\n]/.test(raw) ||
    TRADE_IN_NAME_RX.test(raw);
  if (!looksRich) return out;

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
- industry: 1-3 word niche label, e.g. "HVAC", "Salon", "Restaurant", "Real estate". **Business-name inference is REQUIRED, not optional**: if the already-known businessName or the message contains a clear trade word, extract that as the industry. This is explicit signal from the user — a business literally named "X Plumbing" has industry "Plumbing". Concrete mappings:
    • "Hasnain Plumbing" → "Plumbing"
    • "Bright Dental" → "Dental"
    • "Joe's Auto Repair" → "Auto Repair"
    • "Maria's Thai Kitchen" → "Thai Restaurant"
    • "Acme Bakery" → "Bakery"
    • "Glow Studio Salon" → "Salon"
    • "Smith & Smith Law" → "Legal"
    • "SunCity Roofing" → "Roofing"
    • "Pure Clean Cleaners" → "Cleaning Services"
    • "FastFix Locksmith" → "Locksmith"
  If the businessName is GENERIC ("TechCorp", "Glow Studio", "BlueBird Ventures") with no trade word, leave industry unset.
- primaryCity: the city the business is based in.
- serviceAreas: array of cities/neighborhoods they serve. May overlap with primaryCity.
- services: array of SPECIFIC services or products offered. IMPORTANT: when the user's answer just echoes their industry in generic terms ("we do plumbing", "plumbing services", "all types of plumbing", "every kind of roofing work", "the usual dental stuff", "full-service X", "general X services"), treat it as delegation and OMIT the services field entirely — downstream code will supply trade-specific defaults. Only populate services when the user names DISTINCT, CONCRETE services ("leak repair, drain cleaning, water heater install" or "haircut, beard trim, color"). Single-entry results like ["Plumbing services"] or ["Roofing"] are WRONG — omit the field in those cases.
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
      // Post-filter: if the LLM returned a "services" list whose only
      // entries are generic industry echoes ("Plumbing services" when
      // industry is "Plumbing"), drop the field so the trade template's
      // defaults get used. Prompt tells the LLM to omit these, but
      // this belt-and-braces check catches the occasional miss.
      if (Array.isArray(out.services) && out.services.length > 0) {
        const industryWord = String(known.industry || parsed.industry || '').trim().toLowerCase();
        if (industryWord) {
          const stripSuffix = (s) => String(s || '').toLowerCase().replace(/\s+(services?|work|stuff|things)\s*$/i, '').trim();
          const allEcho = out.services.every((s) => {
            const normalized = stripSuffix(s);
            return normalized === industryWord || normalized === '' || industryWord.includes(normalized) || normalized.includes(industryWord);
          });
          if (allEcho) {
            logger.info(`[ENTITY-ACC] Dropping generic services echo ${JSON.stringify(out.services)} for industry "${industryWord}" — will use trade defaults`);
            delete out.services;
          }
        }
      }
    }
  } catch (err) {
    logger.warn(`[ENTITY-ACC] extractWebsiteFields failed: ${err.message}`);
  }

  return out;
}

/**
 * Merge newly-extracted website fields into `known`, returning the merged
 * object AND the list of field keys that were freshly captured. Does NOT
 * overwrite existing non-empty values.
 */
function mergeWebsiteFields(known, extracted) {
  const merged = { ...known };
  const captured = [];
  for (const [k, v] of Object.entries(extracted || {})) {
    if (v == null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (merged[k] && (Array.isArray(merged[k]) ? merged[k].length > 0 : String(merged[k]).length > 0)) {
      continue;
    }
    merged[k] = v;
    captured.push(k);
  }
  return { merged, captured };
}

/**
 * Run extraction + merge + persist in one shot. Returns
 *   { websiteData, captured, updatedUser }
 * where websiteData is the merged value stored in metadata, captured is the
 * list of newly-populated field keys, and updatedUser is the user object
 * with the in-memory metadata updated to match.
 */
async function hydrateWebsiteData(user, text) {
  const known = user.metadata?.websiteData || {};
  const extracted = await extractWebsiteFields(text, known, user);
  const { merged, captured } = mergeWebsiteFields(known, extracted);

  if (captured.length === 0) {
    return { websiteData: known, captured: [], updatedUser: user };
  }

  const update = { websiteData: merged };
  // Legacy top-level metadata.email is also checked by the rest of the
  // codebase (see nextMissingWebDevState's emailCollected check), so mirror
  // an extracted contactEmail there too.
  if (captured.includes('contactEmail') && merged.contactEmail) {
    update.email = merged.contactEmail;
  }

  await updateUserMetadata(user.id, update);
  const updatedUser = {
    ...user,
    metadata: {
      ...(user.metadata || {}),
      websiteData: merged,
      ...(update.email ? { email: update.email } : {}),
    },
  };

  return { websiteData: merged, captured, updatedUser };
}

/**
 * Extract a clean, normalized INDUSTRY label from a user reply. LLM-first.
 * Fast-path short clean answers ("Tech", "Food & Beverage") through without
 * an LLM call; everything else gets normalized by the LLM so "we just rent
 * trucks" → "Trucking" and "i think its tech" → "Tech".
 *
 * `context` may include { businessName, recentConversation } to help the LLM
 * disambiguate. Returns null if the reply was empty / truly no signal / the
 * LLM couldn't confidently extract an industry.
 */
async function extractIndustry(userReply, context = {}) {
  const raw = String(userReply || '').trim();
  if (!raw) return null;

  // Fast path: clean 1-3 word answer already in good shape. Saves an LLM
  // call for the common "Tech" / "Barbershop" / "Real Estate" replies.
  const clean1to3 = /^[A-Za-z][A-Za-z\s&\-']{0,28}$/;
  const fillerWords = /\b(?:we|i|its|it'?s|is|are|we'?re|im|i'?m|just|only|mainly|basically|probably|maybe|sort\s*of|kind\s*of|think|guess)\b/i;
  if (clean1to3.test(raw) && raw.split(/\s+/).length <= 3 && !fillerWords.test(raw)) {
    return raw;
  }

  const businessLine = context.businessName ? `Business name: "${context.businessName}"\n` : '';
  const historyLine = context.recentConversation
    ? `Recent conversation (most recent last):\n${context.recentConversation}\n\n`
    : '';

  const prompt = `${businessLine}${historyLine}The user was asked "What industry are you in?" and replied: "${raw}"

Extract the industry as a clean 1-3 word label (examples: "Tech", "Food & Beverage", "Real Estate", "HVAC", "Barbershop", "Trucking", "Photography", "Plumbing", "Electrician", "Roofing").

Rules:
- Normalize, don't echo. "we just rent trucks" → "Trucking". "i think its tech" → "Tech". "oh we do AI stuff" → "AI / Software".
- **Business-name inference is a FIRST-CLASS move, not a last resort.** When the user delegates ("whatever", "you pick", "idk", "i'm not sure", "select one for me", "relevant to my business name"), READ THE BUSINESS NAME you were given at the top and extract the industry directly from it. A business literally called "Hasnain Plumbing" has industry "Plumbing". "Joe's Auto Repair" → "Auto Repair". "Glow Studio Salon" → "Salon". "Acme Bakery" → "Bakery". "Bright Dental" → "Dental". If the business name contains a trade/industry word (plumbing, salon, bakery, electric, roofing, dental, law, realty, photography, etc.), that IS the industry — return it, do NOT return "unknown".
- If the user is delegating AND the business name doesn't contain an industry word, use conversation context. Only if BOTH fail, return "unknown".
- If the reply isn't an industry at all (nonsense, "?", greeting), return "unknown".

Return ONLY the industry label or the single word "unknown". No quotes, no explanation, no punctuation.`;

  try {
    const response = await generateResponse(
      prompt,
      [{ role: 'user', content: raw }],
      { userId: context.userId, operation: 'industry_extract' }
    );
    const cleaned = (response || '').trim().replace(/^["']|["'.!?]$/g, '').trim();
    if (!cleaned || /^unknown$/i.test(cleaned)) return null;
    // Sanity cap — industries are short labels.
    if (cleaned.length > 40) return null;
    return cleaned;
  } catch (err) {
    logger.warn(`[ENTITY-ACC] extractIndustry failed: ${err.message}`);
    return null;
  }
}

/**
 * Extract a clean, normalized services array from a user reply. LLM-first.
 * Fast-path obviously-clean comma-separated lists (no prose) through without
 * an LLM call. Everything else gets normalized so "we just rent trucks" →
 * ["Truck rental"], "oh we do haircuts, nails, and also facials" →
 * ["Haircut", "Nails", "Facials"].
 *
 * Returns an empty array for delegation ("whatever", "skip"), a non-empty
 * array for real service lists, or null if the LLM failed.
 */
async function extractServices(userReply, context = {}) {
  const raw = String(userReply || '').trim();
  if (!raw) return [];

  // Fast path: obviously-clean comma-separated list — no personal pronouns,
  // no filler. "haircut, nails, facials" goes straight through.
  const fillerWords = /\b(?:we|i|its|it'?s|we'?re|im|i'?m|our|my|the|a|an|just|only|basically|mainly|mostly|offer|do|provide|sell|make|rent|serve|help)\b/i;
  const allSimpleTokens = raw.split(/\s*,\s*/).every((t) => t.trim().length >= 2 && t.trim().length < 40);
  if (
    raw.length <= 120 &&
    /[a-zA-Z]/.test(raw) &&
    raw.includes(',') &&
    !fillerWords.test(raw) &&
    allSimpleTokens
  ) {
    return raw.split(/\s*,\s*/).map((t) => t.trim()).filter(Boolean);
  }

  const businessLine = context.businessName ? `Business name: "${context.businessName}"\n` : '';
  const industryLine = context.industry ? `Industry: "${context.industry}"\n` : '';

  const prompt = `${businessLine}${industryLine}The user was asked "What services or products do you offer?" and replied: "${raw}"

Extract the services as a JSON array of clean, normalized service names.

Rules:
- Normalize, don't echo the user's prose. "we just rent trucks" → ["Truck rental"]. "we offer haircut, nails and facials" → ["Haircut", "Nails", "Facials"]. "hair cuts and transplant" → ["Haircut", "Hair transplant"].
- Drop filler words ("we do", "we offer", "basically", "just", "also").
- If the user is delegating ("whatever", "skip", "idk", "you pick"), return an empty array: []
- If the reply doesn't describe services at all (nonsense, greeting), return an empty array: []

Return ONLY a JSON array like ["Service 1", "Service 2"] or []. No commentary.`;

  try {
    const response = await generateResponse(
      prompt,
      [{ role: 'user', content: raw }],
      { userId: context.userId, operation: 'services_extract' }
    );
    const match = (response || '').match(/\[[\s\S]*?\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s) => String(s).trim().replace(/^["']|["']$/g, ''))
      .filter((s) => s && s.length < 80);
  } catch (err) {
    logger.warn(`[ENTITY-ACC] extractServices failed: ${err.message}`);
    return null;
  }
}

/**
 * Read the shared cross-flow business context. Single source of truth is
 * `user.metadata.websiteData` — whatever the webdev flow accumulated is
 * what the ad / logo / chatbot flows see when the user pivots into them.
 *
 * Every field is returned (null if missing) so callers can decide what
 * they care about without repeating the same `metadata?.websiteData?.X`
 * dance everywhere. Returns an empty-ish object for brand-new users.
 *
 * Callers should NOT write back to websiteData from secondary flows —
 * websiteData is owned by the webdev flow. If the user types a different
 * business name into the ad flow, that's local to adData; it doesn't
 * poison the website data the next webdev turn will see.
 */
function getSharedBusinessContext(user) {
  const wd = (user && user.metadata && user.metadata.websiteData) || {};
  return {
    businessName: wd.businessName || null,
    industry: wd.industry || null,
    primaryCity: wd.primaryCity || null,
    serviceAreas: Array.isArray(wd.serviceAreas) ? wd.serviceAreas : [],
    services: Array.isArray(wd.services) ? wd.services : [],
    primaryColor: wd.primaryColor || null,
    secondaryColor: wd.secondaryColor || null,
    accentColor: wd.accentColor || null,
    contactEmail: wd.contactEmail || null,
    contactPhone: wd.contactPhone || null,
    contactAddress: wd.contactAddress || null,
  };
}

/**
 * Infer an industry from a business name alone. Used by collection flows
 * that just saved a name and want to skip the industry question when it's
 * obvious from trade words in the name ("Hasnain Plumbing" → "Plumbing").
 *
 * Returns null when the name has no trade-word signal (e.g. "TechCorp",
 * "Glow Studio") — caller should then ask the user for industry.
 *
 * Cheap regex pre-filter (same set as extractWebsiteFields' looksRich
 * gate) avoids an LLM call for clearly-generic names. Strong signal
 * names go to the LLM for accurate normalization.
 */
async function inferIndustryFromBusinessName(name, userId) {
  const raw = String(name || '').trim();
  if (!raw || raw.length < 3) return null;

  const TRADE_IN_NAME_RX = /\b(plumb(?:ing|er)?|electric(?:al|ian)?|hvac|roof(?:ing|er)?|dental|dentist|salon|barber|spa|bakery|bakers?|restaurant|kitchen|diner|cafe|café|catering|law|legal|attorney|lawyer|cleaning|cleaners?|janitorial|landscap\w*|lawn\s*care|photograph\w*|videograph\w*|locksmith|pest\s*control|appliance\s*repair|garage\s*door|auto\s*repair|mechanic|realt\w*|real\s*estate|accounting|accountant|bookkeep\w*|marketing\s*(?:agency|firm)?|consult\w*|fitness|gym|tutor\w*|moving|movers|contractor|construction|coaching|clinic|studio\s*salon)\b/i;
  if (!TRADE_IN_NAME_RX.test(raw)) return null;

  const prompt = `A business is named "${raw}". Extract its industry as a clean 1-3 word label.

Rules:
- The name contains a trade word — that IS the industry. "Hasnain Plumbing" → "Plumbing". "Joe's Auto Repair" → "Auto Repair". "Bright Dental" → "Dental". "Maria's Thai Kitchen" → "Thai Restaurant". "Acme Bakery" → "Bakery". "SunCity Roofing" → "Roofing".
- Normalize trailing words ("Services", "Inc", "LLC", person names) — those are not part of the industry label.
- Return ONLY the industry label (1-3 words). No quotes, no explanation, no punctuation. If truly unclear, return the word "unknown".`;

  try {
    const response = await generateResponse(
      prompt,
      [{ role: 'user', content: raw }],
      { userId, operation: 'industry_from_name', timeoutMs: 8_000 }
    );
    const cleaned = (response || '').trim().replace(/^["']|["'.!?]$/g, '').trim();
    if (!cleaned || /^unknown$/i.test(cleaned)) return null;
    if (cleaned.length > 40) return null;
    return cleaned;
  } catch (err) {
    logger.warn(`[ENTITY-ACC] inferIndustryFromBusinessName failed: ${err.message}`);
    return null;
  }
}

module.exports = {
  extractWebsiteFields,
  mergeWebsiteFields,
  hydrateWebsiteData,
  extractIndustry,
  extractServices,
  getSharedBusinessContext,
  inferIndustryFromBusinessName,
};
