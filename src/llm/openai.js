const OpenAI = require('openai');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

let client = null;

function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: env.llm.openaiApiKey });
  }
  return client;
}

const MODEL = 'gpt-4o-mini';

// Per-call model override is supported via `opts.model`. Use it sparingly
// for calls that truly need better reasoning / entity extraction
// (messageAnalyzer, structured-JSON parsers). Telemetry records the model
// name on each call so cost telemetry splits cleanly per model.
async function generateResponseWithUsage(systemPrompt, messages, opts = {}) {
  const openai = getClient();
  const model = opts.model || MODEL;

  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
  ];

  try {
    // OpenAI prompt caching is automatic for prompts ≥1024 tokens. We just
    // read back the `cached_tokens` counter so the provider can bill the
    // discounted rate for cache hits.
    const response = await openai.chat.completions.create({
      model,
      max_tokens: 2048,
      messages: formattedMessages,
    });

    const promptTokens = response.usage?.prompt_tokens || 0;
    const cachedInputTokens = response.usage?.prompt_tokens_details?.cached_tokens || 0;

    return {
      text: response.choices[0].message.content,
      model,
      provider: 'openai',
      // inputTokens excludes cached tokens so cost math can bill them separately.
      inputTokens: Math.max(0, promptTokens - cachedInputTokens),
      cachedInputTokens,
      outputTokens: response.usage?.completion_tokens || 0,
    };
  } catch (error) {
    logger.error('OpenAI API error:', error);
    throw error;
  }
}

async function generateResponse(systemPrompt, messages, opts = {}) {
  const { text } = await generateResponseWithUsage(systemPrompt, messages, opts);
  return text;
}

async function generateEmbedding(text) {
  const openai = getClient();

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    logger.error('OpenAI embedding error:', error);
    throw error;
  }
}

module.exports = { generateResponse, generateResponseWithUsage, generateEmbedding };
