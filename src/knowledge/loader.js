/**
 * Knowledge Base Loader
 *
 * Reads markdown files from the knowledge/ directory, chunks them by sections,
 * generates embeddings, and stores them in the knowledge_chunks table.
 *
 * Run with: node src/knowledge/loader.js
 */

const fs = require('fs');
const path = require('path');
const { env, validateEnv } = require('../config/env');
const { supabase } = require('../config/database');
const { embedBatch } = require('./embeddings');
const { logger } = require('../utils/logger');

const KNOWLEDGE_DIR = path.join(__dirname, '..', '..', 'knowledge');

/**
 * Read and chunk a markdown file by ## headings.
 * Each chunk includes the heading and its content.
 */
function chunkMarkdownFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  const chunks = [];

  // Split by ## headings
  const sections = content.split(/^## /m);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.length < 20) continue;

    // Reconstruct the heading
    const text = sections.indexOf(section) === 0 ? trimmed : `## ${trimmed}`;

    // Further split if a section is too long (> 800 tokens ≈ ~3200 chars)
    if (text.length > 3200) {
      const paragraphs = text.split('\n\n');
      let currentChunk = '';

      for (const para of paragraphs) {
        if ((currentChunk + para).length > 3000) {
          if (currentChunk.trim()) {
            chunks.push({
              content: currentChunk.trim(),
              source_doc: fileName,
              category: getCategoryFromFilename(fileName),
            });
          }
          currentChunk = para + '\n\n';
        } else {
          currentChunk += para + '\n\n';
        }
      }

      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          source_doc: fileName,
          category: getCategoryFromFilename(fileName),
        });
      }
    } else {
      chunks.push({
        content: text,
        source_doc: fileName,
        category: getCategoryFromFilename(fileName),
      });
    }
  }

  return chunks;
}

function getCategoryFromFilename(filename) {
  const name = filename.replace('.md', '').toLowerCase();
  const categories = {
    services: 'services',
    pricing: 'pricing',
    faq: 'faq',
    'case-studies': 'case_studies',
  };
  return categories[name] || 'general';
}

/**
 * Load all knowledge base documents, chunk them, embed them, and store in DB.
 */
async function loadKnowledgeBase() {
  validateEnv();

  logger.info('Loading knowledge base from:', KNOWLEDGE_DIR);

  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    logger.error('Knowledge directory not found:', KNOWLEDGE_DIR);
    process.exit(1);
  }

  // Read all markdown files
  const files = fs.readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith('.md'));

  if (files.length === 0) {
    logger.warn('No markdown files found in knowledge directory');
    return;
  }

  // Chunk all files
  const allChunks = [];
  for (const file of files) {
    const filePath = path.join(KNOWLEDGE_DIR, file);
    const chunks = chunkMarkdownFile(filePath);
    allChunks.push(...chunks);
    logger.info(`Chunked ${file}: ${chunks.length} chunks`);
  }

  logger.info(`Total chunks: ${allChunks.length}`);

  // Generate embeddings
  logger.info('Generating embeddings... (this may take a moment)');
  const texts = allChunks.map((c) => c.content);
  const embeddings = await embedBatch(texts);

  // Prepare records with embeddings
  const records = allChunks.map((chunk, i) => ({
    ...chunk,
    embedding: embeddings[i],
  }));

  // Clear existing chunks
  logger.info('Clearing existing knowledge chunks...');
  await supabase.from('knowledge_chunks').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Insert new chunks
  logger.info('Inserting chunks into database...');

  // Insert in batches of 20
  for (let i = 0; i < records.length; i += 20) {
    const batch = records.slice(i, i + 20);
    const { error } = await supabase.from('knowledge_chunks').insert(batch);
    if (error) {
      logger.error(`Failed to insert batch ${i}:`, error);
      throw error;
    }
  }

  logger.info(`✅ Knowledge base loaded: ${records.length} chunks embedded and stored`);
}

// Run directly
if (require.main === module) {
  loadKnowledgeBase()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Knowledge base loading failed:', err);
      process.exit(1);
    });
}

module.exports = { loadKnowledgeBase, chunkMarkdownFile };
