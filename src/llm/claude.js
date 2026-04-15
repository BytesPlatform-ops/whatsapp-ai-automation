const Anthropic = require('@anthropic-ai/sdk');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: env.llm.anthropicApiKey });
  }
  return client;
}

const MODEL = 'claude-sonnet-4-20250514';

// Anthropic prompt caching requires system prompts to be sent as a structured
// block with `cache_control`. Prompts under ~1024 tokens aren't cacheable —
// the API still works but `cache_creation_input_tokens` / `cache_read_input_tokens`
// will stay 0. We always attach the marker; Anthropic ignores it when the
// prompt is too short to cache.
async function generateResponseWithUsage(systemPrompt, messages) {
  const anthropic = getClient();

  const formattedMessages = messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      ],
      messages: formattedMessages,
    });

    const u = response.usage || {};
    // Anthropic splits cached reads, cache writes, and fresh input across three
    // counters. provider.js sums them for the display total; pricing.js prices
    // them separately (reads at ~10%, writes at ~125%).
    return {
      text: response.content[0].text,
      model: MODEL,
      provider: 'claude',
      inputTokens: u.input_tokens || 0,
      cachedInputTokens: u.cache_read_input_tokens || 0,
      cacheWriteTokens: u.cache_creation_input_tokens || 0,
      outputTokens: u.output_tokens || 0,
    };
  } catch (error) {
    logger.error('Claude API error:', error);
    throw error;
  }
}

async function generateResponse(systemPrompt, messages) {
  const { text } = await generateResponseWithUsage(systemPrompt, messages);
  return text;
}

module.exports = { generateResponse, generateResponseWithUsage };
