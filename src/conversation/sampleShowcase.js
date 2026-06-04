// Shared "show me your previous work / examples" support for the mid-flow
// off-topic aside path in router.js.
//
// Background: the salesBot (SALES_CHAT) shows portfolio examples via the
// LLM-emitted [SEND_SAMPLE_IMAGE] tag — it sends a screenshot + a branded
// preview URL. But once a user fires [TRIGGER_WEBSITE_DEMO] and moves into
// the website-builder flow, their "can I see previous work?" message is
// handled by the router's generic off-topic aside, which only sends TEXT —
// so the example was promised verbally but never shown. These helpers let
// the router reuse the same screenshot + preview-URL infra in any state.
//
// Intent is decided by the LLM (not keyword matching) so phrasings like
// "tumhara kaam dikhao" / "got any samples" / "show me what you've built"
// all resolve correctly across languages.

const { generateResponse } = require('../llm/provider');
const { classifyIndustry } = require('../utils/industryClassifier');
const { logger } = require('../utils/logger');

const EXAMPLES_REQUEST_PROMPT = `You decide whether the user is asking to SEE examples of OUR previous work — sample websites, portfolio, past projects, "show me what you've built".

Reply with ONLY one word: yes or no.

yes — they want us to show them samples/examples of websites we've made:
  "can I see previous work", "show me examples", "got any samples?", "do you have a portfolio",
  "show me what you've built", "can I see some of your sites", "examples?", "any previous work",
  "kuch examples dikhao", "tumhara kaam dikhao", "puedo ver ejemplos", "mostre seu trabalho"

no — anything else:
  giving an answer (a business name, an industry, a city), asking the price/process/timeline,
  asking what a term means, greetings, "are you a bot", offering to upload THEIR OWN images,
  asking us to build/change something. When unsure, answer no.`;

/**
 * LLM intent check: is this mid-flow message a request to see OUR sample
 * work? Defaults to false on any error / ambiguity so we never spuriously
 * dump screenshots into a flow.
 */
async function classifyExamplesRequest(text, userId) {
  const t = String(text || '').trim();
  if (t.length < 2) return false;
  try {
    const out = await generateResponse(
      EXAMPLES_REQUEST_PROMPT,
      [{ role: 'user', content: t.slice(0, 200) }],
      { userId, operation: 'examples_request_classify', model: 'gpt-5.4-nano', timeoutMs: 8000 }
    );
    return /^\s*yes\b/i.test(String(out || ''));
  } catch (err) {
    logger.warn(`[SHOWCASE] examples-request classify failed: ${err.message}`);
    return false;
  }
}

/**
 * Resolve which industry's sample to show for a user mid-flow. Prefers the
 * already-captured website industry (set when [TRIGGER_WEBSITE_DEMO] fired),
 * then the raw industry text, then ad targeting, else 'generic'. The
 * downstream getSampleScreenshotUrl / getAdPreviewUrl both map unknown keys
 * to the generic example, so any odd value degrades gracefully.
 */
async function resolveShowcaseIndustry(user) {
  const md = (user && user.metadata) || {};
  const wd = md.websiteData || {};
  if (wd.industryKey) return wd.industryKey;
  if (wd.industry) {
    try {
      return await classifyIndustry(wd.industry);
    } catch {
      /* fall through */
    }
  }
  if (md.adIndustry) return md.adIndustry;
  return 'generic';
}

module.exports = { classifyExamplesRequest, resolveShowcaseIndustry };
