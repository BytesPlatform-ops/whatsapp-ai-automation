const axios = require('axios');
const cheerio = require('cheerio');
const { logger } = require('../utils/logger');

/**
 * Scrape a website and extract key data for analysis.
 * Uses axios + cheerio (no headless browser needed for SEO metadata).
 * @param {string} url - The URL to scrape
 * @returns {Promise<Object>} Scraped data object
 */
async function scrapeWebsite(url) {
  logger.info(`[SEO:SCRAPER] Starting scrape for: ${url}`);
  const startTime = Date.now();

  const response = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    maxContentLength: 5 * 1024 * 1024, // 5MB max
  });

  const loadTime = Date.now() - startTime;
  const html = response.data;
  const $ = cheerio.load(html);

  const getMeta = (name) =>
    $(`meta[name="${name}"]`).attr('content') ||
    $(`meta[property="${name}"]`).attr('content') ||
    '';

  const images = $('img')
    .map((_, el) => ({ src: $(el).attr('src') || '', alt: $(el).attr('alt') || '', hasAlt: !!$(el).attr('alt') }))
    .get();

  const origin = new URL(url).origin;
  const links = $('a[href]')
    .map((_, el) => {
      const href = $(el).attr('href') || '';
      const abs = href.startsWith('http') ? href : origin + href;
      return { href: abs, text: $(el).text().trim(), isExternal: !abs.startsWith(origin) };
    })
    .get();

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

  const data = {
    url,
    hasSSL: url.startsWith('https://'),
    loadTimeMs: loadTime,
    scrapedAt: new Date().toISOString(),
    title: $('title').text().trim(),
    metaDescription: getMeta('description'),
    metaKeywords: getMeta('keywords'),
    ogTitle: getMeta('og:title'),
    ogDescription: getMeta('og:description'),
    ogImage: getMeta('og:image'),
    canonical: $('link[rel="canonical"]').attr('href') || '',
    language: $('html').attr('lang') || '',
    hasViewport: !!$('meta[name="viewport"]').length,
    h1: $('h1').map((_, el) => $(el).text().trim()).get(),
    h2: $('h2').map((_, el) => $(el).text().trim()).get(),
    h3: $('h3').map((_, el) => $(el).text().trim()).get(),
    images: images.slice(0, 50),
    totalImages: images.length,
    imagesWithoutAlt: images.filter((i) => !i.hasAlt).length,
    links: links.slice(0, 100),
    totalLinks: links.length,
    externalLinks: links.filter((l) => l.isExternal).length,
    bodyTextLength: bodyText.length,
    htmlSize: html.length,
  };

  logger.info(`Scraped ${url}: ${data.bodyTextLength} chars, ${data.totalImages} images, ${loadTime}ms`);

  return data;
}

module.exports = { scrapeWebsite };
