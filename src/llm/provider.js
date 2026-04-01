const { env } = require('../config/env');
const claude = require('./claude');
const openai = require('./openai');
const { logger } = require('../utils/logger');

/**
 * Generate a chat response using the configured LLM provider.
 * @param {string} systemPrompt - The system/context prompt
 * @param {Array<{role: string, content: string}>} messages - Conversation messages
 * @returns {Promise<string>} The generated response text
 */
async function generateResponse(systemPrompt, messages) {
  const provider = env.llm.provider;

  if (provider === 'openai') {
    return openai.generateResponse(systemPrompt, messages);
  }
  // Default to Claude
  return claude.generateResponse(systemPrompt, messages);
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
