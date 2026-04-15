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

/**
 * Call Claude and return both the text and raw usage metadata so the
 * caller (provider.js) can record cost. Signature is kept backwards-
 * compatible via `generateResponse` below, which strips usage.
 */
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
      system: systemPrompt,
      messages: formattedMessages,
    });

    return {
      text: response.content[0].text,
      model: MODEL,
      provider: 'claude',
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
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
