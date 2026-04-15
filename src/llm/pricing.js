// Per-million-token USD rates for the models we actually call. When a new
// model is added, add a row here — any unknown model falls back to a
// conservative default so the cost shows as "0" rather than a wrong number.
const RATES = {
  // Anthropic
  'claude-sonnet-4-20250514':   { input: 3.00,  output: 15.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00,  output: 15.00 },
  'claude-3-5-haiku-20241022':  { input: 0.80,  output: 4.00 },
  'claude-opus-4-20250514':     { input: 15.00, output: 75.00 },

  // OpenAI chat
  'gpt-4o-mini':                { input: 0.15,  output: 0.60 },
  'gpt-4o':                     { input: 2.50,  output: 10.00 },
  'gpt-4-turbo':                { input: 10.00, output: 30.00 },

  // OpenAI embeddings (output cost effectively 0 — we only bill input tokens)
  'text-embedding-3-small':     { input: 0.02,  output: 0 },
  'text-embedding-3-large':     { input: 0.13,  output: 0 },
};

/**
 * Calculate USD cost for a single LLM call. Returns 0 for unknown models so
 * missing rates never silently inflate the visible cost.
 */
function costOf(model, inputTokens = 0, outputTokens = 0) {
  const rate = RATES[model];
  if (!rate) return 0;
  const costIn = (inputTokens / 1_000_000) * rate.input;
  const costOut = (outputTokens / 1_000_000) * rate.output;
  return Number((costIn + costOut).toFixed(6));
}

module.exports = { RATES, costOf };
