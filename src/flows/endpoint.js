'use strict';

// The Flow endpoint "brain". Pure decision logic — no crypto, no HTTP.
//
//   ping                         → health check
//   INIT                         → render COMMON (labels + industry dropdown options)
//   data_exchange @ COMMON       → industry dropdown id IS the theme; route to
//                                  SALON (tailored) or DETAILS (generic 2-field)
//   data_exchange @ SALON        → persist salon answers → FINISH
//   data_exchange @ DETAILS      → persist details → FINISH
//   data_exchange @ FINISH       → persist 3 contact fields → SUCCESS
//
// Answers persist per screen via the store so the final webhook has the
// full set even though each response payload stays small.

const {
  classifyTheme, VALID_THEMES, INDUSTRY_OPTIONS, NICHE_OPTIONS, CURRENCY_OPTIONS,
  BOOKING_OPTIONS, ADDMORE_OPTIONS, ADDMORE_LISTING_OPTIONS,
  ADDMORE_EXP_OPTIONS, ADDMORE_PROJECT_OPTIONS, ADDMORE_PACKAGE_OPTIONS,
  LISTING_STATUS_OPTIONS, COUNTRY_CODES, DETAILS, NICHE_FIELDS, L, pick,
} = require('./questionBank');
const { getSession, patchSession } = require('./store');
const { logger } = require('../utils/logger');

function commonScreen(lang) {
  return {
    screen: 'COMMON',
    data: {
      common_title: L[lang].common_title,
      l_name: L[lang].l_name,
      l_your_name: L[lang].l_your_name,
      l_business_desc: L[lang].l_business_desc,
      business_desc_helper: L[lang].business_desc_helper,
      l_industry: L[lang].l_industry,
      industry_options: INDUSTRY_OPTIONS[lang] || INDUSTRY_OPTIONS.en,
      l_logo: L[lang].l_logo,
      l_logo_desc: L[lang].l_logo_desc,
      l_next: L[lang].next,
    },
  };
}

function salonScreen(lang) {
  return {
    screen: 'SALON',
    data: {
      salon_title: L[lang].salon_title,
      l_currency: L[lang].l_currency,
      currency_options: CURRENCY_OPTIONS[lang] || CURRENCY_OPTIONS.en,
      l_booking_heading: L[lang].l_booking_heading,
      l_booking: L[lang].l_booking,
      booking_options: BOOKING_OPTIONS[lang] || BOOKING_OPTIONS.en,
      l_booking_link: L[lang].l_booking_link,
      booking_link_helper: L[lang].booking_link_helper,
      l_hours: L[lang].l_hours,
      hours_helper: L[lang].hours_helper,
      l_next: L[lang].next,
    },
  };
}

// Format the running "added so far" summary for the SERVICE screen.
function summarizeServices(list, lang) {
  if (!Array.isArray(list) || list.length === 0) return '';
  const parts = list.map((s) => {
    const extra = [s.price, s.duration].filter(Boolean).join(', ');
    return extra ? `${s.name} (${extra})` : s.name;
  });
  return (L[lang].added_prefix || 'Added so far: ') + parts.join(' · ');
}

// SERVICE screen — structured name/price/duration with an "add another"
// loop. `list` is the services accumulated so far (shown as a summary).
function serviceScreen(lang, list) {
  const summary = summarizeServices(list, lang);
  return {
    screen: 'SERVICE',
    data: {
      service_title: L[lang].service_title,
      // The first field is required only on the first render (empty list) so the
      // user enters at least one; on loop renders it's optional so picking
      // "That's all" finishes without forcing another entry.
      service_required: list.length === 0,
      added_summary: summary || '—',
      added_visible: !!summary,
      l_sname: L[lang].l_sname,
      sname_helper: L[lang].sname_helper,
      l_sprice: L[lang].l_sprice,
      sprice_helper: L[lang].sprice_helper,
      l_sdur: L[lang].l_sdur,
      sdur_helper: L[lang].sdur_helper,
      l_addmore: L[lang].l_addmore,
      addmore_options: ADDMORE_OPTIONS[lang] || ADDMORE_OPTIONS.en,
      l_continue: L[lang].continue,
      // Always-empty initial values bound to the Form's init-values, so
      // the inputs reset to blank every time the screen (re)loads — they
      // no longer retain the previous service's values on "add another".
      // addmore reset to '' so the "Add another?" radio starts deselected on
      // every (re)load — without it the previous "add" selection stays sticky
      // when the loop refreshes the screen.
      service_init: { sname: '', sprice: '', sdur: '', addmore: '' },
    },
  };
}

// Format the running "added so far" summary for the LISTING screen.
function summarizeListings(list, lang) {
  if (!Array.isArray(list) || list.length === 0) return '';
  const parts = list.map((l) => l.address).filter(Boolean);
  return (L[lang].added_prefix || 'Added so far: ') + parts.join(' · ');
}

// LISTING screen — structured address/price/status/beds/baths/sqft/
// neighborhood + optional photo, with an "add another" loop. Mirrors
// serviceScreen. `list` is the listings accumulated so far (shown as a
// summary). Real estate only.
function listingScreen(lang, list) {
  const summary = summarizeListings(list, lang);
  return {
    screen: 'LISTING',
    data: {
      listing_title: L[lang].listing_title,
      // Required only on the first render so a loop "That's all" can finish.
      listing_required: list.length === 0,
      added_summary: summary || '—',
      added_visible: !!summary,
      l_address: L[lang].l_address,
      address_helper: L[lang].address_helper,
      l_lprice: L[lang].l_lprice,
      lprice_helper: L[lang].lprice_helper,
      l_status: L[lang].l_status,
      status_options: LISTING_STATUS_OPTIONS[lang] || LISTING_STATUS_OPTIONS.en,
      l_beds: L[lang].l_beds,
      beds_helper: L[lang].beds_helper,
      l_baths: L[lang].l_baths,
      baths_helper: L[lang].baths_helper,
      l_sqft: L[lang].l_sqft,
      sqft_helper: L[lang].sqft_helper,
      l_neighborhood: L[lang].l_neighborhood,
      neighborhood_helper: L[lang].neighborhood_helper,
      l_lphoto: L[lang].l_lphoto,
      l_lphoto_desc: L[lang].l_lphoto_desc,
      l_addmore: L[lang].l_addmore,
      addmore_options: ADDMORE_LISTING_OPTIONS[lang] || ADDMORE_LISTING_OPTIONS.en,
      l_continue: L[lang].continue,
      // Reset the text inputs to blank every time the screen (re)loads.
      listing_init: { address: '', price: '', beds: '', baths: '', sqft: '', neighborhood: '', addmore: '' },
    },
  };
}

// AGENT screen — structured real-estate agent profile (brokerage, years,
// designations) + the site currency. Replaces the old free-text agent
// TextArea so the values land on keys the generator actually renders.
function agentScreen(lang) {
  return {
    screen: 'AGENT',
    data: {
      agent_title: L[lang].agent_title,
      l_currency: L[lang].l_currency,
      currency_options: CURRENCY_OPTIONS[lang] || CURRENCY_OPTIONS.en,
      l_brokerage: L[lang].l_brokerage,
      brokerage_helper: L[lang].brokerage_helper,
      l_years: L[lang].l_years,
      years_helper: L[lang].years_helper,
      l_designations: L[lang].l_designations,
      designations_helper: L[lang].designations_helper,
      l_next: L[lang].next,
    },
  };
}

// Format the "added so far" summary for a plain name list (HVAC services).
function summarizeNames(list, lang) {
  if (!Array.isArray(list) || list.length === 0) return '';
  return (L[lang].added_prefix || 'Added so far: ') + list.filter(Boolean).join(' · ');
}

// HVAC_SERVICE screen — a single service name with an "add another" loop.
// Simpler than the salon SERVICE screen (no price/duration); accumulates a
// plain list of names. Reuses ADDMORE_OPTIONS ("Add another service").
function hvacServiceScreen(lang, list) {
  const summary = summarizeNames(list, lang);
  return {
    screen: 'HVAC_SERVICE',
    data: {
      hsvc_title: L[lang].hsvc_title,
      // Required only on the first render so a loop "That's all" can finish.
      hsvc_required: list.length === 0,
      added_summary: summary || '—',
      added_visible: !!summary,
      l_hsvc: L[lang].l_hsvc,
      hsvc_helper: L[lang].hsvc_helper,
      l_addmore: L[lang].l_addmore,
      addmore_options: ADDMORE_OPTIONS[lang] || ADDMORE_OPTIONS.en,
      l_continue: L[lang].continue,
      hsvc_init: { sname: '', addmore: '' },
    },
  };
}

function detailsScreen(theme, lang) {
  const d = DETAILS[theme] || DETAILS.general;
  const f2 = pick(d.f2, lang);
  // Currency only shown for real estate (listing prices). The Dropdown is
  // hidden + non-required for every other niche via currency_visible.
  const currencyVisible = theme === 'realestate';
  // Niche dropdown only shown for portfolio (picks the creative sub-template).
  const nicheVisible = theme === 'portfolio';
  // Portfolio-only personalization inputs (skills / links / years / focus).
  // Hidden + non-required for every other theme that shares the DETAILS screen
  // (hvac, general). All optional even for portfolio — sensible placeholders
  // fill any blanks at generate time.
  const portfolioExtraVisible = theme === 'portfolio';
  return {
    screen: 'DETAILS',
    data: {
      details_title: pick(d.title, lang),
      l_currency: L[lang].l_currency,
      currency_options: CURRENCY_OPTIONS[lang] || CURRENCY_OPTIONS.en,
      currency_visible: currencyVisible,
      l_niche: L[lang].l_niche,
      niche_options: NICHE_OPTIONS[lang] || NICHE_OPTIONS.en,
      niche_visible: nicheVisible,
      portfolio_extra_visible: portfolioExtraVisible,
      l_skills: L[lang].l_skills,
      skills_helper: L[lang].skills_helper,
      l_links: L[lang].l_links,
      links_helper: L[lang].links_helper,
      l_pyears: L[lang].l_pyears,
      pyears_helper: L[lang].pyears_helper,
      l_focus: L[lang].l_focus,
      focus_helper: L[lang].focus_helper,
      f1_label: pick(d.f1, lang),
      f1_helper: pick(d.f1_helper, lang),
      f2_label: f2 || '—',
      f2_helper: pick(d.f2_helper, lang),
      f2_visible: !!f2,
      l_next: L[lang].next,
    },
  };
}

// PNICHE screen — portfolio users pick their creative niche FIRST, on its own
// screen, so the next screen (PORTFOLIO) can be tailored to it. Mirrors how the
// industry dropdown on COMMON drives the salon/realestate branch.
function pnicheScreen(lang) {
  return {
    screen: 'PNICHE',
    data: {
      pniche_title: L[lang].pniche_title,
      l_niche: L[lang].l_niche,
      niche_options: NICHE_OPTIONS[lang] || NICHE_OPTIONS.en,
      l_next: L[lang].next,
    },
  };
}

// PORTFOLIO (page 1 of 2) — the "about you" half: bio + skills/tools + years +
// focus. Split across two screens so no single page is a wall of fields. Every
// optional field exists in flow.json; the endpoint toggles each `*_visible`
// (and a couple of label overrides) per niche from NICHE_FIELDS.
function portfolioScreen(lang, niche) {
  const f = NICHE_FIELDS[niche] || NICHE_FIELDS.developer;
  return {
    screen: 'PORTFOLIO',
    data: {
      portfolio_title: pick(f.title, lang) || L[lang].details_title,
      l_about_photo: L[lang].l_about_photo,
      about_photo_desc: L[lang].about_photo_desc,
      about_photo_visible: !!f.aboutPhoto,
      l_bio: L[lang].l_bio,
      bio_helper: L[lang].bio_helper,
      l_skills: pick(f.skills_label, lang) || L[lang].l_skills,
      skills_helper: pick(f.skills_helper, lang) || L[lang].skills_helper,
      skills_visible: !!f.skills,
      l_pyears: L[lang].l_pyears,
      pyears_helper: L[lang].pyears_helper,
      years_visible: !!f.years,
      l_focus: L[lang].l_focus,
      focus_helper: L[lang].focus_helper,
      focus_visible: !!f.focus,
      l_next: L[lang].next,
    },
  };
}

// PORTFOLIO_WORK (page 2 of 2) — the "your work" half: real work samples (visual
// niches get the PhotoPicker) OR projects text (developer/writer), plus links
// (shown for every niche). Niche-toggled the same way.
function portfolio2Screen(lang, niche) {
  const f = NICHE_FIELDS[niche] || NICHE_FIELDS.developer;
  // Discrete, niche-tailored link slots (up to 4). Unfilled slots are hidden.
  const slots = Array.isArray(f.links) ? f.links : [];
  const linkData = {};
  for (let i = 0; i < 4; i++) {
    const slot = slots[i];
    linkData[`l_link${i + 1}`] = slot ? pick(slot.label, lang) : '';
    linkData[`link${i + 1}_helper`] = slot ? pick(slot.helper, lang) : '';
    linkData[`link${i + 1}_visible`] = !!slot;
  }
  return {
    screen: 'PORTFOLIO_WORK',
    data: {
      portfolio2_title: L[lang].portfolio2_title,
      l_photos: L[lang].l_photos,
      photos_desc: pick(f.photos_desc, lang) || L[lang].photos_desc,
      photos_visible: !!f.photos,
      l_projects: L[lang].l_projects,
      projects_helper: L[lang].projects_helper,
      // Projects are collected on the structured PROJECT loop now, so the
      // free-text field on this page stays hidden.
      projects_visible: false,
      ...linkData,
      l_next: L[lang].next,
    },
  };
}

// Format the running "added so far" summary for the experience loop.
function summarizeExperience(list, lang) {
  if (!Array.isArray(list) || list.length === 0) return '';
  const parts = list
    .map((e) => [e.role, e.company].filter(Boolean).join(' @ ') || e.role || e.company)
    .filter(Boolean);
  return (L[lang].added_prefix || 'Added so far: ') + parts.join(' · ');
}

// PEXP — portfolio experience loop (developer). role/company/period/summary
// with an "add another" loop, mirroring the salon SERVICE screen.
function pexpScreen(lang, list) {
  const summary = summarizeExperience(list, lang);
  return {
    screen: 'PEXP',
    data: {
      pexp_title: L[lang].pexp_title,
      // Required only on the first render so a loop "That's my experience" finishes.
      pexp_required: list.length === 0,
      added_summary: summary || '—',
      added_visible: !!summary,
      l_erole: L[lang].l_erole, erole_helper: L[lang].erole_helper,
      l_ecompany: L[lang].l_ecompany, ecompany_helper: L[lang].ecompany_helper,
      l_eperiod: L[lang].l_eperiod, eperiod_helper: L[lang].eperiod_helper,
      l_esummary: L[lang].l_esummary, esummary_helper: L[lang].esummary_helper,
      l_addmore: L[lang].l_addmore,
      addmore_options: ADDMORE_EXP_OPTIONS[lang] || ADDMORE_EXP_OPTIONS.en,
      l_continue: L[lang].continue,
      exp_init: { erole: '', ecompany: '', eperiod: '', esummary: '', addmore: '' },
    },
  };
}

// Format the running "added so far" summary for the project loop.
function summarizeProjectsList(list, lang) {
  if (!Array.isArray(list) || list.length === 0) return '';
  return (L[lang].added_prefix || 'Added so far: ') + list.map((p) => p.title).filter(Boolean).join(' · ');
}

// PROJECT — portfolio project loop (developer/writer). name + description with
// an "add another" loop.
function projectScreen(lang, list) {
  const summary = summarizeProjectsList(list, lang);
  return {
    screen: 'PROJECT',
    data: {
      proj_title: L[lang].proj_title,
      // Required only on the first render so a loop "That's all my projects" finishes.
      proj_required: list.length === 0,
      added_summary: summary || '—',
      added_visible: !!summary,
      l_pname: L[lang].l_pname, pname_helper: L[lang].pname_helper,
      l_pdesc: L[lang].l_pdesc, pdesc_helper: L[lang].pdesc_helper,
      l_addmore: L[lang].l_addmore,
      addmore_options: ADDMORE_PROJECT_OPTIONS[lang] || ADDMORE_PROJECT_OPTIONS.en,
      l_continue: L[lang].continue,
      proj_init: { pname: '', pdesc: '', addmore: '' },
    },
  };
}

// After the "about you" page (or the experience loop), route a portfolio user
// through the project loop if their niche features text projects, else to the
// final "your work" page. Initialises the projects accumulator when entering.
async function portfolioAfterAbout(lang, niche, flowToken) {
  const f = NICHE_FIELDS[niche] || NICHE_FIELDS.developer;
  if (f.projects) {
    if (flowToken) {
      await patchSession(flowToken, { answersPatch: { projects_list: [] } })
        .catch((err) => logger.warn(`[FLOW] init projects_list failed: ${err.message}`));
    }
    return projectScreen(lang, []);
  }
  return portfolio2Screen(lang, niche);
}

// Format the running "added so far" summary for the PACKAGE loop.
function summarizePackages(list, lang) {
  if (!Array.isArray(list) || list.length === 0) return '';
  const parts = list.map((p) => {
    const extra = [p.price, p.duration].filter(Boolean).join(', ');
    return extra ? `${p.name} (${extra})` : p.name;
  }).filter(Boolean);
  return (L[lang].added_prefix || 'Added so far: ') + parts.join(' · ');
}

// PACKAGE — photographer packages/pricing loop. name/price/duration + a
// "what's included" TextArea, with an "add another" loop. Mirrors the salon
// SERVICE screen; `list` is the packages accumulated so far (shown as a summary).
function packageScreen(lang, list) {
  const summary = summarizePackages(list, lang);
  const first = list.length === 0;
  return {
    screen: 'PACKAGE',
    data: {
      package_title: L[lang].package_title,
      // Required only on the first render so a loop "That's all" can finish.
      package_required: first,
      added_summary: summary || '—',
      added_visible: !!summary,
      // Currency is asked once (first package) and applies to every package's
      // price; on loop renders it's hidden — the pick persists in the session.
      l_currency: L[lang].l_currency,
      currency_options: CURRENCY_OPTIONS[lang] || CURRENCY_OPTIONS.en,
      currency_visible: first,
      l_pkgname: L[lang].l_pkgname, pkgname_helper: L[lang].pkgname_helper,
      l_pkgprice: L[lang].l_pkgprice, pkgprice_helper: L[lang].pkgprice_helper,
      l_pkgdur: L[lang].l_pkgdur, pkgdur_helper: L[lang].pkgdur_helper,
      l_pkgincl: L[lang].l_pkgincl, pkgincl_helper: L[lang].pkgincl_helper,
      l_addmore: L[lang].l_addmore,
      addmore_options: ADDMORE_PACKAGE_OPTIONS[lang] || ADDMORE_PACKAGE_OPTIONS.en,
      l_continue: L[lang].continue,
      // Reset every input (incl. the addmore radio) to blank on each (re)load.
      package_init: { pkgname: '', pkgprice: '', pkgdur: '', pkgincl: '', addmore: '' },
    },
  };
}

function finishScreen(lang) {
  return {
    screen: 'FINISH',
    data: {
      finish_title: L[lang].finish_title,
      l_cemail: L[lang].l_cemail,
      l_ccode: L[lang].l_ccode,
      country_options: COUNTRY_CODES,
      l_cphone: L[lang].l_cphone,
      l_caddress: L[lang].l_caddress,
      build: L[lang].build,
    },
  };
}

async function handleFlow(req, ctx = {}) {
  const { action, screen, data = {}, flow_token: flowToken } = req || {};

  if (action === 'ping') return { data: { status: 'active' } };

  if (data && data.error) {
    logger.warn(`[FLOW] client error on token ${flowToken}: ${data.error}`);
    return { data: { acknowledged: true } };
  }

  // Resolve language: explicit ctx > persisted session > 'en'.
  let lang = ctx.lang;
  let session = null;
  if (flowToken) {
    try { session = await getSession(flowToken); }
    catch (err) { logger.warn(`[FLOW] getSession(${flowToken}) failed: ${err.message}`); }
  }
  if (!lang) lang = session?.lang || 'en';
  // Materialize the user's language at runtime if it isn't hand-authored
  // (en/pt). send.js usually pre-warms this; this is the fallback if the
  // process restarted. Only falls back to English if translation failed.
  if (!L[lang] && action !== 'ping') {
    try { const { ensureLanguage } = require('./translate'); await ensureLanguage(lang); }
    catch (err) { logger.warn(`[FLOW] ensureLanguage(${lang}) failed: ${err.message}`); }
  }
  if (!L[lang]) lang = 'en';

  // INIT — flow opened. Return COMMON (labels + dropdown options).
  if (action === 'INIT') return commonScreen(lang);

  if (action === 'data_exchange') {
    // COMMON → classify (dropdown id = theme), route to the right screen.
    if (screen === 'COMMON') {
      // Portfolio renders a "Your name" field (your_name) instead of
      // "Business name" — the label is wrong for a personal portfolio, but the
      // site still needs the name (it's the hero title). Merge either into the
      // single business_name the rest of the pipeline (intake + templates) reads.
      const businessName = String(data.business_name || data.your_name || '').trim();
      const businessDescription = String(data.business_description || '').trim();
      const industryId = String(data.industry || '').trim();
      const theme = VALID_THEMES.includes(industryId) ? industryId : classifyTheme(industryId);

      if (flowToken) {
        const answersPatch = { business_name: businessName, business_description: businessDescription, industry: industryId };
        // Optional logo PhotoPicker — stash the raw media descriptor(s) only.
        // The CDN download + decrypt + bg-removal is deferred to the
        // completion handler (off this endpoint's tight response budget).
        if (Array.isArray(data.logo) && data.logo.length) {
          answersPatch.logo_media = data.logo;
          logger.info(`[FLOW] COMMON logo uploaded (${data.logo.length} file) token=${flowToken}`);
        }
        await patchSession(flowToken, { answersPatch, theme, lang })
          .catch((err) => logger.warn(`[FLOW] persist COMMON failed: ${err.message}`));
      }
      logger.info(`[FLOW] COMMON → theme=${theme} lang=${lang} token=${flowToken}`);

      if (theme === 'salon') return salonScreen(lang);
      if (theme === 'realestate') return agentScreen(lang);
      if (theme === 'portfolio') return pnicheScreen(lang);
      return detailsScreen(theme, lang);
    }

    // PNICHE (portfolio) → persist the creative niche, then render the
    // niche-tailored PORTFOLIO screen. The niche lives in the session so the
    // build (intake) reads it even though only PORTFOLIO's payload follows.
    if (screen === 'PNICHE') {
      const niche = String(data.portfolio_niche || '').trim();
      if (flowToken) {
        await patchSession(flowToken, { answersPatch: { portfolio_niche: niche } })
          .catch((err) => logger.warn(`[FLOW] persist PNICHE failed: ${err.message}`));
      }
      logger.info(`[FLOW] PNICHE → niche=${niche} lang=${lang} token=${flowToken}`);
      return portfolioScreen(lang, niche);
    }

    // PORTFOLIO (page 1) → persist the "about you" fields, then render page 2
    // (niche read from the session, persisted at PNICHE).
    if (screen === 'PORTFOLIO') {
      if (flowToken) {
        const answersPatch = {
          f1: data.f1 || '',
          p_skills: data.p_skills || '',
          p_years: data.p_years || '',
          p_focus: data.p_focus || '',
        };
        // Optional headshot ("A photo of you") → about-section portrait. Stashed
        // as raw media; decrypt + upload deferred to the completion handler.
        if (Array.isArray(data.about_photo) && data.about_photo.length) {
          answersPatch.about_photo_media = data.about_photo;
          logger.info(`[FLOW] PORTFOLIO about-photo uploaded token=${flowToken}`);
        }
        await patchSession(flowToken, { answersPatch })
          .catch((err) => logger.warn(`[FLOW] persist PORTFOLIO failed: ${err.message}`));
      }
      const niche = String(session?.answers?.portfolio_niche || '').trim();
      const f = NICHE_FIELDS[niche] || NICHE_FIELDS.developer;
      // Developer → collect a real work history first (experience loop), then
      // projects, then the work/links page. Other niches skip straight to
      // projects (if any) or the work page.
      if (f.experience) {
        if (flowToken) {
          await patchSession(flowToken, { answersPatch: { experience_list: [] } })
            .catch((err) => logger.warn(`[FLOW] init experience_list failed: ${err.message}`));
        }
        return pexpScreen(lang, []);
      }
      return portfolioAfterAbout(lang, niche, flowToken);
    }

    // PEXP (developer) → append this role, then loop ("add another") or move on
    // to the project loop / work page. The accumulated list lives in the
    // session (experience_list); the nfm_reply only carries the last row.
    if (screen === 'PEXP') {
      const niche = String(session?.answers?.portfolio_niche || '').trim();
      const list = Array.isArray(session?.answers?.experience_list)
        ? session.answers.experience_list.slice()
        : [];
      const role = String(data.erole || '').trim();
      if (role) {
        list.push({
          role,
          company: String(data.ecompany || '').trim(),
          period: String(data.eperiod || '').trim(),
          summary: String(data.esummary || '').trim(),
        });
      }
      if (flowToken) {
        await patchSession(flowToken, { answersPatch: { experience_list: list } })
          .catch((err) => logger.warn(`[FLOW] persist PEXP failed: ${err.message}`));
      }
      if (data.addmore === 'add' && role && list.length < 8) {
        logger.info(`[FLOW] PEXP loop (${list.length} so far) token=${flowToken}`);
        return pexpScreen(lang, list);
      }
      return portfolioAfterAbout(lang, niche, flowToken);
    }

    // PROJECT (developer/writer) → append this project, then loop or proceed to
    // the work/links page. List lives in the session (projects_list).
    if (screen === 'PROJECT') {
      const niche = String(session?.answers?.portfolio_niche || '').trim();
      const list = Array.isArray(session?.answers?.projects_list)
        ? session.answers.projects_list.slice()
        : [];
      const title = String(data.pname || '').trim();
      if (title) list.push({ title, description: String(data.pdesc || '').trim() });
      if (flowToken) {
        await patchSession(flowToken, { answersPatch: { projects_list: list } })
          .catch((err) => logger.warn(`[FLOW] persist PROJECT failed: ${err.message}`));
      }
      if (data.addmore === 'add' && title && list.length < 6) {
        logger.info(`[FLOW] PROJECT loop (${list.length} so far) token=${flowToken}`);
        return projectScreen(lang, list);
      }
      return portfolio2Screen(lang, niche);
    }

    // PORTFOLIO_WORK (page 2) → persist projects/links (+ any uploaded work
    // photos, stashed as raw media descriptors like the COMMON logo / listing
    // photos — decrypt + upload is deferred to the completion handler) → FINISH.
    if (screen === 'PORTFOLIO_WORK') {
      const niche = String(session?.answers?.portfolio_niche || '').trim();
      const f = NICHE_FIELDS[niche] || NICHE_FIELDS.developer;
      if (flowToken) {
        // Re-join the discrete link slots into the single blob the shared parser
        // (portfolioLinksParse.js) consumes — newline-separated so each link is
        // independently matchable. We know each slot's platform (same niche the
        // screen was built from), so a bare username/@handle gets tagged with
        // its platform keyword; a pasted URL is left raw so a mis-filled URL
        // can't be mis-tagged (the parser resolves it by its own domain).
        const slots = f.links || [];
        const p_links = [data.p_link1, data.p_link2, data.p_link3, data.p_link4]
          .map((v, i) => {
            const val = String(v || '').trim();
            if (!val) return '';
            const key = slots[i] && slots[i].key;
            const isUrlish = /[/.]/.test(val);
            return key && !isUrlish ? `${key}: ${val}` : val;
          })
          .filter(Boolean)
          .join('\n');
        const answersPatch = { p_links };
        if (Array.isArray(data.work_photos) && data.work_photos.length) {
          answersPatch.portfolio_photos_media = data.work_photos;
          logger.info(`[FLOW] PORTFOLIO_WORK photos uploaded (${data.work_photos.length}) token=${flowToken}`);
        }
        await patchSession(flowToken, { answersPatch })
          .catch((err) => logger.warn(`[FLOW] persist PORTFOLIO_WORK failed: ${err.message}`));
      }
      // Photographer: collect packages/pricing next (the site has a packages
      // section); every other niche finishes here.
      if (f.packages) {
        if (flowToken) {
          await patchSession(flowToken, { answersPatch: { packages_list: [] } })
            .catch((err) => logger.warn(`[FLOW] init packages_list failed: ${err.message}`));
        }
        return packageScreen(lang, []);
      }
      return finishScreen(lang);
    }

    // PACKAGE (photographer) → append this package, then loop ("add another" →
    // refresh the PACKAGE screen) or proceed to FINISH. The accumulated list
    // lives in the session (packages_list); the nfm_reply only carries the last
    // row, so the session is the source of truth for the build.
    if (screen === 'PACKAGE') {
      const list = Array.isArray(session?.answers?.packages_list)
        ? session.answers.packages_list.slice()
        : [];
      const name = String(data.pkgname || '').trim();
      if (name) {
        list.push({
          name,
          price: String(data.pkgprice || '').trim(),
          duration: String(data.pkgdur || '').trim(),
          includes: String(data.pkgincl || '').trim(),
        });
      }
      if (flowToken) {
        const answersPatch = { packages_list: list };
        // Currency dropdown is shown on the first package only; persist it the
        // first time it arrives so the build can prefix every package price.
        if (data.currency && !session?.answers?.currency) {
          answersPatch.currency = String(data.currency).trim().slice(0, 8);
        }
        await patchSession(flowToken, { answersPatch })
          .catch((err) => logger.warn(`[FLOW] persist PACKAGE failed: ${err.message}`));
      }
      // "add" → loop for one more (only if they named this one), capped at 6.
      if (data.addmore === 'add' && name && list.length < 6) {
        logger.info(`[FLOW] PACKAGE loop (${list.length} so far) token=${flowToken}`);
        return packageScreen(lang, list);
      }
      return finishScreen(lang);
    }

    // AGENT (real estate) → persist structured agent fields, init the
    // listings accumulator → LISTING loop.
    if (screen === 'AGENT') {
      if (flowToken) {
        await patchSession(flowToken, {
          answersPatch: {
            currency: data.currency || '',
            brokerage: data.brokerage || '',
            years: data.years || '',
            designations: data.designations || '',
            listings_list: [],
          },
        }).catch((err) => logger.warn(`[FLOW] persist AGENT failed: ${err.message}`));
      }
      return listingScreen(lang, []);
    }

    // SALON → persist currency/booking/hours → go to SERVICE (collect
    // services one at a time, structured).
    if (screen === 'SALON') {
      if (flowToken) {
        await patchSession(flowToken, {
          answersPatch: {
            currency: data.currency || '',
            booking: data.booking || '',
            booking_link: data.booking_link || '',
            hours: data.hours || '',
            services_list: [],
          },
        }).catch((err) => logger.warn(`[FLOW] persist SALON failed: ${err.message}`));
      }
      return serviceScreen(lang, []);
    }

    // SERVICE → append this service, then loop ("add another" → refresh
    // the SERVICE screen) or proceed to FINISH. The accumulated list lives
    // in the session (services_list); the nfm_reply only carries the last
    // row, so the session is the source of truth for the build.
    if (screen === 'SERVICE') {
      const list = Array.isArray(session?.answers?.services_list)
        ? session.answers.services_list.slice()
        : [];
      const name = String(data.sname || '').trim();
      if (name) {
        list.push({
          name,
          price: String(data.sprice || '').trim(),
          duration: String(data.sdur || '').trim(),
        });
      }
      if (flowToken) {
        await patchSession(flowToken, { answersPatch: { services_list: list } })
          .catch((err) => logger.warn(`[FLOW] persist SERVICE failed: ${err.message}`));
      }
      // "add" → loop for one more (only if they actually named this one);
      // anything else (done / blank) → proceed.
      if (data.addmore === 'add' && name) {
        logger.info(`[FLOW] SERVICE loop (${list.length} so far) token=${flowToken}`);
        return serviceScreen(lang, list);
      }
      return finishScreen(lang);
    }

    // DETAILS → persist the generic answers. HVAC then collects services on
    // the structured HVAC_SERVICE loop; portfolio/general go to FINISH. (Real
    // estate no longer routes here — it uses AGENT → LISTING.)
    if (screen === 'DETAILS') {
      const hvac = (session?.theme) === 'hvac';
      if (flowToken) {
        const answersPatch = { currency: data.currency || '', f1: data.f1 || '', f2: data.f2 || '' };
        // Portfolio niche dropdown (hidden/blank for other themes).
        if (data.portfolio_niche) answersPatch.portfolio_niche = String(data.portfolio_niche);
        if (hvac) answersPatch.hvac_services = [];
        await patchSession(flowToken, { answersPatch })
          .catch((err) => logger.warn(`[FLOW] persist DETAILS failed: ${err.message}`));
      }
      return hvac ? hvacServiceScreen(lang, []) : finishScreen(lang);
    }

    // HVAC_SERVICE → append this service name, then loop ("add another" →
    // refresh) or proceed to FINISH. The list lives in the session.
    if (screen === 'HVAC_SERVICE') {
      const list = Array.isArray(session?.answers?.hvac_services)
        ? session.answers.hvac_services.slice()
        : [];
      const name = String(data.sname || '').trim();
      if (name) list.push(name.slice(0, 60));
      if (flowToken) {
        await patchSession(flowToken, { answersPatch: { hvac_services: list } })
          .catch((err) => logger.warn(`[FLOW] persist HVAC_SERVICE failed: ${err.message}`));
      }
      if (data.addmore === 'add' && name && list.length < 10) {
        logger.info(`[FLOW] HVAC_SERVICE loop (${list.length} so far) token=${flowToken}`);
        return hvacServiceScreen(lang, list);
      }
      return finishScreen(lang);
    }

    // LISTING → append this listing (+ its optional photo descriptor), then
    // loop ("add another" → refresh the LISTING screen) or proceed to FINISH.
    // The accumulated list lives in the session (listings_list); the nfm_reply
    // only carries the last row, so the session is the source of truth.
    if (screen === 'LISTING') {
      const list = Array.isArray(session?.answers?.listings_list)
        ? session.answers.listings_list.slice()
        : [];
      const address = String(data.address || '').trim();
      if (address) {
        const entry = {
          address,
          price: String(data.price || '').trim(),
          status: String(data.status || '').trim(),
          beds: String(data.beds || '').trim(),
          baths: String(data.baths || '').trim(),
          sqft: String(data.sqft || '').trim(),
          neighborhood: String(data.neighborhood || '').trim(),
        };
        // Optional PhotoPicker — stash the raw media descriptor; decrypt +
        // upload happens at completion (off this endpoint's response budget).
        if (Array.isArray(data.photo) && data.photo.length) entry.photo_media = data.photo;
        list.push(entry);
      }
      if (flowToken) {
        await patchSession(flowToken, { answersPatch: { listings_list: list } })
          .catch((err) => logger.warn(`[FLOW] persist LISTING failed: ${err.message}`));
      }
      // "add" → loop for one more (only if they gave an address, and we're
      // under the 3-listing cap the site layout + web form use); anything
      // else (done / blank / cap reached) → proceed.
      if (data.addmore === 'add' && address && list.length < 3) {
        logger.info(`[FLOW] LISTING loop (${list.length} so far) token=${flowToken}`);
        return listingScreen(lang, list);
      }
      return finishScreen(lang);
    }

    // FINISH → persist the 3 contact fields → terminal SUCCESS. The build
    // is triggered by the webhook nfm_reply handler.
    if (screen === 'FINISH') {
      // Validate the phone (optional field) against the picked country code by
      // digit count. On a mismatch, re-render FINISH with a snackbar error
      // (error_message) — WhatsApp keeps the user on the screen WITH their
      // typed input, so they can fix the number or clear it to skip.
      const cCode = String(data.c_code || '').trim();
      const cPhone = String(data.c_phone || '').trim();
      if (cPhone && cCode) {
        const { validatePhoneForCode } = require('./countryCodes');
        const res = validatePhoneForCode(cCode, cPhone);
        if (!res.valid) {
          logger.info(`[FLOW] FINISH phone rejected (code=${cCode} len=${res.length}) token=${flowToken}`);
          const screenData = finishScreen(lang).data;
          const base = (L[lang] && L[lang].phone_error) || L.en.phone_error;
          // Append the expected digit count (language-neutral) as a hint when
          // we have one for this country.
          screenData.error_message = res.expected && res.expected.length
            ? `${base} (${res.expected.join('/')})`
            : base;
          return { screen: 'FINISH', data: screenData };
        }
      }
      if (flowToken) {
        await patchSession(flowToken, {
          answersPatch: {
            c_email: data.c_email || '',
            c_code: data.c_code || '',
            c_phone: data.c_phone || '',
            c_address: data.c_address || '',
          },
        }).catch((err) => logger.warn(`[FLOW] persist FINISH failed: ${err.message}`));
      }
      logger.info(`[FLOW] FINISH complete token=${flowToken}`);
      return {
        screen: 'SUCCESS',
        data: { extension_message_response: { params: { flow_token: flowToken } } },
      };
    }
  }

  logger.warn(`[FLOW] unhandled action="${action}" screen="${screen}" token=${flowToken}`);
  return { data: { acknowledged: true } };
}

module.exports = { handleFlow, commonScreen, salonScreen, serviceScreen, listingScreen, agentScreen, hvacServiceScreen, detailsScreen, pnicheScreen, portfolioScreen, portfolio2Screen, pexpScreen, projectScreen, packageScreen, finishScreen };
