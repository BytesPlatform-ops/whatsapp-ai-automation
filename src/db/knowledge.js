const { supabase } = require('../config/database');

async function insertChunks(chunks) {
  const { error } = await supabase
    .from('knowledge_chunks')
    .insert(chunks);

  if (error) throw new Error(`Failed to insert chunks: ${error.message}`);
}

async function clearChunks() {
  const { error } = await supabase
    .from('knowledge_chunks')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all

  if (error) throw new Error(`Failed to clear chunks: ${error.message}`);
}

async function searchChunks(embedding, limit = 5) {
  const { data, error } = await supabase
    .rpc('match_knowledge_chunks', {
      query_embedding: embedding,
      match_count: limit,
    });

  if (error) throw new Error(`Failed to search chunks: ${error.message}`);
  return data || [];
}

module.exports = { insertChunks, clearChunks, searchChunks };
