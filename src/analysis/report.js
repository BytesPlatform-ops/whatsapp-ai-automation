const PDFDocument = require('pdfkit');
const { logger } = require('../utils/logger');

// ─── Brand tokens ──────────────────────────────────────────────────────────
// Single-tone dark teal header (not gradient). Whites + slates elsewhere.
// Green/amber/red accents ONLY on severity chips and checklist markers so
// the report looks like a diagnosis, not a marketing page.

const TEAL = '#0F766E';         // teal-700 — single header tone, section accents
const GREEN = '#16A34A';        // green-600 — "passed" items only
const GREEN_SOFT = '#DCFCE7';
const AMBER = '#D97706';        // amber-600 — partial / warning
const AMBER_SOFT = '#FEF3C7';
const RED = '#DC2626';          // red-600 — failures
const RED_SOFT = '#FEE2E2';

const INK = '#0F172A';
const INK_SOFT = '#1F2937';
const MUTED = '#475569';
const SUBTLE = '#94A3B8';
const BORDER = '#E2E8F0';
const SURFACE = '#F8FAFC';

// Tightened verdicts so a 70 no longer reads as "Good" when the site is
// missing canonical + robots + sitemap + schema. Honest thresholds create
// urgency; inflated ones kill conversion.
const SCORE_VERDICTS = [
  { min: 85, color: GREEN, label: 'Excellent' },
  { min: 75, color: TEAL, label: 'Good' },
  { min: 60, color: AMBER, label: 'Needs Attention' },
  { min: 45, color: '#EA580C', label: 'Poor' },
  { min: 0,  color: RED, label: 'Critical' },
];

const SEVERITY_STYLE = {
  high: { bg: RED_SOFT, fg: RED, label: 'HIGH' },
  medium: { bg: AMBER_SOFT, fg: AMBER, label: 'MEDIUM' },
  low: { bg: GREEN_SOFT, fg: GREEN, label: 'LOW' },
};

function verdictFor(score) {
  if (score == null) return SCORE_VERDICTS[SCORE_VERDICTS.length - 1];
  return SCORE_VERDICTS.find((s) => score >= s.min) || SCORE_VERDICTS[SCORE_VERDICTS.length - 1];
}

async function generateReport(url, audit) {
  const summary = buildWhatsAppSummary(url, audit);
  const pdfBuffer = await generatePdf(url, audit);
  return { summary, pdfBuffer };
}

function buildWhatsAppSummary(url, audit) {
  const score = audit?.score?.overall ?? null;
  const verdict = verdictFor(score);
  const lines = [];
  lines.push(`📊 *SEO Audit: ${url}*`);
  if (score != null) lines.push(`Overall: *${score}/100* — ${verdict.label}`);
  if (audit?.narration?.verdict) lines.push(`\n${audit.narration.verdict}`);
  if (Array.isArray(audit?.narration?.topRecommendations) && audit.narration.topRecommendations.length) {
    lines.push('\n*Top 3 things to fix:*');
    audit.narration.topRecommendations.slice(0, 3).forEach((r, i) => {
      lines.push(`${i + 1}. ${r.title}`);
    });
  }
  lines.push('\n_Full detailed report in the PDF._');
  let out = lines.join('\n');
  if (out.length > 950) out = out.slice(0, 947) + '...';
  return out;
}

/**
 * 2-page report (max). Page 1: identity, score, sub-scores, top 3 issues.
 * Page 2: technical checklist, Core Web Vitals (if measured), Lighthouse
 * opportunities (if measured), consolidated findings list. Sections that
 * have no data are skipped entirely — no "unavailable" placeholder that
 * wastes a page.
 */
function generatePdf(url, audit) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        bufferPages: true,
        info: { Title: 'SEO Audit Report', Author: 'Pixie', Subject: `SEO audit for ${url}`, Creator: 'pixiebot.co' },
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const LM = 50, RM = 50, CW = pageW - LM - RM;

      // ═════ PAGE 1 — Cover + Score + Top 3 Problems ═════
      drawHeaderBand(doc, pageW, url);
      doc.y = 170;

      drawScoreHero(doc, audit, { LM, CW });

      // NOTE: The Lighthouse sub-score grid (Performance / SEO Basics /
      // Accessibility / Best Practices) used to sit here. It was removed
      // from page 1 on purpose — non-technical owners saw three
      // "EXCELLENT" chips and instantly felt reassured, which killed
      // urgency for the real issues (indexability, security, CWV). The
      // weighted overall score + verdict + Top 3 + Business Impact now
      // carry page 1 alone. Lighthouse detail still reaches technical
      // readers via Performance Opportunities on page 2.

      // Methodology footnote — one line of transparency about what the
      // overall number rolls up. Doesn't expose individual sub-scores
      // (which would re-introduce reassurance), just names the categories.
      doc.moveDown(0.5);
      doc
        .fillColor(SUBTLE)
        .font('Helvetica-Oblique')
        .fontSize(8.5)
        .text(
          'Overall score weighs Performance, SEO, Core Web Vitals, Indexability, Accessibility, Best Practices, and Security.',
          LM,
          doc.y,
          { width: CW }
        );

      doc.moveDown(1);
      drawSectionTitle(doc, 'Top 3 Things to Fix', { LM });
      drawTopRecommendations(doc, audit, { LM, CW, pageH });

      // Business Impact callout — urgency-building summary. Renders inline
      // after the Top 3 cards. If page is close to full we add a page.
      if (Array.isArray(audit?.businessImpact) && audit.businessImpact.length > 0) {
        doc.moveDown(0.7);
        drawBusinessImpact(doc, audit, { LM, CW, pageH });
      }

      // ═════ PAGE 2 — Diagnostics (only if there's content) ═════
      const hasCwv = hasMeasuredCwv(audit);
      const hasPsiIssues = Array.isArray(audit?.topIssues) && audit.topIssues.length > 0;
      const hasFindings = hasAnyFindings(audit);
      const hasTechHealth = audit?.technicalHealth && Object.keys(audit.technicalHealth).length > 0;
      const hasLocal = !!(audit?.localSignals?.isLocal && (
        (Array.isArray(audit.localSignals.checks) && audit.localSignals.checks.length > 0) ||
        (Array.isArray(audit.localSignals.recommendations) && audit.localSignals.recommendations.length > 0)
      ));

      if (hasTechHealth || hasCwv || hasPsiIssues || hasFindings || hasLocal) {
        doc.addPage();
        drawCompactHeader(doc, pageW, 'Full Diagnostics');
        doc.y = 80;

        if (hasTechHealth) {
          drawSectionTitle(doc, 'Technical Health', { LM });
          drawTechnicalHealth(doc, audit, { LM, CW });
          doc.moveDown(1);
        }

        if (hasCwv) {
          ensureSpace(doc, pageH, 160);
          drawSectionTitle(doc, 'Core Web Vitals', { LM });
          drawCoreWebVitals(doc, audit, { LM, CW });
          doc.moveDown(1);
        }

        if (hasPsiIssues) {
          ensureSpace(doc, pageH, 160);
          drawSectionTitle(doc, 'Performance Opportunities', { LM });
          audit.topIssues.slice(0, 5).forEach((issue) => {
            // Estimate card height BEFORE rendering so long descriptions
            // never spill past the footer line. Mirrors the math in
            // drawDiagnosticCard so we never under-guess.
            doc.font('Helvetica').fontSize(9.5);
            const estH = Math.max(54, 26 + doc.heightOfString(issue.description || '', { width: CW - 24, lineGap: 2 }) + 12);
            ensureSpace(doc, pageH, estH + 10);
            drawDiagnosticCard(doc, issue, { LM, CW });
          });
          doc.moveDown(0.6);
        }

        if (hasLocal) {
          drawLocalSeoSection(doc, audit, { LM, CW, pageH });
          doc.moveDown(0.6);
        }

        if (hasFindings) {
          const flat = flattenFindings(audit);
          if (flat.length) {
            ensureSpace(doc, pageH, 150);
            drawSectionTitle(doc, 'Additional Findings', { LM });
            drawBulletList(doc, flat, { LM, CW, iconColor: TEAL, icon: '•' });
            doc.moveDown(0.6);
          }
        }

        // Always end with a CTA card that turns diagnosis into action.
        doc.moveDown(0.4);
        drawNextStepsCta(doc, audit, { LM, CW, pageH });
      }

      stampFooter(doc, pageW, pageH, LM, RM, CW);
      doc.end();
    } catch (err) {
      logger.error('[REPORT] PDF generation failed:', err.message);
      reject(err);
    }
  });
}

// ─── Content helpers ───────────────────────────────────────────────────────

function hasMeasuredCwv(audit) {
  const cwv = audit?.coreWebVitals;
  if (!cwv) return false;
  return Object.values(cwv).some((v) => v && v.value != null && v.verdict && v.verdict !== 'unknown');
}

function hasAnyFindings(audit) {
  const f = audit?.narration?.findings;
  if (!f) return false;
  return Object.values(f).some((arr) => Array.isArray(arr) && arr.length > 0);
}

/**
 * Build a keyword denylist for findings that are already covered by the
 * Technical Health checklist, Core Web Vitals rows, or Performance
 * Opportunities cards. The previous version repeated up to 5 of 8 bullets
 * across sections — pure noise. Now "Additional Findings" only surfaces
 * items the other sections DIDN'T already show.
 */
function buildCoveredKeywords(audit) {
  const covered = new Set();
  const t = audit?.technicalHealth || {};
  if (t.https) covered.add('https');
  if (t.viewport) covered.add('viewport');
  if (t.canonical) { covered.add('canonical'); }
  if (t.robots) { covered.add('robots.txt'); covered.add('robots'); }
  if (t.sitemap) { covered.add('sitemap'); }
  if (t.schema) { covered.add('schema'); covered.add('structured data'); covered.add('json-ld'); covered.add('json ld'); }
  if (t.security) { covered.add('security header'); }
  if (t.imageAlt) { covered.add('alt tag'); covered.add('alt text'); covered.add('alt-text'); }

  const cwv = audit?.coreWebVitals || {};
  if (cwv.lcp?.value != null) { covered.add('lcp'); covered.add('largest contentful'); }
  if (cwv.cls?.value != null) { covered.add('cls'); covered.add('layout shift'); }
  if (cwv.inp?.value != null) { covered.add('inp'); covered.add('interaction'); }
  if (cwv.fcp?.value != null) { covered.add('fcp'); covered.add('first contentful'); }
  if (cwv.tbt?.value != null) { covered.add('total blocking'); }
  if (cwv.si?.value != null) { covered.add('speed index'); }

  const issues = Array.isArray(audit?.topIssues) ? audit.topIssues.slice(0, 5) : [];
  issues.forEach((i) => {
    const words = String(i.title || '').toLowerCase().split(/\s+/).filter((w) => w.length >= 5);
    // Pick the longest 2 words per issue title as signature keywords.
    words.sort((a, b) => b.length - a.length);
    words.slice(0, 2).forEach((w) => covered.add(w));
  });

  return covered;
}

// Positivity filter — the section is called "Additional Findings" and
// should surface PROBLEMS the other sections didn't cover. If the LLM
// slipped in a compliment ("properly set", "adequately sized", "well
// formed") we drop it. The prompt tells it not to, but this is the
// defence-in-depth layer.
const POSITIVE_RX = /\b(properly|correctly|adequately|sufficient(?:ly)?|well[- ](?:formed|formulated|optimized|sized|structured)|appropriate(?:ly)?|good|acceptable|clean(?:ly)?|strong)\b/i;

function flattenFindings(audit) {
  const f = audit?.narration?.findings || {};
  const covered = buildCoveredKeywords(audit);
  const seen = new Set();
  const out = [];
  for (const arr of Object.values(f)) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const text = String(item || '').trim();
      if (!text) continue;
      const norm = text.toLowerCase();
      if (seen.has(norm)) continue;
      if (POSITIVE_RX.test(text)) continue; // skip positives
      let skip = false;
      for (const kw of covered) {
        if (kw && norm.includes(kw)) { skip = true; break; }
      }
      if (skip) continue;
      seen.add(norm);
      out.push(text);
      if (out.length >= 6) return out;
    }
  }
  // If fewer than 2 net-new problem findings survive, skip the section
  // entirely — better than showing a lonely single bullet or, worse, a
  // single positive line that undermines the rest of the report.
  return out.length >= 2 ? out : [];
}

function ensureSpace(doc, pageH, needed) {
  if (doc.y + needed > pageH - 70) doc.addPage();
}

// ─── Header band (single tone — not gradient anymore) ─────────────────────

function drawHeaderBand(doc, pageW, url) {
  const h = 130;
  doc.save();
  doc.rect(0, 0, pageW, h).fill(TEAL);
  doc.restore();
  // Subtle 1px accent line at band bottom
  doc.save();
  doc.rect(0, h - 1.5, pageW, 1.5).fill(GREEN);
  doc.restore();

  doc
    .fillColor('#FFFFFF').opacity(0.75)
    .font('Helvetica-Bold').fontSize(10)
    .text('PIXIE', 50, 36, { characterSpacing: 3 });
  doc.opacity(1);

  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold').fontSize(28)
    .text('SEO Audit Report', 50, 54);

  doc
    .fillColor('#FFFFFF').opacity(0.88)
    .font('Helvetica').fontSize(11)
    .text(url, 50, 94, { width: pageW - 230, lineBreak: false, ellipsis: true, link: url });
  doc.opacity(1);

  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc
    .fillColor('#FFFFFF').opacity(0.7)
    .font('Helvetica-Bold').fontSize(9)
    .text('REPORT DATE', pageW - 150, 78, { width: 100, align: 'right', characterSpacing: 2 });
  doc
    .fillColor('#FFFFFF').opacity(1)
    .font('Helvetica').fontSize(11)
    .text(dateStr, pageW - 200, 94, { width: 150, align: 'right' });
}

function drawCompactHeader(doc, pageW, label) {
  doc.save();
  doc.rect(0, 0, pageW, 36).fill(TEAL);
  doc.restore();
  doc.save();
  doc.rect(0, 34, pageW, 1.5).fill(GREEN);
  doc.restore();

  doc
    .fillColor('#FFFFFF').opacity(0.75)
    .font('Helvetica-Bold').fontSize(9)
    .text('PIXIE · SEO AUDIT', 50, 13, { characterSpacing: 2 });
  doc.opacity(1);

  doc
    .fillColor('#FFFFFF').opacity(0.88)
    .font('Helvetica').fontSize(10)
    .text(label, pageW - 250, 13, { width: 200, align: 'right' });
  doc.opacity(1);
}

function drawSectionTitle(doc, text, { LM }) {
  doc
    .fillColor(INK_SOFT)
    .font('Helvetica-Bold').fontSize(16)
    .text(text, LM, doc.y);
  const y = doc.y + 2;
  doc.save();
  doc.strokeColor(TEAL).lineWidth(2.5).moveTo(LM, y).lineTo(LM + 40, y).stroke();
  doc.restore();
  doc.moveDown(0.7);
}

// ─── Score hero ────────────────────────────────────────────────────────────

function drawScoreHero(doc, audit, { LM, CW }) {
  const score = audit?.score?.overall ?? null;
  const v = verdictFor(score);
  const cardY = doc.y;
  const cardH = 150;

  doc.save();
  doc.roundedRect(LM, cardY, CW, cardH, 8).fillAndStroke(SURFACE, BORDER);
  doc.restore();

  const ringSize = 108;
  const ringX = LM + 26;
  const ringY = cardY + (cardH - ringSize) / 2;
  drawScoreRing(doc, ringX, ringY, ringSize, score, v.color);

  // Score number + "/100" suffix rendered as a single baseline-aligned unit,
  // horizontally centered in the ring. The previous layout dropped "/100"
  // below the number's baseline which looked like a floating subscript.
  const num = score == null ? '—' : String(score);
  const numSize = score == null ? 32 : 38;
  const suffix = '/100';
  const suffixSize = 10;

  doc.font('Helvetica-Bold').fontSize(numSize);
  const numW = doc.widthOfString(num);
  const numH = doc.currentLineHeight();

  doc.font('Helvetica').fontSize(suffixSize);
  const suffixW = doc.widthOfString(suffix);
  const suffixH = doc.currentLineHeight();

  // Combined block width (with 4px breathing space between big number and suffix)
  const gap = 4;
  const totalW = numW + gap + suffixW;
  const startX = ringX + (ringSize - totalW) / 2;
  const numY = ringY + (ringSize - numH) / 2 - 4;

  // Big number
  doc.fillColor(v.color).font('Helvetica-Bold').fontSize(numSize)
    .text(num, startX, numY, { lineBreak: false });

  // Suffix, baseline-aligned to the big number — so "/100" sits flush with
  // the bottom of the digits instead of hovering at their midpoint.
  const baseline = numY + numH;
  const suffixY = baseline - suffixH + 2;
  doc.fillColor(MUTED).font('Helvetica').fontSize(suffixSize)
    .text(suffix, startX + numW + gap, suffixY, { lineBreak: false });

  const labelX = ringX + ringSize + 26;
  const labelW = CW - (labelX - LM) - 20;
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9).text('OVERALL SCORE', labelX, cardY + 30, { characterSpacing: 2, width: labelW });
  doc.fillColor(v.color).font('Helvetica-Bold').fontSize(22).text(v.label, labelX, cardY + 46, { width: labelW });

  const verdictCopy = audit?.narration?.verdict || 'Measured from Google PageSpeed Insights, Core Web Vitals, and static SEO signals.';
  doc.fillColor(MUTED).font('Helvetica').fontSize(10.5)
    .text(verdictCopy, labelX, cardY + 78, { width: labelW, lineGap: 2 });

  doc.x = LM;
  doc.y = cardY + cardH + 18;
}

function drawScoreRing(doc, x, y, size, score, color) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size / 2 - 5.5;
  const pct = Math.max(0, Math.min(100, score ?? 0)) / 100;

  // Track
  doc.save();
  doc.lineWidth(10).strokeColor(BORDER).circle(cx, cy, r).stroke();
  doc.restore();

  if (pct > 0) {
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (2 * Math.PI * pct);
    const steps = Math.max(40, Math.round(120 * pct));
    const step = (endAngle - startAngle) / steps;
    doc.save();
    doc.lineWidth(10).strokeColor(color).lineCap('round');
    doc.moveTo(cx + r * Math.cos(startAngle), cy + r * Math.sin(startAngle));
    for (let i = 1; i <= steps; i++) {
      const a = startAngle + step * i;
      doc.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    doc.stroke();
    doc.restore();
  }
}

// ─── Sub-score grid (only shown when Lighthouse returned data) ────────────

function drawSubScoreGrid(doc, audit, { LM, CW }) {
  const lh = audit?.lighthouse;
  // Renamed "SEO" → "SEO BASICS" so users don't confuse this narrow
  // Lighthouse score with the broader Technical Health section (which
  // checks canonical / robots / sitemap / schema / security — signals
  // Lighthouse SEO doesn't cover).
  const cells = [
    { label: 'PERFORMANCE', val: lh?.performance ?? null },
    { label: 'SEO BASICS', val: lh?.seo ?? null },
    { label: 'ACCESSIBILITY', val: lh?.accessibility ?? null },
    { label: 'BEST PRACTICES', val: lh?.bestPractices ?? null },
  ];
  if (cells.every((c) => c.val == null)) return;

  const cellW = (CW - 18) / 4;
  const cellH = 84; // Taller now — makes room for the verdict chip.
  const y = doc.y;
  cells.forEach((c, i) => {
    const x = LM + i * (cellW + 6);
    const v = subScoreVerdict(c.val);
    doc.save();
    doc.roundedRect(x, y, cellW, cellH, 6).fillAndStroke('#FFFFFF', BORDER);
    doc.restore();
    doc.save();
    doc.rect(x, y, 3, cellH).fill(v.color);
    doc.restore();
    const valStr = c.val == null ? '—' : String(c.val);
    doc.fillColor(v.color).font('Helvetica-Bold').fontSize(24).text(valStr, x + 14, y + 14, { lineBreak: false });
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text(c.label, x + 14, y + 46, { characterSpacing: 1.3, width: cellW - 20 });

    // Verdict chip — gives users a read on "is this score actually good?"
    // without needing to know what a good Lighthouse number looks like.
    if (c.val != null) {
      const chipY = y + 62;
      doc.font('Helvetica-Bold').fontSize(7.5);
      const chipLabel = v.label.toUpperCase();
      const chipW = doc.widthOfString(chipLabel) + 12;
      doc.save();
      doc.roundedRect(x + 14, chipY, chipW, 13, 6).fill(v.bg);
      doc.restore();
      doc.fillColor(v.color).font('Helvetica-Bold').fontSize(7.5)
        .text(chipLabel, x + 14, chipY + 3, { width: chipW, align: 'center', characterSpacing: 1 });
    }
  });
  doc.y = y + cellH + 12;
}

/**
 * Map a 0-100 sub-score to a verdict label + color + soft-bg pair.
 * Mirrors Lighthouse's official thresholds (90+ / 50-89 / <50).
 */
function subScoreVerdict(v) {
  if (v == null) return { label: 'N/A', color: MUTED, bg: SURFACE };
  if (v >= 90) return { label: 'Excellent', color: GREEN, bg: GREEN_SOFT };
  if (v >= 75) return { label: 'Good', color: TEAL, bg: '#CCFBF1' };
  if (v >= 50) return { label: 'OK', color: AMBER, bg: AMBER_SOFT };
  return { label: 'Poor', color: RED, bg: RED_SOFT };
}

// ─── Top 3 recommendations ────────────────────────────────────────────────

function drawTopRecommendations(doc, audit, { LM, CW, pageH }) {
  const recs = audit?.narration?.topRecommendations || [];
  if (!recs.length) {
    doc.font('Helvetica-Oblique').fontSize(11).fillColor(MUTED)
      .text('No recommendations returned.', LM, doc.y);
    return;
  }
  recs.forEach((r, i) => {
    const sev = SEVERITY_STYLE[r.severity] || SEVERITY_STYLE.medium;

    // Measure the why-text so the card grows to fit — previously a fixed
    // 62px height caused long why lines to wrap past the bottom border.
    const textX = LM + 38;
    const textW = CW - 54;
    const titleTop = 28;
    const whyTop = 44;
    const bottomPad = 12;

    doc.font('Helvetica').fontSize(10);
    const whyHeight = doc.heightOfString(String(r.why || ''), { width: textW, lineGap: 2 });
    const cardH = Math.max(62, whyTop + whyHeight + bottomPad);

    if (doc.y + cardH + 12 > pageH - 70) doc.addPage();
    const y = doc.y;

    doc.save();
    doc.roundedRect(LM, y, CW, cardH, 6).fillAndStroke(SURFACE, BORDER);
    doc.restore();
    doc.save();
    doc.rect(LM, y, 4, cardH).fill(sev.fg);
    doc.restore();

    // Number
    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(13)
      .text(String(i + 1), LM + 16, y + 12, { lineBreak: false });

    // Severity chip
    const chipX = LM + 38;
    const chipY = y + 13;
    doc.font('Helvetica-Bold').fontSize(7.5);
    const chipW = doc.widthOfString(sev.label) + 12;
    doc.save();
    doc.roundedRect(chipX, chipY, chipW, 13, 6).fill(sev.bg);
    doc.restore();
    doc.fillColor(sev.fg).font('Helvetica-Bold').fontSize(7.5)
      .text(sev.label, chipX, chipY + 3, { width: chipW, align: 'center', characterSpacing: 1 });

    // Title (still single line — trimmed to fit)
    doc.fillColor(INK_SOFT).font('Helvetica-Bold').fontSize(12)
      .text(r.title, textX, y + titleTop, { width: textW, lineBreak: false, ellipsis: true });

    // Why — now allowed to wrap to multiple lines within the dynamic card.
    doc.fillColor(MUTED).font('Helvetica').fontSize(10)
      .text(String(r.why || ''), textX, y + whyTop, { width: textW, lineGap: 2 });

    doc.x = LM;
    doc.y = y + cardH + 8;
  });
}

// ─── Technical Health (issues emphasised; passed items muted) ─────────────

function drawTechnicalHealth(doc, audit, { LM, CW }) {
  const t = audit?.technicalHealth || {};
  const order = ['https', 'viewport', 'canonical', 'robots', 'sitemap', 'schema', 'security', 'imageAlt'];
  // Sort so failures and partial items appear first — the report visually
  // leads with what's broken, not with passes.
  const items = order
    .map((k) => ({ key: k, ...(t[k] || {}) }))
    .filter((i) => i.label)
    .sort((a, b) => rankStatus(a) - rankStatus(b));

  items.forEach((item) => {
    const status = item.pass ? 'pass' : item.partial ? 'partial' : 'fail';
    const color = status === 'pass' ? GREEN : status === 'partial' ? AMBER : RED;
    const bg = status === 'pass' ? GREEN_SOFT : status === 'partial' ? AMBER_SOFT : RED_SOFT;

    // Rows with a "why this matters" consequence line are taller. Passed
    // rows stay compact — we don't need to explain why HTTPS being on is
    // good.
    const hasWhy = !item.pass && !!item.why;
    const rowH = hasWhy ? 46 : 26;
    const y = doc.y;

    const cx = LM + 9;
    const cy = y + (hasWhy ? 13 : rowH / 2);
    doc.save();
    doc.circle(cx, cy, 8).fill(bg);
    doc.restore();
    drawStatusIcon(doc, cx, cy, status, color);

    // Passed items are muted; failures stay dark for visual emphasis.
    const labelColor = status === 'pass' ? MUTED : INK_SOFT;
    doc.fillColor(labelColor).font(status === 'pass' ? 'Helvetica' : 'Helvetica-Bold').fontSize(10.5)
      .text(item.label, LM + 24, y + (hasWhy ? 7 : rowH / 2 - 5.5), { width: CW - 36, lineBreak: false, ellipsis: true });

    // "Why this matters" consequence line — only on failures. Non-technical
    // owners otherwise see a red X with no idea why they should care.
    if (hasWhy) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(9)
        .text(item.why, LM + 24, y + 22, { width: CW - 36, lineGap: 1.5 });
    }

    doc.save();
    doc.strokeColor(BORDER).lineWidth(0.5).moveTo(LM, y + rowH).lineTo(LM + CW, y + rowH).stroke();
    doc.restore();
    doc.x = LM;
    doc.y = y + rowH + 4;
  });
}

// ─── Business Impact callout (page 1) ─────────────────────────────────────

function drawBusinessImpact(doc, audit, { LM, CW, pageH }) {
  const lines = audit?.businessImpact || [];
  if (!lines.length) return;
  ensureSpace(doc, pageH, 60 + lines.length * 24);

  const y = doc.y;
  const padX = 14;
  const padY = 12;
  doc.font('Helvetica').fontSize(10);
  const textH = lines.reduce((sum, line) => sum + doc.heightOfString(line, { width: CW - padX * 2 - 14, lineGap: 2 }) + 6, 0);
  const headerH = 22;
  const cardH = headerH + padY + textH + padY - 6;

  // Amber-tinted card to signal "pay attention to this" without feeling alarmist.
  doc.save();
  doc.roundedRect(LM, y, CW, cardH, 8).fillAndStroke(AMBER_SOFT, AMBER);
  doc.restore();
  // Left accent bar for emphasis
  doc.save();
  doc.rect(LM, y, 4, cardH).fill(AMBER);
  doc.restore();

  doc
    .fillColor(AMBER)
    .font('Helvetica-Bold').fontSize(9)
    .text('BUSINESS IMPACT', LM + padX, y + padY - 2, { characterSpacing: 2 });
  let cursorY = y + padY + headerH - 6;
  lines.forEach((line) => {
    // Bullet
    doc.fillColor(AMBER).font('Helvetica-Bold').fontSize(11)
      .text('•', LM + padX, cursorY, { lineBreak: false });
    doc.fillColor(INK).font('Helvetica').fontSize(10)
      .text(line, LM + padX + 14, cursorY, { width: CW - padX * 2 - 14, lineGap: 2 });
    cursorY = doc.y + 4;
  });
  doc.x = LM;
  doc.y = y + cardH + 14;
}

// ─── Local SEO section (shown only when local signals detected) ──────────

function drawLocalSeoSection(doc, audit, { LM, CW, pageH }) {
  const local = audit?.localSignals;
  if (!local?.isLocal) return;
  // Prefer the new structured `checks` array (pass + fail items shown as a
  // mini-checklist). Fall back to legacy `recommendations` (fails only) so
  // older audits still render.
  const checks = Array.isArray(local.checks) ? local.checks : null;
  const legacy = Array.isArray(local.recommendations) ? local.recommendations : [];
  if ((!checks || !checks.length) && legacy.length === 0) return;

  const rows = checks
    ? checks
    : legacy.map((text) => ({ ok: false, text }));

  ensureSpace(doc, pageH, 80 + rows.length * 28);
  drawSectionTitle(doc, 'Local Business Checks', { LM });

  doc
    .fillColor(MUTED)
    .font('Helvetica-Oblique').fontSize(9.5)
    .text('Detected local-business signals. These checks matter most for restaurants, storefronts, and service-area businesses.',
      LM, doc.y, { width: CW, lineGap: 2 });
  doc.moveDown(0.6);

  rows.forEach((row) => {
    const y = doc.y;
    const status = row.ok ? 'pass' : 'fail';
    const color = row.ok ? GREEN : RED;
    const bg = row.ok ? GREEN_SOFT : RED_SOFT;

    // Small disc + vector icon (same visual language as Technical Health).
    doc.save();
    doc.circle(LM + 8, y + 7, 7).fill(bg);
    doc.restore();
    drawStatusIcon(doc, LM + 8, y + 7, status, color);

    // Body text — dim passing rows a touch, keep failures dark for emphasis.
    doc.fillColor(row.ok ? MUTED : INK).font('Helvetica').fontSize(10.5)
      .text(String(row.text), LM + 22, y, { width: CW - 22, lineGap: 3 });
    doc.moveDown(0.25);
  });
}

// ─── Next Steps CTA (end of report) ──────────────────────────────────────

function drawNextStepsCta(doc, audit, { LM, CW, pageH }) {
  ensureSpace(doc, pageH, 110);
  const y = doc.y;
  const cardH = 84;

  doc.save();
  doc.roundedRect(LM, y, CW, cardH, 8).fill(TEAL);
  doc.restore();

  doc
    .fillColor('#FFFFFF').opacity(0.8)
    .font('Helvetica-Bold').fontSize(9)
    .text('NEXT STEPS', LM + 18, y + 14, { characterSpacing: 2 });
  doc.opacity(1);

  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold').fontSize(15)
    .text('Ready to fix these issues?', LM + 18, y + 28, { lineBreak: false });

  doc
    .fillColor('#FFFFFF').opacity(0.9)
    .font('Helvetica').fontSize(10.5)
    .text('Reply on WhatsApp — Pixie can scope a fix for the issues above and ship updates in days, not months.',
      LM + 18, y + 50, { width: CW - 36, lineGap: 2 });
  doc.opacity(1);

  doc.x = LM;
  doc.y = y + cardH + 10;
}

/**
 * Draw a check / cross / exclamation as vector lines, centered on (cx, cy).
 * No font dependency — works regardless of what glyphs Helvetica ships.
 */
function drawStatusIcon(doc, cx, cy, status, color) {
  doc.save();
  doc.strokeColor(color).lineWidth(1.8).lineCap('round').lineJoin('round');
  if (status === 'pass') {
    // Checkmark: short stroke down-right, then longer stroke up-right
    doc.moveTo(cx - 4, cy + 0.5)
      .lineTo(cx - 1, cy + 3)
      .lineTo(cx + 4, cy - 3)
      .stroke();
  } else if (status === 'fail') {
    // X: two diagonals
    doc.moveTo(cx - 3.5, cy - 3.5).lineTo(cx + 3.5, cy + 3.5).stroke();
    doc.moveTo(cx + 3.5, cy - 3.5).lineTo(cx - 3.5, cy + 3.5).stroke();
  } else {
    // Partial / warning: vertical stroke + dot = "!"
    doc.moveTo(cx, cy - 4).lineTo(cx, cy + 1).stroke();
    doc.restore();
    doc.save();
    doc.fillColor(color).circle(cx, cy + 3, 0.9).fill();
  }
  doc.restore();
}

function rankStatus(item) {
  if (item.pass) return 2;
  if (item.partial) return 1;
  return 0; // fail first
}

// ─── Core Web Vitals (compact) ────────────────────────────────────────────

function drawCoreWebVitals(doc, audit, { LM, CW }) {
  const cwv = audit?.coreWebVitals || {};
  // Plain-English help text — acronyms alone (LCP, INP...) don't mean
  // anything to a small-business owner. Each label is what the metric
  // actually answers in everyday terms.
  const rows = [
    { key: 'lcp', label: 'LCP', help: 'How fast the main content appears' },
    { key: 'cls', label: 'CLS', help: 'How stable the page is while loading' },
    { key: 'inp', label: 'INP', help: 'How quickly taps and clicks respond' },
    { key: 'fcp', label: 'FCP', help: 'When the first text or image shows up' },
  ];
  rows.forEach((r) => {
    const v = cwv[r.key];
    if (!v || v.value == null) return;
    const y = doc.y;
    const rowH = 42;
    const verdictColor = v.verdict === 'good' ? GREEN : v.verdict === 'needs-improvement' ? AMBER : v.verdict === 'poor' ? RED : MUTED;
    const verdictBg = v.verdict === 'good' ? GREEN_SOFT : v.verdict === 'needs-improvement' ? AMBER_SOFT : v.verdict === 'poor' ? RED_SOFT : SURFACE;
    const verdictLabel = v.verdict === 'good' ? 'GOOD' : v.verdict === 'needs-improvement' ? 'NEEDS WORK' : v.verdict === 'poor' ? 'POOR' : 'N/A';

    doc.save();
    doc.roundedRect(LM, y, CW, rowH, 6).fillAndStroke(SURFACE, BORDER);
    doc.restore();
    doc.fillColor(INK_SOFT).font('Helvetica-Bold').fontSize(11).text(r.label, LM + 14, y + 9, { lineBreak: false });
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(r.help, LM + 14, y + 24, { width: CW - 180, lineBreak: false });
    doc.fillColor(INK_SOFT).font('Helvetica-Bold').fontSize(13).text(v.displayValue || '—', LM + CW - 180, y + 13, { width: 90, align: 'right', lineBreak: false });
    const chipX = LM + CW - 80;
    doc.save();
    doc.roundedRect(chipX, y + 13, 64, 16, 8).fill(verdictBg);
    doc.restore();
    doc.fillColor(verdictColor).font('Helvetica-Bold').fontSize(8)
      .text(verdictLabel, chipX, y + 17, { width: 64, align: 'center', characterSpacing: 1 });
    doc.x = LM;
    doc.y = y + rowH + 5;
  });
}

// ─── PSI diagnostic cards ─────────────────────────────────────────────────

function drawDiagnosticCard(doc, issue, { LM, CW }) {
  const y = doc.y;
  const sev = SEVERITY_STYLE[issue.severity] || SEVERITY_STYLE.medium;

  // Measure description first so the card grows to fit — otherwise long
  // Lighthouse descriptions spill out of the bottom border.
  const titlePad = 9;
  const descTop = 26;
  const descWidth = CW - 24;
  const descBottomPad = 10;

  doc.font('Helvetica').fontSize(9.5);
  const descHeight = doc.heightOfString(issue.description || '', { width: descWidth, lineGap: 2 });
  const cardH = Math.max(50, descTop + descHeight + descBottomPad);

  doc.save();
  doc.roundedRect(LM, y, CW, cardH, 6).fillAndStroke(SURFACE, BORDER);
  doc.restore();
  doc.save();
  doc.rect(LM, y, 3, cardH).fill(sev.fg);
  doc.restore();

  doc.fillColor(INK_SOFT).font('Helvetica-Bold').fontSize(10.5)
    .text(issue.title, LM + 12, y + titlePad, { width: CW - 110, lineBreak: false, ellipsis: true });

  // Right-side badge: always shown, so cards look visually consistent.
  // Prefer concrete savings (-780ms / -120KB) when Lighthouse provides them;
  // fall back to the severity pill (HIGH/MEDIUM/LOW) so the card never ends
  // with a blank right edge that reads as "this one doesn't matter".
  if (issue.savingsMs > 100) {
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(9)
      .text(`-${issue.savingsMs} ms`, LM + CW - 80, y + titlePad + 2, { width: 72, align: 'right', lineBreak: false });
  } else if (issue.savingsKb > 10) {
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(9)
      .text(`-${issue.savingsKb} KB`, LM + CW - 80, y + titlePad + 2, { width: 72, align: 'right', lineBreak: false });
  } else {
    // Severity chip — same styling as the Top 3 cards so visual language
    // is consistent across the report.
    doc.font('Helvetica-Bold').fontSize(7.5);
    const chipW = doc.widthOfString(sev.label) + 12;
    const chipX = LM + CW - chipW - 10;
    const chipY = y + titlePad + 1;
    doc.save();
    doc.roundedRect(chipX, chipY, chipW, 13, 6).fill(sev.bg);
    doc.restore();
    doc.fillColor(sev.fg).font('Helvetica-Bold').fontSize(7.5)
      .text(sev.label, chipX, chipY + 3, { width: chipW, align: 'center', characterSpacing: 1 });
  }

  doc.fillColor(MUTED).font('Helvetica').fontSize(9.5)
    .text(issue.description || '', LM + 12, y + descTop, { width: descWidth, lineGap: 2 });
  doc.x = LM;
  doc.y = y + cardH + 6;
}

// ─── Bullet list (used for flattened findings) ────────────────────────────

function drawBulletList(doc, items, { LM, CW, iconColor = TEAL, icon = '•' }) {
  if (!Array.isArray(items) || !items.length) return;
  items.forEach((text) => {
    const y = doc.y;
    doc.fillColor(iconColor).font('Helvetica-Bold').fontSize(11)
      .text(icon, LM + 4, y, { width: 12, lineBreak: false });
    doc.fillColor(INK).font('Helvetica').fontSize(10.5)
      .text(String(text), LM + 20, y, { width: CW - 20, lineGap: 3 });
    doc.moveDown(0.25);
  });
}

// ─── Footer (consistent on every page) ────────────────────────────────────

function stampFooter(doc, pageW, pageH, LM, RM, CW) {
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    const savedBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const footerY = pageH - 36;
    doc.save();
    doc.strokeColor(TEAL).lineWidth(0.8)
      .moveTo(LM, footerY - 10).lineTo(pageW - RM, footerY - 10).stroke();
    doc.restore();

    doc.fillColor(SUBTLE).font('Helvetica').fontSize(9)
      .text('Generated by Pixie  ·  pixiebot.co', LM, footerY, { width: CW / 2, lineBreak: false });
    doc.fillColor(SUBTLE).font('Helvetica').fontSize(9)
      .text(`Page ${i + 1} of ${pages.count}`, pageW - RM - 100, footerY, { width: 100, align: 'right', lineBreak: false });

    doc.page.margins.bottom = savedBottomMargin;
  }
}

module.exports = { generateReport };
