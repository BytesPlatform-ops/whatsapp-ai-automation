// Rule-based static checks that don't need a headless browser. Fills in the
// SEO gaps PageSpeed Insights doesn't cover: indexability (robots.txt,
// sitemap.xml), structured data (JSON-LD schema), HTTP security headers,
// image hygiene beyond alt tags. All checks are resilient — a single
// failing fetch never breaks the whole audit; missing signals are marked
// "unknown" so the scorer treats them neutrally instead of penalizing.

const axios = require('axios');
const cheerio = require('cheerio');
const { logger } = require('../utils/logger');

const FETCH_TIMEOUT_MS = 8000;
const UA = 'Mozilla/5.0 (compatible; PixieAudit/1.0; +https://pixiebot.co)';

async function safeGet(url, opts = {}) {
  try {
    const res = await axios.get(url, {
      timeout: FETCH_TIMEOUT_MS,
      headers: { 'User-Agent': UA, ...(opts.headers || {}) },
      validateStatus: () => true, // Never throw on HTTP status — we handle it
      maxContentLength: 2 * 1024 * 1024,
      ...opts,
    });
    return res;
  } catch (err) {
    return { status: 0, headers: {}, data: null, error: err.message };
  }
}

async function safeHead(url) {
  try {
    const res = await axios.head(url, {
      timeout: FETCH_TIMEOUT_MS,
      headers: { 'User-Agent': UA },
      validateStatus: () => true,
    });
    return res;
  } catch (err) {
    return { status: 0, headers: {}, error: err.message };
  }
}

/**
 * Fetch and parse /robots.txt. Returns `{ present, allowsAll, hasSitemap,
 * sitemapUrls, content }`.
 */
async function checkRobotsTxt(origin) {
  const url = `${origin}/robots.txt`;
  const res = await safeGet(url);
  const present = res.status === 200 && typeof res.data === 'string';
  if (!present) return { present: false, url };

  const text = String(res.data);
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const sitemapUrls = [];
  let disallowsRoot = false;
  for (const line of lines) {
    const m = line.match(/^sitemap:\s*(\S+)/i);
    if (m) sitemapUrls.push(m[1]);
    if (/^disallow:\s*\/\s*$/i.test(line)) disallowsRoot = true;
  }
  return {
    present: true,
    url,
    allowsAll: !disallowsRoot,
    hasSitemapDirective: sitemapUrls.length > 0,
    sitemapUrls,
    size: text.length,
  };
}

/**
 * Try common sitemap URLs (the one from robots.txt, /sitemap.xml, /sitemap_index.xml).
 * Returns `{ present, url, urlCount, isIndex, error }`.
 */
async function checkSitemap(origin, sitemapUrlsFromRobots = []) {
  const candidates = Array.from(new Set([
    ...sitemapUrlsFromRobots,
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
  ]));
  for (const url of candidates) {
    const res = await safeGet(url);
    if (res.status !== 200 || !res.data) continue;
    const text = String(res.data);
    if (!/<(urlset|sitemapindex)/i.test(text)) continue;

    const isIndex = /<sitemapindex/i.test(text);
    // Cheap count — matches both <url><loc>…</loc></url> (urlset) and
    // <sitemap><loc>…</loc></sitemap> (sitemapindex).
    const urlCount = (text.match(/<loc>/gi) || []).length;
    return { present: true, url, isIndex, urlCount };
  }
  return { present: false };
}

/**
 * Look at the home-page HTML we already scraped (passed via $) and report
 * on JSON-LD schema blocks. Counts types, flags common organization /
 * website / localbusiness patterns.
 */
function checkSchemaMarkup($) {
  const scripts = $('script[type="application/ld+json"]');
  if (!scripts.length) return { present: false, blocks: 0, types: [] };

  const types = [];
  let valid = 0;
  scripts.each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const json = JSON.parse(raw);
      const collect = (obj) => {
        if (!obj) return;
        if (Array.isArray(obj)) { obj.forEach(collect); return; }
        if (obj['@type']) {
          const t = obj['@type'];
          if (Array.isArray(t)) t.forEach((x) => types.push(String(x)));
          else types.push(String(t));
        }
        if (obj['@graph']) collect(obj['@graph']);
      };
      collect(json);
      valid += 1;
    } catch (_) {
      // Malformed JSON-LD — count block but not as valid
    }
  });

  const uniqTypes = Array.from(new Set(types));
  return {
    present: valid > 0,
    blocks: scripts.length,
    validBlocks: valid,
    types: uniqTypes,
    hasOrganization: uniqTypes.some((t) => /organization|localbusiness/i.test(t)),
    hasWebsite: uniqTypes.some((t) => /^website$/i.test(t)),
    hasBreadcrumb: uniqTypes.some((t) => /breadcrumb/i.test(t)),
  };
}

/**
 * Inspect key HTTP security headers on the home-page response. Missing
 * headers don't affect SEO directly but do affect Lighthouse's Best
 * Practices score and signal trustworthiness to savvy users.
 */
function checkSecurityHeaders(headers) {
  const h = Object.fromEntries(
    Object.entries(headers || {}).map(([k, v]) => [String(k).toLowerCase(), v])
  );
  const checks = {
    strictTransportSecurity: !!h['strict-transport-security'],
    contentSecurityPolicy: !!h['content-security-policy'],
    xContentTypeOptions: h['x-content-type-options'] === 'nosniff',
    xFrameOptions: !!h['x-frame-options'] || !!h['content-security-policy']?.match(/frame-ancestors/i),
    referrerPolicy: !!h['referrer-policy'],
    permissionsPolicy: !!h['permissions-policy'] || !!h['feature-policy'],
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  return { ...checks, passed, total, coveragePct: Math.round((passed / total) * 100) };
}

/**
 * Image hygiene: alt-text coverage ratio + file-size sanity-check on the
 * first N images (HEAD requests, bounded to 10 to stay fast).
 */
async function checkImageOptimization(images, origin) {
  if (!Array.isArray(images) || images.length === 0) {
    return { total: 0, withAlt: 0, altCoveragePct: 100, oversized: [], checkedCount: 0 };
  }
  const withAlt = images.filter((i) => i.hasAlt).length;
  const altCoveragePct = Math.round((withAlt / images.length) * 100);

  // HEAD the first 10 images with absolute URLs for byte sizes.
  const pool = images
    .map((i) => {
      let src = i.src || '';
      if (!src) return null;
      if (src.startsWith('//')) src = 'https:' + src;
      else if (!src.startsWith('http')) src = origin + (src.startsWith('/') ? '' : '/') + src;
      return src;
    })
    .filter(Boolean)
    .slice(0, 10);

  const oversized = [];
  let checkedCount = 0;
  await Promise.all(pool.map(async (src) => {
    const res = await safeHead(src);
    const len = parseInt(res.headers?.['content-length'] || '0', 10);
    if (!len) return;
    checkedCount += 1;
    // Flag anything over 300KB — well beyond recommended for hero/thumb images.
    if (len > 300 * 1024) {
      oversized.push({ src, kb: Math.round(len / 1024) });
    }
  }));

  return {
    total: images.length,
    withAlt,
    altCoveragePct,
    oversized,
    oversizedCount: oversized.length,
    checkedCount,
  };
}

/**
 * Run all the rule checks in parallel. Accepts the URL and the cheerio
 * instance + raw image list we already produced during scraping, so we
 * don't re-fetch the home page. Returns a single structured object —
 * callers hand this off to the scorer.
 */
async function runRuleChecks(url, $, scrapedData, homepageHeaders) {
  const origin = new URL(url).origin;
  logger.info(`[RULES] Running rule checks for ${origin}`);
  const t0 = Date.now();

  const robots = await checkRobotsTxt(origin);
  const sitemap = await checkSitemap(origin, robots.sitemapUrls || []);
  const schema = checkSchemaMarkup($);
  const security = checkSecurityHeaders(homepageHeaders);
  const images = await checkImageOptimization(scrapedData.images || [], origin);

  const result = {
    origin,
    robots,
    sitemap,
    schema,
    security,
    images,
    fetchedAt: new Date().toISOString(),
    tookMs: Date.now() - t0,
  };
  logger.info(`[RULES] Done in ${result.tookMs}ms — robots=${robots.present}, sitemap=${sitemap.present}, schema=${schema.present}, securityCoverage=${security.coveragePct}%, altCoverage=${images.altCoveragePct}%`);
  return result;
}

module.exports = { runRuleChecks };
