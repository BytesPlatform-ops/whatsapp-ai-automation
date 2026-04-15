const { supabase } = require('../config/database');
const { withRetry, throwIfNetworkError } = require('./retry');
const { logger } = require('../utils/logger');

/**
 * Insert a row into llm_usage. Fire-and-forget semantics — a failure here
 * should never break the user-facing LLM call, so we swallow errors after
 * logging them.
 */
async function recordUsage({ userId, operation, provider, model, inputTokens, outputTokens, costUsd, durationMs }) {
  if (!userId) return; // unattributed calls — skip DB write
  try {
    await withRetry(async () => {
      const { error } = await supabase.from('llm_usage').insert({
        user_id: userId,
        operation: operation || 'unknown',
        provider,
        model,
        input_tokens: inputTokens || 0,
        output_tokens: outputTokens || 0,
        cost_usd: costUsd || 0,
        duration_ms: durationMs || null,
      });
      throwIfNetworkError(error);
      if (error) throw new Error(`Failed to record llm_usage: ${error.message}`);
    }, 'recordUsage');
  } catch (err) {
    logger.warn(`[llmUsage] recordUsage failed (non-fatal): ${err.message}`);
  }
}

/**
 * Fetch per-user LLM usage with totals and a per-operation breakdown.
 */
async function getUsageForUser(userId) {
  return await withRetry(async () => {
    const { data, error } = await supabase
      .from('llm_usage')
      .select('operation, provider, model, input_tokens, output_tokens, cost_usd, duration_ms, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    throwIfNetworkError(error);
    if (error) throw new Error(`Failed to fetch llm_usage: ${error.message}`);

    const rows = data || [];
    const totals = rows.reduce(
      (acc, r) => {
        acc.input_tokens += r.input_tokens || 0;
        acc.output_tokens += r.output_tokens || 0;
        acc.cost_usd += Number(r.cost_usd || 0);
        acc.calls += 1;
        return acc;
      },
      { input_tokens: 0, output_tokens: 0, cost_usd: 0, calls: 0 }
    );
    totals.cost_usd = Number(totals.cost_usd.toFixed(6));

    // Breakdown grouped by operation.
    const byOp = {};
    for (const r of rows) {
      const key = r.operation;
      if (!byOp[key]) {
        byOp[key] = { operation: key, calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0, models: new Set() };
      }
      byOp[key].calls += 1;
      byOp[key].input_tokens += r.input_tokens || 0;
      byOp[key].output_tokens += r.output_tokens || 0;
      byOp[key].cost_usd += Number(r.cost_usd || 0);
      byOp[key].models.add(r.model);
    }
    const breakdown = Object.values(byOp)
      .map((o) => ({ ...o, cost_usd: Number(o.cost_usd.toFixed(6)), models: Array.from(o.models) }))
      .sort((a, b) => b.cost_usd - a.cost_usd);

    return { totals, breakdown, rows };
  }, 'getUsageForUser');
}

module.exports = { recordUsage, getUsageForUser };
