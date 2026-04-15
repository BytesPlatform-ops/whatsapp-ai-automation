const { generateResponse } = require('../llm/provider');
const { WEBSITE_ANALYSIS_PROMPT } = require('../llm/prompts');
const { logger } = require('../utils/logger');

/**
 * Analyze scraped website data using LLM.
 * @param {Object} scrapedData - Output from scraper.js
 * @returns {Promise<string>} Analysis text
 */
async function analyzeWebsite(scrapedData, options = {}) {
  // Prepare a structured summary for the LLM
  const summary = `
WEBSITE: ${scrapedData.url}
LOAD TIME: ${scrapedData.loadTimeMs}ms
SSL: ${scrapedData.hasSSL ? 'Yes' : 'No'}

PAGE TITLE: ${scrapedData.title || '⚠️ MISSING'}
META DESCRIPTION: ${scrapedData.metaDescription || '⚠️ MISSING'}
META KEYWORDS: ${scrapedData.metaKeywords || 'Not set'}
LANGUAGE: ${scrapedData.language || 'Not set'}
CANONICAL URL: ${scrapedData.canonical || 'Not set'}

OPEN GRAPH:
- OG Title: ${scrapedData.ogTitle || '⚠️ MISSING'}
- OG Description: ${scrapedData.ogDescription || '⚠️ MISSING'}
- OG Image: ${scrapedData.ogImage || '⚠️ MISSING'}

HEADINGS:
- H1 tags (${scrapedData.h1?.length || 0}): ${(scrapedData.h1 || []).join(' | ') || 'None'}
- H2 tags (${scrapedData.h2?.length || 0}): ${(scrapedData.h2 || []).slice(0, 10).join(' | ') || 'None'}
- H3 tags (${scrapedData.h3?.length || 0}): ${(scrapedData.h3 || []).slice(0, 10).join(' | ') || 'None'}

IMAGES:
- Total images: ${scrapedData.totalImages}
- Missing alt tags: ${scrapedData.imagesWithoutAlt}

LINKS:
- Total links: ${scrapedData.totalLinks}
- External links: ${scrapedData.externalLinks}

CONTENT:
- Body text length: ${scrapedData.bodyTextLength} characters
- HTML size: ${Math.round(scrapedData.htmlSize / 1024)}KB

MOBILE:
- Viewport meta tag: ${scrapedData.hasViewport ? 'Yes' : '⚠️ MISSING'}
`.trim();

  logger.info(`[SEO:ANALYZER] Sending ${summary.length} chars of website data to LLM for analysis`);

  const analysis = await generateResponse(
    WEBSITE_ANALYSIS_PROMPT,
    [{ role: 'user', content: `Please analyze this website:\n\n${summary}` }],
    { userId: options.userId, operation: 'seo_analysis' }
  );

  logger.info(`[SEO:ANALYZER] LLM analysis received: ${analysis.length} chars`);
  return analysis;
}

module.exports = { analyzeWebsite };
