// Weighted scoring engine — the audit's single source of truth for "the
// number". Deterministic: same inputs always produce the same score. No
// LLM involvement. If a category is missing (e.g. PSI failed), its weight
// is redistributed across the remaining categories so we never get a low
// score for not-measured-yet signals.
//
// Weights are tuned to reflect what actually moves Google rankings + what
// a small-business owner can realistically fix:
//   - Performance (25%)    — real Lighthouse perf score
//   - SEO fundamentals (20%)— real Lighthouse SEO score
//   - Core Web Vitals (15%)— LCP/CLS/INP individually weighted
//   - Indexability (15%)   — robots.txt + sitemap.xml + schema
//   - Accessibility (10%)  — real Lighthouse a11y score
//   - Best practices (10%) — real Lighthouse best-practices score
//   - Security (5%)        — HTTP security headers coverage

// Rebalanced weights — the old split gave Lighthouse "SEO basics" (which
// only measures trivial HTML hygiene) 20% of the score, letting sites
// with missing canonical/robots/sitemap/schema coast to an inflated 70+.
// Indexability is what actually moves Google rankings, so it gets the
// biggest weight now. Security also bumped because browsers flagging a
// site as "Not Secure" kills conversion directly.
const CATEGORY_WEIGHTS = {
  performance: 22,
  seoFundamentals: 10,   // was 20 — Lighthouse basics are a floor, not a ceiling
  coreWebVitals: 15,
  indexability: 25,      // was 15 — robots + sitemap + schema + canonical = real SEO
  accessibility: 8,
  bestPractices: 10,
  security: 10,          // was 5 — HTTPS warnings = instant bounce
};

// CWV sub-weights (sum = 100 within the CWV category)
const CWV_WEIGHTS = { lcp: 35, cls: 30, inp: 25, fcp: 10 };

// Map a PSI "verdict" to a 0-100 point value.
const CWV_VERDICT_POINTS = { good: 100, 'needs-improvement': 65, poor: 25, unknown: 50 };

/**
 * Compute a weighted score (0-100) from the combined PSI + rule-check data.
 * @param {object} signals
 * @param {object|null} signals.psi       Result from runPageSpeedInsights (mobile)
 * @param {object|null} signals.psiDesktop Result from runPageSpeedInsights (desktop) — optional
 * @param {object} signals.rules          Result from runRuleChecks
 * @param {object} signals.scraped        Raw scrape data (for SSL, viewport, etc.)
 * @returns {{
 *   overall: number,
 *   breakdown: { [category]: { score, weight, effectiveWeight, contributing: string[] }},
 *   missing: string[]
 * }}
 */
function computeScore({ psi, psiDesktop, rules, scraped }) {
  const categoryScores = {};
  const notes = {};

  // --- Performance ---------------------------------------------------------
  if (psi?.scores?.performance != null) {
    categoryScores.performance = psi.scores.performance;
    notes.performance = [`Mobile Lighthouse Performance: ${psi.scores.performance}/100`];
    if (psiDesktop?.scores?.performance != null) {
      notes.performance.push(`Desktop: ${psiDesktop.scores.performance}/100`);
    }
  } else if (scraped?.loadTimeMs != null) {
    // Rough fallback from single-request TTFB if PSI is unavailable.
    const ms = scraped.loadTimeMs;
    const s = ms <= 600 ? 90 : ms <= 1200 ? 75 : ms <= 2500 ? 55 : ms <= 4000 ? 35 : 15;
    categoryScores.performance = s;
    notes.performance = [`Scraper load time ${ms}ms → fallback perf estimate ${s}/100 (PSI unavailable)`];
  }

  // --- SEO fundamentals ----------------------------------------------------
  if (psi?.scores?.seo != null) {
    categoryScores.seoFundamentals = psi.scores.seo;
    notes.seoFundamentals = [`Lighthouse SEO: ${psi.scores.seo}/100`];
  } else {
    // Fallback built from static signals
    let s = 50;
    const reasons = [];
    if (scraped?.title && scraped.title.length >= 10 && scraped.title.length <= 70) { s += 10; reasons.push('title len ok'); }
    else reasons.push('title missing/weak');
    if (scraped?.metaDescription && scraped.metaDescription.length >= 50) { s += 10; reasons.push('meta desc ok'); }
    else reasons.push('meta desc missing/short');
    if (Array.isArray(scraped?.h1) && scraped.h1.length === 1) { s += 10; reasons.push('single H1'); }
    else reasons.push('H1 issue');
    if (scraped?.canonical) { s += 10; reasons.push('canonical set'); } else reasons.push('no canonical');
    if (scraped?.language) { s += 5; reasons.push('lang set'); }
    if (scraped?.hasViewport) { s += 5; reasons.push('viewport ok'); } else reasons.push('no viewport');
    categoryScores.seoFundamentals = Math.max(0, Math.min(100, s));
    notes.seoFundamentals = reasons;
  }

  // --- Core Web Vitals -----------------------------------------------------
  if (psi?.coreWebVitals) {
    let sum = 0;
    let wSum = 0;
    const reasons = [];
    for (const [key, weight] of Object.entries(CWV_WEIGHTS)) {
      const cwv = psi.coreWebVitals[key];
      if (!cwv) continue;
      const pts = CWV_VERDICT_POINTS[cwv.verdict] ?? 50;
      sum += pts * weight;
      wSum += weight;
      reasons.push(`${key.toUpperCase()}=${cwv.displayValue || '?'} (${cwv.verdict})`);
    }
    if (wSum > 0) {
      categoryScores.coreWebVitals = Math.round(sum / wSum);
      notes.coreWebVitals = reasons;
    }
  }

  // --- Indexability (robots + sitemap + schema) ---------------------------
  {
    const reasons = [];
    let s = 0;
    let max = 0;
    max += 30;
    if (rules?.robots?.present) { s += 30; reasons.push('robots.txt present'); }
    else reasons.push('robots.txt missing');
    max += 30;
    if (rules?.sitemap?.present) {
      s += 30;
      reasons.push(`sitemap.xml present (${rules.sitemap.urlCount || 0} URLs)`);
    } else reasons.push('sitemap.xml missing');
    max += 25;
    if (rules?.schema?.present) {
      s += rules.schema.hasOrganization ? 25 : 18;
      reasons.push(`schema markup present (${rules.schema.types?.slice(0, 3).join(', ') || 'generic'})`);
    } else reasons.push('no JSON-LD schema markup');
    max += 15;
    if (scraped?.canonical) { s += 15; reasons.push('canonical tag set'); }
    else reasons.push('canonical missing');
    categoryScores.indexability = Math.round((s / max) * 100);
    notes.indexability = reasons;
  }

  // --- Accessibility -------------------------------------------------------
  if (psi?.scores?.accessibility != null) {
    categoryScores.accessibility = psi.scores.accessibility;
    notes.accessibility = [`Lighthouse Accessibility: ${psi.scores.accessibility}/100`];
  } else if (rules?.images?.altCoveragePct != null) {
    categoryScores.accessibility = rules.images.altCoveragePct;
    notes.accessibility = [`Alt-text coverage ${rules.images.altCoveragePct}% (PSI unavailable)`];
  }

  // --- Best Practices ------------------------------------------------------
  if (psi?.scores?.bestPractices != null) {
    categoryScores.bestPractices = psi.scores.bestPractices;
    notes.bestPractices = [`Lighthouse Best Practices: ${psi.scores.bestPractices}/100`];
  } else if (scraped?.hasSSL != null) {
    // SSL is the single biggest best-practices signal we can measure statically.
    categoryScores.bestPractices = scraped.hasSSL ? 80 : 40;
    notes.bestPractices = [scraped.hasSSL ? 'HTTPS enabled' : 'HTTPS missing', '(PSI unavailable)'];
  }

  // --- Security (HTTP headers) --------------------------------------------
  if (rules?.security?.coveragePct != null) {
    categoryScores.security = rules.security.coveragePct;
    const reasons = [];
    if (rules.security.strictTransportSecurity) reasons.push('HSTS');
    if (rules.security.contentSecurityPolicy) reasons.push('CSP');
    if (rules.security.xContentTypeOptions) reasons.push('X-Content-Type-Options');
    if (rules.security.xFrameOptions) reasons.push('X-Frame-Options');
    if (rules.security.referrerPolicy) reasons.push('Referrer-Policy');
    if (rules.security.permissionsPolicy) reasons.push('Permissions-Policy');
    notes.security = [`${reasons.length}/${rules.security.total} security headers present${reasons.length ? ': ' + reasons.join(', ') : ''}`];
  }

  // --- Weighted overall with redistribution for missing categories --------
  const present = Object.keys(categoryScores);
  const totalWeight = present.reduce((acc, k) => acc + (CATEGORY_WEIGHTS[k] || 0), 0);
  let overall = 0;
  const breakdown = {};
  for (const k of Object.keys(CATEGORY_WEIGHTS)) {
    const weight = CATEGORY_WEIGHTS[k];
    const effectiveWeight = categoryScores[k] != null ? (weight / totalWeight) * 100 : 0;
    if (categoryScores[k] != null) {
      overall += categoryScores[k] * (weight / totalWeight);
    }
    breakdown[k] = {
      score: categoryScores[k] ?? null,
      weight,
      effectiveWeight: Math.round(effectiveWeight),
      contributing: notes[k] || [],
    };
  }

  const missing = Object.keys(CATEGORY_WEIGHTS).filter((k) => categoryScores[k] == null);

  // Critical-miss cap — a site that's missing 3+ of the four core
  // indexability signals (canonical, robots.txt, sitemap.xml, schema) is
  // effectively invisible to Google regardless of how well Lighthouse
  // scores its HTML hygiene. Cap the overall at 60 so the verdict label
  // tells the truth: this site needs real SEO work.
  const criticalMisses = [
    !rules?.robots?.present,
    !rules?.sitemap?.present,
    !rules?.schema?.present,
    !scraped?.canonical,
  ].filter(Boolean).length;
  let finalOverall = Math.round(Math.max(0, Math.min(100, overall)));
  let capped = false;
  if (criticalMisses >= 3 && finalOverall > 60) {
    finalOverall = 60;
    capped = true;
  }

  return {
    overall: finalOverall,
    breakdown,
    missing,
    criticalMisses,
    capped,
  };
}

module.exports = { computeScore, CATEGORY_WEIGHTS };
