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

async function generateResponse(systemPrompt, messages) {
  const openai = getClient();

  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 2048,
      messages: formattedMessages,
    });

    return response.choices[0].message.content;
  } catch (error) {
    logger.error('OpenAI API error:', error);
    throw error;
  }
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

module.exports = { generateResponse, generateEmbedding };
