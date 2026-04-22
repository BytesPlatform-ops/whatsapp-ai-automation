// Orchestrator for the upgraded SEO audit. Runs the static scrape + Google
// PageSpeed Insights + rule-based checks in parallel where safe, then hands
// the combined signals to a deterministic scorer and a reduced-scope LLM
// that only narrates findings (never invents a score).
//
// Output shape (structured; NOT a markdown string):
//   {
//     url, runAt,
//     score: { overall: 78, breakdown: {...}, missing: [...] },
//     lighthouse: { performance, accessibility, bestPractices, seo },
//     coreWebVitals: { lcp, cls, inp, fcp, tbt, si } (each with value/verdict/displayValue),
//     technicalHealth: { https, robots, sitemap, schema, security, images, canonical, viewport },
//     topIssues: [...],          // from PSI diagnostics
//     narration: {               // LLM-authored prose
//       verdict, strengths, topRecommendations, findings, quickFixSummary
//     }
//   }

const { runPageSpeedInsights } = require('./pageSpeedInsights');
const { runRuleChecks } = require('./ruleChecks');
const { computeScore } = require('./scorer');
const { generateResponse } = require('../llm/provider');
const { WEBSITE_ANALYSIS_STRUCTURED_PROMPT } = require('../llm/prompts');
const { logger } = require('../utils/logger');
const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Run the full audit. Accepts the URL and the scraped data we already have
 * (so the handler doesn't pay the scrape cost twice). Returns the structured
 * audit object the PDF renderer reads.
 */
async function analyzeWebsite(scrapedData, options = {}) {
  const url = scrapedData.url;
  logger.info(`[ANALYZER] Orchestrating audit for ${url}`);
  const t0 = Date.now();

  // Need a cheerio handle + response headers for rule checks. Re-fetch the
  // home page lightly — adds ~2s but avoids re-plumbing the scraper.
  let $ = null;
  let homepageHeaders = {};
  try {
    const res = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PixieAudit/1.0)' },
      validateStatus: () => true,
      maxContentLength: 5 * 1024 * 1024,
    });
    if (typeof res.data === 'string') $ = cheerio.load(res.data);
    homepageHeaders = res.headers || {};
  } catch (err) {
    logger.warn(`[ANALYZER] Re-fetch for rule checks failed: ${err.message}`);
    $ = cheerio.load('<html></html>');
  }

  // Run PSI (mobile) and rule checks in parallel. Desktop PSI would add
  // another ~30s; skip for now, add later if users ask.
  const [psi, rules] = await Promise.all([
    runPageSpeedInsights(url, 'mobile').catch((err) => {
      logger.warn(`[ANALYZER] PSI threw: ${err.message}`);
      return null;
    }),
    runRuleChecks(url, $, scrapedData, homepageHeaders).catch((err) => {
      logger.warn(`[ANALYZER] Rule checks threw: ${err.message}`);
      return null;
    }),
  ]);

  const score = computeScore({ psi, rules, scraped: scrapedData });

  // Build a compact LLM brief — the LLM narrates, doesn't measure.
  const brief = buildLlmBrief({ url, scrapedData, psi, rules, score });

  // Call LLM for narration only. Keep temperature implicit (provider default)
  // since we want natural prose. Strictly parse JSON; fall back to an empty
  // narration so the PDF still renders if the LLM misbehaves.
  let narration = { verdict: '', topRecommendations: [], strengths: [], findings: {}, quickFixSummary: '' };
  try {
    // 45s ceiling: the narration prompt produces ~6 short bullets + verdict,
    // not a book. Default 90s masks stalls — we'd rather surface an error
    // than silently wait a minute and a half for a dead LLM socket.
    const raw = await generateResponse(
      WEBSITE_ANALYSIS_STRUCTURED_PROMPT,
      [{ role: 'user', content: brief }],
      { userId: options.userId, operation: 'seo_analysis_structured', timeoutMs: 45_000 }
    );
    const m = String(raw || '').match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      narration = {
        verdict: String(parsed.verdict || '').trim(),
        topRecommendations: Array.isArray(parsed.topRecommendations) ? parsed.topRecommendations.slice(0, 3).map((r) => ({
          title: String(r.title || '').trim(),
          why: String(r.why || '').trim(),
          severity: ['high', 'medium', 'low'].includes(String(r.severity).toLowerCase()) ? String(r.severity).toLowerCase() : 'medium',
        })) : [],
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map((s) => String(s).trim()).filter(Boolean).slice(0, 4) : [],
        findings: {
          seo: normalizeArray(parsed.findings?.seo),
          performance: normalizeArray(parsed.findings?.performance),
          content: normalizeArray(parsed.findings?.content),
          technical: normalizeArray(parsed.findings?.technical),
        },
        quickFixSummary: String(parsed.quickFixSummary || '').trim(),
      };
    }
  } catch (err) {
    logger.warn(`[ANALYZER] LLM narration parse failed: ${err.message}`);
  }

  const localSignals = detectLocalSignals(scrapedData, rules, $);
  const businessImpact = buildBusinessImpact({ psi, rules, scrapedData, score, localSignals });

  const result = {
    url,
    runAt: new Date().toISOString(),
    tookMs: Date.now() - t0,
    score,
    lighthouse: psi?.scores || null,
    coreWebVitals: psi?.coreWebVitals || null,
    technicalHealth: buildTechnicalHealth({ scrapedData, rules }),
    topIssues: psi?.topIssues || [],
    narration,
    businessImpact,
    localSignals,
    // Keep a short plain-text summary so existing follow-up code (top-fix
    // extractor, WhatsApp summary) keeps working without major changes.
    text: buildPlainTextSummary({ score, narration }),
  };
  logger.info(`[ANALYZER] Audit complete in ${Math.round(result.tookMs / 1000)}s — score=${result.score.overall}`);
  return result;
}

function normalizeArray(v) {
  if (!Array.isArray(v)) return [];
  return v.map((s) => String(s).trim()).filter(Boolean).slice(0, 5);
}

function buildLlmBrief({ url, scrapedData, psi, rules, score }) {
  const lines = [];
  lines.push(`Analyzed URL: ${url}`);
  lines.push(`Run at: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('MEASURED OVERALL SCORE: ' + score.overall + '/100');
  lines.push('Category breakdown (already computed, do not change):');
  for (const [k, v] of Object.entries(score.breakdown)) {
    if (v.score == null) continue;
    lines.push(`  - ${k}: ${v.score}/100 (weight ${v.weight}%) — ${(v.contributing || []).slice(0, 3).join('; ')}`);
  }
  if (score.missing.length) {
    lines.push('Not measured (treat neutrally): ' + score.missing.join(', '));
  }
  lines.push('');

  if (psi) {
    lines.push('LIGHTHOUSE (mobile):');
    lines.push(`  Performance: ${psi.scores.performance}, Accessibility: ${psi.scores.accessibility}, Best-Practices: ${psi.scores.bestPractices}, SEO: ${psi.scores.seo}`);
    lines.push('  Core Web Vitals:');
    for (const [k, v] of Object.entries(psi.coreWebVitals || {})) {
      lines.push(`    ${k.toUpperCase()}: ${v.displayValue || 'n/a'} (${v.verdict})`);
    }
    lines.push(`  Top PSI issues (${psi.topIssues.length}):`);
    psi.topIssues.slice(0, 6).forEach((i) => {
      lines.push(`    - [${i.severity}] ${i.title}${i.savingsMs ? ` (saves ~${i.savingsMs}ms)` : ''}`);
    });
  } else {
    lines.push('LIGHTHOUSE: unavailable (PSI failed or rate-limited). Base findings on static signals only.');
  }
  lines.push('');

  if (rules) {
    lines.push('STATIC RULE CHECKS:');
    lines.push(`  robots.txt: ${rules.robots.present ? `present (${rules.robots.sitemapUrls?.length || 0} sitemap directives)` : 'missing'}`);
    lines.push(`  sitemap.xml: ${rules.sitemap.present ? `present (${rules.sitemap.urlCount} URLs, isIndex=${rules.sitemap.isIndex})` : 'missing'}`);
    lines.push(`  Schema markup: ${rules.schema.present ? `${rules.schema.validBlocks} block(s), types=${(rules.schema.types || []).join(',') || 'none'}` : 'missing'}`);
    lines.push(`  Security headers: ${rules.security.passed}/${rules.security.total} present (${rules.security.coveragePct}%)`);
    lines.push(`  Image alt-text coverage: ${rules.images.altCoveragePct}% (${rules.images.withAlt}/${rules.images.total})`);
    if (rules.images.oversizedCount) lines.push(`  Oversized images (>300KB): ${rules.images.oversizedCount} out of ${rules.images.checkedCount} checked`);
  }
  lines.push('');

  lines.push('RAW SCRAPE HIGHLIGHTS:');
  lines.push(`  Title: ${scrapedData.title || 'MISSING'}`);
  lines.push(`  Meta description: ${scrapedData.metaDescription ? `${scrapedData.metaDescription.length} chars` : 'MISSING'}`);
  lines.push(`  Canonical: ${scrapedData.canonical || 'NOT SET'}`);
  lines.push(`  H1 count: ${(scrapedData.h1 || []).length}`);
  lines.push(`  Images missing alt: ${scrapedData.imagesWithoutAlt || 0} / ${scrapedData.totalImages || 0}`);
  lines.push(`  Body text length: ${scrapedData.bodyTextLength || 0} chars`);
  lines.push(`  HTML size: ${Math.round((scrapedData.htmlSize || 0) / 1024)} KB`);
  lines.push(`  HTTPS: ${scrapedData.hasSSL ? 'yes' : 'no'}`);
  lines.push(`  Viewport meta: ${scrapedData.hasViewport ? 'yes' : 'no'}`);

  return lines.join('\n');
}

// "Why this matters" copy — each failing Technical Health row gets a
// plain-English business consequence line in the PDF. Non-technical
// owners otherwise see a wall of jargon (canonical, JSON-LD, HSTS) and
// don't grasp the stakes.
const WHY_NOT = {
  https: "Browsers flag non-HTTPS sites as 'Not Secure' — customers bounce before buying.",
  viewport: 'Without this tag Google treats your site as desktop-only and drops your mobile rankings.',
  canonical: 'Google may see your pages as duplicates, splitting ranking signals and hurting traffic.',
  robots: 'Search engines crawl blindly, wasting time on unimportant pages and missing the ones that sell.',
  sitemap: "Google has to guess which pages exist — many never get indexed and stay invisible in search.",
  schema: 'You miss rich search results (stars, hours, menu, prices) that stand out above plain blue links.',
  security: "Modern browsers may warn 'Not Secure' on checkout pages — customers abandon carts on impulse.",
  imageAlt: "Screen readers + Google can't describe your images — hurts accessibility and image-search traffic.",
};
const WHY_OK = {
  https: 'HTTPS is live — customers see the padlock and trust the site.',
  viewport: 'Mobile viewport configured — Google ranks you as mobile-friendly.',
  canonical: 'Canonical URL set — ranking signals stay consolidated.',
  robots: 'robots.txt present — you control what search engines crawl.',
  sitemap: 'Sitemap discovered — Google has a map of every page.',
  schema: 'Structured data present — you qualify for rich results.',
  security: 'Most key security headers configured.',
  imageAlt: 'Strong alt-text coverage — accessibility and image SEO in good shape.',
};

function buildTechnicalHealth({ scrapedData, rules }) {
  const out = {
    https: { pass: !!scrapedData?.hasSSL, label: scrapedData?.hasSSL ? 'HTTPS enabled' : 'HTTPS missing' },
    viewport: { pass: !!scrapedData?.hasViewport, label: scrapedData?.hasViewport ? 'Mobile viewport set' : 'Viewport meta missing' },
    canonical: { pass: !!scrapedData?.canonical, label: scrapedData?.canonical ? 'Canonical URL set' : 'No canonical URL' },
    robots: { pass: !!rules?.robots?.present, label: rules?.robots?.present ? 'robots.txt present' : 'robots.txt missing' },
    sitemap: { pass: !!rules?.sitemap?.present, label: rules?.sitemap?.present ? `sitemap.xml present (${rules.sitemap.urlCount} URLs)` : 'sitemap.xml missing' },
    schema: { pass: !!rules?.schema?.present, label: rules?.schema?.present ? `Schema markup: ${(rules.schema.types || []).slice(0, 2).join(', ') || 'generic'}` : 'No structured data (JSON-LD)' },
    security: {
      // Stricter threshold — 17% coverage is not "partial", it's a fail.
      // Partial (amber) kicks in only at 35-49%, real pass at 50%+.
      pass: (rules?.security?.coveragePct || 0) >= 50,
      partial: (rules?.security?.coveragePct || 0) >= 35 && (rules?.security?.coveragePct || 0) < 50,
      label: rules ? `Security headers: ${rules.security.passed}/${rules.security.total} configured` : 'Security headers not checked',
    },
    imageAlt: {
      pass: (rules?.images?.altCoveragePct || 0) >= 90,
      partial: (rules?.images?.altCoveragePct || 0) >= 50 && (rules?.images?.altCoveragePct || 0) < 90,
      label: rules?.images ? `Alt-text coverage: ${rules.images.altCoveragePct}%` : 'Image alt-text coverage unknown',
    },
  };
  // Attach the "why this matters" copy. Pass → OK line. Fail/partial → NOT line.
  for (const key of Object.keys(out)) {
    const row = out[key];
    row.why = row.pass ? WHY_OK[key] : WHY_NOT[key];
  }
  return out;
}

/**
 * Detect local-business signals in the scraped content so we can show
 * restaurant/shop owners a local-SEO-specific section. Scans visible
 * body text (via the cheerio handle), tel: links, and JSON-LD schema
 * types. 2+ signals → local.
 */
function detectLocalSignals(scrapedData, rules, $) {
  // Pull visible body text from the cheerio handle we already have. Fall
  // back to title + meta description if the handle is unavailable.
  let body = '';
  if ($) {
    try {
      body = $('body').text().replace(/\s+/g, ' ').slice(0, 20000);
    } catch (_) { /* fall back */ }
  }
  if (!body) {
    body = [scrapedData?.title, scrapedData?.metaDescription].filter(Boolean).join(' ');
  }

  const phoneRx = /(?:\+?\d[\s().-]?){9,}/;
  const telLink = $ ? $('a[href^="tel:"]').length > 0 : false;
  const addressRx = /\b\d{1,5}\s+[A-Za-z][A-Za-z\s.]{2,30}\s+(?:Street|St\.?|Avenue|Ave\.?|Blvd\.?|Boulevard|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Highway|Hwy\.?|Way|Parkway|Pkwy\.?|Court|Ct\.?|Place|Pl\.?)\b/i;
  const zipRx = /\b[A-Z]{2}\s+\d{5}\b/;
  const hoursRx = /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?\b[\s\S]{0,30}\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)/;
  const localKeywordRx = /\b(?:menu|order online|dine[- ]in|delivery|takeout|take[- ]out|reservations?|catering|storefront|directions|open\s+(?:now|today|daily)|hours|location)\b/i;
  const localSchemaTypes = ['Restaurant', 'LocalBusiness', 'Store', 'CafeOrCoffeeShop', 'FoodEstablishment', 'Bakery', 'BarOrPub', 'HomeAndConstructionBusiness', 'ProfessionalService', 'Organization'];

  const hasPhone = phoneRx.test(body) || telLink;
  const hasAddress = addressRx.test(body) || zipRx.test(body);
  const hasHours = hoursRx.test(body);
  const hasLocalKeyword = localKeywordRx.test(body);
  const schemaTypes = rules?.schema?.types || [];
  const hasLocalSchema = schemaTypes.some((t) => localSchemaTypes.some((l) => String(t).toLowerCase().includes(l.toLowerCase())));

  const signals = { hasPhone, hasAddress, hasHours, hasLocalKeyword, hasLocalSchema, telLink };
  const signalCount = Object.values(signals).filter(Boolean).length;
  if (signalCount < 2) return { isLocal: false, signals };

  // Detect Google Business Profile / Maps linkage — strong signal that the
  // owner has already claimed a listing and is driving discovery through it.
  let hasGbpLink = false;
  if ($) {
    try {
      hasGbpLink = $('a[href*="google.com/maps"], a[href*="goo.gl/maps"], a[href*="maps.app.goo.gl"], a[href*="g.page"]').length > 0;
    } catch (_) { /* best-effort */ }
  }

  // Rather than returning a thin "only missing items" list, return a full
  // checklist of what's detected + what's missing. The PDF renders this as
  // a visual check/X list so the section feels substantial even when the
  // site is mostly complete.
  const checks = [];

  if (telLink) checks.push({ ok: true, text: 'Phone number wrapped in tel: link — mobile visitors can one-tap to call.' });
  else if (hasPhone) checks.push({ ok: false, text: 'Phone visible but not a tel: link — mobile visitors lose one-tap calling.' });
  else checks.push({ ok: false, text: 'No phone number detected — local customers expect one on the homepage.' });

  if (hasHours) checks.push({ ok: true, text: 'Opening hours visible on the page — supports "near me" search filtering.' });
  else checks.push({ ok: false, text: '"Near me" searches filter out sites without visible opening hours.' });

  if (hasAddress) checks.push({ ok: true, text: 'Street address or ZIP detected — supports Google Maps proximity ranking.' });
  else checks.push({ ok: false, text: 'No street address / ZIP visible — hurts local proximity signals in Google.' });

  if (hasLocalSchema) {
    checks.push({ ok: true, text: `LocalBusiness schema present (${(schemaTypes || []).slice(0, 2).join(', ') || 'generic'}) — qualifies for rich Google panels.` });
  } else {
    checks.push({ ok: false, text: 'No LocalBusiness schema — missing from rich Google panels (hours, phone, directions).' });
  }

  if (hasGbpLink) checks.push({ ok: true, text: 'Google Maps / Business Profile link detected — customers can find directions fast.' });
  else checks.push({ ok: false, text: 'No Google Business Profile link — directions, reviews, and photos go unclaimed.' });

  // Legacy `recommendations` array kept for any older caller that still
  // reads it; new callers should prefer `checks`.
  const recommendations = checks.filter((c) => !c.ok).map((c) => c.text);

  return {
    isLocal: true,
    signals,
    schemaTypes,
    checks,
    recommendations,
  };
}

/**
 * Derive a "Business Impact" summary from measured issues. No fake revenue
 * numbers — the bullets are directional (what the owner loses) and tied
 * to what the audit actually found so the copy is always truthful.
 */
function buildBusinessImpact({ psi, rules, scrapedData, score, localSignals }) {
  const lines = [];
  const lcp = psi?.coreWebVitals?.lcp;
  if (lcp?.value != null && lcp.value > 4) {
    lines.push(`Slow load (${lcp.displayValue}) — Google drops sites above 4s in mobile rankings; visitors abandon before the main content loads.`);
  } else if (lcp?.value != null && lcp.value > 2.5) {
    lines.push(`Mobile load time sits between 2.5s and 4s — every extra second costs roughly 7% of visitors.`);
  }

  if (!scrapedData?.canonical || !rules?.robots?.present || !rules?.sitemap?.present) {
    lines.push('Indexability gaps mean some of your pages never appear in Google at all — those pages cannot earn a single visit.');
  }

  if (!rules?.schema?.present) {
    lines.push(localSignals?.isLocal
      ? 'Missing structured data — your restaurant/business info will not appear in the rich Google panel (hours, phone, directions).'
      : 'Missing structured data — no rich search results (reviews, prices, FAQs) so you blend in with plain blue links.');
  }

  const secPct = rules?.security?.coveragePct;
  if (secPct != null && secPct < 50) {
    lines.push(`Only ${secPct}% of critical security headers are configured — browsers may flag parts of your site as insecure.`);
  }

  if (localSignals?.isLocal && !localSignals?.signals?.hasLocalSchema) {
    lines.push('Looks like a local business — without LocalBusiness schema you are invisible to "near me" searches that drive walk-ins.');
  }

  // Always close with a framing line tied to the score — creates urgency without lying.
  if (score?.overall != null) {
    if (score.overall < 60) lines.push('Overall, this site is underperforming for search — organic traffic is almost certainly lower than it should be.');
    else if (score.overall < 75) lines.push('Overall, this site has meaningful issues holding back organic traffic — fixable in days, not months.');
  }
  return lines.slice(0, 4);
}

function buildPlainTextSummary({ score, narration }) {
  const lines = [];
  lines.push(`Overall Score: ${score.overall}/100`);
  if (narration.verdict) lines.push(narration.verdict);
  lines.push('');
  if (narration.topRecommendations.length) {
    lines.push('Top recommendations:');
    narration.topRecommendations.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.title} — ${r.why}`);
    });
  }
  return lines.join('\n');
}

module.exports = { analyzeWebsite };
