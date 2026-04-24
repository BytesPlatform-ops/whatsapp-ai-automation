const { findOrCreateUser, updateUserState, updateUserMetadata } = require('../db/users');
const { logMessage } = require('../db/conversations');
const { markAsRead, sendTextMessage, sendInteractiveButtons, sendWithMenuButton, setLastMessageId } = require('../messages/sender');
const { runWithContext } = require('../messages/channelContext');
const { STATES } = require('./states');
const { logger } = require('../utils/logger');
const { generateResponse } = require('../llm/provider');
const { INTENT_CLASSIFIER_PROMPT, GENERAL_CHAT_PROMPT } = require('../llm/prompts');
const { transcribeAudio } = require('../llm/transcribe');
const { maybeUpdateSummary } = require('./summaryManager');
const { isDelegation } = require('../config/smartDefaults');
const {
  classifyUndoOrKeep,
  pushStateHistory,
  handleUndo,
  clearUndoPending,
  UNDOABLE_STATES,
} = require('./undoStack');
const messageBuffer = require('./messageBuffer');
const { handleObjection } = require('./handlers/objectionHandler');

// ── Message dedup ─────────────────────────────────────────────────────────
// WhatsApp can occasionally redeliver the same inbound message (network blip,
// ACK miss between Meta and our server). Without this, /reset could fire
// twice in a row and the user sees duplicate greetings. LRU-capped so
// memory stays bounded under load.
const RECENT_MESSAGES = new Map(); // key = `${from}:${messageId}` → timestamp
const DEDUP_WINDOW_MS = 60_000;
const DEDUP_MAX_ENTRIES = 2000;

function seenRecently(from, messageId) {
  if (!messageId) return false; // can't dedup without an ID
  const key = `${from}:${messageId}`;
  const now = Date.now();
  const last = RECENT_MESSAGES.get(key);
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  RECENT_MESSAGES.set(key, now);
  // Cheap eviction: if the map grew past the cap, drop the oldest 20% so
  // occasional large bursts don't leak memory.
  if (RECENT_MESSAGES.size > DEDUP_MAX_ENTRIES) {
    const keys = Array.from(RECENT_MESSAGES.keys()).slice(0, Math.floor(DEDUP_MAX_ENTRIES * 0.2));
    for (const k of keys) RECENT_MESSAGES.delete(k);
  }
  return false;
}

// ── Per-user serial processing ────────────────────────────────────────────
// Two inbound webhooks for the same user can land in parallel (/reset
// followed by the user's first real message, for example). Without a lock
// they process concurrently, which causes weird races: /reset's DB cleanup
// is slow, its greeting fires AFTER the next message's reply, and the user
// sees "greeting → real reply → greeting" out of order.
//
// This is a Map<phoneNumber, Promise> that chains pending work. Each turn
// awaits the previous turn's completion before running.
const USER_LOCKS = new Map();

function withUserLock(from, fn) {
  const previous = USER_LOCKS.get(from) || Promise.resolve();
  const current = previous.then(fn, fn); // run regardless of prior success/failure
  USER_LOCKS.set(from, current);
  // Clean up the map entry once this turn finishes, but ONLY if nothing newer
  // has queued on top of us. Otherwise a later turn would lose its chain.
  current.finally(() => {
    if (USER_LOCKS.get(from) === current) USER_LOCKS.delete(from);
  });
  return current;
}

/**
 * Identify which product an ad is promoting based on the ad body text.
 */
function identifyProduct(adBody) {
  const body = (adBody || '').toLowerCase();
  if (body.includes('chatbot') || body.includes('bot') || body.includes('automation') || body.includes('ai assistant')) return 'chatbot';
  if (body.includes('website') || body.includes('web design') || body.includes('web development') || body.includes('landing page')) return 'web';
  if (body.includes('seo') || body.includes('ranking') || body.includes('google rank')) return 'seo';
  if (body.includes('social media') || body.includes('marketing') || body.includes('ads') || body.includes('campaign')) return 'smm';
  if (body.includes('app') || body.includes('mobile') || body.includes('android') || body.includes('ios')) return 'app';
  if (body.includes('ecommerce') || body.includes('store') || body.includes('shop') || body.includes('shopify')) return 'ecommerce';
  return 'generic';
}

// Import handlers
const { handleWelcome } = require('./handlers/welcome');
const { handleServiceSelection } = require('./handlers/serviceSelection');
const { handleSeoAudit } = require('./handlers/seoAudit');
const { handleWebDev, handleGenerationFailed } = require('./handlers/webDev');
const { handleAppDev } = require('./handlers/appDev');
const { handleMarketing } = require('./handlers/marketing');
const { handleGeneralChat } = require('./handlers/generalChat');
const { handleScheduling } = require('./handlers/scheduling');
const { handleSalesBot } = require('./handlers/salesBot');
const { handleInformativeBot } = require('./handlers/informativeBot');
const { handleChatbotService } = require('./handlers/chatbotService');
const { handleCustomDomain } = require('./handlers/customDomain');
const { handleAdGeneration } = require('./handlers/adGeneration');
const { handleLogoGeneration } = require('./handlers/logoGeneration');
const { tryHandleSalonOwnerCommand } = require('./handlers/salonOwnerCommands');

// Map states to their handler functions
const STATE_HANDLERS = {
  [STATES.WELCOME]: handleWelcome,
  [STATES.SERVICE_SELECTION]: handleServiceSelection,

  // SEO flow
  [STATES.SEO_COLLECT_URL]: handleSeoAudit,
  [STATES.SEO_ANALYZING]: handleSeoAudit,
  [STATES.SEO_RESULTS]: handleSeoAudit,
  [STATES.SEO_FOLLOW_UP]: handleSeoAudit,

  // Web Dev flow
  [STATES.WEB_COLLECT_NAME]: handleWebDev,
  [STATES.WEB_COLLECT_EMAIL]: handleWebDev,
  [STATES.WEB_COLLECT_INDUSTRY]: handleWebDev,
  [STATES.WEB_COLLECT_AREAS]: handleWebDev,
  [STATES.WEB_COLLECT_AGENT_PROFILE]: handleWebDev,
  [STATES.WEB_COLLECT_LISTINGS_ASK]: handleWebDev,
  [STATES.WEB_COLLECT_LISTINGS_DETAILS]: handleWebDev,
  [STATES.WEB_COLLECT_LISTINGS_PHOTOS]: handleWebDev,
  [STATES.WEB_COLLECT_SERVICES]: handleWebDev,
  [STATES.WEB_COLLECT_COLORS]: handleWebDev,
  [STATES.WEB_COLLECT_LOGO]: handleWebDev,
  [STATES.WEB_COLLECT_CONTACT]: handleWebDev,
  [STATES.SALON_BOOKING_TOOL]: handleWebDev,
  [STATES.SALON_INSTAGRAM]: handleWebDev,
  [STATES.SALON_HOURS]: handleWebDev,
  [STATES.SALON_SERVICE_DURATIONS]: handleWebDev,
  [STATES.WEB_DOMAIN_CHOICE]: handleWebDev,
  [STATES.WEB_DOMAIN_OWN_INPUT]: handleWebDev,
  [STATES.WEB_DOMAIN_SEARCH]: handleWebDev,
  [STATES.WEB_CONFIRM]: handleWebDev,
  [STATES.WEB_GENERATING]: handleWebDev,
  [STATES.WEB_GENERATION_FAILED]: handleGenerationFailed,
  [STATES.WEB_PREVIEW]: handleWebDev,
  [STATES.WEB_REVISIONS]: handleWebDev,

  // Custom domain flow
  [STATES.DOMAIN_OFFER]: handleCustomDomain,
  [STATES.DOMAIN_SEARCH]: handleCustomDomain,
  [STATES.DOMAIN_PURCHASE_WAIT]: handleCustomDomain,
  [STATES.DOMAIN_DNS_GUIDE]: handleCustomDomain,
  [STATES.DOMAIN_VERIFY]: handleCustomDomain,

  // App Dev flow
  [STATES.APP_COLLECT_REQUIREMENTS]: handleAppDev,
  [STATES.APP_PROPOSAL]: handleAppDev,
  [STATES.APP_FOLLOW_UP]: handleAppDev,

  // Marketing flow
  [STATES.MARKETING_COLLECT_DETAILS]: handleMarketing,
  [STATES.MARKETING_STRATEGY]: handleMarketing,
  [STATES.MARKETING_FOLLOW_UP]: handleMarketing,

  // General
  [STATES.GENERAL_CHAT]: handleGeneralChat,

  // Informative / FAQ bot
  [STATES.INFORMATIVE_CHAT]: handleInformativeBot,

  // Sales bot (Bytes Platform v2)
  [STATES.SALES_CHAT]: handleSalesBot,

  // Meeting scheduling flow
  [STATES.SCHEDULE_COLLECT_DATE]: handleScheduling,
  [STATES.SCHEDULE_COLLECT_TIME]: handleScheduling,
  [STATES.SCHEDULE_CONFIRM]: handleScheduling,

  // AI Chatbot SaaS flow
  [STATES.CB_COLLECT_NAME]: handleChatbotService,
  [STATES.CB_COLLECT_INDUSTRY]: handleChatbotService,
  [STATES.CB_COLLECT_FAQS]: handleChatbotService,
  [STATES.CB_COLLECT_SERVICES]: handleChatbotService,
  [STATES.CB_COLLECT_HOURS]: handleChatbotService,
  [STATES.CB_COLLECT_LOCATION]: handleChatbotService,
  [STATES.CB_GENERATING]: handleChatbotService,
  [STATES.CB_DEMO_SENT]: handleChatbotService,
  [STATES.CB_FOLLOW_UP]: handleChatbotService,

  // Marketing Ad Generation flow
  [STATES.AD_COLLECT_BUSINESS]: handleAdGeneration,
  [STATES.AD_COLLECT_INDUSTRY]: handleAdGeneration,
  [STATES.AD_COLLECT_NICHE]: handleAdGeneration,
  [STATES.AD_COLLECT_TYPE]: handleAdGeneration,
  [STATES.AD_COLLECT_SLOGAN]: handleAdGeneration,
  [STATES.AD_COLLECT_PRICING]: handleAdGeneration,
  [STATES.AD_COLLECT_COLORS]: handleAdGeneration,
  [STATES.AD_COLLECT_IMAGE]: handleAdGeneration,
  [STATES.AD_SELECT_IDEA]: handleAdGeneration,
  [STATES.AD_CREATING_IMAGE]: handleAdGeneration,
  [STATES.AD_RESULTS]: handleAdGeneration,

  // Logo Generation flow
  [STATES.LOGO_COLLECT_BUSINESS]: handleLogoGeneration,
  [STATES.LOGO_COLLECT_INDUSTRY]: handleLogoGeneration,
  [STATES.LOGO_COLLECT_DESCRIPTION]: handleLogoGeneration,
  [STATES.LOGO_COLLECT_STYLE]: handleLogoGeneration,
  [STATES.LOGO_COLLECT_COLORS]: handleLogoGeneration,
  [STATES.LOGO_COLLECT_SYMBOL]: handleLogoGeneration,
  [STATES.LOGO_COLLECT_BACKGROUND]: handleLogoGeneration,
  [STATES.LOGO_SELECT_IDEA]: handleLogoGeneration,
  [STATES.LOGO_CREATING_IMAGE]: handleLogoGeneration,
  [STATES.LOGO_RESULTS]: handleLogoGeneration,
};

// States that collect free-text input — the intent classifier runs for
// these so "skip this, do a logo" / "forget it, make a chatbot" / etc.
// can flow-switch out mid-collection. Excluded: button-driven states
// (the interactive reply matcher handles those separately), transient
// system states (*_GENERATING / *_ANALYZING), and WEB_CONFIRM which
// has its own dedicated flow-switch intercept in handleConfirm.
const COLLECTION_STATES = new Set([
  STATES.WEB_COLLECT_NAME,
  STATES.WEB_COLLECT_EMAIL,
  STATES.WEB_COLLECT_INDUSTRY,
  STATES.WEB_COLLECT_AREAS,
  STATES.WEB_COLLECT_AGENT_PROFILE,
  STATES.WEB_COLLECT_LISTINGS_ASK,
  STATES.WEB_COLLECT_LISTINGS_DETAILS,
  STATES.WEB_COLLECT_LISTINGS_PHOTOS,
  STATES.WEB_COLLECT_SERVICES,
  STATES.WEB_COLLECT_LOGO,
  STATES.WEB_COLLECT_CONTACT,
  STATES.WEB_REVISIONS,
  // Salon sub-flow collection states
  STATES.SALON_BOOKING_TOOL,
  STATES.SALON_INSTAGRAM,
  STATES.SALON_HOURS,
  STATES.SALON_SERVICE_DURATIONS,
  // SEO post-audit chat
  STATES.SEO_COLLECT_URL,
  STATES.SEO_FOLLOW_UP,
  STATES.APP_COLLECT_REQUIREMENTS,
  STATES.APP_FOLLOW_UP,
  STATES.MARKETING_COLLECT_DETAILS,
  STATES.MARKETING_FOLLOW_UP,
  STATES.SCHEDULE_COLLECT_DATE,
  STATES.SCHEDULE_COLLECT_TIME,
  STATES.CB_COLLECT_NAME,
  STATES.CB_COLLECT_INDUSTRY,
  STATES.CB_COLLECT_FAQS,
  STATES.CB_COLLECT_SERVICES,
  STATES.CB_COLLECT_HOURS,
  STATES.CB_COLLECT_LOCATION,
  STATES.CB_FOLLOW_UP,
  // Ad generation text-collection states
  STATES.AD_COLLECT_BUSINESS,
  STATES.AD_COLLECT_INDUSTRY,
  STATES.AD_COLLECT_NICHE,
  STATES.AD_COLLECT_SLOGAN,
  STATES.AD_COLLECT_PRICING,
  STATES.AD_COLLECT_COLORS,
  // Logo generation text-collection states
  STATES.LOGO_COLLECT_BUSINESS,
  STATES.LOGO_COLLECT_INDUSTRY,
  STATES.LOGO_COLLECT_DESCRIPTION,
  STATES.LOGO_COLLECT_COLORS,
  STATES.LOGO_COLLECT_SYMBOL,
]);

// Human-readable description of what the bot was asking in each state
const STATE_QUESTION = {
  [STATES.WEB_COLLECT_NAME]: 'What is your business name?',
  [STATES.WEB_COLLECT_EMAIL]: "What's your email address? (or reply skip)",
  [STATES.WEB_COLLECT_INDUSTRY]: 'What industry are you in?',
  [STATES.WEB_COLLECT_AREAS]: 'Which city are you based in, and which areas do you serve?',
  [STATES.WEB_COLLECT_AGENT_PROFILE]: 'Tell me your brokerage, years in real estate, and any designations (or just skip).',
  [STATES.WEB_COLLECT_LISTINGS_ASK]: 'Do you have any listings to showcase? (yes / skip)',
  [STATES.WEB_COLLECT_LISTINGS_DETAILS]: 'Send your listing details in natural language, or say done.',
  [STATES.WEB_COLLECT_LISTINGS_PHOTOS]: 'Send a listing photo, or say done / skip for stock photos.',
  [STATES.WEB_COLLECT_SERVICES]: 'What services or products do you offer?',
  [STATES.WEB_COLLECT_LOGO]: "Do you have a logo? (send an image or type 'skip')",
  [STATES.WEB_COLLECT_CONTACT]: 'Please share your contact details (email, phone, address)',
  [STATES.WEB_REVISIONS]: "Tell me what you'd like to change on the site, or reply approve to move on.",
  [STATES.SALON_BOOKING_TOOL]: 'Do you use a booking tool (like Fresha, Vagaro) or want one built in?',
  [STATES.SALON_INSTAGRAM]: "What's your Instagram handle? (or reply skip)",
  [STATES.SALON_HOURS]: 'What are your opening hours for each day of the week?',
  [STATES.SALON_SERVICE_DURATIONS]: 'How long does each service take, and what does it cost?',
  [STATES.SEO_COLLECT_URL]: 'Please send your website URL to analyze',
  [STATES.SEO_FOLLOW_UP]: "Any questions about the audit — or want help fixing what we found?",
  [STATES.APP_COLLECT_REQUIREMENTS]: 'Tell me about your app idea - what does it do and who is it for?',
  [STATES.APP_FOLLOW_UP]: 'Any questions on the app proposal, or ready to move forward?',
  [STATES.MARKETING_COLLECT_DETAILS]: 'Tell me about your business and your marketing goals',
  [STATES.MARKETING_FOLLOW_UP]: 'Any questions on the marketing plan, or ready to move forward?',
  [STATES.SCHEDULE_COLLECT_DATE]: 'What date works best for you for the meeting?',
  [STATES.SCHEDULE_COLLECT_TIME]: 'What time works best for you for the meeting?',
  [STATES.CB_COLLECT_NAME]: 'What is your business name?',
  [STATES.CB_COLLECT_INDUSTRY]: 'What industry are you in?',
  [STATES.CB_COLLECT_FAQS]: 'What are the top questions your customers ask? (type "done" when finished)',
  [STATES.CB_COLLECT_SERVICES]: 'What services do you offer with their prices?',
  [STATES.CB_COLLECT_HOURS]: 'What are your business hours?',
  [STATES.CB_COLLECT_LOCATION]: 'What is your business address/location?',
  [STATES.CB_FOLLOW_UP]: 'Any questions about the chatbot — or ready to start your free trial?',
  // Ad generation
  [STATES.AD_COLLECT_BUSINESS]: 'What is your business name?',
  [STATES.AD_COLLECT_INDUSTRY]: 'What industry are you in? (e.g. Food & Beverage, Fashion, Tech)',
  [STATES.AD_COLLECT_NICHE]: 'What product or service is this ad for?',
  [STATES.AD_COLLECT_SLOGAN]: 'Type your brand slogan or tagline, or skip',
  [STATES.AD_COLLECT_PRICING]: 'Any pricing info to display on the ad? (or skip)',
  [STATES.AD_COLLECT_COLORS]: 'What are your brand colors? (or skip)',
  // Logo generation
  [STATES.LOGO_COLLECT_BUSINESS]: 'What is your business name? (this will appear on the logo)',
  [STATES.LOGO_COLLECT_INDUSTRY]: 'What industry are you in?',
  [STATES.LOGO_COLLECT_DESCRIPTION]: 'In one sentence, what does your business do?',
  [STATES.LOGO_COLLECT_COLORS]: 'What are your brand colors? (or skip)',
  [STATES.LOGO_COLLECT_SYMBOL]: 'Any symbol idea for your logo? (e.g. "a bee" or skip)',
};

// Regex fast-path for unambiguous sales objections. Hits the common 80% of
// "i don't want this / it's too much / let me think" phrasings without an
// LLM call. Everything else falls through to the LLM check in
// isSalesObjection below.
const SALES_OBJECTION_RX = /\b(too expensive|too (much|pricey|costly)|can'?t afford|out of (my )?budget|over (my )?budget|not worth it|not sure (it'?s )?worth|don'?t think it'?s worth|let me think( about it)?|(i'?ll|i will) think about it|get back to (you|u)( later)?|circle back|maybe later|not (right )?now|not the right time|look (at|for) (other |another )?(alternatives?|options?)|look elsewhere|shop around|found (something|one) cheaper|cheaper (option|alternative)|(i'?ll|i will) (just )?use wix|(i'?ll|i will) (just )?use squarespace|chatgpt (can|could|will) (do|build)|just use (ai|chatgpt)|burn(ed|t)? by agencies|scammed before)\b/i;

/**
 * Cheap detector for sales-chat objections. Tries regex first (no LLM cost),
 * falls back to a short LLM classifier for ambiguous cases. Designed to be
 * fast — this runs before every sales-chat turn so latency matters.
 *
 * Returns true when the message is clearly a pushback on buying/committing
 * (price, stalling, alternatives, trust). Returns false for questions,
 * agreement, info-sharing, or anything that the sales bot should handle
 * normally.
 */
async function isSalesObjection(text, userId) {
  const t = String(text || '').trim();
  if (!t || t.length < 4) return false;
  if (SALES_OBJECTION_RX.test(t)) return true;

  // Short messages without regex hit are almost never objections — skip the
  // LLM call. This keeps latency low for the common "ok", "yes", "what
  // about X?" replies that make up most of a sales chat.
  if (t.length < 30) return false;

  try {
    const prompt = `Classify the user's message. Return ONLY JSON: {"isObjection": true|false}.

An objection is pushback on buying or continuing — price concerns ("too expensive", "over my budget"), stalling ("let me think", "get back to you"), trust doubts ("not sure it's worth it"), competitor mentions ("i'll use wix", "chatgpt could do this"), or rejections ("not interested").

NOT objections: asking a question, providing business info, agreeing, specifying preferences, small talk. When unsure, return false.`;
    const raw = await generateResponse(
      prompt,
      [{ role: 'user', content: t.slice(0, 500) }],
      { userId, operation: 'sales_objection_check', timeoutMs: 15_000 }
    );
    const m = String(raw || '').match(/\{[\s\S]*?\}/);
    if (!m) return false;
    const parsed = JSON.parse(m[0]);
    return !!parsed.isObjection;
  } catch {
    return false; // on any failure, don't intercept — let the sales bot handle it
  }
}

/**
 * Classify whether a free-text message is answering the current question
 * or doing something else (asking a question, wanting the menu, exiting).
 * Returns: "answer" | "question" | "menu" | "exit"
 */
/**
 * After we decline a user's business for NSFW-legal reasons (cannabis,
 * gambling, adult entertainment), we persist metadata.scopeDeclinedAt.
 * This tiny LLM check decides whether a follow-up message is pushing
 * back on the same declined topic (→ re-decline) or pivoting to a
 * different project (→ clear the flag, let normal flow run).
 *
 * Returns true when the user is clearly switching topics. Returns
 * false on any ambiguity so we err on the safe side and re-decline.
 */
async function isPivotAwayFromDeclinedScope(text, declinedReason, userId) {
  const t = String(text || '').trim();
  if (!t) return false;
  try {
    const prompt = `We previously declined to build a website / marketing for a user whose business is "${declinedReason}" (outside our service scope). They just sent a new message. Is this message:

- "pivot": clearly switching to a DIFFERENT business or project (e.g. "actually, I also run a bakery", "what about my other company", "different topic, I need a logo for X", "forget that, new idea"), OR
- "continue": still pushing back on the decline, asking why, trying to reconsider, or saying anything that could still be about the declined business ("you can't?", "why not?", "but it's legal here", "please", "try anyway", a generic question like "really?").

When in doubt, return "continue" — we only switch to "pivot" when there's a clear mention of a different business or topic.

User message: "${t.replace(/"/g, '\\"').slice(0, 400)}"

Return ONLY one word: pivot or continue.`;
    const resp = await generateResponse(
      prompt,
      [{ role: 'user', content: 'Classify.' }],
      { userId, operation: 'scope_decline_pivot', timeoutMs: 8_000 }
    );
    const cleaned = String(resp || '').trim().toLowerCase().replace(/[^a-z]/g, '');
    return cleaned === 'pivot';
  } catch (err) {
    logger.warn(`[ABUSE] isPivotAwayFromDeclinedScope failed: ${err.message}`);
    return false; // safe default: re-decline
  }
}

async function classifyIntent(state, text, userId) {
  const currentQuestion = STATE_QUESTION[state];
  if (!currentQuestion) return 'answer';

  // Fast-path — these are unambiguously answers, never menu/exit/question.
  // The LLM classifier sometimes misfires on short replies (e.g. "skip" or
  // "lets just skip it" gets routed to "menu", which resets the user back to
  // service selection mid-flow). Treat the obvious short replies as plain
  // answers and skip the LLM call entirely.
  const t = String(text || '').trim().toLowerCase();
  if (!t) return 'answer';
  if (/^(skip|none|no|nope|nah|n\/?a|na|next|continue|done|same|ok|okay|yes|yeah|yep|ya|sure|y|n)$/.test(t)) return 'answer';
  // Phone-number-shaped input
  if (/^[\d\s\-+().]{6,}$/.test(t)) return 'answer';
  // Email-shaped input
  if (/@/.test(t) && t.length < 100 && !/[?]/.test(t)) return 'answer';
  // Very short replies (< 4 chars) almost always answers, never menu requests
  if (t.length < 4) return 'answer';
  // Short messages that clearly express skip / delegate / acceptance intent.
  // Single source of truth is smartDefaults.isDelegation — covers "surprise
  // me", "just add something random", "idk you pick", "i dont have it yet",
  // etc. Without this short-circuit the LLM intent classifier sometimes
  // misroutes them as "question" or "exit" and the user gets dumped out of
  // their flow mid-step.
  if (isDelegation(t)) return 'answer';

  try {
    const prompt = INTENT_CLASSIFIER_PROMPT.replace('{{CURRENT_QUESTION}}', currentQuestion);
    const response = await generateResponse(prompt, [{ role: 'user', content: text }], {
      userId,
      operation: 'intent_classifier',
    });
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return 'answer';
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.intent || 'answer';
  } catch {
    return 'answer'; // On any failure, don't block the flow
  }
}

/**
 * Inner processor: acquires the per-user lock, pins channel context, runs
 * _routeMessage with one retry if the first attempt threw before sending
 * anything. Called via routeMessage directly for non-text / button / slash
 * messages, and via the message buffer for debounced text batches.
 */
function _processTurn(message) {
  const channel = message.channel || 'whatsapp';
  return withUserLock(message.from || 'anon', () =>
    // Pin the inbound phone_number_id into the async context so every
    // sendTextMessage / sendInteractiveButtons / etc. inside this turn replies
    // from the same business number the user messaged. The context also
    // tracks a sendCount that gates the retry logic below.
    runWithContext({ channel, phoneNumberId: message.phoneNumberId || null }, async () => {
    const { getSendCount } = require('../messages/channelContext');

    // First attempt.
    try {
      return await _routeMessage(message);
    } catch (err) {
      const alreadyReplied = getSendCount() > 0;
      if (alreadyReplied) {
        // The turn already delivered at least one reply to the user before
        // throwing. Retrying would duplicate that reply — much worse than
        // just logging and moving on. This is the common case when a post-
        // reply step (metadata update, summary refresh, trigger dispatch)
        // throws but the user got what they needed.
        logger.warn(`[ROUTER] First attempt failed AFTER ${getSendCount()} reply(ies) for ${message.from}: ${err.message}. NOT retrying (would duplicate).`);
        return;
      }
      logger.warn(`[ROUTER] First attempt failed for ${message.from} with no reply sent: ${err.message}. Retrying once.`);
      await new Promise((r) => setTimeout(r, 600));
    }

    // Second attempt — only reached when the first attempt threw BEFORE
    // sending anything. Transient timeouts / network blips fall into this
    // bucket and usually succeed on retry.
    try {
      return await _routeMessage(message);
    } catch (err) {
      logger.error(`[ROUTER] Retry also failed for ${message.from}:`, {
        message: err.message,
        stack: err.stack?.split('\n').slice(0, 5).join('\n'),
      });
      // Only now, after two honest attempts, surface a user-visible nudge.
      try {
        await sendTextMessage(
          message.from,
          "Hmm, something glitched on my end. Try sending that again in a sec?"
        );
      } catch {
        // If even the nudge fails, we're truly stuck — just log.
      }
    }
    })
  );
}

/**
 * Main message router. Called for every incoming message (WhatsApp, Messenger, Instagram).
 *
 * Dedup runs up front so redelivered messages never enter the buffer or the
 * lock chain. Plain text goes through the 1s debounce buffer (Phase 7) so
 * rapid bursts merge into one turn; everything else (media, button taps,
 * slash commands) takes the direct path and flushes any pending text first
 * to preserve arrival order.
 */
async function routeMessage(message) {
  const from = message.from || 'anon';

  // Dedup: WhatsApp occasionally redelivers the same inbound messageId.
  // Checking here (before the buffer and lock) means a dup can never ride
  // into a merged batch and accidentally re-trigger a reply.
  if (seenRecently(from, message.messageId)) {
    logger.warn(`[ROUTER] Duplicate delivery ignored: from=${from} messageId=${message.messageId}`);
    return;
  }

  if (messageBuffer.isBufferable(message)) {
    return messageBuffer.enqueue(message, _processTurn);
  }

  // Non-text / button / slash: drain any pending text for this user first
  // so the user-visible order matches the send order (typed "hi" then
  // tapped a button → "hi" gets a reply, then the button tap processes).
  await messageBuffer.flushPendingWith(from, _processTurn);
  return _processTurn(message);
}

async function _routeMessage(message) {
  const { from, text, messageId } = message;
  const channel = message.channel || 'whatsapp';

  // Dedup already ran in routeMessage before the buffer / lock — don't
  // re-check here. seenRecently is stateful and a second call for the same
  // id would mis-flag this turn as a duplicate.

  // Track the message ID so typing indicators work for all outgoing messages
  setLastMessageId(from, messageId);

  // Mark message as read
  try {
    await markAsRead(messageId);
  } catch {
    // Non-critical - continue processing
  }

  // Save original message type before audio transcription overwrites it
  const originalType = message.type;

  // Download media (image/audio) for storage in DB so admin can view it
  let mediaData = null;
  let mediaMime = null;
  if ((message.type === 'image' || message.type === 'audio') && message.mediaId) {
    try {
      const { downloadMedia } = require('../messages/sender');
      const media = await downloadMedia(message.mediaId);
      if (media?.buffer) {
        mediaData = `data:${media.mimeType};base64,${media.buffer.toString('base64')}`;
        mediaMime = media.mimeType;
      }
    } catch (err) {
      logger.error('Media download failed:', err.message);
    }
  }

  // Transcribe audio messages to text
  if (message.type === 'audio' && (message.mediaId || message.mediaUrl)) {
    try {
      const mediaRef = message.mediaId || message.mediaUrl;
      const transcript = await transcribeAudio(mediaRef, message.mimeType);
      if (transcript) {
        message.text = transcript;
        message.type = 'text';
        logger.info(`Audio from ${from} transcribed: "${transcript.slice(0, 100)}"`);
      }
    } catch (error) {
      logger.error('Audio transcription failed:', error);
      await sendTextMessage(from, "I couldn't process that voice message - could you type it out instead?");
      return;
    }
  }

  // Find or create user. Identity is per (phone, channel, inbound business
  // number) so a customer texting two of our WhatsApp numbers gets two
  // independent sessions.
  const user = await findOrCreateUser(from, channel, message.phoneNumberId || null);

  // ── Feedback button intercepts ─────────────────────────────────────────
  // Must run BEFORE abuse detection and normal intent routing — these are
  // user responses to prompts WE sent; they're not abuse, not flow-switch
  // intent, and they shouldn't be classified by other interceptors.
  try {
    const {
      handleFeedbackButton,
      handlePendingComment,
      handleHandoffButton,
    } = require('../feedback/feedback');

    // Post-delivery rating buttons (🔥/👍/🤔)
    const fb = await handleFeedbackButton(user, message);
    if (fb?.handled) return;

    // Human-handoff offer buttons (Get a human / Keep trying)
    const ho = await handleHandoffButton(user, message);
    if (ho?.handled) return;

    // The existing humanTakeover gate further down (around line ~860)
    // is what silences subsequent inbound turns once the abuse detector
    // has flipped the user. No separate short-circuit needed here —
    // applyHandover() sets humanTakeover:true, one canned reply goes
    // out at flag time, and every inbound turn after that falls through
    // to the standard takeover drop with zero LLM spend.

    // Free-text reply to "what happened?" after the user tapped
    // Had issues on a previous delivery prompt.
    const pc = await handlePendingComment(user, message);
    if (pc?.handled) return;
  } catch (err) {
    logger.warn(`[FEEDBACK] Router hook failed: ${err.message}`);
  }

  // ── Interactive reply matcher (Phase 10) ───────────────────────────────
  // If the last bot message to this user had buttons/list and this inbound
  // is plain text that looks like a pick ("2", "second one", "website",
  // etc.), convert it into a real buttonId so downstream handlers treat
  // it as a tap. Users on desktop, older clients, or who just prefer
  // typing never have to phrase things exactly right. Runs BEFORE the
  // recap check so a matched pick suppresses the recap.
  const rawText = (message.text || '').trim();
  const alreadyTapped = !!(message.buttonId || message.listId);
  if (message.type === 'text' && rawText && !alreadyTapped && !rawText.startsWith('/')) {
    try {
      const { matchReply } = require('../messages/interactiveReplyMatcher');
      const result = await matchReply(user.phone_number, rawText, { userId: user.id });
      if (result && result.kind === 'match') {
        logger.info(`[INTERACTIVE] Matched "${rawText}" → buttonId=${result.item.id} (title="${result.item.title}") for ${from}`);
        message.buttonId = result.item.id;
        // Replace the visible text with the button's title so conversation
        // logs and any LLM context downstream read naturally ("SEO Audit"
        // instead of "2"). Original digit is still recoverable from logs.
        message.text = result.item.title;
      } else if (result && result.kind === 'out_of_range') {
        // User typed a digit that doesn't correspond to any button. Give
        // a concrete nudge rather than silently re-showing the menu.
        // Pending stays alive so their next valid digit still matches.
        logger.info(`[INTERACTIVE] Out-of-range digit "${rawText}" for ${from} (total=${result.total})`);
        const nudge = `that was only ${result.total} option${result.total === 1 ? '' : 's'} — pick 1-${result.total} or tap one of the buttons above.`;
        await sendTextMessage(user.phone_number, nudge);
        await logMessage(user.id, nudge, 'assistant');
        // Stop this turn here. The buttons are still visible in the
        // chat and the user can retry; no need to run the state handler
        // (which would re-show the whole menu).
        return;
      }
      // kind 'off_topic' and 'nopending' fall through to normal handling.
    } catch (err) {
      logger.warn(`[INTERACTIVE] Matcher threw for ${from}: ${err.message}`);
    }
  }

  // ── Abuse detection (Phase 13) ─────────────────────────────────────────
  // Before ANY greeting / recap / handler dispatch runs, classify the
  // inbound message. Hard categories (hate / threats / phishing /
  // hacking / illegal) get a firm decline, bot-silence via
  // humanTakeover, and an admin email. NSFW-legal (adult / cannabis /
  // gambling) gets a polite decline only. Gray-area intents (MLM,
  // crypto, diet-pill dropshipping) pivot to the meeting-booking flow.
  //
  // Gated to skip cheaply for: button taps, slash commands, empty
  // text, and users already in humanTakeover — no need to burn an
  // LLM call on messages that won't produce a bot reply anyway.
  {
    const abuseText = (message.text || '').trim();
    const isAbuseSlash = abuseText.startsWith('/');
    const isAbuseInteractive = !!(message.buttonId || message.listId);
    const alreadySilenced = !!user.metadata?.humanTakeover;
    if (
      message.type === 'text' &&
      abuseText &&
      !isAbuseSlash &&
      !isAbuseInteractive &&
      !alreadySilenced
    ) {
      try {
        // Phase 13 follow-up: if this user was already declined for
        // nsfw-legal scope in the last 30 min, don't let a generic
        // pushback ("you can't do it?") slip past the classifier and
        // re-enter the normal flow. Check whether they're pivoting to
        // a different topic — if so, clear the flag; otherwise
        // re-decline softly and stop processing this turn.
        const scopeDeclinedAt = user.metadata?.scopeDeclinedAt;
        if (scopeDeclinedAt) {
          const sinceMs = Date.now() - new Date(scopeDeclinedAt).getTime();
          const COOLDOWN_MS = 30 * 60 * 1000;
          if (sinceMs < COOLDOWN_MS) {
            const reason = user.metadata?.scopeDeclinedReason || 'that kind of business';
            const pivoted = await isPivotAwayFromDeclinedScope(abuseText, reason, user.id);
            if (!pivoted) {
              const reDecline = `still not something we're able to help with for ${reason}. if there's a different project you're working on, happy to chat about that instead.`;
              await sendTextMessage(user.phone_number, reDecline);
              await logMessage(user.id, reDecline, 'assistant');
              logger.info(`[ABUSE] Re-declined nsfw scope (${reason}) for ${from}`);
              return;
            }
            // Pivoted — clear the flag and fall through to normal routing
            await updateUserMetadata(user.id, { scopeDeclinedAt: null, scopeDeclinedReason: null });
            if (user.metadata) {
              user.metadata.scopeDeclinedAt = null;
              user.metadata.scopeDeclinedReason = null;
            }
            logger.info(`[ABUSE] User pivoted away from declined ${reason}, clearing flag`);
          } else {
            // Cooldown elapsed — clear silently.
            await updateUserMetadata(user.id, { scopeDeclinedAt: null, scopeDeclinedReason: null });
            if (user.metadata) {
              user.metadata.scopeDeclinedAt = null;
              user.metadata.scopeDeclinedReason = null;
            }
          }
        }

        const { classifyAbuse } = require('./abuseDetector');
        const { handleAbuseCategory } = require('./abuseHandler');
        const category = await classifyAbuse(abuseText, user.id);
        if (category && category !== 'clean') {
          const result = await handleAbuseCategory(user, message, category);
          if (result?.handled) return;
        }
      } catch (err) {
        // Never let an abuse-detector bug block a legitimate message.
        logger.warn(`[ABUSE] Detection pipeline failed for ${from}: ${err.message}`);
      }
    }
  }

  // ── Document + location intercepts (Phase 14) ──────────────────────────
  // Before state dispatch, catch non-text inbounds that handlers can't
  // process. Location pins get reverse-geocoded and (when the user is
  // mid-webdev) can seed primaryCity / contactAddress automatically.
  // Documents are captured to metadata and acknowledged — admin handles
  // content review manually.
  //
  // Silenced users (humanTakeover) are NOT handled here — their messages
  // pass through to the takeover gate below and are logged without a
  // bot reply, same as text messages.
  const silencedForMedia = !!user.metadata?.humanTakeover;
  if (!silencedForMedia && message.type === 'location') {
    try {
      const { handleLocation } = require('./handlers/locationHandler');
      const result = await handleLocation(user, message);
      if (result?.handled) return;
    } catch (err) {
      logger.error(`[LOCATION] Handler failed for ${from}: ${err.message}`);
    }
  }
  if (!silencedForMedia && message.type === 'document') {
    try {
      const { handleDocument } = require('./handlers/locationHandler');
      const result = await handleDocument(user, message);
      if (result?.handled) return;
    } catch (err) {
      logger.error(`[DOC] Handler failed for ${from}: ${err.message}`);
    }
  }

  // ── Session recap (Phase 9) ────────────────────────────────────────────
  // If the user has been silent for more than 30 min, fire a short
  // contextual "welcome back" before the handler runs. Done HERE (after
  // findOrCreateUser, before logMessage) so the gap query inside
  // maybeBuildRecap sees the PREVIOUS turn as "latest user message"
  // instead of the one we're about to log.
  //
  // Skip on slash commands and button/list taps — /reset is a fresh-start
  // intent and a button tap is typically mid-flow navigation; a recap in
  // front of either feels off.
  const recapText = (message.text || '').trim();
  const isSlash = recapText.startsWith('/');
  const isInteractive = !!(message.buttonId || message.listId);
  let recapFired = false;
  if (message.type === 'text' && !isSlash && !isInteractive) {
    try {
      const { maybeBuildRecap } = require('./sessionRecap');
      const recap = await maybeBuildRecap(user);
      if (recap) {
        logger.info(`[RECAP] Sending session recap to ${from}`);
        await sendTextMessage(user.phone_number, recap);
        await logMessage(user.id, recap, 'assistant');
        recapFired = true;
      }
    } catch (err) {
      // A failed recap should never block the actual reply. Log and move
      // on — the user still gets the handler's response.
      logger.warn(`[RECAP] Recap failed for ${from}: ${err.message}`);
    }
  }

  // ── Phase 15: return-visitor greeting ───────────────────────────────────
  // If a user who previously completed a project (website, logo, ad,
  // chatbot, SEO audit) comes back after a long gap and is in an idle
  // state (not mid-collection), prepend a warm "welcome back" that
  // references their business by name. Gated on !recapFired so the two
  // mechanisms don't double-fire — recap handles users mid-flow with
  // in-progress context; return-greet handles users whose prior work
  // is complete.
  if (message.type === 'text' && !isSlash && !isInteractive && !recapFired) {
    try {
      const { maybeBuildReturnGreeting } = require('./returnVisitor');
      const greeting = await maybeBuildReturnGreeting(user);
      if (greeting) {
        logger.info(`[RETURN-GREET] Sending return-visitor greeting to ${from}`);
        await sendTextMessage(user.phone_number, greeting);
        await logMessage(user.id, greeting, 'assistant');
      }
    } catch (err) {
      logger.warn(`[RETURN-GREET] Greeting failed for ${from}: ${err.message}`);
    }
  }

  // Store ad referral data on first interaction (if present)
  if (message.referral && !user.metadata?.adSource) {
    const ref = message.referral;
    const product = identifyProduct(ref.body || ref.headline || '');
    await updateUserMetadata(user.id, {
      adSource: product,
      adReferral: {
        sourceId: ref.sourceId,
        sourceType: ref.sourceType,
        headline: ref.headline,
        body: ref.body,
        ctwaClid: ref.ctwaClid,
        platform: channel,
        timestamp: new Date().toISOString(),
      },
    });
    user.metadata = { ...user.metadata, adSource: product, adReferral: ref };
    logger.info(`[AD TRACKING] Platform: ${channel} | Product: ${product} | Ad: ${ref.headline || 'N/A'} | User: ${from}`);
  }

  // Log incoming message — use latest text (may be audio transcript), originalType (so audio shows as audio)
  await logMessage(user.id, message.text || text || '', 'user', originalType, messageId, mediaData, mediaMime);

  // Auto-update lead temperature based on user message count
  const messageCount = (user.metadata?.userMessageCount || 0) + 1;
  const currentTemp = user.metadata?.leadTemperature || 'COLD';
  const newTemp = messageCount >= 10 ? 'HOT' : messageCount >= 5 ? 'WARM' : currentTemp;
  if (newTemp !== currentTemp || messageCount !== user.metadata?.userMessageCount) {
    await updateUserMetadata(user.id, { userMessageCount: messageCount, leadTemperature: newTemp });
    if (newTemp !== currentTemp) {
      logger.info(`[LEAD] ${from} temperature: ${currentTemp} → ${newTemp} (${messageCount} messages)`);
    }
  }

  // Re-fetch user to get latest metadata (takeover flag may have been set from admin)
  const { supabase } = require('../config/database');
  const { data: freshMeta } = await supabase.from('users').select('metadata').eq('id', user.id).single();
  if (freshMeta) user.metadata = freshMeta.metadata;

  // If human has taken over this conversation, just log the message and stop
  if (user.metadata?.humanTakeover) {
    logger.info(`[HUMAN TAKEOVER] Message from ${from} logged (bot paused): "${(text || '').slice(0, 50)}"`);
    return;
  }

  // Check for reset command
  if (text && text.toLowerCase().trim() === '/reset') {
    // Feedback: rapid-reset detector — if the user issued /reset
    // within the RAPID_RESET_WINDOW_MS of their previous one, log an
    // implicit friction row with the conversation excerpt. Has to
    // happen BEFORE the metadata clear below, since the clear wipes
    // lastResetAt. We re-write lastResetAt after the clear.
    let rapidResetTimestamp = null;
    try {
      const { recordResetAndMaybeFlag } = require('../feedback/feedback');
      rapidResetTimestamp = await recordResetAndMaybeFlag(user);
    } catch (err) {
      logger.warn(`[FEEDBACK] recordResetAndMaybeFlag failed: ${err.message}`);
    }

    await updateUserState(user.id, STATES.SALES_CHAT);
    // Clear trigger flags so flows can be re-triggered
    const { updateUserMetadata } = require('../db/users');
    await updateUserMetadata(user.id, {
      websiteDemoTriggered: false,
      seoAuditTriggered: false,
      chatbotDemoTriggered: false,
      chatbotDemoAgreed: false,
      adGeneratorTriggered: false,
      logoMakerTriggered: false,
      returnToSales: false,
      leadClosed: false,
      meetingBooked: false,
      leadBriefSent: false,
      followupSteps: [],
      lastSeoAnalysis: null,
      lastSeoUrl: null,
      seoTopFix: null,
      seoAuditCompletedAt: null,
      currentAuditId: null,
      chatbotData: null,
      adData: null,
      logoData: null,
      chatbotDemoSentAt: null,
      chatbotDemoFollowedUp: false,
      chatbotTrialActivated: false,
      chatbotSlug: null,
      chatbotTrialEndsAt: null,
      // Website builder state — without these, a fresh /reset would still
      // reuse the last business name, industry, services, contact info, and
      // the half-built site record, skipping collection questions on restart.
      websiteData: null,
      currentSiteId: null,
      revisionCount: 0,
      bonusRevisionUsed: false,
      lastRevisionComplexity: null,
      // Step-completed flags — without clearing these, a prior session's
      // skip leaks across and suppresses the matching question forever.
      emailSkipped: false,
      contactSkipped: false,
      // Other flow-state leaks found by the audit: each of these gets
      // SET mid-flow but was never cleared on reset, so a previous
      // session's state bled into the next flow.
      // - bytescartPitched: once true, the sales bot never re-offers
      //   ByteScart (even to a fresh user after /reset).
      // - currentMeetingId: stale pointer to a prior meeting row.
      // - salonFlowOrigin: forces salon sub-flow into CONFIRM loopback
      //   on a fresh user if set by a prior session.
      // - webGenStartedAt: the in-progress generation guard gets
      //   tripped by a stale timestamp.
      bytescartPitched: false,
      currentMeetingId: null,
      salonFlowOrigin: null,
      webGenStartedAt: null,
      // Phase 13 nsfw-legal decline flag. Without clearing these, a
      // user who hits /reset after being declined (e.g. to try a
      // different business) would stay soft-blocked for 30 min.
      scopeDeclinedAt: null,
      scopeDeclinedReason: null,
      // Domain state — otherwise the sales bot sees a leftover
      // selectedDomain and offers "umairbarber.com" to a fresh user.
      selectedDomain: null,
      domainStatus: null,
      domainPaymentPending: false,
      domainPurchasedAt: null,
      // Rolling conversation summary (Phase 0) gets re-injected into every
      // sales-bot prompt, so leaving it across /reset is the #1 way the
      // previous session's context leaks into a "fresh" start. Clear it.
      conversationSummary: null,
      conversationSummaryAt: null,
      // Humanize flags that gate per-user behavior across turns.
      objectionTopics: [],
      preferredLanguage: null,
      postWebsiteUpsellSent: false,
      postWebsiteUpsellKind: null,
      postWebsiteUpsellAt: null,
      undoPendingState: null,
      stateHistory: [],
      // Lead-temperature accounting.
      userMessageCount: 0,
      leadTemperature: 'COLD',
      // Session-recap gate.
      sessionRecapLastAt: null,
      // Phase 12: multi-service queue.
      serviceQueue: [],
      // NOTE: lastBusinessName / lastCompletedProjectType / lastCompletedProjectAt
      // are INTENTIONALLY NOT cleared here. Phase 15 uses them to personalize
      // the return-visitor greeting across sessions — a /reset should wipe
      // in-progress state, not the memory that the user has completed work
      // with us before.
    });
    user.state = STATES.SALES_CHAT;
    logger.info(`User ${from} reset conversation state + metadata (history preserved for admin)`);

    // /reset now keeps past conversation rows in the DB so the admin
    // dashboard can see what led up to the reset (helps diagnose why
    // a user chose to restart). The bot, however, treats everything
    // before this moment as invisible — every LLM-facing caller of
    // getConversationHistory passes `afterTimestamp: user.metadata
    // .lastResetAt` so the sales bot / sub-handlers / summarizer only
    // see messages from the fresh session.
    //
    // A system-role sentinel row gives the admin chat view a visible
    // divider at the /reset moment.
    const resetAt = new Date(rapidResetTimestamp || Date.now()).toISOString();
    try {
      await logMessage(user.id, '━━━ session restarted (/reset) ━━━', 'system');
    } catch (err) {
      logger.warn(`[RESET] Failed to write sentinel row: ${err.message}`);
    }

    // Persist lastResetAt so (a) LLM-facing history queries filter
    // past this point, and (b) the next /reset can detect rapid-
    // succession. Has to happen AFTER the metadata clear above.
    try {
      await updateUserMetadata(user.id, { lastResetAt: resetAt });
      user.metadata = { ...(user.metadata || {}), lastResetAt: resetAt };
    } catch (err) {
      logger.warn(`[RESET] Failed to persist lastResetAt: ${err.message}`);
    }

    // Send a deterministic Pixie greeting so /reset never produces a
    // greeting-less response. Stopping here also saves an LLM call.
    await sendTextMessage(user.phone_number, "Hi! I'm Pixie. What can I help you with today?");
    await logMessage(user.id, "Hi! I'm Pixie. What can I help you with today?", 'assistant');
    return;
  }

  // Check for menu command (text or button) - go back to service selection
  // AND send the main menu directly. Falling through would land in
  // handleServiceSelection's default "hmm, didn't catch that" branch
  // because "/menu" isn't in matchServiceFromText's service-keyword list.
  if ((text && text.toLowerCase().trim() === '/menu') || message.buttonId === 'menu_main') {
    await updateUserState(user.id, STATES.SERVICE_SELECTION);
    user.state = STATES.SERVICE_SELECTION;
    // Phase 12: explicit menu request cancels any pending queue — user is
    // re-choosing, not continuing the original plan.
    const { clearServiceQueue } = require('./serviceQueue');
    await clearServiceQueue(user);
    const { sendMainMenu } = require('./handlers/serviceSelection');
    await sendMainMenu(user);
    return;
  }

  // ── Salon owner commands (run before state routing) ───────────────────────
  // Lets salon owners query/cancel bookings from any state via plain text:
  // "bookings", "bookings today", "cancel 123".
  if (text && !message.buttonId && !message.listId && message.type === 'text') {
    try {
      const handled = await tryHandleSalonOwnerCommand(user, message);
      if (handled) return;
    } catch (err) {
      logger.error('Salon owner command interceptor failed:', err);
    }
  }

  // ── Phase 12: multi-service queue pre-interceptor ─────────────────────────
  // When the user is NOT mid-collection (sales chat, service selection,
  // or informative chat) and their message names 2+ queueable services
  // in one breath, build the queue and kick off the first flow. For
  // collection states the intent classifier below picks it up via the
  // "menu" branch, so we scope this early check to the idle states only.
  if (
    text &&
    !message.buttonId &&
    !message.listId &&
    message.type === 'text' &&
    (user.state === STATES.SALES_CHAT ||
      user.state === STATES.SERVICE_SELECTION ||
      user.state === STATES.INFORMATIVE_CHAT)
  ) {
    try {
      const { detectServiceQueue, startServiceQueue } = require('./serviceQueue');
      const plural = await detectServiceQueue(message.text || '', user.id);
      if (plural.length >= 2) {
        await updateUserState(user.id, STATES.SERVICE_SELECTION);
        user.state = STATES.SERVICE_SELECTION;
        const newState = await startServiceQueue(user, plural);
        if (newState && newState !== user.state) {
          await updateUserState(user.id, newState);
        }
        return;
      }
    } catch (err) {
      logger.error('[QUEUE] Plural pre-interceptor failed:', err);
      // Fall through to normal routing — never let a queue bug block a reply.
    }
  }

  // ── Undo / keep classifier ────────────────────────────────────────────────
  // When the user is at an undo-able state, one LLM call decides if their
  // reply means "go back", "keep the previous value", or neither. The LLM
  // handles natural phrasings ("actually let's revisit that", "one step
  // back", "nah, back up") without a brittle regex list. Long messages
  // and non-text inputs short-circuit to skip the LLM call.
  if (
    text &&
    !message.buttonId &&
    !message.listId &&
    message.type === 'text' &&
    UNDOABLE_STATES.has(user.state)
  ) {
    const intent = await classifyUndoOrKeep(text, {
      undoPending: user.metadata?.undoPendingState === user.state,
      userId: user.id,
    });
    if (intent === 'undo') {
      await handleUndo(user);
      return;
    }
    if (intent === 'keep') {
      await clearUndoPending(user);
      try {
      const webDev = require('./handlers/webDev');
      const wd = user.metadata?.websiteData || {};

      // Compute next state. Salon sub-flow has its own linear order; other
      // states defer to nextMissingWebDevState.
      let nextState;
      if (user.state === STATES.SALON_BOOKING_TOOL) {
        nextState = STATES.SALON_INSTAGRAM;
      } else if (user.state === STATES.SALON_INSTAGRAM) {
        // Embed mode skips hours/durations; native goes through them.
        nextState = wd.bookingMode === 'embed'
          ? null  // sentinel — finishSalonFlow handles rest
          : STATES.SALON_HOURS;
      } else if (user.state === STATES.SALON_HOURS) {
        nextState = (wd.services && wd.services.length > 0)
          ? STATES.SALON_SERVICE_DURATIONS
          : null;
      } else if (user.state === STATES.SALON_SERVICE_DURATIONS) {
        nextState = null; // finishSalonFlow handles what's next
      } else {
        nextState = webDev.nextMissingWebDevState(wd, user.metadata || {});
      }

      // Null sentinel for salon → route through finishSalonFlow. It
      // handles contact-already-collected vs needs-collection vs confirm.
      if (nextState === null) {
        // Inline minimal finishSalonFlow: show summary if contact known,
        // else ask for contact. finishSalonFlow is not exported but we
        // can mimic its decision.
        const hasContact = !!(wd.contactEmail || wd.contactPhone || wd.contactAddress);
        if (hasContact) {
          await sendTextMessage(user.phone_number, 'Kept as is.');
          await webDev.showConfirmSummary(user);
        } else {
          await sendTextMessage(
            user.phone_number,
            "Kept as is.\n\nLast thing — what contact info do you want on the site? Send your email, phone, and/or address."
          );
          await updateUserState(user.id, STATES.WEB_COLLECT_CONTACT);
        }
        await logMessage(user.id, `Undo: kept, advanced through salon flow`, 'assistant');
        return;
      }

      if (nextState && nextState !== user.state) {
        await updateUserState(user.id, nextState);
        user.state = nextState;
      }
      if (nextState === STATES.WEB_CONFIRM) {
        await webDev.showConfirmSummary(user);
      } else {
        const question = webDev.questionForState(nextState, wd);
        await sendTextMessage(user.phone_number, `Kept as is. ${question}`);
      }
      await logMessage(user.id, `Undo: kept, advanced to ${nextState}`, 'assistant');
      } catch (err) {
        logger.error(`[UNDO] Keep-advance failed: ${err.message}`);
        await sendTextMessage(user.phone_number, "Kept as is. What's next?");
      }
      return;
    }
    // intent === 'none' — fall through to normal routing
  }

  // ── Feedback: implicit friction detectors ──────────────────────────────
  // Text-only, post-findOrCreateUser, before state routing. Each
  // detector runs cheap regex/counter checks; on hit, writes an
  // implicit feedback row and (for escalating signals) offers a human
  // handoff. Does NOT short-circuit message processing — just logs
  // signal and continues, so the user still gets the handler's reply.
  if (
    text &&
    !message.buttonId &&
    !message.listId &&
    message.type === 'text'
  ) {
    try {
      const {
        maybeLogFrustration,
        bumpCorrectionLoop,
        detectHelpEscape,
        offerHumanHandoff,
        isTester,
        CORRECTION_LOOP_THRESHOLD,
        TRIGGER,
      } = require('../feedback/feedback');

      if (!isTester(user)) {
        // Frustrated phrasing (silent log, no user-facing action)
        await maybeLogFrustration(user, text);

        // Help-escape (explicit "talk to a human") — offer handoff.
        // Pairs with humanTakeover toggle per user's design decision.
        if (detectHelpEscape(text)) {
          await offerHumanHandoff(user, TRIGGER.HELP_ESCAPE);
          return; // handoff prompt replaces the normal turn
        }

        // Correction-loop counter — only meaningful in collection states
        // where the user is answering a specific question.
        if (COLLECTION_STATES.has(user.state)) {
          const count = await bumpCorrectionLoop(user, text);
          if (count >= CORRECTION_LOOP_THRESHOLD) {
            // Log the event + offer handoff. Reset the counter so we
            // don't keep re-offering on every subsequent message.
            const { logFeedback, SOURCE } = require('../feedback/feedback');
            const { getConversationHistory } = require('../db/conversations');
            let excerpt = [];
            try {
              const hist = await getConversationHistory(user.id, 8);
              excerpt = (hist || []).map((m) => ({
                role: m.role,
                text: String(m.content || m.message_text || '').slice(0, 200),
              }));
            } catch { /* best-effort excerpt */ }
            await logFeedback({
              user,
              source: SOURCE.IMPLICIT,
              triggerType: TRIGGER.CORRECTION_LOOP,
              flow: 'general',
              rating: 'issues',
              comment: `${count} consecutive corrections in state ${user.state}`,
              excerpt,
              state: user.state,
            });
            await updateUserMetadata(user.id, { correctionLoopCount: 0 });
            await offerHumanHandoff(user, TRIGGER.CORRECTION_LOOP);
            return;
          }
        }
      }
    } catch (err) {
      logger.warn(`[FEEDBACK] Implicit detector hook failed: ${err.message}`);
    }
  }

  // ── Intent interceptor ─────────────────────────────────────────────────────
  // For collection states with free-text (no button press), classify intent
  // before blindly passing the text to the handler.
  if (
    text &&
    !message.buttonId &&
    !message.listId &&
    message.type === 'text' &&
    COLLECTION_STATES.has(user.state)
  ) {
    const intent = await classifyIntent(user.state, text, user.id);
    logger.debug(`Intent classified for ${from} in state ${user.state}: ${intent}`);

    if (intent === 'menu' || intent === 'exit') {
      // Flow-switch or exit. Figure out which service the user wants to
      // switch TO (handles negation like "forget the website, do chatbot"
      // and plurals like "marketing ads" via LLM fallback when regex
      // alone isn't reliable). If a target service is found, route them
      // to its start handler directly. If not, show the main menu.
      await updateUserState(user.id, STATES.SERVICE_SELECTION);
      user.state = STATES.SERVICE_SELECTION;

      // Phase 12: if the switch names 2+ queueable services ("forget
      // this, do a website AND a logo AND some ads"), build the queue
      // and kick off the first flow here. Overwrites any prior queue.
      const {
        detectServiceQueue,
        startServiceQueue,
        maybeStartNextQueuedService,
        dropQueuedService,
        hasQueue,
      } = require('./serviceQueue');
      const plural = await detectServiceQueue(message.text || text || '', user.id);
      if (plural.length >= 2) {
        const newState = await startServiceQueue(user, plural);
        if (newState && newState !== user.state) {
          await updateUserState(user.id, newState);
        }
        return;
      }

      const { pickServiceFromSwitch } = require('./handlers/serviceSelection');
      const targetService = await pickServiceFromSwitch(text, user.id);

      // Phase 12: user has a pending queue AND their switch has no specific
      // target ("forget this, lets do the rest" / "next" / "skip this").
      // Advance the queue instead of falling into the generic menu.
      //
      // Gate on EXPLICIT skip phrasing. The intent classifier occasionally
      // labels an ambiguous answer as "menu" (e.g. "Hasnain Plumbing" in a
      // name-collection state); without this gate, we'd silently advance
      // the queue and eat the user's real answer.
      const skipPhrasingRx = /\b(rest|next|continue|skip|forget\s+(?:this|it|that)|forget\s+the|drop\s+(?:this|it|that)|scrap\s+(?:this|it|that)|cancel\s+(?:this|it|that)|pass|move\s+on|keep\s+going|proceed|whatever|on\s+to\s+the\s+next|remaining|others?)\b/i;
      const hasSkipPhrasing = skipPhrasingRx.test(message.text || text || '');
      if (!targetService && hasQueue(user) && hasSkipPhrasing) {
        try {
          const newState = await maybeStartNextQueuedService(user, 'skipped');
          if (newState) {
            await updateUserState(user.id, newState);
            return;
          }
        } catch (err) {
          // Surface the error instead of leaving the user with only the
          // "skipping ahead" message. Send a recovery nudge so the user
          // isn't stuck; the queue has already advanced (next item was
          // popped), so the message reflects current state.
          logger.error(`[QUEUE] Advance failed after skip: ${err.message}`, { stack: err.stack?.split('\n').slice(0, 5).join('\n') });
          try {
            await sendTextMessage(
              user.phone_number,
              "hmm, something glitched while starting the next one. try sending *menu* and we can pick it back up."
            );
          } catch { /* last-resort nudge also failed — nothing more to do */ }
          return;
        }
      }

      // Phase 12: user jumped to a specific service that's ALREADY queued.
      // Drop it (and anything before it) from the queue so we don't run
      // the same flow twice when it completes.
      if (targetService && hasQueue(user)) {
        await dropQueuedService(user, targetService);
      }

      const newState = await handleServiceSelection(user, {
        ...message,
        // Pre-resolved service tells handleServiceSelection exactly which
        // case to run. Falls back to matchServiceFromText → default if
        // null (no service mentioned).
        buttonId: targetService || '',
        listId: '',
        text: targetService ? '' : (message.text || ''),
      });
      if (newState && newState !== user.state) {
        await updateUserState(user.id, newState);
      }
      return;
    }

    if (intent === 'question') {
      // Answer their question, then bring them back to where they were.
      // If the LLM call fails, skip the aside and just re-prompt — better
      // than stalling silently.
      const currentQuestion = STATE_QUESTION[user.state];
      try {
        const aside = await generateResponse(
          GENERAL_CHAT_PROMPT,
          [{ role: 'user', content: text }],
          { userId: user.id, operation: 'off_topic_aside' }
        );
        await sendTextMessage(user.phone_number, aside);
        await logMessage(user.id, aside, 'assistant');
      } catch (err) {
        logger.warn(`[ROUTER] Off-topic aside LLM call failed for ${from}: ${err.message}`);
      }

      // Remind them of the current step. If STATE_QUESTION has no entry
      // for this state, skip the re-prompt (better silence than
      // "Now, back to where we were - undefined").
      if (currentQuestion) {
        await sendWithMenuButton(
          user.phone_number,
          `Now, back to where we were - ${currentQuestion}`
        );
        await logMessage(user.id, `Reminded user: ${currentQuestion}`, 'assistant');
      }
      return; // Stay in same state
    }

    if (intent === 'objection') {
      // Phase 8: the user is pushing back on the process (price, doubt,
      // stalling, competitor). The objection handler validates, shares
      // light social proof if relevant, and offers a low-commitment next
      // step — no re-sell, no fake urgency. User stays in the same state
      // so their next message lands in the normal collection flow.
      await handleObjection(user, message, user.state, STATE_QUESTION[user.state]);
      return;
    }

    // intent === 'answer' - fall through to normal handler
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── Sales-chat objection interceptor ───────────────────────────────────────
  // The sales bot has its own aggressive Stage 6 ("value-stack, drop a tier,
  // re-close"), which trips users into bullet-point re-pitches after a simple
  // "too expensive". Before the sales bot runs, check if the message is a
  // clear objection — if so, route through the gentle objectionHandler
  // instead and stay in SALES_CHAT. User's next message flows normally.
  if (
    user.state === STATES.SALES_CHAT &&
    text &&
    !message.buttonId &&
    !message.listId &&
    message.type === 'text' &&
    (await isSalesObjection(text, user.id))
  ) {
    logger.info(`[SALES] Objection intercepted for ${from} — routing to gentle handler`);
    await handleObjection(user, message, STATES.SALES_CHAT, 'sales conversation');
    return;
  }

  // Get handler for current state
  const handler = STATE_HANDLERS[user.state] || handleWelcome;

  logger.debug(`Routing message for ${from}`, { state: user.state });

  // Remember the state we were in BEFORE the handler runs, so the undo
  // stack can push it once the handler tells us we're transitioning.
  const stateBeforeHandler = user.state;

  // Execute the handler
  const newState = await handler(user, message);

  // If handler returned a new state, update it
  if (newState && newState !== user.state) {
    // Push the OLD state onto the undo history so the user can walk back
    // a step later. pushStateHistory filters to undo-able states only.
    await pushStateHistory(user, stateBeforeHandler);
    // Clear the undo-pending marker — once the user has answered a popped
    // step, there's nothing pending anymore.
    if (user.metadata?.undoPendingState) await clearUndoPending(user);
    await updateUserState(user.id, newState);
    logger.debug(`State transition for ${from}: ${user.state} → ${newState}`);
  }

  // Refresh the rolling conversation summary if we've crossed the interval.
  // Fire-and-forget — must not block the turn; the summary manager swallows errors.
  maybeUpdateSummary(user).catch(() => {});

  // Fire-and-forget abuse judge. Every 5 inbound turns, a small LLM call
  // scans the conversation and flags the user when the intent looks like
  // token-burn (gibberish, jailbreak attempts, persistent trolling).
  // Two consecutive 'abusive' verdicts trigger handover — the next inbound
  // turn will short-circuit to the canned reply at the top of this fn.
  try {
    const abuse = require('../abuse/detector');
    abuse.maybeRunJudge(user).catch((err) =>
      logger.warn(`[ABUSE] Judge threw: ${err.message}`)
    );
  } catch (err) {
    logger.warn(`[ABUSE] Could not dispatch judge: ${err.message}`);
  }
}

module.exports = { routeMessage };
