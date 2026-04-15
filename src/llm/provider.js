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
async function generateResponse(systemPrompt, messages, options = {}) {
  const provider = env.llm.provider;
  const impl = provider === 'openai' ? openai : claude;
  const start = Date.now();

  const { text, model, provider: providerName, inputTokens, outputTokens } =
    await impl.generateResponseWithUsage(systemPrompt, messages);

  const durationMs = Date.now() - start;
  const cost_usd = costOf(model, inputTokens, outputTokens);

  // Fire-and-forget — recordUsage swallows its own errors.
  recordUsage({
    userId: options.userId,
    operation: options.operation || 'unknown',
    provider: providerName,
    model,
    inputTokens,
    outputTokens,
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
