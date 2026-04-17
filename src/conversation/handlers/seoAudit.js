const {
  sendTextMessage,
  sendInteractiveButtons,
  sendDocument,
  sendDocumentBuffer,
  sendWithMenuButton,
} = require('../../messages/sender');
const { logMessage, getConversationHistory } = require('../../db/conversations');
const { createAudit, updateAudit, getLatestAudit } = require('../../db/audits');
const { updateUserMetadata } = require('../../db/users');
const { validateUrl } = require('../../utils/validators');
const { formatWhatsApp } = require('../../utils/formatWhatsApp');
const { logger } = require('../../utils/logger');
const { STATES } = require('../states');
const { buildSummaryContext } = require('../summaryManager');

// Lazy-load heavy modules
let scraper, analyzer, report;

async function handleSeoAudit(user, message) {
  switch (user.state) {
    case STATES.SEO_COLLECT_URL:
      return handleCollectUrl(user, message);
    case STATES.SEO_ANALYZING:
      return handleAnalyzing(user, message);
    case STATES.SEO_RESULTS:
    case STATES.SEO_FOLLOW_UP:
      return handleFollowUp(user, message);
    default:
      return STATES.SEO_COLLECT_URL;
  }
}

async function handleCollectUrl(user, message) {
  logger.info(`[SEO] handleCollectUrl called for ${user.phone_number}, input: "${(message.text || '').slice(0, 100)}"`);
  const url = validateUrl(message.text);

  if (!url) {
    logger.warn(`[SEO] Invalid URL from ${user.phone_number}: "${message.text}"`);
    await sendWithMenuButton(
      user.phone_number,
      '❌ That doesn\'t look like a valid URL. Please send a website URL like:\n\n' +
        '• example.com\n' +
        '• https://www.example.com'
    );
    await logMessage(user.id, 'Invalid URL provided', 'assistant');
    return STATES.SEO_COLLECT_URL;
  }

  logger.info(`[SEO] Valid URL parsed: ${url}`);

  // Create audit record
  const audit = await createAudit(user.id, url);
  logger.info(`[SEO] Audit record created: ${audit.id}`);
  await updateUserMetadata(user.id, { currentAuditId: audit.id });

  await sendTextMessage(
    user.phone_number,
    `⏳ Analyzing *${url}*...\n\n` +
      'This usually takes 30-60 seconds. I\'m checking:\n' +
      '• SEO health & meta tags\n' +
      '• Page performance\n' +
      '• Design & structure\n' +
      '• Content quality\n\n' +
      'Please hold tight! 🔍'
  );
  await logMessage(user.id, `Starting analysis for ${url}`, 'assistant');

  // Run the analysis with a global timeout
  console.log(`\n[SEO] ========== STARTING ANALYSIS FOR ${url} ==========\n`);
  logger.info(`[SEO] ========== STARTING ANALYSIS FOR ${url} ==========`);
  try {
    // Lazy-load heavy modules
    logger.info('[SEO] Loading analysis modules...');
    if (!scraper) scraper = require('../../analysis/scraper');
    if (!analyzer) analyzer = require('../../analysis/analyzer');
    if (!report) report = require('../../analysis/report');
    logger.info('[SEO] Modules loaded successfully');

    // 1. Scrape the website
    logger.info(`[SEO] Step 1/6: Scraping ${url}`);
    let scrapedData;
    try {
      scrapedData = await scraper.scrapeWebsite(url);
      logger.info(`[SEO] Scrape done: ${scrapedData.bodyTextLength || 'N/A'} chars, ${scrapedData.totalImages || 'N/A'} imgs`);
    } catch (scrapeErr) {
      logger.error(`[SEO] Scrape FAILED: ${scrapeErr.message}`);
      throw new Error(`Failed to scrape website: ${scrapeErr.message}`);
    }

    // 2. Analyze with LLM
    logger.info('[SEO] Step 2/6: Analyzing with LLM');
    let analysis;
    try {
      analysis = await analyzer.analyzeWebsite(scrapedData, { userId: user.id });
      logger.info(`[SEO] Analysis done: ${analysis.length} chars`);
    } catch (analyzeErr) {
      logger.error(`[SEO] LLM Analysis FAILED: ${analyzeErr.message}`);
      throw new Error(`LLM analysis failed: ${analyzeErr.message}`);
    }

    // 3. Generate report
    logger.info('[SEO] Step 3/6: Generating report');
    let summary, pdfBuffer;
    try {
      const reportResult = await report.generateReport(url, analysis);
      summary = reportResult.summary;
      pdfBuffer = reportResult.pdfBuffer;
      logger.info(`[SEO] Report done: summary ${summary.length} chars, PDF ${pdfBuffer.length} bytes`);
    } catch (reportErr) {
      logger.error(`[SEO] Report generation FAILED: ${reportErr.message}`);
      // Fallback: send text analysis without PDF
      summary = analysis.slice(0, 2000);
      pdfBuffer = null;
    }

    // 4. Update audit record
    logger.info('[SEO] Step 4/6: Updating audit in DB');
    await updateAudit(audit.id, {
      raw_data: scrapedData,
      analysis_text: analysis,
      status: 'completed',
    });

    // 5. Send report
    logger.info('[SEO] Step 5/6: Sending report to user');
    if (pdfBuffer) {
      try {
        await sendDocumentBuffer(
          user.phone_number,
          pdfBuffer,
          'Your free SEO audit report for ' + url,
          `SEO-Audit-${new URL(url).hostname}.pdf`
        );
        await logMessage(user.id, 'Sent PDF report', 'assistant');
        logger.info('[SEO] PDF sent successfully');
      } catch (pdfErr) {
        logger.error('[SEO] Failed to send PDF, sending text fallback:', pdfErr.message);
        await sendTextMessage(user.phone_number, summary);
        await logMessage(user.id, summary, 'assistant');
      }
    } else {
      logger.info('[SEO] No PDF available, sending text summary');
      await sendTextMessage(user.phone_number, summary);
      await logMessage(user.id, summary, 'assistant');
    }

    // 6. Store analysis and immediately pitch via sales bot
    logger.info('[SEO] Step 6/6: Triggering sales pitch based on findings');

    // Extract the single biggest fix in 2-6 words so the 24h silence follow-up
    // can quote it back to the user ("your biggest opportunity was X") without
    // having to re-parse the full analysis at scheduler time. Best-effort —
    // if extraction fails, the follow-up falls back to a generic pitch.
    let seoTopFix = '';
    try {
      const { generateResponse: extractTopFix } = require('../../llm/provider');
      const rawFix = await extractTopFix(
        'You read SEO audit reports. Extract the single most impactful improvement opportunity from the report and name it in 2-6 words. No sentence, no punctuation, no quotes — just the issue name. Examples: "missing title tags", "slow page load", "thin homepage content", "no meta descriptions", "broken internal links".',
        [{ role: 'user', content: analysis.slice(0, 6000) }],
        { userId: user.id, operation: 'seo_top_fix_extract' }
      );
      seoTopFix = String(rawFix || '').trim().replace(/^["']|["']$/g, '').slice(0, 60);
      logger.info(`[SEO] Top fix extracted: "${seoTopFix}"`);
    } catch (extractErr) {
      logger.warn(`[SEO] Top-fix extraction failed: ${extractErr.message}`);
    }

    await updateUserMetadata(user.id, {
      lastSeoAnalysis: analysis,
      lastSeoUrl: url,
      seoAuditTriggered: true, // Prevent re-triggering
      seoTopFix,
      seoAuditCompletedAt: new Date().toISOString(),
    });

    // Feed a synthetic message to the sales bot so it pitches immediately
    // Use a message WITHOUT a URL to avoid the fallback SEO trigger catching it again
    const { handleSalesBot } = require('./salesBot');
    const { updateUserState } = require('../../db/users');
    await updateUserState(user.id, STATES.SALES_CHAT);

    logger.info(`[SEO] Analysis complete for ${url}, triggering sales pitch`);
    return handleSalesBot(
      { ...user, state: STATES.SALES_CHAT, metadata: { ...user.metadata, seoAuditTriggered: true, lastSeoAnalysis: analysis, lastSeoUrl: url } },
      { ...message, text: 'Based on the audit results, what SEO package would you recommend to fix these issues?', type: 'text' }
    );
  } catch (error) {
    console.error(`\n[SEO] ❌ FAILED: ${error.message}\n`);
    console.error(error.stack);
    logger.error(`[SEO] ❌ Website analysis failed for ${url}:`);
    logger.error(`[SEO] Error: ${error.message}`);
    logger.error(`[SEO] Status: ${error.response?.status || 'N/A'}`);
    logger.error(`[SEO] Stack: ${error.stack}`);

    try {
      await updateAudit(audit.id, { status: 'failed' });
    } catch (dbErr) {
      logger.error('[SEO] Failed to update audit status:', dbErr.message);
    }

    try {
      await sendTextMessage(
        user.phone_number,
        '😔 Sorry, I had trouble analyzing that website. This can happen if:\n\n' +
          '• The site is blocking automated access\n' +
          '• The site takes too long to load\n' +
          '• The URL is incorrect\n\n' +
          'Want to try a different URL, or would you prefer to chat with our team?'
      );
      await sendInteractiveButtons(user.phone_number, 'What would you like to do?', [
        { id: 'seo_retry', title: 'Try Another URL' },
        { id: 'svc_general', title: 'Chat with Us' },
      ]);
      await logMessage(user.id, 'Analysis failed, offering retry', 'assistant');
    } catch (sendErr) {
      logger.error('[SEO] Failed to send error message to user:', sendErr);
    }

    return STATES.SEO_FOLLOW_UP;
  }
}

async function handleAnalyzing(user, message) {
  await sendTextMessage(
    user.phone_number,
    '⏳ Still analyzing your website... Please hold on a moment.'
  );
  return STATES.SEO_ANALYZING;
}

async function handleFollowUp(user, message) {
  const buttonId = message.buttonId || '';

  // Handle CTA button responses
  const returnToSales = user.metadata?.returnToSales;

  if (buttonId === 'seo_fix' || buttonId === 'seo_quote') {
    if (returnToSales) {
      // Route back to sales bot to handle pricing/packaging
      await sendTextMessage(
        user.phone_number,
        buttonId === 'seo_fix'
          ? "Let's get these fixed - based on what I found, here's what I'd recommend."
          : "Let me put together the right package for you based on what we found."
      );
      await logMessage(user.id, `User wants to ${buttonId === 'seo_fix' ? 'fix issues' : 'get a quote'}, returning to sales`, 'assistant');
      return STATES.SALES_CHAT;
    }

    await sendTextMessage(
      user.phone_number,
      buttonId === 'seo_fix'
        ? '🛠️ Great choice! Our team can fix all the issues we found.\n\n' +
          'I\'ll have someone reach out to you with a detailed proposal and timeline. ' +
          'In the meantime, is there anything specific you\'d like to know?'
        : '💰 I\'ll have our team prepare a custom quote based on the issues we found.\n\n' +
          'They\'ll reach out to you shortly. Is there anything else you\'d like to know about our services?'
    );
    await logMessage(user.id, `User wants to ${buttonId === 'seo_fix' ? 'fix issues' : 'get a quote'}`, 'assistant');
    return STATES.SEO_FOLLOW_UP;
  }

  if (buttonId === 'seo_retry') {
    await sendTextMessage(user.phone_number, 'Sure! Please send me another website URL:');
    await logMessage(user.id, 'User retrying with new URL', 'assistant');
    return STATES.SEO_COLLECT_URL;
  }

  // For free-text follow-up questions, use LLM with conversation context
  const { generateResponse } = require('../../llm/provider');
  const { GENERAL_CHAT_PROMPT } = require('../../llm/prompts');
  const history = await getConversationHistory(user.id, 20);

  const messages = history.map((h) => ({
    role: h.role,
    content: h.message_text,
  }));

  // Add context about the audit
  const audit = await getLatestAudit(user.id);
  let systemContext = GENERAL_CHAT_PROMPT;
  if (audit?.analysis_text) {
    systemContext += `\n\nYou recently analyzed the website ${audit.url}. Here's the analysis:\n${audit.analysis_text}\n\nAnswer follow-up questions based on this analysis.`;
  }
  systemContext += buildSummaryContext(user);

  const response = await generateResponse(systemContext, messages, {
    userId: user.id,
    operation: 'seo_follow_up',
  });

  await sendTextMessage(user.phone_number, formatWhatsApp(response));
  await logMessage(user.id, response, 'assistant');

  return STATES.SEO_FOLLOW_UP;
}

module.exports = { handleSeoAudit };
