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

// States that collect free-text input - apply intent checking here
const COLLECTION_STATES = new Set([
  STATES.WEB_COLLECT_NAME,
  STATES.WEB_COLLECT_INDUSTRY,
  STATES.WEB_COLLECT_AREAS,
  STATES.WEB_COLLECT_AGENT_PROFILE,
  STATES.WEB_COLLECT_LISTINGS_ASK,
  STATES.WEB_COLLECT_LISTINGS_DETAILS,
  STATES.WEB_COLLECT_LISTINGS_PHOTOS,
  STATES.WEB_COLLECT_SERVICES,
  STATES.WEB_COLLECT_LOGO,
  STATES.WEB_COLLECT_CONTACT,
  STATES.SEO_COLLECT_URL,
  STATES.APP_COLLECT_REQUIREMENTS,
  STATES.MARKETING_COLLECT_DETAILS,
  STATES.SCHEDULE_COLLECT_DATE,
  STATES.SCHEDULE_COLLECT_TIME,
  STATES.CB_COLLECT_NAME,
  STATES.CB_COLLECT_INDUSTRY,
  STATES.CB_COLLECT_FAQS,
  STATES.CB_COLLECT_SERVICES,
  STATES.CB_COLLECT_HOURS,
  STATES.CB_COLLECT_LOCATION,
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
  [STATES.WEB_COLLECT_INDUSTRY]: 'What industry are you in?',
  [STATES.WEB_COLLECT_AREAS]: 'Which city are you based in, and which areas do you serve?',
  [STATES.WEB_COLLECT_AGENT_PROFILE]: 'Tell me your brokerage, years in real estate, and any designations (or just skip).',
  [STATES.WEB_COLLECT_LISTINGS_ASK]: 'Do you have any listings to showcase? (yes / skip)',
  [STATES.WEB_COLLECT_LISTINGS_DETAILS]: 'Send your listing details in natural language, or say done.',
  [STATES.WEB_COLLECT_LISTINGS_PHOTOS]: 'Send a listing photo, or say done / skip for stock photos.',
  [STATES.WEB_COLLECT_SERVICES]: 'What services or products do you offer?',
  [STATES.WEB_COLLECT_LOGO]: "Do you have a logo? (send an image or type 'skip')",
  [STATES.WEB_COLLECT_CONTACT]: 'Please share your contact details (email, phone, address)',
  [STATES.SEO_COLLECT_URL]: 'Please send your website URL to analyze',
  [STATES.APP_COLLECT_REQUIREMENTS]: 'Tell me about your app idea - what does it do and who is it for?',
  [STATES.MARKETING_COLLECT_DETAILS]: 'Tell me about your business and your marketing goals',
  [STATES.SCHEDULE_COLLECT_DATE]: 'What date works best for you for the meeting?',
  [STATES.SCHEDULE_COLLECT_TIME]: 'What time works best for you for the meeting?',
  [STATES.CB_COLLECT_NAME]: 'What is your business name?',
  [STATES.CB_COLLECT_INDUSTRY]: 'What industry are you in?',
  [STATES.CB_COLLECT_FAQS]: 'What are the top questions your customers ask? (type "done" when finished)',
  [STATES.CB_COLLECT_SERVICES]: 'What services do you offer with their prices?',
  [STATES.CB_COLLECT_HOURS]: 'What are your business hours?',
  [STATES.CB_COLLECT_LOCATION]: 'What is your business address/location?',
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

/**
 * Classify whether a free-text message is answering the current question
 * or doing something else (asking a question, wanting the menu, exiting).
 * Returns: "answer" | "question" | "menu" | "exit"
 */
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
 * Main message router. Called for every incoming message (WhatsApp, Messenger, Instagram).
 */
async function routeMessage(message) {
  const channel = message.channel || 'whatsapp';
  // Serialize processing per user — two concurrent webhooks for the same
  // phone number would otherwise race each other. The lock chains pending
  // turns so /reset finishes (including its greeting) before the user's
  // next message starts processing.
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

async function _routeMessage(message) {
  const { from, text, messageId } = message;
  const channel = message.channel || 'whatsapp';

  // Dedup: WhatsApp sometimes redelivers the same inbound messageId. Without
  // this, /reset / sales greetings fire twice and the user sees duplicates.
  if (seenRecently(from, messageId)) {
    logger.warn(`[ROUTER] Duplicate delivery ignored: from=${from} messageId=${messageId}`);
    return;
  }

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
    });
    // Clear conversation history so the sales bot starts fresh
    const { clearHistory } = require('../db/conversations');
    await clearHistory(user.id);
    user.state = STATES.SALES_CHAT;
    logger.info(`User ${from} reset conversation, metadata, and history`);

    // Send a deterministic Pixie greeting so /reset never produces a
    // greeting-less response. Stopping here also saves an LLM call.
    await sendTextMessage(user.phone_number, "Hi! I'm Pixie. What can I help you with today?");
    await logMessage(user.id, "Hi! I'm Pixie. What can I help you with today?", 'assistant');
    return;
  }

  // Check for menu command (text or button) - go back to service selection
  if ((text && text.toLowerCase().trim() === '/menu') || message.buttonId === 'menu_main') {
    await updateUserState(user.id, STATES.SERVICE_SELECTION);
    user.state = STATES.SERVICE_SELECTION;
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
      // Update state first, then show the service menu with a clean synthetic message
      await updateUserState(user.id, STATES.SERVICE_SELECTION);
      user.state = STATES.SERVICE_SELECTION;
      // Use a synthetic message so handleServiceSelection shows the menu (default branch)
      const newState = await handleServiceSelection(user, { ...message, text: '', buttonId: '', listId: '' });
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

      // Remind them of the current step
      await sendWithMenuButton(
        user.phone_number,
        `Now, back to where we were - ${currentQuestion}`
      );
      await logMessage(user.id, `Reminded user: ${currentQuestion}`, 'assistant');
      return; // Stay in same state
    }

    // intent === 'answer' - fall through to normal handler
  }
  // ──────────────────────────────────────────────────────────────────────────

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
}

module.exports = { routeMessage };
