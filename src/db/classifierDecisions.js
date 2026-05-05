// Per-turn classifier decision logger (Phase 1 — observability).
//
// Every LLM-driven classifier in the router pipeline records its verdict
// here, grouped by turn_id. The admin dashboard renders these inline
// with the conversation so a tester-bug report can be diagnosed in
// seconds: "the user said X — what did each classifier decide?"
//
// Critical invariant: this module MUST NEVER throw or block. Classifiers
// are on the bot's critical path; if observability fails, behavior is
// unchanged. Every public function catches its own errors and returns
// quietly.

const { supabase } = require('../config/database');
const { logger } = require('../utils/logger');
const { getUserId, getTurnId } = require('../messages/channelContext');

// Truncate large free-text fields so a runaway prompt doesn't bloat the
// table or the admin UI. 500 chars is enough to identify any user
// message in practice.
const MAX_TEXT = 500;

function truncate(s, n = MAX_TEXT) {
  if (s == null) return null;
  const str = String(s);
  return str.length <= n ? str : `${str.slice(0, n - 1)}…`;
}

/**
 * Record a single classifier's decision for the current turn.
 *
 * Args (all optional except `classifier`):
 *   classifier       — string, e.g. 'classifyUndoOrKeep' / 'correctionDetector'
 *   inputText        — what the user said (truncated to 500 chars)
 *   inputContext     — { undoPending, currentState, … } — anything that
 *                      shaped the classifier's decision
 *   output           — the classifier's structured verdict (kind / intent /
 *                      field / value / confidence / …)
 *   latencyMs        — how long the LLM call took
 *   userId           — fallback if not in channelContext (proactive paths)
 *   turnId           — fallback if not in channelContext
 *
 * Fire-and-forget. Never throws. Never awaits the caller — internally
 * the supabase insert is awaited but errors are swallowed.
 */
async function recordClassifierDecision({
  classifier,
  inputText = null,
  inputContext = {},
  output = {},
  latencyMs = null,
  userId = null,
  turnId = null,
} = {}) {
  if (!classifier) return;
  try {
    const resolvedUserId = userId || getUserId();
    const resolvedTurnId = turnId || getTurnId();
    if (!resolvedUserId || !resolvedTurnId) {
      // No user / turn context — most likely a background job classifier
      // (followup scheduler, etc.). Skip silently; nothing useful to log.
      return;
    }
    const { error } = await supabase.from('classifier_decisions').insert({
      user_id: resolvedUserId,
      turn_id: resolvedTurnId,
      classifier: String(classifier).slice(0, 80),
      input_text: truncate(inputText),
      input_context: inputContext || {},
      output: output || {},
      latency_ms: typeof latencyMs === 'number' ? Math.round(latencyMs) : null,
    });
    if (error) {
      // Only WARN — never throw. The classifier already returned a
      // verdict; failing to log it is a missing trace, not a broken bot.
      logger.warn(`[CLASSIFIER-LOG] insert failed for ${classifier}: ${error.message}`);
    }
  } catch (err) {
    logger.warn(`[CLASSIFIER-LOG] threw for ${classifier}: ${err.message}`);
  }
}

/**
 * Wrap a classifier call with timing + automatic decision recording.
 * Use this inside a classifier function to remove boilerplate:
 *
 *   const verdict = await withDecisionLogging(
 *     'classifyUndoOrKeep',
 *     { inputText: text, inputContext: { undoPending } },
 *     async () => runTheActualLlmCallAndReturnVerdict()
 *   );
 *   return verdict;
 *
 * Returns whatever the wrapped fn returns. Errors in the fn are
 * re-thrown so the classifier's own error path runs (we just log a
 * 'threw' decision so the trace shows the failure).
 */
async function withDecisionLogging(classifier, { inputText = null, inputContext = {} } = {}, fn) {
  const start = Date.now();
  try {
    const output = await fn();
    recordClassifierDecision({
      classifier,
      inputText,
      inputContext,
      output: typeof output === 'object' && output !== null ? output : { value: output },
      latencyMs: Date.now() - start,
    }).catch(() => {});
    return output;
  } catch (err) {
    recordClassifierDecision({
      classifier,
      inputText,
      inputContext,
      output: { threw: true, message: String(err && err.message || err).slice(0, 200) },
      latencyMs: Date.now() - start,
    }).catch(() => {});
    throw err;
  }
}

/**
 * Fetch all classifier decisions for a user, ordered by time.
 * Used by the admin dashboard's per-turn trace panel.
 *
 * Returns rows newest-first. Caller groups by turn_id in JS.
 */
async function getDecisionsForUser(userId, { limit = 500 } = {}) {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('classifier_decisions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      logger.warn(`[CLASSIFIER-LOG] read failed for user ${userId}: ${error.message}`);
      return [];
    }
    return data || [];
  } catch (err) {
    logger.warn(`[CLASSIFIER-LOG] getDecisionsForUser threw: ${err.message}`);
    return [];
  }
}

module.exports = {
  recordClassifierDecision,
  withDecisionLogging,
  getDecisionsForUser,
};
