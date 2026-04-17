const PDFDocument = require('pdfkit');
const { formatWhatsApp } = require('../utils/formatWhatsApp');
const { logger } = require('../utils/logger');

// ─── Design tokens ─────────────────────────────────────────────────────────
// Professional navy palette. All colour decisions live here so the look can
// be adjusted without hunting through render code.
const BRAND = '#0F2A52';        // deep navy — primary (headers, underlines)
const BRAND_SOFT = '#1E3A8A';   // blue-800 — accent stripe on cover band
const INK = '#111827';          // near-black — body text
const MUTED = '#4B5563';        // gray-600 — secondary copy
const SUBTLE = '#9CA3AF';       // gray-400 — footer, dates
const BORDER = '#E5E7EB';       // gray-200 — hairlines / card borders
const SURFACE = '#F9FAFB';      // gray-50 — score-card background

const SCORE_PALETTE = [
  { min: 80, color: '#047857', label: 'Strong' },           // emerald-700
  { min: 60, color: '#B45309', label: 'Room to Improve' },  // amber-700
  { min: 40, color: '#C2410C', label: 'Needs Work' },       // orange-700
  { min: 0,  color: '#B91C1C', label: 'Critical' },         // red-700
];

/**
 * Generate a WhatsApp-friendly summary and a PDF report from the analysis.
 * @param {string} url - The analyzed URL
 * @param {string} analysis - Full LLM analysis text
 * @returns {Promise<{summary: string, pdfBuffer: Buffer}>}
 */
async function generateReport(url, analysis) {
  // 1. Short WhatsApp summary (under 1000 chars).
  const formatted = formatWhatsApp(analysis);
  const lines = formatted.split('\n').filter((l) => l.trim());
  let summary = `📊 *Website Analysis: ${url}*\n\n`;
  let charCount = summary.length;
  for (const line of lines) {
    if (charCount + line.length + 1 > 950) break;
    summary += line + '\n';
    charCount += line.length + 1;
  }
  summary += '\n_Full detailed report available as PDF._';

  // 2. PDF report.
  const pdfBuffer = await generatePdf(url, analysis);
  return { summary, pdfBuffer };
}

/**
 * Pull a 0-100 score out of the analysis text. Returns null when nothing
 * matches — the PDF then just skips the score card and the body still renders
 * correctly. Pattern mirrors the one admin/queries.js uses so the UI and PDF
 * agree on what "the score" means.
 */
function extractScore(analysis) {
  if (!analysis) return null;
  const m = String(analysis).match(/(?:overall\s*score|score)\s*[:\-]?\s*(\d{1,3})\s*(?:\/\s*100|out of 100)?/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

function verdictFor(score) {
  return SCORE_PALETTE.find((s) => score >= s.min) || SCORE_PALETTE[SCORE_PALETTE.length - 1];
}

/**
 * Generate the branded PDF. Pages are buffered so a consistent footer (page
 * number + Pixie credit) can be stamped on every page at the end, regardless
 * of how many pages the body content spilled into.
 */
function generatePdf(url, analysis) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        bufferPages: true,
        info: {
          Title: 'SEO Audit Report',
          Author: 'Pixie',
          Subject: `SEO audit for ${url}`,
        },
      });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const leftMargin = 50;
      const rightMargin = 50;
      const contentWidth = pageWidth - leftMargin - rightMargin;

      // ─── Cover header band ─────────────────────────────────────────────
      // Full-bleed indigo rectangle across the top of page 1. Contains the
      // report title, the URL it was run against, and a small "PIXIE" brand
      // mark top-right so the cover reads as branded without needing a logo
      // file shipped in-repo.
      const headerH = 150;
      doc.save();
      doc.rect(0, 0, pageWidth, headerH).fill(BRAND);
      doc.restore();

      // Thin hairline at the bottom of the band for a more editorial feel
      // than the chunky accent stripe the first cut used.
      doc.save();
      doc.rect(0, headerH - 2, pageWidth, 2).fill(BRAND_SOFT);
      doc.restore();

      // Title.
      doc
        .fillColor('#FFFFFF')
        .fontSize(26)
        .font('Helvetica-Bold')
        .text('SEO AUDIT REPORT', leftMargin, 42, { width: contentWidth, characterSpacing: 0.5 });

      // "Prepared for" label.
      doc
        .fillColor('#FFFFFF', 0.72)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('PREPARED FOR', leftMargin, 86, { characterSpacing: 2 });

      // URL value (clickable).
      doc
        .fillColor('#FFFFFF')
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(url, leftMargin, 100, {
          width: contentWidth - 180,
          link: url,
          underline: false,
          lineBreak: false,
          ellipsis: true,
        });

      // Date (right-aligned inside header).
      const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      doc
        .fillColor('#FFFFFF', 0.72)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('DATE', pageWidth - 150, 86, { width: 100, align: 'right', characterSpacing: 2 });
      doc
        .fillColor('#FFFFFF')
        .fontSize(13)
        .font('Helvetica')
        .text(dateStr, pageWidth - 200, 100, { width: 150, align: 'right' });

      // Move the cursor below the header for everything else.
      doc.y = headerH + 28;
      doc.x = leftMargin;

      // ─── Score callout ─────────────────────────────────────────────────
      const score = extractScore(analysis);
      if (score != null) {
        const v = verdictFor(score);
        const cardY = doc.y;
        const cardH = 96;

        // Card background + left accent bar.
        doc.save();
        doc.roundedRect(leftMargin, cardY, contentWidth, cardH, 8).fill(SURFACE);
        doc.rect(leftMargin, cardY, 6, cardH).fill(v.color);
        doc.restore();

        // Score number — sized down so it reads as a statistic, not a badge.
        doc
          .fillColor(v.color)
          .fontSize(40)
          .font('Helvetica-Bold')
          .text(String(score), leftMargin + 26, cardY + 22, { lineBreak: false });

        // "/100" subdued, inline with the big number.
        const numWidth = doc.widthOfString(String(score));
        doc
          .fillColor(MUTED)
          .fontSize(16)
          .font('Helvetica')
          .text('/ 100', leftMargin + 26 + numWidth + 6, cardY + 44, { lineBreak: false });

        // Right-side labels.
        doc
          .fillColor(MUTED)
          .fontSize(9)
          .font('Helvetica-Bold')
          .text('OVERALL SCORE', leftMargin + 180, cardY + 22, { characterSpacing: 2 });
        doc
          .fillColor(v.color)
          .fontSize(20)
          .font('Helvetica-Bold')
          .text(v.label, leftMargin + 180, cardY + 38, { width: contentWidth - 180 });
        doc
          .fillColor(MUTED)
          .fontSize(10)
          .font('Helvetica')
          .text('Based on the findings summarised in this report.', leftMargin + 180, cardY + 66, { width: contentWidth - 180 });

        doc.y = cardY + cardH + 22;
        doc.x = leftMargin;
      }

      // ─── Body ──────────────────────────────────────────────────────────
      // Line-level structure (lists, `##` headings) is detected from the raw
      // text; inline **bold** runs are preserved and rendered in bold.
      const body = String(analysis || '').split('\n');

      // Strip _inline_ markdown (italic, code, underscore-bold) — anything
      // that isn't `**bold**`, which we render with emphasis.
      const stripNonBold = (s) => s
        .replace(/\*(?!\*)(.+?)\*(?!\*)/g, '$1')   // *italic* → italic
        .replace(/__(.+?)__/g, '$1')
        .replace(/`(.+?)`/g, '$1');

      // Split a line into alternating normal / bold segments based on
      // `**...**` markers. Always returns at least one segment.
      const segmentBold = (raw) => {
        const text = stripNonBold(raw);
        const out = [];
        const re = /\*\*([\s\S]+?)\*\*/g;
        let last = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
          if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false });
          out.push({ text: m[1], bold: true });
          last = m.index + m[0].length;
        }
        if (last < text.length) out.push({ text: text.slice(last), bold: false });
        if (out.length === 0) out.push({ text, bold: false });
        return out;
      };

      // Render a line with mixed bold/regular runs using `continued: true`
      // chains. First call optionally absolute-positions (x, y, width) —
      // subsequent calls flow naturally on the same paragraph.
      const renderInline = (raw, opts = {}) => {
        const { x, y, width, boldColor = INK, baseColor = INK, fontSize = 11 } = opts;
        const segs = segmentBold(raw);
        segs.forEach((seg, i) => {
          const isLast = i === segs.length - 1;
          const font = seg.bold ? 'Helvetica-Bold' : 'Helvetica';
          const color = seg.bold ? boldColor : baseColor;
          doc.font(font).fillColor(color).fontSize(fontSize);
          if (i === 0 && x != null && y != null) {
            doc.text(seg.text, x, y, { continued: !isLast, width });
          } else if (i === 0 && width != null) {
            doc.text(seg.text, { continued: !isLast, width });
          } else {
            doc.text(seg.text, { continued: !isLast });
          }
        });
      };

      // Helper: draw a short navy accent underline below big section headers.
      const drawAccentUnderline = () => {
        const y = doc.y + 2;
        doc.save();
        doc.strokeColor(BRAND).lineWidth(2.5)
          .moveTo(leftMargin, y).lineTo(leftMargin + 42, y).stroke();
        doc.restore();
        doc.moveDown(0.6);
      };

      // Set default body style.
      doc.fillColor(INK).fontSize(11).font('Helvetica');

      for (const rawLine of body) {
        const line = rawLine.replace(/\t/g, '  ');
        const trimmed = line.trim();

        // Blank line → a bit of breathing room.
        if (!trimmed) {
          doc.moveDown(0.45);
          continue;
        }

        // Markdown headings (#, ##, ###, etc.).
        if (/^#{1,6}\s+/.test(trimmed)) {
          const level = trimmed.match(/^#+/)[0].length;
          const headerText = stripNonBold(trimmed.replace(/^#+\s*/, '')).replace(/\*\*/g, '');

          // Keep headings from landing at the very bottom of a page.
          if (doc.y > pageHeight - 120) doc.addPage();

          if (level <= 2) {
            doc
              .moveDown(0.7)
              .fontSize(17)
              .font('Helvetica-Bold')
              .fillColor(INK)
              .text(headerText);
            drawAccentUnderline();
          } else {
            doc
              .moveDown(0.5)
              .fontSize(13)
              .font('Helvetica-Bold')
              .fillColor(BRAND)
              .text(headerText)
              .moveDown(0.2);
          }
          doc.fillColor(INK).fontSize(11).font('Helvetica');
          continue;
        }

        // A full-line bold "Key: value" style heading (e.g. "**Summary:**").
        if (/^\*\*[^*]+\*\*:?\s*$/.test(trimmed)) {
          const headerText = stripNonBold(trimmed).replace(/\*\*/g, '').replace(/:$/, '');
          if (doc.y > pageHeight - 110) doc.addPage();
          doc
            .moveDown(0.55)
            .fontSize(13)
            .font('Helvetica-Bold')
            .fillColor(BRAND)
            .text(headerText)
            .moveDown(0.2);
          doc.fillColor(INK).fontSize(11).font('Helvetica');
          continue;
        }

        // Bullet points — bullet glyph + mixed-weight body text so labels
        // like "**Load Time:**" at the start render bold while the rest
        // stays regular.
        if (/^[-*•]\s+/.test(trimmed)) {
          const bulletBody = trimmed.replace(/^[-*•]\s+/, '');
          const startY = doc.y;
          doc
            .fillColor(BRAND)
            .fontSize(11)
            .font('Helvetica-Bold')
            .text('•', leftMargin + 4, startY, { lineBreak: false, width: 12 });
          renderInline(bulletBody, {
            x: leftMargin + 20,
            y: startY,
            width: contentWidth - 20,
            baseColor: INK,
            boldColor: INK,
          });
          continue;
        }

        // Numbered list — same inline-bold treatment.
        if (/^\d+[.)]\s+/.test(trimmed)) {
          const indent = 8;
          const startY = doc.y;
          renderInline(trimmed, {
            x: leftMargin + indent,
            y: startY,
            width: contentWidth - indent,
            baseColor: INK,
            boldColor: INK,
          });
          continue;
        }

        // Horizontal rule.
        if (/^[-_*]{3,}$/.test(trimmed)) {
          doc.moveDown(0.3);
          doc.save();
          doc.strokeColor(BORDER).lineWidth(0.5)
            .moveTo(leftMargin, doc.y).lineTo(pageWidth - rightMargin, doc.y).stroke();
          doc.restore();
          doc.moveDown(0.5);
          continue;
        }

        // Regular body paragraph — still renders inline **bold** runs.
        renderInline(trimmed, {
          width: contentWidth,
          baseColor: INK,
          boldColor: INK,
        });
      }

      // ─── Page-number + credit footer on every page ─────────────────────
      // Done last, after all pages exist, so the count is accurate and the
      // footer doesn't interfere with body layout.
      //
      // IMPORTANT: pdfkit auto-paginates whenever text is written below the
      // page's bottom margin — even when we supply an explicit absolute y.
      // Our footer sits at (pageHeight - 36), which is below the default
      // bottom margin of 50. Without compensating, every .text() call below
      // would spawn a blank page to "continue" the text on. The fix is to
      // temporarily set the bottom margin to 0 for the footer loop, then
      // restore it. (Learned the hard way — the previous version of this
      // function was emitting three pages for a single-page report.)
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);

        const savedBottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;

        const footerY = pageHeight - 36;

        doc.save();
        doc.strokeColor(BORDER).lineWidth(0.5)
          .moveTo(leftMargin, footerY - 8)
          .lineTo(pageWidth - rightMargin, footerY - 8)
          .stroke();
        doc.restore();

        doc
          .fillColor(SUBTLE)
          .fontSize(9)
          .font('Helvetica')
          .text('Generated by Pixie', leftMargin, footerY, { width: contentWidth / 2, lineBreak: false });

        doc
          .fillColor(SUBTLE)
          .fontSize(9)
          .font('Helvetica')
          .text(`Page ${i + 1} of ${pages.count}`, pageWidth - rightMargin - 100, footerY, { width: 100, align: 'right', lineBreak: false });

        doc.page.margins.bottom = savedBottomMargin;
      }

      doc.end();
    } catch (error) {
      logger.error('[SEO PDF] generation failed:', error.message);
      reject(error);
    }
  });
}

module.exports = { generateReport };
