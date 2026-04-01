const PDFDocument = require('pdfkit');
const { formatWhatsApp } = require('../utils/formatWhatsApp');
const { logger } = require('../utils/logger');

/**
 * Generate a WhatsApp-friendly summary and a PDF report from the analysis.
 * @param {string} url - The analyzed URL
 * @param {string} analysis - Full LLM analysis text
 * @returns {Promise<{summary: string, pdfBuffer: Buffer}>}
 */
async function generateReport(url, analysis) {
  // 1. Create a short WhatsApp summary (under 1000 chars)
  const formatted = formatWhatsApp(analysis);
  const lines = formatted.split('\n').filter((l) => l.trim());
  let summary = `📊 *Website Analysis: ${url}*\n\n`;

  // Extract key points — take the first meaningful section
  let charCount = summary.length;
  for (const line of lines) {
    if (charCount + line.length + 1 > 950) break;
    summary += line + '\n';
    charCount += line.length + 1;
  }

  summary += '\n_Full detailed report available as PDF._';

  // 2. Generate PDF
  const pdfBuffer = await generatePdf(url, analysis);

  return { summary, pdfBuffer };
}

/**
 * Generate a branded PDF report.
 */
function generatePdf(url, analysis) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc
        .fontSize(24)
        .font('Helvetica-Bold')
        .text('SEO Audit Report', { align: 'center' })
        .moveDown(0.5);

      doc
        .fontSize(12)
        .font('Helvetica')
        .fillColor('#666')
        .text(`Generated on ${new Date().toLocaleDateString()}`, { align: 'center' })
        .moveDown(0.3);

      doc
        .fontSize(14)
        .fillColor('#2563EB')
        .text(url, { align: 'center', link: url })
        .moveDown(1.5);

      // Divider
      doc
        .strokeColor('#E5E7EB')
        .lineWidth(1)
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .stroke()
        .moveDown(1);

      // Analysis content
      doc.fontSize(11).font('Helvetica').fillColor('#333');

      // Strip markdown to clean text, then render
      const cleanAnalysis = analysis
        .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold** -> bold (handled separately)
        .replace(/\*(.+?)\*/g, '$1')        // *italic* -> italic
        .replace(/__(.+?)__/g, '$1')        // __bold__ -> bold
        .replace(/`(.+?)`/g, '$1');         // `code` -> code

      const sections = cleanAnalysis.split('\n');
      for (const line of sections) {
        const trimmed = line.trim();

        if (!trimmed) {
          doc.moveDown(0.4);
          continue;
        }

        // H1-H6 headers (# ## ### #### etc.)
        if (/^#{1,6}\s+/.test(trimmed)) {
          const level = (trimmed.match(/^#+/) || [''])[0].length;
          const headerText = trimmed.replace(/^#+\s*/, '');
          doc
            .moveDown(0.5)
            .fontSize(level === 1 ? 16 : level === 2 ? 14 : 12)
            .font('Helvetica-Bold')
            .fillColor('#1F2937')
            .text(headerText)
            .moveDown(0.3);
          doc.fontSize(11).font('Helvetica').fillColor('#333');
        }
        // Bold headers - line that starts AND ends with **
        else if (/^\*\*[^*]+\*\*:?\s*$/.test(line.trim())) {
          const headerText = line.trim().replace(/\*\*/g, '').replace(/:$/, '');
          doc
            .moveDown(0.5)
            .fontSize(13)
            .font('Helvetica-Bold')
            .fillColor('#1F2937')
            .text(headerText)
            .moveDown(0.2);
          doc.fontSize(11).font('Helvetica').fillColor('#333');
        }
        // Inline bold at start of line (e.g. "**Score:** 75/100")
        else if (/^\*\*.+?\*\*/.test(line.trim())) {
          const cleanLine = line.trim().replace(/\*\*(.+?)\*\*/g, '$1');
          doc.font('Helvetica-Bold').text(cleanLine, { continued: false });
          doc.font('Helvetica');
        }
        // Bullet points (-, *, •)
        else if (/^[-*•]\s/.test(trimmed)) {
          const bulletText = trimmed.replace(/^[-*•]\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1');
          doc.text(`  •  ${bulletText}`, { indent: 15 });
        }
        // Numbered lists
        else if (/^\d+[.)]\s/.test(trimmed)) {
          const listText = trimmed.replace(/\*\*(.+?)\*\*/g, '$1');
          doc.text(`  ${listText}`, { indent: 10 });
        }
        // Horizontal rules
        else if (/^[-_*]{3,}$/.test(trimmed)) {
          doc.moveDown(0.3);
          doc.strokeColor('#E5E7EB').lineWidth(0.5)
            .moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
          doc.moveDown(0.3);
        }
        // Regular text
        else {
          doc.text(trimmed.replace(/\*\*(.+?)\*\*/g, '$1'));
        }

        // Check if we need a new page
        if (doc.y > doc.page.height - 100) {
          doc.addPage();
        }
      }

      // Footer
      doc.moveDown(2);
      doc
        .strokeColor('#E5E7EB')
        .lineWidth(1)
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .stroke()
        .moveDown(1);

      doc
        .fontSize(10)
        .fillColor('#999')
        .text('Generated by Bytes Platform', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateReport };
