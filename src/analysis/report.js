const PDFDocument = require('pdfkit');
const { formatWhatsApp } = require('../utils/formatWhatsApp');
const { logger } = require('../utils/logger');

// ─── Design tokens ─────────────────────────────────────────────────────────
// Kept in one place so the PDF's look can be tweaked without hunting through
// the render code. Hex values are inlined in rgb() calls where pdfkit needs
// them; these constants exist for readability and so the palette stays
// internally consistent (e.g. score-card bar colour matches the verdict text).
const BRAND = '#4F46E5';        // indigo-600 — primary
const BRAND_SOFT = '#818CF8';   // indigo-400 — accent / underlines
const INK = '#0F172A';          // slate-900 — body text
const MUTED = '#475569';        // slate-600 — secondary text
const SUBTLE = '#94A3B8';       // slate-400 — footers / dates
const BORDER = '#E2E8F0';       // slate-200 — rules / card borders
const SURFACE = '#F8FAFC';      // slate-50 — card backgrounds

const SCORE_PALETTE = [
  { min: 80, color: '#059669', label: 'Strong' },           // emerald-600
  { min: 60, color: '#CA8A04', label: 'Room to Improve' },  // yellow-600
  { min: 40, color: '#EA580C', label: 'Needs Work' },       // orange-600
  { min: 0,  color: '#DC2626', label: 'Critical' },         // red-600
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

      // Subtle diagonal accent stripe — a second slightly-darker band behind
      // the main one gives the header depth without needing gradients.
      doc.save();
      doc.rect(0, headerH - 6, pageWidth, 6).fill(BRAND_SOFT);
      doc.restore();

      // Brand mark top-right.
      doc
        .fillColor('#FFFFFF', 0.85)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('P I X I E', pageWidth - 120, 28, { width: 70, align: 'right' });

      // Title.
      doc
        .fillColor('#FFFFFF')
        .fontSize(28)
        .font('Helvetica-Bold')
        .text('SEO AUDIT REPORT', leftMargin, 40, { width: contentWidth });

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

        // Big score number.
        doc
          .fillColor(v.color)
          .fontSize(48)
          .font('Helvetica-Bold')
          .text(String(score), leftMargin + 26, cardY + 16, { lineBreak: false });

        // "/100" subdued, inline with the big number.
        const numWidth = doc.widthOfString(String(score));
        doc
          .fillColor(MUTED)
          .fontSize(18)
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
      // Strip inline markdown before rendering. Line-level structure (lists,
      // headings prefixed with `##`, etc.) is still detected from the raw
      // text below.
      const body = String(analysis || '').split('\n');

      const stripInline = (s) => s
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/`(.+?)`/g, '$1');

      // Helper: draw a small indigo accent underline below big headers.
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
          const headerText = stripInline(trimmed.replace(/^#+\s*/, ''));

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
          const headerText = stripInline(trimmed).replace(/:$/, '');
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

        // Inline-bold at start of line (e.g. "**Score:** 82/100").
        if (/^\*\*.+?\*\*/.test(trimmed)) {
          const clean = stripInline(trimmed);
          doc.font('Helvetica-Bold').fillColor(INK).text(clean);
          doc.font('Helvetica').fillColor(INK);
          continue;
        }

        // Bullet points.
        if (/^[-*•]\s+/.test(trimmed)) {
          const bulletText = stripInline(trimmed.replace(/^[-*•]\s+/, ''));
          const startY = doc.y;
          // Coloured bullet glyph.
          doc
            .fillColor(BRAND)
            .fontSize(11)
            .font('Helvetica-Bold')
            .text('•', leftMargin + 4, startY, { lineBreak: false, width: 12 });
          // Body text indented past the bullet.
          doc
            .fillColor(INK)
            .font('Helvetica')
            .text(bulletText, leftMargin + 20, startY, { width: contentWidth - 20 });
          continue;
        }

        // Numbered list.
        if (/^\d+[.)]\s+/.test(trimmed)) {
          const clean = stripInline(trimmed);
          doc.fillColor(INK).font('Helvetica').text(clean, { indent: 8 });
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

        // Regular body paragraph.
        doc.fillColor(INK).font('Helvetica').fontSize(11).text(stripInline(trimmed));
      }

      // ─── Page-number + credit footer on every page ─────────────────────
      // Done last, after all pages exist, so the count is accurate and the
      // footer doesn't interfere with body layout.
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);

        const footerY = pageHeight - 36;

        // Thin divider above the footer text.
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
      }

      doc.end();
    } catch (error) {
      logger.error('[SEO PDF] generation failed:', error.message);
      reject(error);
    }
  });
}

module.exports = { generateReport };
