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
const { parseProjectText } = require('../website-gen/portfolioProjectParse');
const { parseProfileLinks } = require('../website-gen/portfolioLinksParse');

// "30 min" / "1 hr" / "45" → minutes (default 30). "1h"/"1 hour" → 60.
function parseDurationMin(text) {
  const t = String(text || '').toLowerCase().trim();
  if (!t) return 30;
  const hr = t.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hour)/);
  if (hr) return Math.round(parseFloat(hr[1]) * 60);
  const min = t.match(/(\d+)/);
  if (min) {
    const n = parseInt(min[1], 10);
    if (n > 0 && n <= 600) return n;
  }
  return 30;
}

// Keep the user's price as written; if they typed a bare number and we
// know the currency, prefix a symbol so the site reads naturally.
function normalizePrice(price, currency) {
  const p = String(price || '').trim();
  if (!p) return '';
  if (/[^\d.,\s]/.test(p)) return p.slice(0, 40); // already has a symbol/word
  const SYM = { USD: '$', EUR: '€', GBP: '£', BRL: 'R$', AED: 'dh ', INR: '₹', PKR: 'Rs ' };
  const sym = SYM[String(currency || '').toUpperCase()] || '';
  return (sym + p).slice(0, 40);
}

// A user-pasted booking link → a safe absolute URL, or '' if it doesn't
// look like one. Mirrors the chat embed path (webDev): trim, strip trailing
// punctuation, default the scheme to https://.
function normalizeBookingUrl(text) {
  let u = String(text || '').trim().replace(/[)\].,;:!?]+$/, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
  if (!/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(u)) return ''; // needs a real host
  return u.slice(0, 300);
}

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
 * New form shape:
 *   COMMON : business_name, industry (dropdown id = theme), logo
 *   SALON  : currency (id), booking (id 'build'|'own'), hours, services
 *   DETAILS: f1, f2  (meaning depends on theme)
 *   FINISH : c_email, c_phone, c_address (3 separate optional fields)
 *
 * Email is collected ONCE, on FINISH (c_email). `answers.email` is only the
 * legacy COMMON field — kept as a harmless fallback so any session that was
 * already in-flight when COMMON's email input was removed still resolves.
 *
 * @param {object} answers  flat submitted answers
 * @param {string} theme    salon|hvac|realestate|portfolio|general
 * @param {string} userId
 * @returns {Promise<object>} websiteData patch
 */
async function buildWebsiteDataFromFlow(answers = {}, theme, userId) {
  const { extractServices } = require('../conversation/entityAccumulator');
  const { THEME_TO_INDUSTRY } = require('./questionBank');

  const businessName = String(answers.business_name || '').trim();
  const email = String(answers.email || '').trim();
  // Optional free-text business description from COMMON → the generator's
  // canonical about/description field. Fed into the LLM content prompt so the
  // generated copy reflects what the owner actually said the business does;
  // for portfolio it flows through to portfolioAbout.
  const businessDescription = String(answers.business_description || '').trim();
  // industry arrives as the dropdown id (== theme). Convert to a clean
  // industry label the site generator's template detectors recognize.
  const industry = THEME_TO_INDUSTRY[theme] || String(answers.industry || '').trim() || 'General';

  // Contact: separate optional fields — no parsing/guessing needed.
  // Phone may carry a country-code picked from the dropdown; prefix it
  // when the user didn't already type a leading "+" (and strip a leading
  // local 0, e.g. UK/PK national format).
  const cEmail = String(answers.c_email || '').trim();
  const cCode = String(answers.c_code || '').trim();
  let cPhone = String(answers.c_phone || '').trim();
  if (cPhone && cCode && !cPhone.startsWith('+')) {
    cPhone = `${cCode} ${cPhone.replace(/^0+/, '')}`.trim();
  }
  const cAddress = String(answers.c_address || '').trim();

  const wd = {
    businessName,
    industry,
    contactEmail: cEmail || email || '',
    contactPhone: cPhone || '',
    contactAddress: cAddress || '',
    flowSource: true, // marks this lead as built via the Flow intake
  };
  if (businessDescription) wd.aboutText = businessDescription.slice(0, 600);

  // Logo uploaded via the COMMON PhotoPicker (optional). The endpoint stashed
  // the raw media descriptor; download + decrypt + clean the background here
  // (off the Flow endpoint's tight response budget) and reuse the SAME chat
  // logo pipeline so the generator gets the identical wd.logoUrl shape —
  // templates read c.logoUrl. A failure never blocks the build: we just fall
  // back to a text logo, exactly like the chat "skip" path.
  try {
    const media = Array.isArray(answers.logo_media) ? answers.logo_media[0] : null;
    if (media && media.cdn_url) {
      const { decryptFlowMedia } = require('./media');
      const { processLogo } = require('../website-gen/logoProcessor');
      const { buffer, mimeType } = await decryptFlowMedia(media);
      const result = await processLogo(buffer, mimeType);
      if (result?.url) {
        wd.logoUrl = result.url;
        wd.logoSkipped = false;
        logger.info(`[FLOW-INTAKE] logo processed (${result.source}) → ${result.url}`);
      }
    }
  } catch (err) {
    logger.warn(`[FLOW-INTAKE] logo process failed: ${err.message}`);
  }

  const blank = (v) => !v || !String(v).trim();

  try {
    if (theme === 'salon') {
      // currency (dropdown id like "USD"), booking ('build'|'own'),
      // hours (free text), services_list (structured [{name,price,duration}]).
      if (!blank(answers.currency)) wd.currency = String(answers.currency).trim().slice(0, 8);
      // booking: 'build' → native system; 'own' → embed their external tool.
      // If they pasted a link in the form, embed it straight into v1 (same
      // shape the chat path produces: bookingMode='embed' + bookingUrl).
      // 'own' with no link stays 'embed_pending' — collected later in chat.
      if (answers.booking === 'own') {
        const link = normalizeBookingUrl(answers.booking_link);
        if (link) { wd.bookingMode = 'embed'; wd.bookingUrl = link; }
        else { wd.bookingMode = 'embed_pending'; }
      } else {
        wd.bookingMode = 'native';
      }
      if (!blank(answers.hours)) {
        try {
          const { parseWeeklyHours } = require('../website-gen/hoursParser');
          const { hours } = await parseWeeklyHours(String(answers.hours));
          wd.weeklyHours = hours;
        } catch (e) { logger.warn(`[FLOW-INTAKE] hours parse failed: ${e.message}`); }
      }
      // Structured services from the looped SERVICE screen — no LLM needed.
      const list = Array.isArray(answers.services_list) ? answers.services_list : [];
      const clean = list.filter((s) => s && String(s.name || '').trim());
      if (clean.length) {
        wd.services = clean.map((s) => String(s.name).trim());
        wd.salonServices = clean.map((s) => ({
          name: String(s.name).trim(),
          durationMinutes: parseDurationMin(s.duration),
          priceText: normalizePrice(s.price, wd.currency),
          addressed: true,
        }));
      }
    } else if (theme === 'hvac') {
      // f1 = "City: area, area"
      if (!blank(answers.f1)) {
        const [city, areasPart] = String(answers.f1).split(':');
        if (city) wd.primaryCity = city.trim();
        if (areasPart) wd.serviceAreas = areasPart.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      }
      // Structured services from the looped HVAC_SERVICE screen (names only —
      // no LLM needed). Fall back to the old free-text f2 for older sessions.
      const hvacList = Array.isArray(answers.hvac_services) ? answers.hvac_services : [];
      const cleanHvac = hvacList.map((s) => String(s || '').trim()).filter(Boolean);
      if (cleanHvac.length) {
        wd.services = cleanHvac.slice(0, 10);
      } else if (!blank(answers.f2)) {
        wd.services = (await extractServices(answers.f2, { businessName, industry, userId })) || [];
      }
    } else if (theme === 'realestate') {
      // currency (dropdown id like "USD") — site-wide + per-listing default.
      if (!blank(answers.currency)) wd.currency = String(answers.currency).trim().slice(0, 8);
      // Structured agent profile (AGENT screen) → the exact keys the template
      // renders. Brokerage blank = solo (left unset → generator treats as
      // independent). Designations → uppercased, deduped array (template reads
      // an array). Mirrors the chat handleCollectAgentProfile output.
      if (!blank(answers.brokerage)) wd.brokerageName = String(answers.brokerage).trim().slice(0, 60);
      const years = parseInt(answers.years, 10);
      if (Number.isFinite(years) && years > 0 && years < 80) wd.yearsExperience = years;
      if (!blank(answers.designations)) {
        const out = [];
        const seen = new Set();
        for (const raw of String(answers.designations).split(/[,/;\s]+/)) {
          const d = raw.trim().toUpperCase();
          if (d && d.length <= 12 && !seen.has(d)) { seen.add(d); out.push(d); }
        }
        if (out.length) wd.designations = out.slice(0, 8);
      }
      wd.agentProfileCollected = true;
      // Structured listings from the looped LISTING screen → the exact
      // wd.listings shape the generator + chat web-form produce, so the site
      // builds identically (mirrors parseRealEstateRows/handleRealEstateSubmit
      // in services-form). Each listing may carry an optional photo
      // (PhotoPicker): decrypt + upload here, off the endpoint's budget.
      const rawListings = (Array.isArray(answers.listings_list) ? answers.listings_list : []).slice(0, 3);
      const listings = [];
      for (const r of rawListings) {
        if (!r || blank(r.address)) continue;
        let photoUrl = null;
        if (Array.isArray(r.photo_media) && r.photo_media.length) {
          try {
            const { decryptFlowMedia } = require('./media');
            const { uploadListingPhoto } = require('../website-gen/listingPhotoUploader');
            const { buffer, mimeType } = await decryptFlowMedia(r.photo_media[0]);
            photoUrl = await uploadListingPhoto(buffer, mimeType);
          } catch (err) {
            logger.warn(`[FLOW-INTAKE] listing photo failed: ${err.message}`);
          }
        }
        const price = parseInt(r.price, 10);
        const beds = parseInt(r.beds, 10);
        const baths = parseFloat(r.baths);
        const sqft = parseInt(r.sqft, 10);
        const status = ['For Sale', 'Just Listed', 'Pending', 'Sold'].includes(r.status) ? r.status : 'For Sale';
        listings.push({
          address: String(r.address).trim().slice(0, 120),
          price: Number.isFinite(price) && price > 0 ? price : 0,
          currency: wd.currency || 'USD',
          beds: Number.isFinite(beds) ? beds : 3,
          baths: Number.isFinite(baths) ? baths : 2,
          sqft: Number.isFinite(sqft) && sqft > 0 ? sqft : 1800,
          status,
          neighborhood: blank(r.neighborhood) ? '' : String(r.neighborhood).trim().slice(0, 60),
          photoUrl,
        });
      }
      if (listings.length) wd.listings = listings;
      wd.services = Array.isArray(wd.services) ? wd.services : [];
    } else if (theme === 'portfolio') {
      // f1 = bio, niche dropdown = creative niche, f2 = projects (free text,
      // one per line / natural language). industryKey makes the portfolio
      // template selection deterministic regardless of the industry label.
      wd.industryKey = 'portfolio';
      if (!blank(answers.f1)) wd.aboutText = String(answers.f1).trim().slice(0, 600);
      if (!blank(answers.portfolio_niche)) wd.portfolioNiche = String(answers.portfolio_niche).trim();
      // Skills / tools → services list (drives the tech ribbon, skills grid,
      // terminal stack, and "technologies" stat). LLM-split like every other
      // services field so "React, Node and a bit of Go" → clean tokens.
      if (!blank(answers.p_skills)) {
        wd.services = (await extractServices(answers.p_skills, { businessName, industry, userId })) || [];
      }
      // Profile links → username-only handles the templates render
      // (github/linkedin/twitter/instagram/behance). Pasted URLs or
      // "github: foo" both resolve via the shared parser.
      if (!blank(answers.p_links)) {
        Object.assign(wd, parseProfileLinks(answers.p_links));
      }
      // Years of experience → the "years building" stat (else it falls back to
      // a placeholder count).
      const pYears = parseInt(answers.p_years, 10);
      if (Number.isFinite(pYears) && pYears > 0 && pYears < 80) wd.yearsExperience = pYears;
      // Current focus → hero meta + the terminal "building" line.
      if (!blank(answers.p_focus)) wd.currentFocus = String(answers.p_focus).trim().slice(0, 120);
      if (!blank(answers.f2)) {
        const parsed = await parseProjectText(String(answers.f2).trim(), userId);
        if (Array.isArray(parsed) && parsed.length) {
          wd.projects = parsed.slice(0, 6).map((p) => ({
            title: p.title,
            description: p.description || '',
            role: p.role || '',
            year: p.year || '',
            link: p.link || '',
            tools: Array.isArray(p.tools) ? p.tools : [],
            photoUrl: null,
          }));
        }
      }
      // Real work samples from the PORTFOLIO PhotoPicker (photographer/designer).
      // Decrypt + upload each (reusing the generic listing-photo Supabase
      // uploader) → project.photoUrl, so the work grid shows the user's own
      // photos instead of Pexels fallbacks. If project text was also given, the
      // photos fill those cards' missing images first; extras become image-only
      // cards. A failure on any one photo just skips it — never blocks the build.
      const photoMedia = Array.isArray(answers.portfolio_photos_media)
        ? answers.portfolio_photos_media.slice(0, 6)
        : [];
      if (photoMedia.length) {
        const { decryptFlowMedia } = require('./media');
        const { uploadListingPhoto } = require('../website-gen/listingPhotoUploader');
        const urls = [];
        for (const m of photoMedia) {
          try {
            const { buffer, mimeType } = await decryptFlowMedia(m);
            const url = await uploadListingPhoto(buffer, mimeType);
            if (url) urls.push(url);
          } catch (err) {
            logger.warn(`[FLOW-INTAKE] portfolio photo failed: ${err.message}`);
          }
        }
        if (urls.length) {
          const blankProject = (photoUrl) => ({ title: '', description: '', role: '', year: '', link: '', tools: [], photoUrl });
          if (Array.isArray(wd.projects) && wd.projects.length) {
            let pi = 0;
            for (const p of wd.projects) { if (!p.photoUrl && pi < urls.length) p.photoUrl = urls[pi++]; }
            while (pi < urls.length) wd.projects.push(blankProject(urls[pi++]));
            wd.projects = wd.projects.slice(0, 6);
          } else {
            wd.projects = urls.map(blankProject);
          }
          logger.info(`[FLOW-INTAKE] portfolio photos uploaded (${urls.length}) → ${wd.projects.length} work cards`);
        }
      }
      // Optional headshot from the "A photo of you" picker → about-section
      // portrait (c.aboutPhotoUrl). Photographer/general templates render it;
      // when absent they drop the circle and stay text-only. Same decrypt +
      // upload path as work photos; a failure just leaves it text-only.
      const aboutMedia = Array.isArray(answers.about_photo_media)
        ? answers.about_photo_media.slice(0, 1)
        : [];
      if (aboutMedia.length) {
        try {
          const { decryptFlowMedia } = require('./media');
          const { uploadListingPhoto } = require('../website-gen/listingPhotoUploader');
          const { buffer, mimeType } = await decryptFlowMedia(aboutMedia[0]);
          const url = await uploadListingPhoto(buffer, mimeType);
          if (url) {
            wd.aboutPhotoUrl = url;
            logger.info('[FLOW-INTAKE] about photo uploaded → aboutPhotoUrl');
          }
        } catch (err) {
          logger.warn(`[FLOW-INTAKE] about photo failed: ${err.message}`);
        }
      }
      wd.services = Array.isArray(wd.services) ? wd.services : [];
    } else {
      // general — f1 = services list
      if (!blank(answers.f1)) {
        wd.services = (await extractServices(answers.f1, { businessName, industry, userId })) || [];
      }
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
  let lang = 'en';
  try {
    if (flowToken) {
      const { getSession } = require('./store');
      const session = await getSession(flowToken);
      if (session) {
        theme = session.theme || theme;
        if (session.lang) lang = session.lang;
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

  // Create the site DB record if one doesn't exist yet. The chat path does
  // this in handleCollectName; without it, generateWebsite deploys to
  // Netlify but has no siteId to persist preview_url against — so the later
  // revisions / domain steps (getLatestSite) can't find the site and reply
  // "I don't have a generated website for you yet."
  let currentSiteId = user.metadata?.currentSiteId || null;
  if (!currentSiteId) {
    try {
      const { createSite } = require('../db/sites');
      const site = await createSite(user.id, 'business-starter');
      currentSiteId = site.id;
    } catch (err) {
      logger.warn(`[FLOW-INTAKE] createSite failed: ${err.message}`);
    }
  }

  await updateUserMetadata(user.id, {
    websiteData: mergedWd,
    websiteDemoTriggered: true,
    currentSiteId,
    email: patch.contactEmail || user.metadata?.email || null,
  });
  user.metadata = { ...(user.metadata || {}), websiteData: mergedWd, websiteDemoTriggered: true, currentSiteId };

  if (flowToken) {
    try {
      const { markSubmitted } = require('./store');
      await markSubmitted(flowToken);
    } catch (err) {
      logger.warn(`[FLOW-INTAKE] markSubmitted failed: ${err.message}`);
    }
  }

  logger.info(`[FLOW-INTAKE] completed theme=${theme} biz="${patch.businessName}" → generating site for ${user.phone_number}`);

  // Acknowledge the submission immediately so the user knows something is
  // happening — the build + deploy takes ~10-60s before the preview lands.
  try {
    const { sendTextMessage } = require('../messages/sender');
    const name = patch.businessName ? ` for *${patch.businessName}*` : '';
    const building = lang === 'pt'
      ? `Perfeito! 🛠️ Estou criando seu site${name} agora — leva uns segundinhos. Já te mando o link do preview. ✨`
      : `Perfect! 🛠️ I'm building your site${name} now — this takes a few seconds. I'll send you the preview link in a moment. ✨`;
    await sendTextMessage(user.phone_number, building);
  } catch (err) {
    logger.warn(`[FLOW-INTAKE] building-ack send failed: ${err.message}`);
  }

  // Hand off to the proven generator (builds, deploys, sends preview link,
  // fires CAPI). It manages its own state transition to WEB_GENERATING.
  // The post-preview flow (payment link, revisions, domain offer) is the
  // SAME as the chat path — generateWebsite + the WEB_* state machine.
  const { generateWebsite } = require('../conversation/handlers/webDev');
  return generateWebsite(user);
}

module.exports = { buildWebsiteDataFromFlow, splitContact, handleFlowCompletion };
