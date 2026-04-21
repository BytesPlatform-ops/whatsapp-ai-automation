// Google PageSpeed Insights client — the single biggest upgrade to our audit
// quality. PSI runs a real Lighthouse audit in Google's infrastructure and
// returns the four standard category scores (Performance, Accessibility,
// Best Practices, SEO) plus Core Web Vitals (LCP, CLS, FID/INP) and a list
// of actionable diagnostics. Free API, no key required for normal volume
// (25k req/day/IP at time of writing). If GOOGLE_PAGESPEED_API_KEY is set
// in env, we send it for the higher quota.

const axios = require('axios');
const { logger } = require('../utils/logger');

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
// PSI typically takes 20-40s on small sites. Large content-heavy sites
// (MDN, tailwindcss.com docs, big marketing pages) routinely need 60-80s
// because PSI runs a full headless Chrome pass and evaluates 50+ audits.
// 90s ceiling keeps those audits from falling back to static-rule-only
// scoring while still killing true hangs.
const PSI_TIMEOUT_MS = 90000;

// The LH categories we want; everything else is noise for a small-business audit.
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

// Core Web Vital thresholds (Google's official definitions — mirrors what
// appears in Search Console). Values are in seconds unless noted.
const CWV_THRESHOLDS = {
  lcp: { good: 2.5, poor: 4.0, unit: 's' },           // Largest Contentful Paint
  cls: { good: 0.1, poor: 0.25, unit: '' },           // Cumulative Layout Shift (unitless)
  inp: { good: 200, poor: 500, unit: 'ms' },          // Interaction to Next Paint
  fcp: { good: 1.8, poor: 3.0, unit: 's' },           // First Contentful Paint
  tbt: { good: 200, poor: 600, unit: 'ms' },          // Total Blocking Time
  si: { good: 3.4, poor: 5.8, unit: 's' },            // Speed Index
};

function verdictFor(metric, value) {
  const t = CWV_THRESHOLDS[metric];
  if (!t || value == null) return 'unknown';
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'needs-improvement';
  return 'poor';
}

/**
 * Parse a Lighthouse metric's displayValue string (e.g. "1.5 s", "0.08",
 * "350 ms") into a plain number in the metric's native unit. Falls back
 * to numericValue when parsing fails.
 */
function parseMetric(audit, fallback = null) {
  if (!audit) return fallback;
  if (typeof audit.numericValue === 'number') {
    // LH returns ms for time metrics; convert to s for LCP/FCP/SI to match thresholds.
    return audit.numericValue;
  }
  return fallback;
}

/**
 * Run a PageSpeed Insights audit against a URL. Returns null if the API
 * call fails or the response is malformed — callers fall back to the
 * static scrape-only analysis without breaking.
 *
 * @param {string} url
 * @param {'mobile'|'desktop'} strategy
 * @returns {Promise<null|{
 *   strategy, scores: {performance, accessibility, bestPractices, seo},
 *   coreWebVitals: {lcp, cls, inp, fcp, tbt, si, [metric].value, .verdict, .displayValue},
 *   topIssues: Array<{id, title, description, severity, savingsMs, savingsKb}>,
 *   fetchedAt: string
 * }>}
 */
async function runPageSpeedInsights(url, strategy = 'mobile') {
  const params = {
    url,
    strategy,
    // Repeat `category` param for each one PSI supports as array.
    category: CATEGORIES,
  };
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY || process.env.PAGESPEED_API_KEY;
  if (apiKey) params.key = apiKey;

  logger.info(`[PSI] Fetching ${strategy} audit for ${url}${apiKey ? ' (keyed)' : ' (anonymous)'}`);
  const t0 = Date.now();

  let data;
  try {
    const res = await axios.get(PSI_ENDPOINT, {
      params,
      // axios serializes arrays into `category=a&category=b` when paramsSerializer
      // is set; otherwise it produces `category[]=a` which PSI rejects.
      paramsSerializer: (p) => {
        const parts = [];
        for (const [k, v] of Object.entries(p)) {
          if (Array.isArray(v)) v.forEach((x) => parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(x)}`));
          else if (v != null) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
        }
        return parts.join('&');
      },
      timeout: PSI_TIMEOUT_MS,
    });
    data = res.data;
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    logger.warn(`[PSI] ${strategy} fetch failed (${status || 'network'}): ${err.message}${body?.error?.message ? ` — ${body.error.message}` : ''}`);
    return null;
  }

  const lh = data?.lighthouseResult;
  if (!lh) {
    logger.warn('[PSI] Response missing lighthouseResult');
    return null;
  }

  // Category scores (0.0-1.0 → 0-100)
  const cats = lh.categories || {};
  const scores = {
    performance: cats.performance?.score != null ? Math.round(cats.performance.score * 100) : null,
    accessibility: cats.accessibility?.score != null ? Math.round(cats.accessibility.score * 100) : null,
    bestPractices: cats['best-practices']?.score != null ? Math.round(cats['best-practices'].score * 100) : null,
    seo: cats.seo?.score != null ? Math.round(cats.seo.score * 100) : null,
  };

  // Core Web Vitals + key perf metrics, normalized into the units our thresholds expect.
  const audits = lh.audits || {};
  const raw = {
    lcp: parseMetric(audits['largest-contentful-paint']),
    cls: parseMetric(audits['cumulative-layout-shift']),
    inp: parseMetric(audits['interaction-to-next-paint']) ?? parseMetric(audits['max-potential-fid']),
    fcp: parseMetric(audits['first-contentful-paint']),
    tbt: parseMetric(audits['total-blocking-time']),
    si: parseMetric(audits['speed-index']),
  };
  // LCP/FCP/SI come as ms from LH; CWV thresholds above are in seconds for those.
  const normalize = (metric, ms) => {
    if (ms == null) return null;
    if (['lcp', 'fcp', 'si'].includes(metric)) return ms / 1000;
    return ms;
  };
  const coreWebVitals = {};
  for (const key of Object.keys(CWV_THRESHOLDS)) {
    const value = normalize(key, raw[key]);
    coreWebVitals[key] = {
      value,
      verdict: verdictFor(key, value),
      displayValue: formatCwvDisplay(key, value, audits[lhAuditId(key)]?.displayValue),
    };
  }

  // Top issues — pick the highest-impact audits with failed / warning status.
  // Filter to categories with actionable savings (opportunities + diagnostics).
  const topIssues = [];
  for (const [id, audit] of Object.entries(audits)) {
    // Skip passing audits & informational ones with no savings.
    if (audit.score === 1 || audit.score == null) continue;
    const savingsMs = audit.details?.overallSavingsMs || 0;
    const savingsKb = audit.details?.overallSavingsBytes ? Math.round(audit.details.overallSavingsBytes / 1024) : 0;
    // Deduped: require either meaningful savings or an explicit fail score.
    if (savingsMs < 50 && savingsKb < 5 && audit.score > 0.5) continue;
    topIssues.push({
      id,
      title: audit.title || id,
      description: String(audit.description || '').replace(/\[(.+?)\]\(.+?\)/g, '$1').trim().slice(0, 240),
      score: audit.score,
      severity: audit.score < 0.5 ? 'high' : audit.score < 0.9 ? 'medium' : 'low',
      savingsMs: Math.round(savingsMs),
      savingsKb,
    });
  }
  // Sort by heuristic impact: high severity first, then by savingsMs.
  topIssues.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    return b.savingsMs - a.savingsMs;
  });

  logger.info(`[PSI] ${strategy} done in ${Math.round((Date.now() - t0) / 1000)}s — perf=${scores.performance}, seo=${scores.seo}, issues=${topIssues.length}`);

  return {
    strategy,
    scores,
    coreWebVitals,
    topIssues: topIssues.slice(0, 12),
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Format a Core Web Vital value for display. Two jobs:
 *
 *   1. Cap absurd-looking values (LCP > 20s under simulated slow 4G mobile
 *      is technically accurate but reads as "this audit is broken"). Above
 *      the cap we show "very slow (>20s)" which preserves urgency without
 *      inviting disbelief.
 *
 *   2. Clean up the fallback formatting for ms metrics. INP coming from the
 *      `max-potential-fid` fallback has no `displayValue` on the Lighthouse
 *      side, so the old fallback emitted "102.00ms" — trailing .00 with no
 *      space. Round ms to integer and insert a space.
 */
function formatCwvDisplay(key, value, rawDisplay) {
  if (value == null) return rawDisplay || null;

  // Time metrics reported in seconds (LCP / FCP / SI): cap extreme values.
  if (key === 'lcp' || key === 'fcp' || key === 'si') {
    if (value > 20) return 'very slow (>20s)';
    if (rawDisplay) return rawDisplay;
    return `${value.toFixed(1)} s`;
  }
  // Time metrics reported in ms (INP / TBT): always render integer + space.
  if (key === 'inp' || key === 'tbt') {
    return `${Math.round(value)} ms`;
  }
  // CLS is unitless — 2 decimals.
  if (key === 'cls') {
    return value.toFixed(2);
  }
  return rawDisplay || `${value}`;
}

// Map our CWV keys to the Lighthouse audit IDs that own a `displayValue`.
function lhAuditId(key) {
  return ({
    lcp: 'largest-contentful-paint',
    cls: 'cumulative-layout-shift',
    inp: 'interaction-to-next-paint',
    fcp: 'first-contentful-paint',
    tbt: 'total-blocking-time',
    si: 'speed-index',
  })[key];
}

module.exports = { runPageSpeedInsights, verdictFor, CWV_THRESHOLDS };
