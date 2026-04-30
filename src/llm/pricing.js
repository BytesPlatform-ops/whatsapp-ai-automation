// Per-million-token USD rates for the models we actually call. Each row has
// fresh `input` and `cached` (prompt-cache read) rates. Output is always fresh.
//
// OpenAI prompt caching: cached reads are ~10% of input. No cache-write premium.
const RATES = {
  // OpenAI chat — primary models
  'gpt-5.4-mini':               { input: 0.75,  output: 4.50,  cached: 0.075 },
  'gpt-5.4-nano':               { input: 0.20,  output: 1.25,  cached: 0.020 },

  // OpenAI chat — legacy / kept for usage rows that pre-date the switch
  'gpt-5':                      { input: 1.25,  output: 10.00, cached: 0.125 },
  'gpt-5-mini':                 { input: 0.25,  output: 2.00,  cached: 0.025 },
  'gpt-5-nano':                 { input: 0.05,  output: 0.40,  cached: 0.005 },
  'gpt-4o-mini':                { input: 0.15,  output: 0.60,  cached: 0.075 },
  'gpt-4o':                     { input: 2.50,  output: 10.00, cached: 1.25  },
  'gpt-4-turbo':                { input: 10.00, output: 30.00, cached: 10.00 },

  // OpenAI embeddings (no output, no caching)
  'text-embedding-3-small':     { input: 0.02,  output: 0,     cached: 0.02 },
  'text-embedding-3-large':     { input: 0.13,  output: 0,     cached: 0.13 },
};

/**
 * Cost in USD for a single LLM call. Unknown models return 0 so missing
 * rates never silently inflate the visible cost.
 *
 * @param {string} model
 * @param {number} [inputTokens=0]        Fresh input (billed at full rate)
 * @param {number} [outputTokens=0]       Completion tokens
 * @param {number} [cachedInputTokens=0]  Prompt-cache reads
 */
function costOf(model, inputTokens = 0, outputTokens = 0, cachedInputTokens = 0) {
  const rate = RATES[model];
  if (!rate) return 0;
  const M = 1_000_000;
  const cost =
    (inputTokens / M) * rate.input +
    (outputTokens / M) * rate.output +
    (cachedInputTokens / M) * rate.cached;
  return Number(cost.toFixed(6));
}

module.exports = { RATES, costOf };
