// Per-million-token USD rates for the models we actually call. Each row has
// fresh `input`, `cached` (prompt-cache read), and `write` (prompt-cache write,
// Anthropic only) rates. Output is always fresh.
//
// OpenAI: cached reads are 50% of input. No cache-write premium.
// Anthropic: cached reads are 10% of input. Cache writes are 125% of input.
const RATES = {
  // Anthropic
  'claude-sonnet-4-20250514':   { input: 3.00,  output: 15.00, cached: 0.30,  write: 3.75 },
  'claude-3-5-sonnet-20241022': { input: 3.00,  output: 15.00, cached: 0.30,  write: 3.75 },
  'claude-3-5-haiku-20241022':  { input: 0.80,  output: 4.00,  cached: 0.08,  write: 1.00 },
  'claude-opus-4-20250514':     { input: 15.00, output: 75.00, cached: 1.50,  write: 18.75 },

  // OpenAI chat
  'gpt-5':                      { input: 1.25,  output: 10.00, cached: 0.125, write: 1.25 },
  'gpt-5-mini':                 { input: 0.25,  output: 2.00,  cached: 0.025, write: 0.25 },
  'gpt-5-nano':                 { input: 0.05,  output: 0.40,  cached: 0.005, write: 0.05 },
  'gpt-4o-mini':                { input: 0.15,  output: 0.60,  cached: 0.075, write: 0.15 },
  'gpt-4o':                     { input: 2.50,  output: 10.00, cached: 1.25,  write: 2.50 },
  'gpt-4-turbo':                { input: 10.00, output: 30.00, cached: 10.00, write: 10.00 },

  // OpenAI embeddings (no output, no caching)
  'text-embedding-3-small':     { input: 0.02,  output: 0,     cached: 0.02,  write: 0.02 },
  'text-embedding-3-large':     { input: 0.13,  output: 0,     cached: 0.13,  write: 0.13 },
};

/**
 * Cost in USD for a single LLM call. Unknown models return 0 so missing
 * rates never silently inflate the visible cost.
 *
 * @param {string} model
 * @param {number} [inputTokens=0]        Fresh input (billed at full rate)
 * @param {number} [outputTokens=0]       Completion tokens
 * @param {number} [cachedInputTokens=0]  Prompt-cache reads
 * @param {number} [cacheWriteTokens=0]   Prompt-cache writes (Anthropic only)
 */
function costOf(model, inputTokens = 0, outputTokens = 0, cachedInputTokens = 0, cacheWriteTokens = 0) {
  const rate = RATES[model];
  if (!rate) return 0;
  const M = 1_000_000;
  const cost =
    (inputTokens / M) * rate.input +
    (outputTokens / M) * rate.output +
    (cachedInputTokens / M) * rate.cached +
    (cacheWriteTokens / M) * rate.write;
  return Number(cost.toFixed(6));
}

module.exports = { RATES, costOf };
