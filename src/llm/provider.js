const { env } = require('../config/env');
const claude = require('./claude');
const openai = require('./openai');
const { logger } = require('../utils/logger');
const { costOf } = require('./pricing');
const { recordUsage } = require('../db/llmUsage');

/**
 * Generate a chat response using the configured LLM provider.
 *
 * @param {string} systemPrompt
 * @param {Array<{role: string, content: string}>} messages
 * @param {{ userId?: string, operation?: string }} [options]
 *   When userId is supplied, token usage + cost is persisted to the
 *   `llm_usage` table so the admin dashboard can show a per-conversation
 *   pricing breakdown. `operation` should be a short tag describing what
 *   this call was for ('webdev_extract', 'website_content', 'sales_chat',
 *   etc.) — anything unset lands in the "unknown" bucket.
 * @returns {Promise<string>} The generated response text.
 */
// Default per-call timeout for LLM generations. Without this the call can
// stall forever on a dead socket and any handler awaiting it just hangs,
// which manifests to the user as the bot silently ignoring them. 90s is
// generous for even long website-content generations; anything beyond that
// is almost certainly a network/API problem worth surfacing.
const DEFAULT_LLM_TIMEOUT_MS = 90_000;

async function generateResponse(systemPrompt, messages, options = {}) {
  const provider = env.llm.provider;
  const impl = provider === 'openai' ? openai : claude;
  const start = Date.now();

  // Replace {{WEBSITE_PRICE}} / {{REVISION_PRICE}} / etc. in the prompt
  // with the admin-managed values from settings cache. Doing it here
  // (single chokepoint) means every prompt that wants live pricing just
  // needs the token; no call site needs to know.
  let renderedSystemPrompt = systemPrompt;
  try {
    const { applyPricingTokens } = require('../db/settings');
    renderedSystemPrompt = applyPricingTokens(systemPrompt);
  } catch (_) {
    /* settings module missing → ship the prompt as-is */
  }

  const timeoutMs = options.timeoutMs || DEFAULT_LLM_TIMEOUT_MS;
  const result = await Promise.race([
    impl.generateResponseWithUsage(renderedSystemPrompt, messages),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`LLM call timed out after ${timeoutMs}ms (operation=${options.operation || 'unknown'})`)),
        timeoutMs
      )
    ),
  ]);
  const {
    text,
    model,
    provider: providerName,
    inputTokens = 0,
    outputTokens = 0,
    cachedInputTokens = 0,
    cacheWriteTokens = 0,
  } = result;

  const durationMs = Date.now() - start;
  const cost_usd = costOf(model, inputTokens, outputTokens, cachedInputTokens, cacheWriteTokens);

  // Fire-and-forget — recordUsage swallows its own errors.
  recordUsage({
    userId: options.userId,
    operation: options.operation || 'unknown',
    provider: providerName,
    model,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    costUsd: cost_usd,
    durationMs,
  });

  return text;
}

/**
 * Generate an embedding vector for text.
 * Always uses OpenAI (text-embedding-3-small) regardless of chat provider.
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} Embedding vector (1536 dimensions)
 */
async function generateEmbedding(text) {
  return openai.generateEmbedding(text);
}

module.exports = { generateResponse, generateEmbedding };
