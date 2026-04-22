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

const MODEL = 'gpt-5';

// gpt-5 / gpt-5-mini / gpt-5-nano require `max_completion_tokens` and don't
// accept the legacy `max_tokens`. Older 4.x models accept both. Pick the
// right param name at request time so the same code path works for either.
const USES_COMPLETION_TOKENS = /^gpt-5/.test(MODEL);

async function generateResponseWithUsage(systemPrompt, messages) {
  const openai = getClient();

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
      model: MODEL,
      messages: formattedMessages,
    };
    if (USES_COMPLETION_TOKENS) {
      // gpt-5 counts reasoning tokens toward max_completion_tokens. With
      // reasoning on by default, a tight budget gets burned entirely on
      // invisible thinking and returns empty content. `reasoning_effort:
      // minimal` effectively disables reasoning for chat-style outputs
      // (sub-3-second WhatsApp replies don't need deep deliberation), and
      // we keep a generous 4096-token ceiling as a safety margin.
      request.max_completion_tokens = 4096;
      request.reasoning_effort = 'minimal';
    } else {
      request.max_tokens = 2048;
    }
    const response = await openai.chat.completions.create(request);

    const promptTokens = response.usage?.prompt_tokens || 0;
    const cachedInputTokens = response.usage?.prompt_tokens_details?.cached_tokens || 0;

    return {
      text: response.choices[0].message.content,
      model: MODEL,
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
      model: MODEL,
      status: error?.status,
      code: error?.code,
      type: error?.type,
      param: error?.param,
      message: error?.message,
    });
    throw error;
  }
}

async function generateResponse(systemPrompt, messages) {
  const { text } = await generateResponseWithUsage(systemPrompt, messages);
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
