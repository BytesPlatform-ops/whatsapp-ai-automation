const { generateEmbedding } = require('../llm/provider');
const { logger } = require('../utils/logger');

/**
 * Generate embeddings for text chunks.
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} Embedding vector (1536 dimensions)
 */
async function embedText(text) {
  return generateEmbedding(text);
}

/**
 * Generate embeddings for multiple chunks in batch.
 * @param {string[]} texts - Array of text chunks
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
async function embedBatch(texts) {
  const embeddings = [];
  for (const text of texts) {
    const embedding = await embedText(text);
    embeddings.push(embedding);
    // Small delay to respect rate limits
    await new Promise((r) => setTimeout(r, 200));
  }
  return embeddings;
}

module.exports = { embedText, embedBatch };
