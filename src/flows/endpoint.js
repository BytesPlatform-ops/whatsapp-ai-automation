'use strict';

// The Flow endpoint "brain". Pure decision logic — no crypto, no HTTP.
// Given the decrypted request + the resolved language, it drives the
// 3-screen state machine and returns the next screen + its data.
//
//   ping                          → health check
//   INIT                          → render COMMON labels
//   data_exchange @ COMMON        → classify theme, render THEME questions
//   data_exchange @ THEME         → render FINISH (contact) labels
//   data_exchange @ FINISH        → SUCCESS terminal (build handed off
//                                   to the webhook nfm_reply handler)
//
// Answers are persisted per screen via the store so the final webhook
// has everything even though the response payloads stay small.

const { Q, L, classifyTheme, q } = require('./questionBank');
const { getSession, patchSession } = require('./store');
const { logger } = require('../utils/logger');

// Build the data object for the THEME screen from a theme + language.
// Empty questions (q3/q4 for most non-salon themes) are hidden via the
// q*_visible booleans. Hidden fields still need a non-empty label (Flow
// validates labels even when not shown), so we substitute a placeholder.
function themeScreenData(theme, lang) {
  const t = Q[theme] || Q.general;
  const q2 = q(theme, 'q2', lang);
  const q3 = q(theme, 'q3', lang);
  const q4 = q(theme, 'q4', lang);
  return {
    theme_title: t.title[lang] || t.title.en,
    q1_label: q(theme, 'q1', lang),
    q2_label: q2 || '—',
    q3_label: q3 || '—',
    q4_label: q4 || '—',
    q2_visible: !!q2,
    q3_visible: !!q3,
    q4_visible: !!q4,
    l_next: L[lang].next,
    _theme: theme,
  };
}

/**
 * @param {object} req decrypted request: { action, screen, data, flow_token, version }
 * @param {object} [ctx]
 * @param {string} [ctx.lang] resolved language ('en'|'pt'); falls back to
 *        the persisted session lang, then 'en'.
 * @returns {Promise<object>} the response object to encrypt + return
 */
async function handleFlow(req, ctx = {}) {
  const { action, screen, data = {}, flow_token: flowToken } = req || {};

  // Health check — Meta pings the endpoint. Must return this exact shape.
  if (action === 'ping') {
    return { data: { status: 'active' } };
  }

  // Client reported an error (e.g. decryption issue on their side).
  if (data && data.error) {
    logger.warn(`[FLOW] client error on token ${flowToken}: ${data.error}`);
    return { data: { acknowledged: true } };
  }

  // Resolve language: explicit ctx > persisted session > 'en'.
  let lang = ctx.lang;
  let session = null;
  if (flowToken) {
    try {
      session = await getSession(flowToken);
    } catch (err) {
      logger.warn(`[FLOW] getSession(${flowToken}) failed: ${err.message}`);
    }
  }
  if (!lang) lang = session?.lang || 'en';
  if (!L[lang]) lang = 'en';

  // INIT — first screen load. Return COMMON labels.
  if (action === 'INIT') {
    return {
      screen: 'COMMON',
      data: {
        l_name: L[lang].name,
        l_email: L[lang].email,
        l_industry: L[lang].industry,
        l_next: L[lang].next,
      },
    };
  }

  if (action === 'data_exchange') {
    // After COMMON → classify theme, persist, render THEME questions.
    if (screen === 'COMMON') {
      const businessName = String(data.business_name || '').trim();
      const email = String(data.email || '').trim();
      const industry = String(data.industry || '').trim();
      const theme = classifyTheme(industry);

      if (flowToken) {
        await patchSession(flowToken, {
          answersPatch: { business_name: businessName, email, industry },
          theme,
          lang,
        }).catch((err) => logger.warn(`[FLOW] persist COMMON failed: ${err.message}`));
      }
      logger.info(`[FLOW] COMMON → theme=${theme} lang=${lang} token=${flowToken}`);

      return { screen: 'THEME', data: themeScreenData(theme, lang) };
    }

    // After THEME → persist answers, render FINISH (contact) screen.
    if (screen === 'THEME') {
      const themeAnswers = {
        a1: data.a1 || '',
        a2: data.a2 || '',
        a3: data.a3 || '',
        a4: data.a4 || '',
      };
      if (flowToken) {
        await patchSession(flowToken, { answersPatch: themeAnswers })
          .catch((err) => logger.warn(`[FLOW] persist THEME failed: ${err.message}`));
      }
      return {
        screen: 'FINISH',
        data: {
          finish_title: L[lang].finish_title,
          l_contact: L[lang].contact,
          l_build: L[lang].build,
        },
      };
    }

    // After FINISH → persist contact, complete. The actual build is
    // triggered by the webhook nfm_reply handler (it gets the full
    // payload from Meta); here we just persist + return the terminal
    // SUCCESS response Meta expects.
    if (screen === 'FINISH') {
      if (flowToken) {
        await patchSession(flowToken, {
          answersPatch: { contact_info: data.contact_info || '' },
        }).catch((err) => logger.warn(`[FLOW] persist FINISH failed: ${err.message}`));
      }
      logger.info(`[FLOW] FINISH complete token=${flowToken}`);
      return {
        screen: 'SUCCESS',
        data: {
          extension_message_response: {
            params: { flow_token: flowToken },
          },
        },
      };
    }
  }

  // Unknown action/screen — return a benign ack so we never hard-fail.
  logger.warn(`[FLOW] unhandled action="${action}" screen="${screen}" token=${flowToken}`);
  return { data: { acknowledged: true } };
}

module.exports = { handleFlow, themeScreenData };
