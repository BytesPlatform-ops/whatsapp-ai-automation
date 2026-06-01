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
  classifyTheme, VALID_THEMES, INDUSTRY_OPTIONS, CURRENCY_OPTIONS,
  BOOKING_OPTIONS, DETAILS, L, pick,
} = require('./questionBank');
const { getSession, patchSession } = require('./store');
const { logger } = require('../utils/logger');

function commonScreen(lang) {
  return {
    screen: 'COMMON',
    data: {
      common_title: L[lang].common_title,
      l_name: L[lang].l_name,
      l_email: L[lang].l_email,
      l_industry: L[lang].l_industry,
      industry_options: INDUSTRY_OPTIONS[lang] || INDUSTRY_OPTIONS.en,
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
      l_booking: L[lang].l_booking,
      booking_options: BOOKING_OPTIONS[lang] || BOOKING_OPTIONS.en,
      l_hours: L[lang].l_hours,
      hours_helper: L[lang].hours_helper,
      l_services: L[lang].l_services,
      services_helper: L[lang].services_helper,
      l_next: L[lang].next,
    },
  };
}

function detailsScreen(theme, lang) {
  const d = DETAILS[theme] || DETAILS.general;
  const f2 = pick(d.f2, lang);
  return {
    screen: 'DETAILS',
    data: {
      details_title: pick(d.title, lang),
      f1_label: pick(d.f1, lang),
      f1_helper: pick(d.f1_helper, lang),
      f2_label: f2 || '—',
      f2_helper: pick(d.f2_helper, lang),
      f2_visible: !!f2,
      l_next: L[lang].next,
    },
  };
}

function finishScreen(lang) {
  return {
    screen: 'FINISH',
    data: {
      finish_title: L[lang].finish_title,
      l_cemail: L[lang].l_cemail,
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
  if (!L[lang]) lang = 'en';

  // INIT — flow opened. Return COMMON (labels + dropdown options).
  if (action === 'INIT') return commonScreen(lang);

  if (action === 'data_exchange') {
    // COMMON → classify (dropdown id = theme), route to the right screen.
    if (screen === 'COMMON') {
      const businessName = String(data.business_name || '').trim();
      const email = String(data.email || '').trim();
      const industryId = String(data.industry || '').trim();
      const theme = VALID_THEMES.includes(industryId) ? industryId : classifyTheme(industryId);

      if (flowToken) {
        await patchSession(flowToken, {
          answersPatch: { business_name: businessName, email, industry: industryId },
          theme, lang,
        }).catch((err) => logger.warn(`[FLOW] persist COMMON failed: ${err.message}`));
      }
      logger.info(`[FLOW] COMMON → theme=${theme} lang=${lang} token=${flowToken}`);

      return theme === 'salon' ? salonScreen(lang) : detailsScreen(theme, lang);
    }

    // SALON → persist tailored answers → FINISH.
    if (screen === 'SALON') {
      if (flowToken) {
        await patchSession(flowToken, {
          answersPatch: {
            currency: data.currency || '',
            booking: data.booking || '',
            hours: data.hours || '',
            services: data.services || '',
          },
        }).catch((err) => logger.warn(`[FLOW] persist SALON failed: ${err.message}`));
      }
      return finishScreen(lang);
    }

    // DETAILS → persist generic 2-field answers → FINISH.
    if (screen === 'DETAILS') {
      if (flowToken) {
        await patchSession(flowToken, {
          answersPatch: { f1: data.f1 || '', f2: data.f2 || '' },
        }).catch((err) => logger.warn(`[FLOW] persist DETAILS failed: ${err.message}`));
      }
      return finishScreen(lang);
    }

    // FINISH → persist the 3 contact fields → terminal SUCCESS. The build
    // is triggered by the webhook nfm_reply handler.
    if (screen === 'FINISH') {
      if (flowToken) {
        await patchSession(flowToken, {
          answersPatch: {
            c_email: data.c_email || '',
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

module.exports = { handleFlow, commonScreen, salonScreen, detailsScreen, finishScreen };
