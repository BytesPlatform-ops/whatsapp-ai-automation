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

// Default model for user-facing replies. Helper/classifier call sites pass
// `{ model: 'gpt-5.4-nano' }` to use the cheaper, faster nano variant.
const DEFAULT_MODEL = 'gpt-5.4-mini';

// gpt-5 family models require `max_completion_tokens` and don't accept the
// legacy `max_tokens`. Older 4.x models accept both.
function usesCompletionTokens(model) {
  return /^gpt-5/.test(model);
}

async function generateResponseWithUsage(systemPrompt, messages, options = {}) {
  const openai = getClient();
  const model = options.model || DEFAULT_MODEL;

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
    const request = {
      model,
      messages: formattedMessages,
    };
    if (usesCompletionTokens(model)) {
      // gpt-5 family counts reasoning tokens toward max_completion_tokens.
      // With reasoning on by default, a tight budget gets burned entirely
      // on invisible thinking and returns empty content. `reasoning_effort:
      // none` disables reasoning for chat-style outputs (sub-3-second
      // WhatsApp replies don't need deep deliberation). 5.0 used 'minimal'
      // as the off-switch; 5.4+ renamed it to 'none'. We keep a generous
      // 4096-token ceiling as a safety margin.
      request.max_completion_tokens = 4096;
      request.reasoning_effort = 'none';
    } else {
      request.max_tokens = 2048;
    }
    const response = await openai.chat.completions.create(request);

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
    // Surface the OpenAI-specific fields so "model not found" / "rate
    // limit" / auth issues are visible in one log line instead of the
    // generic "API error:" dump.
    logger.error('OpenAI API error:', {
      model: options.model || DEFAULT_MODEL,
      status: error?.status,
      code: error?.code,
      type: error?.type,
      param: error?.param,
      message: error?.message,
    });
    throw error;
  }
}

async function generateResponse(systemPrompt, messages, options = {}) {
  const { text } = await generateResponseWithUsage(systemPrompt, messages, options);
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
