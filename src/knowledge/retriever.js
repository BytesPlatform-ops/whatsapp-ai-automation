const { generateEmbedding } = require('../llm/provider');
const { logger } = require('../utils/logger');
const { supabase } = require('../config/database');

/**
 * Retrieve relevant knowledge chunks for a query using pgvector similarity search.
 * @param {string} query - The user's question/message
 * @param {number} limit - Number of chunks to retrieve
 * @param {number} minSimilarity - Minimum cosine similarity score (0–1). Chunks below this are discarded.
 * @returns {Promise<Array<{content: string, source_doc: string, similarity: number}>>}
 */
async function retrieveContext(query, limit = 5, minSimilarity = 0.72) {
  // Generate embedding for the query
  const embedding = await generateEmbedding(query);

  // Use pgvector cosine similarity search via an RPC function
  // This requires the match_knowledge_chunks function to be created in Supabase
  const { data, error } = await supabase.rpc('match_knowledge_chunks', {
    query_embedding: embedding,
    match_count: limit,
  });

  if (error) {
    logger.error('Knowledge retrieval error:', error);
    throw error;
  }

  // Only return chunks that are genuinely relevant
  const results = (data || []).filter((chunk) => chunk.similarity >= minSimilarity);

  if (results.length > 0) {
    logger.debug(
      `RAG: ${results.length} relevant chunk(s) found (top similarity: ${results[0].similarity.toFixed(3)})`
    );
  } else {
    logger.debug(`RAG: no chunks above threshold ${minSimilarity} - falling back to LLM`);
  }

  return results;
}

module.exports = { retrieveContext };
