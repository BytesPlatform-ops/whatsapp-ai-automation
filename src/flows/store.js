'use strict';

// Flow session persistence. Keyed by flow_token (unique per Flow send).
// Survives the multi-screen exchange and a server restart so collected
// answers aren't lost mid-flow. See migrations/024_flow_sessions.sql.

const { supabase } = require('../config/database');
const { withRetry, throwIfNetworkError } = require('../db/retry');
const { logger } = require('../utils/logger');

/**
 * Create a session row when we send the Flow to a user. Stores the
 * resolved language, the user's wa_id, which number they messaged, and
 * the ctwa_clid for later CAPI attribution.
 */
async function createSession({ flowToken, waId, phoneNumberId, userId, lang, ctwaClid }) {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('flow_sessions')
      .upsert({
        flow_token: flowToken,
        wa_id: waId || null,
        phone_number_id: phoneNumberId || null,
        user_id: userId || null,
        lang: lang || 'en',
        ctwa_clid: ctwaClid || null,
        answers: {},
        status: 'open',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'flow_token' })
      .select()
      .single();
    throwIfNetworkError(error);
    if (error) throw new Error(`createSession failed: ${error.message}`);
    return data;
  }, 'flowStore:create');
}

async function getSession(flowToken) {
  if (!flowToken) return null;
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('flow_sessions')
      .select('*')
      .eq('flow_token', flowToken)
      .maybeSingle();
    throwIfNetworkError(error);
    if (error) throw new Error(`getSession failed: ${error.message}`);
    return data;
  }, 'flowStore:get');
}

/**
 * Merge a patch into the session. `answersPatch` is shallow-merged into
 * the existing answers JSON; top-level columns (lang, theme, status,
 * submitted_at) are set directly when provided.
 */
async function patchSession(flowToken, { answersPatch, theme, lang, status, submittedAt } = {}) {
  if (!flowToken) return null;
  return withRetry(async () => {
    const existing = await getSession(flowToken);
    const mergedAnswers = { ...(existing?.answers || {}), ...(answersPatch || {}) };
    const update = {
      answers: mergedAnswers,
      updated_at: new Date().toISOString(),
    };
    if (theme !== undefined) update.theme = theme;
    if (lang !== undefined) update.lang = lang;
    if (status !== undefined) update.status = status;
    if (submittedAt !== undefined) update.submitted_at = submittedAt;

    const { data, error } = await supabase
      .from('flow_sessions')
      .update(update)
      .eq('flow_token', flowToken)
      .select()
      .single();
    throwIfNetworkError(error);
    if (error) throw new Error(`patchSession failed: ${error.message}`);
    return data;
  }, 'flowStore:patch');
}

async function markSubmitted(flowToken) {
  return patchSession(flowToken, { status: 'submitted', submittedAt: new Date().toISOString() });
}

module.exports = { createSession, getSession, patchSession, markSubmitted };
