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

async function generateResponse(systemPrompt, messages) {
  const anthropic = getClient();

  const formattedMessages = messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: formattedMessages,
    });

    return response.content[0].text;
  } catch (error) {
    logger.error('Claude API error:', error);
    throw error;
  }
}

module.exports = { generateResponse };
