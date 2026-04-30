// Session recap after inactivity (Phase 9).
//
// When a user comes back after a long gap (>30 min), we send a short
// contextual "welcome back" message that references what we were working on
// — not a generic "continue where we left off". The handler for the
// current turn still runs normally after the recap, so any intent in the
// user's returning message ("actually change the name to X") gets answered.
//
// Why LLM-backed rather than templated: the context that belongs in a
// recap varies by state (webdev collection vs preview vs SEO follow-up vs
// sales chat with accumulated entities), and templating all of that reads
// stilted. One short LLM call produces a natural line. Recaps are rare
// (only after 30+ min gaps) so the per-call cost is negligible.
//
// Call site: inside router._routeMessage, AFTER findOrCreateUser /
// re-fetch, BEFORE logMessage of the current inbound. Querying
// `conversations` before we log this turn means the "latest user message"
// we see is the PREVIOUS turn, which is the correct gap baseline.

const { supabase } = require('../config/database');
const { generateResponse } = require('../llm/provider');
const { STATES } = require('./states');
const { logger } = require('../utils/logger');

const RECAP_GAP_MS = 30 * 60 * 1000; // 30 minutes

// States where a recap is never sent. WELCOME / SERVICE_SELECTION =
// nothing meaningful has happened yet. Generation / results / preview
// states are transient and the handler's own reply already orients
// the user, so a recap would be redundant noise.
const SKIP_STATES = new Set([
  STATES.WELCOME,
  STATES.SERVICE_SELECTION,
  STATES.WEB_GENERATING,
  STATES.WEB_GENERATION_FAILED,
  STATES.WEB_PREVIEW,
  STATES.AD_CREATING_IMAGE,
  STATES.AD_RESULTS,
  STATES.LOGO_CREATING_IMAGE,
  STATES.LOGO_RESULTS,
  STATES.CB_GENERATING,
  STATES.CB_DEMO_SENT,
  STATES.SEO_ANALYZING,
  STATES.SEO_RESULTS,
]);

/**
 * Gap in ms since this user's last logged inbound message. Returns null
 * when no prior inbound exists (new user). Must be called BEFORE the
 * current turn's logMessage so the "latest" row is the previous turn.
 */
async function lastInboundGapMs(userId) {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('created_at')
      .eq('user_id', userId)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) {
      logger.warn(`[RECAP] lastInboundGapMs query failed: ${error.message}`);
      return null;
    }
    if (!data || data.length === 0) return null;
    return Date.now() - new Date(data[0].created_at).getTime();
  } catch (err) {
    logger.warn(`[RECAP] lastInboundGapMs threw: ${err.message}`);
    return null;
  }
}

/**
 * Compose a compact context block the LLM can write from. Pulls the
 * fields most likely to matter for a recap — business name, industry,
 * city, services, last site URL, last audit URL. Missing fields are
 * dropped, not papered over.
 */
function buildContextLines(user) {
  const lines = [`Current state: ${user.state}`];
  const md = user.metadata || {};
  const wd = md.websiteData || {};

  if (wd.businessName) lines.push(`Business name: ${wd.businessName}`);
  if (wd.industry) lines.push(`Industry: ${wd.industry}`);
  if (wd.primaryCity) lines.push(`City: ${wd.primaryCity}`);
  if (Array.isArray(wd.services) && wd.services.length) {
    lines.push(`Services: ${wd.services.slice(0, 5).join(', ')}`);
  }
  if (wd.contactEmail) lines.push(`Email captured: yes`);
  if (wd.contactPhone) lines.push(`Phone captured: yes`);

  if (md.lastSeoUrl) lines.push(`Last SEO audit URL: ${md.lastSeoUrl}`);
  if (md.seoTopFix) lines.push(`SEO top fix flagged: ${md.seoTopFix}`);
  if (md.adSource) lines.push(`Arrived from ad: ${md.adSource}`);
  if (md.previewUrl) lines.push(`Preview site already generated: ${md.previewUrl}`);

  // Surface PAID / DELIVERED state so the LLM doesn't recap as if the
  // project is still in progress. Without these the recap would happily
  // invent a fictitious in-flight task ("we were lining up gigs") just
  // because the business industry sounds adjacent — which it has done
  // when a music-business owner returned post-payment.
  if (md.paymentConfirmed) {
    const paidBits = [];
    if (md.lastCompletedProjectType) paidBits.push(`type=${md.lastCompletedProjectType}`);
    if (md.lastBusinessName) paidBits.push(`for=${md.lastBusinessName}`);
    if (md.paidAt) paidBits.push(`paid_at=${md.paidAt}`);
    lines.push(
      `*PROJECT ALREADY DELIVERED & PAID*${paidBits.length ? ' (' + paidBits.join(', ') + ')' : ''} — site is live and the activation banner is gone. Do NOT recap as if work is in progress; do NOT pitch the same service again.`
    );
  }

  if (md.conversationSummary) {
    // Keep it short — the summary can be multiple paragraphs.
    lines.push(`Recent conversation summary: ${String(md.conversationSummary).slice(0, 400)}`);
  }

  return lines.join('\n');
}

/**
 * Build the next-step hint from the current state. Used as an extra nudge
 * inside the LLM prompt so the recap reliably names what comes next
 * instead of just describing the past.
 *
 * Special-cases SALES_CHAT for users with a delivered project — the
 * default "continue the sales conversation naturally" hint plus a
 * tempting business name (Ansh Singer / Music) was enough to make the
 * LLM hallucinate an unrelated in-flight flow on returning customers.
 */
function nextStepHint(state, user) {
  if (state === STATES.SALES_CHAT && user?.metadata?.paymentConfirmed) {
    return 'next step: acknowledge the delivered project, then ask if they want a tweak to the existing site, a different service entirely, or just have a question. Do NOT pitch the same service again.';
  }
  const hints = {
    [STATES.WEB_COLLECT_NAME]: 'next step: ask for the business name',
    [STATES.WEB_COLLECT_EMAIL]: 'next step: ask for contact email',
    [STATES.WEB_COLLECT_INDUSTRY]: 'next step: ask what industry the business is in',
    [STATES.WEB_COLLECT_AREAS]: 'next step: ask about primary city and service areas',
    [STATES.WEB_COLLECT_AGENT_PROFILE]: 'next step: ask for brokerage, years, and designations',
    [STATES.WEB_COLLECT_LISTINGS_ASK]: 'next step: ask whether they want to showcase listings',
    [STATES.WEB_COLLECT_LISTINGS_DETAILS]: 'next step: collect listing details',
    [STATES.WEB_COLLECT_LISTINGS_PHOTOS]: 'next step: collect listing photos',
    [STATES.WEB_COLLECT_SERVICES]: 'next step: ask what services they offer',
    [STATES.WEB_COLLECT_COLORS]: 'next step: ask about brand colors',
    [STATES.WEB_COLLECT_LOGO]: 'next step: ask for a logo',
    [STATES.WEB_COLLECT_CONTACT]: 'next step: ask for contact details',
    [STATES.SALON_BOOKING_TOOL]: 'next step: ask about their salon booking tool',
    [STATES.SALON_HOURS]: 'next step: ask for business hours',
    [STATES.SALON_SERVICE_DURATIONS]: 'next step: ask for service durations',
    [STATES.WEB_CONFIRM]: 'next step: confirm and generate the site',
    [STATES.WEB_REVISIONS]: 'next step: ask what they want revised',
    [STATES.SEO_COLLECT_URL]: 'next step: ask for a URL to audit',
    [STATES.SEO_FOLLOW_UP]: 'next step: follow up on the audit findings',
    [STATES.DOMAIN_OFFER]: 'next step: ask whether they want a custom domain',
    [STATES.DOMAIN_SEARCH]: 'next step: search their desired domain',
    [STATES.APP_COLLECT_REQUIREMENTS]: 'next step: ask about the app idea',
    [STATES.MARKETING_COLLECT_DETAILS]: 'next step: ask about marketing goals',
    [STATES.CB_COLLECT_NAME]: 'next step: ask for the chatbot business name',
    [STATES.CB_COLLECT_INDUSTRY]: 'next step: ask for the chatbot industry',
    [STATES.CB_COLLECT_FAQS]: 'next step: collect chatbot FAQs',
    [STATES.CB_COLLECT_SERVICES]: 'next step: collect chatbot services',
    [STATES.CB_COLLECT_HOURS]: 'next step: ask for chatbot business hours',
    [STATES.CB_COLLECT_LOCATION]: 'next step: ask for chatbot location',
    [STATES.AD_COLLECT_BUSINESS]: 'next step: ask for business name for the ad',
    [STATES.AD_COLLECT_INDUSTRY]: 'next step: ask for industry for the ad',
    [STATES.AD_COLLECT_NICHE]: 'next step: ask what product/service the ad is for',
    [STATES.AD_COLLECT_SLOGAN]: 'next step: ask for a slogan',
    [STATES.AD_COLLECT_PRICING]: 'next step: ask for pricing to display',
    [STATES.AD_COLLECT_COLORS]: 'next step: ask for ad colors',
    [STATES.AD_COLLECT_IMAGE]: 'next step: ask for an image/photo',
    [STATES.AD_SELECT_IDEA]: 'next step: show ad concepts to pick from',
    [STATES.LOGO_COLLECT_BUSINESS]: 'next step: ask for business name for the logo',
    [STATES.LOGO_COLLECT_INDUSTRY]: 'next step: ask for industry for the logo',
    [STATES.LOGO_COLLECT_DESCRIPTION]: 'next step: ask for business description',
    [STATES.LOGO_COLLECT_STYLE]: 'next step: ask for logo style',
    [STATES.LOGO_COLLECT_COLORS]: 'next step: ask for logo colors',
    [STATES.LOGO_COLLECT_SYMBOL]: 'next step: ask about a symbol idea',
    [STATES.LOGO_COLLECT_BACKGROUND]: 'next step: ask about background preference',
    [STATES.LOGO_SELECT_IDEA]: 'next step: show logo concepts to pick from',
    [STATES.SALES_CHAT]: 'next step: continue the sales conversation naturally',
    [STATES.GENERAL_CHAT]: 'next step: continue general chat naturally',
    [STATES.INFORMATIVE_CHAT]: 'next step: continue informative chat naturally',
  };
  return hints[state] || 'next step: continue naturally';
}

/**
 * If the user has been silent for more than RECAP_GAP_MS, build a
 * contextual recap. Returns the recap text or null.
 *
 * Constraints on the caller:
 *   - Must be called AFTER findOrCreateUser (needs user.id and user.state).
 *   - Must be called BEFORE logMessage for the current turn so the
 *     gap-query sees the PREVIOUS turn as "latest user message".
 *   - Safe to skip silently on any failure.
 */
async function maybeBuildRecap(user) {
  if (!user || !user.id) return null;
  if (SKIP_STATES.has(user.state)) return null;

  const gap = await lastInboundGapMs(user.id);
  if (gap == null) return null;      // new user, nothing to recap
  if (gap < RECAP_GAP_MS) return null; // recent activity

  const contextLines = buildContextLines(user);
  // If nothing meaningful is in context (no business name, no services,
  // nothing accumulated), skip the recap — it'd just say "welcome back"
  // with no substance, which is exactly the generic fallback we want
  // to avoid.
  const hasContext =
    contextLines.includes('Business name:') ||
    contextLines.includes('Industry:') ||
    contextLines.includes('Last SEO audit URL:') ||
    contextLines.includes('Recent conversation summary:') ||
    contextLines.includes('Preview site already generated:');
  if (!hasContext) return null;

  const minutes = Math.round(gap / 60_000);
  const prompt = `You are Pixie, a friendly WhatsApp bot. The user is returning after ${minutes} minutes of silence. Write a SHORT, warm "welcome back" message that references what you were working on, summarizes what you already have, and names the next step. Be specific — never generic.

Rules:
- 1-2 sentences max, casual WhatsApp tone (lowercase is fine, contractions fine)
- Reference at least ONE concrete detail from the context (business name, industry, city, services, URL — whatever applies)
- Name the next step clearly
- Do NOT say "continue where we left off", "pick up where we left off", or similar generic filler
- Do NOT re-introduce yourself
- Do NOT use emojis unless the context shows the user uses them
- Do NOT use em dashes (—) or en dashes (–). Regular hyphens only.

Context about this user:
${contextLines}
${nextStepHint(user.state, user)}

Return just the recap text. No quotes, no preamble.`;

  try {
    const response = await generateResponse(
      prompt,
      [{ role: 'user', content: 'Write the welcome-back recap now.' }],
      { userId: user.id, operation: 'session_recap', timeoutMs: 15_000, model: 'gpt-5.4-nano' }
    );
    const text = String(response || '').trim();
    return text || null;
  } catch (err) {
    logger.warn(`[RECAP] LLM call failed for ${user.phone_number}: ${err.message}`);
    return null;
  }
}

module.exports = {
  maybeBuildRecap,
  lastInboundGapMs,
  RECAP_GAP_MS,
  SKIP_STATES,
};
