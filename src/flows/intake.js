'use strict';

// Flow → Pixie bridge. Turns the submitted Flow answers into the
// websiteData shape the generator consumes, then triggers the build.
//
// The Flow collects core TEXT info only (per spec). Image steps (logo,
// listings/project photos) and any refinement continue in chat after the
// preview is sent — the generator fills sensible defaults for anything
// not provided (trade-default services, default hours, placeholders), so
// a v1 build is always coherent.

const { logger } = require('../utils/logger');

// Light, dependency-free contact splitter for the single contact_info
// field. Pulls email + phone by shape; whatever's left (with a street/
// place hint) becomes the address. Mirrors the spirit of webDev's
// parseContactFields without importing that 8000-line module.
function splitContact(text) {
  const raw = String(text || '').trim();
  const out = { contactEmail: '', contactPhone: '', contactAddress: '' };
  if (!raw) return out;
  const email = raw.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  if (email) out.contactEmail = email[0];
  const phone = raw.match(/\+?\d[\d\s\-().]{6,}\d/);
  if (phone) out.contactPhone = phone[0].trim();
  let rest = raw
    .replace(email?.[0] || '', '')
    .replace(phone?.[0] || '', '')
    .replace(/\b(email|e-?mail|phone|tel|mobile|address|addr)\s*[:\-]?/gi, '')
    .replace(/[,\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (rest && (/\d/.test(rest) || /\b(st|street|ave|avenue|road|rd|blvd|lane|ln|dr|drive|block|sector|suite|floor|nagar|colony)\b/i.test(rest) || rest.split(/\s+/).length >= 2)) {
    out.contactAddress = rest.slice(0, 200);
  }
  return out;
}

/**
 * Map submitted Flow answers → a websiteData patch. Async because it
 * reuses Pixie's LLM-backed extractors for services / hours / prices.
 *
 * @param {object} answers  flat answers (business_name,email,industry,a1..a4,contact_info)
 * @param {string} theme    salon|hvac|realestate|portfolio|general
 * @param {string} userId
 * @returns {Promise<object>} websiteData patch
 */
async function buildWebsiteDataFromFlow(answers = {}, theme, userId) {
  const { extractServices, extractPricesByService } = require('../conversation/entityAccumulator');

  const businessName = String(answers.business_name || '').trim();
  const email = String(answers.email || '').trim();
  const industry = String(answers.industry || '').trim();
  const contact = splitContact(answers.contact_info);

  const wd = {
    businessName,
    industry,
    contactEmail: contact.contactEmail || email || '',
    contactPhone: contact.contactPhone || '',
    contactAddress: contact.contactAddress || '',
    flowSource: true, // marks this lead as built via the Flow intake
  };

  const isDefault = (v) => /^\s*(default|skip|no|none|n\/?a)\s*$/i.test(String(v || ''));

  try {
    if (theme === 'general') {
      // a1 = services list
      if (answers.a1 && !isDefault(answers.a1)) {
        wd.services = (await extractServices(answers.a1, { businessName, industry, userId })) || [];
      }
    } else if (theme === 'hvac') {
      // a1 = "City: area, area"; a2 = services
      if (answers.a1) {
        const [city, areasPart] = String(answers.a1).split(':');
        if (city) wd.primaryCity = city.trim();
        if (areasPart) wd.serviceAreas = areasPart.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      }
      if (answers.a2 && !isDefault(answers.a2)) {
        wd.services = (await extractServices(answers.a2, { businessName, industry, userId })) || [];
      }
    } else if (theme === 'salon') {
      // a1=currency, a2=booking, a3=hours, a4=services+durations+prices
      if (answers.a1 && !isDefault(answers.a1)) wd.currency = String(answers.a1).trim().slice(0, 8);
      if (answers.a2 && !isDefault(answers.a2)) {
        wd.bookingMode = 'embed';
        wd.bookingUrl = String(answers.a2).trim();
      } else {
        wd.bookingMode = 'native';
      }
      if (answers.a3 && !isDefault(answers.a3)) {
        try {
          const { parseWeeklyHours } = require('../website-gen/hoursParser');
          const { hours } = await parseWeeklyHours(String(answers.a3));
          wd.weeklyHours = hours;
        } catch (e) { logger.warn(`[FLOW-INTAKE] hours parse failed: ${e.message}`); }
      }
      if (answers.a4 && !isDefault(answers.a4)) {
        const services = (await extractServices(answers.a4, { businessName, industry, userId })) || [];
        wd.services = services;
        if (services.length) {
          try {
            const prices = await extractPricesByService(answers.a4, services, userId);
            if (prices && Object.keys(prices).length) {
              wd.salonServices = services.map((name) => ({
                name, durationMinutes: 0, priceText: prices[name] || '', addressed: false,
              }));
            }
          } catch (e) { logger.warn(`[FLOW-INTAKE] price extract failed: ${e.message}`); }
        }
      }
    } else if (theme === 'realestate') {
      // a1 = agent profile (raw); a2 = listings (raw, refined in chat)
      if (answers.a1 && !isDefault(answers.a1)) wd.agentProfileRaw = String(answers.a1).trim();
      wd.agentProfileCollected = true;
      if (answers.a2 && !isDefault(answers.a2)) wd.listingsRaw = String(answers.a2).trim();
      wd.services = Array.isArray(wd.services) ? wd.services : [];
    } else if (theme === 'portfolio') {
      // a1 = bio; a2 = projects (raw)
      if (answers.a1 && !isDefault(answers.a1)) wd.about = String(answers.a1).trim();
      if (answers.a2 && !isDefault(answers.a2)) wd.projectsRaw = String(answers.a2).trim();
      wd.services = Array.isArray(wd.services) ? wd.services : [];
    }
  } catch (err) {
    logger.warn(`[FLOW-INTAKE] theme mapping (${theme}) failed: ${err.message}`);
  }

  return wd;
}

/**
 * Handle a completed Flow (the nfm_reply inbound). Maps answers →
 * websiteData, persists, marks the session submitted, and triggers the
 * Pixie build. generateWebsite() already sends the preview link AND fires
 * the CAPI Lead/LeadSubmitted event (using ctwa_clid from the user's
 * adReferral), so we don't double-fire here.
 *
 * @returns {Promise<string|null>} next state or null
 */
async function handleFlowCompletion(user, message) {
  const answers = message.flowReply || {};
  const flowToken = answers.flow_token || message.flowToken || null;

  // Resolve theme + lang from the persisted session (authoritative), with
  // the answer payload's _theme as a fallback.
  let theme = answers._theme || null;
  try {
    if (flowToken) {
      const { getSession } = require('./store');
      const session = await getSession(flowToken);
      if (session) {
        theme = session.theme || theme;
        // Merge any answers the endpoint persisted but that aren't in the
        // final nfm_reply (defensive — nfm_reply should carry them all).
        if (session.answers && typeof session.answers === 'object') {
          for (const [k, v] of Object.entries(session.answers)) {
            if (answers[k] === undefined) answers[k] = v;
          }
        }
      }
    }
  } catch (err) {
    logger.warn(`[FLOW-INTAKE] session lookup failed: ${err.message}`);
  }
  if (!theme) {
    const { classifyTheme } = require('./questionBank');
    theme = classifyTheme(answers.industry);
  }

  const patch = await buildWebsiteDataFromFlow(answers, theme, user.id);

  const { updateUserMetadata } = require('../db/users');
  const prevWd = user.metadata?.websiteData || {};
  const mergedWd = { ...prevWd, ...patch };
  await updateUserMetadata(user.id, {
    websiteData: mergedWd,
    websiteDemoTriggered: true,
    email: patch.contactEmail || user.metadata?.email || null,
  });
  user.metadata = { ...(user.metadata || {}), websiteData: mergedWd, websiteDemoTriggered: true };

  if (flowToken) {
    try {
      const { markSubmitted } = require('./store');
      await markSubmitted(flowToken);
    } catch (err) {
      logger.warn(`[FLOW-INTAKE] markSubmitted failed: ${err.message}`);
    }
  }

  logger.info(`[FLOW-INTAKE] completed theme=${theme} biz="${patch.businessName}" → generating site for ${user.phone_number}`);

  // Hand off to the proven generator (builds, deploys, sends preview link,
  // fires CAPI). It manages its own state transition to WEB_GENERATING.
  const { generateWebsite } = require('../conversation/handlers/webDev');
  return generateWebsite(user);
}

module.exports = { buildWebsiteDataFromFlow, splitContact, handleFlowCompletion };
