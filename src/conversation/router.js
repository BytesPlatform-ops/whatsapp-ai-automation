const { findOrCreateUser, updateUserState, updateUserMetadata } = require('../db/users');
const { logMessage, getConversationHistory } = require('../db/conversations');
const { markAsRead, sendTextMessage, sendInteractiveButtons, sendWithMenuButton, setLastMessageId } = require('../messages/sender');
const { runWithContext } = require('../messages/channelContext');
const { STATES } = require('./states');
const { logger } = require('../utils/logger');
const { generateResponse } = require('../llm/provider');
const { GENERAL_CHAT_PROMPT } = require('../llm/prompts');
const { transcribeAudio } = require('../llm/transcribe');
const { analyzeMessage } = require('../llm/messageAnalyzer');
const { persistIfConfident: persistLanguage } = require('../llm/languageDirective');
const { hydrateMetadata } = require('./entityAccumulator');
const { setQueue, acknowledgeQueue, dequeueAndPeekNext } = require('./serviceQueue');
const { buildRecapIfNeeded } = require('./sessionRecap');
const { buildReturningGreeting } = require('./returningUser');

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

  // Web Dev flow — new single-state LLM-driven collector:
  [STATES.WEB_COLLECTING]: handleWebDev,
  // Legacy states still wired for mid-flow users from before the unified collector:
  [STATES.WEB_COLLECT_NAME]: handleWebDev,
  [STATES.WEB_COLLECT_EMAIL]: handleWebDev,
  [STATES.WEB_COLLECT_INDUSTRY]: handleWebDev,
  [STATES.WEB_COLLECT_AREAS]: handleWebDev,
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

// States where the current step is optional — the frustration-skip button
// is allowed to skip past them. Non-listed states are required.
const OPTIONAL_STATES = new Set([
  STATES.WEB_COLLECT_EMAIL,
  STATES.WEB_COLLECT_SERVICES,
  STATES.WEB_COLLECT_LOGO,
  STATES.WEB_COLLECT_AREAS,
  STATES.SALON_INSTAGRAM,
  STATES.AD_COLLECT_SLOGAN,
  STATES.AD_COLLECT_PRICING,
  STATES.AD_COLLECT_COLORS,
  STATES.AD_COLLECT_IMAGE,
  STATES.LOGO_COLLECT_COLORS,
  STATES.LOGO_COLLECT_SYMBOL,
]);

// States that collect free-text input - apply intent checking here
const COLLECTION_STATES = new Set([
  STATES.WEB_COLLECTING,
  STATES.WEB_COLLECT_NAME,
  STATES.WEB_COLLECT_INDUSTRY,
  STATES.WEB_COLLECT_AREAS,
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
  [STATES.WEB_COLLECTING]: 'Tell me about your business so I can build your site.',
  [STATES.WEB_COLLECT_NAME]: 'What is your business name?',
  [STATES.WEB_COLLECT_INDUSTRY]: 'What industry are you in?',
  [STATES.WEB_COLLECT_AREAS]: 'Which city are you based in, and which areas do you serve?',
  [STATES.WEB_COLLECT_SERVICES]: 'What services or products do you offer?',
  [STATES.WEB_COLLECT_LOGO]: "Do you have a logo? Send the image, or let me know if you'd rather not.",
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
  [STATES.AD_COLLECT_SLOGAN]: "Do you have a brand slogan or tagline you'd like on the ad?",
  [STATES.AD_COLLECT_PRICING]: "Want any pricing info on the ad?",
  [STATES.AD_COLLECT_COLORS]: "What are your brand colors?",
  // Logo generation
  [STATES.LOGO_COLLECT_BUSINESS]: 'What is your business name? (this will appear on the logo)',
  [STATES.LOGO_COLLECT_INDUSTRY]: 'What industry are you in?',
  [STATES.LOGO_COLLECT_DESCRIPTION]: 'In one sentence, what does your business do?',
  [STATES.LOGO_COLLECT_COLORS]: "What are your brand colors?",
  [STATES.LOGO_COLLECT_SYMBOL]: "Any symbol idea for your logo? (e.g. \"a bee\")",
};

// ── Topic-switch routing (used when analysis.intent === 'service_switch') ──
// Maps the messageAnalyzer.topicSwitch enum → entry state for that flow.
const TOPIC_TO_ENTRY_STATE = {
  seo: STATES.SEO_COLLECT_URL,
  webdev: STATES.WEB_COLLECTING,
  appdev: STATES.APP_COLLECT_REQUIREMENTS,
  marketing: STATES.MARKETING_COLLECT_DETAILS,
  adgen: STATES.AD_COLLECT_BUSINESS,
  logo: STATES.LOGO_COLLECT_BUSINESS,
  chatbot: STATES.CB_COLLECT_NAME,
  scheduling: STATES.SCHEDULE_COLLECT_DATE,
  general: STATES.SALES_CHAT,
};

const TOPIC_TO_LABEL = {
  seo: 'free SEO audit',
  webdev: 'website development',
  appdev: 'app development',
  marketing: 'digital marketing',
  adgen: 'ad generator',
  logo: 'logo maker',
  chatbot: 'AI chatbot',
  scheduling: 'meeting scheduling',
  general: 'sales chat',
};

// Per-flow metadata field that should be cleared on a service switch so the
// new flow starts fresh. Anything not listed here is preserved (business name,
// industry, contact, lead temperature, etc).
const FLOW_DATA_KEYS = ['websiteData', 'adData', 'logoData', 'chatbotData'];

/**
 * Reverse-map a state string → its topic key (for friendly labels in re-asks).
 * Falls back to 'general' when the state isn't part of any productized flow.
 */
function stateToTopic(state) {
  const s = String(state || '');
  if (s.startsWith('SEO_')) return 'seo';
  if (s.startsWith('WEB_') || s.startsWith('SALON_') || s.startsWith('DOMAIN_')) return 'webdev';
  if (s.startsWith('APP_')) return 'appdev';
  if (s.startsWith('MARKETING_')) return 'marketing';
  if (s.startsWith('AD_')) return 'adgen';
  if (s.startsWith('LOGO_')) return 'logo';
  if (s.startsWith('CB_')) return 'chatbot';
  if (s.startsWith('SCHEDULE_')) return 'scheduling';
  return 'general';
}

/**
 * Pull the most recent assistant message text out of the user's history, used
 * as `lastBotMessage` context for the messageAnalyzer.
 */
async function getLastBotMessage(userId) {
  try {
    const history = await getConversationHistory(userId, 10);
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'assistant' && history[i].message_text) {
        return String(history[i].message_text);
      }
    }
  } catch {
    /* ignore — analyzer falls back to safe default */
  }
  return '';
}

/**
 * Main message router. Called for every incoming message (WhatsApp, Messenger, Instagram).
 *
 * Text messages are run through the rapid-message buffer so a user who
 * splits their answer across multiple quick messages gets ONE bot reply
 * that handles all of it. Button taps, media, and audio skip the buffer
 * and process immediately.
 */
async function routeMessage(message) {
  const { shouldBuffer, enqueue } = require('./messageBuffer');
  const channel = message.channel || 'whatsapp';

  if (shouldBuffer(message)) {
    // Queue into buffer. The processor runs _routeMessage with the
    // concatenated text once the user stops typing (QUIET_MS).
    return enqueue(message, (finalMessage) =>
      runWithContext({ channel, phoneNumberId: finalMessage.phoneNumberId || null }, () => _routeMessage(finalMessage))
    );
  }

  // Non-text / payload: process immediately without buffering.
  // Pin the inbound phone_number_id into the async context so every
  // sendTextMessage / sendInteractiveButtons / etc. inside this turn
  // replies from the same business number the user messaged.
  return runWithContext({ channel, phoneNumberId: message.phoneNumberId || null }, () => _routeMessage(message));
}

// ── Dedup caches ────────────────────────────────────────────────────────
// WhatsApp sometimes re-delivers the same webhook on retry; users double-
// tap buttons too. Drop exact-same messageId within 30s and same button
// payload from the same user within 5s. Both caches are in-memory; an LRU
// cap keeps them bounded. A restart naturally clears them — acceptable
// since duplicates only matter within a tight time window.
const MESSAGE_DEDUP_TTL_MS = 30_000;
const BUTTON_DEDUP_TTL_MS = 5_000;
const DEDUP_CACHE_MAX = 2000;
const _seenMessages = new Map();   // messageId → firstSeenAt
const _seenButtons = new Map();    // `${from}:${buttonId}` → firstTapAt

function _pruneDedup(map, ttl) {
  if (map.size < DEDUP_CACHE_MAX) return;
  const cutoff = Date.now() - ttl;
  // Keep it simple — on overflow, drop anything older than ttl. Entries
  // still newer than ttl stay; if that's still too many, truncate.
  for (const [k, v] of map) if (v < cutoff) map.delete(k);
  if (map.size >= DEDUP_CACHE_MAX) {
    // Hard truncate — oldest first (Map preserves insertion order).
    const excess = map.size - Math.floor(DEDUP_CACHE_MAX / 2);
    let i = 0;
    for (const k of map.keys()) {
      if (i++ >= excess) break;
      map.delete(k);
    }
  }
}

/**
 * Returns true iff the given message is a duplicate we should silently drop.
 * Logs the drop. Updates the cache on first sight.
 */
function isDuplicate(message) {
  const now = Date.now();

  if (message.messageId) {
    const seen = _seenMessages.get(message.messageId);
    if (seen != null && now - seen < MESSAGE_DEDUP_TTL_MS) {
      logger.info(`[DEDUP] dropping duplicate messageId=${message.messageId} (seen ${now - seen}ms ago)`);
      return true;
    }
    _seenMessages.set(message.messageId, now);
    _pruneDedup(_seenMessages, MESSAGE_DEDUP_TTL_MS);
  }

  if (message.buttonId && message.from) {
    const key = `${message.from}:${message.buttonId}`;
    const seen = _seenButtons.get(key);
    if (seen != null && now - seen < BUTTON_DEDUP_TTL_MS) {
      logger.info(`[DEDUP] dropping duplicate button ${key} (seen ${now - seen}ms ago)`);
      return true;
    }
    _seenButtons.set(key, now);
    _pruneDedup(_seenButtons, BUTTON_DEDUP_TTL_MS);
  }

  return false;
}

async function _routeMessage(message) {
  // Dedup first — before any DB writes or LLM calls. Duplicate webhooks
  // and double-taps both hit this path.
  if (isDuplicate(message)) return;

  const { from, text, messageId } = message;
  const channel = message.channel || 'whatsapp';

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

  // ── Session recap for returning users ────────────────────────────────
  // Must compute BEFORE logMessage below — otherwise this turn's inbound
  // becomes the "last activity" and the gap is always 0. The recap only
  // fires mid-flow and only after a significant gap (>=30 min).
  let __pendingRecap = '';
  try {
    __pendingRecap = await buildRecapIfNeeded(user);
  } catch (err) {
    logger.warn(`[RECAP] buildRecapIfNeeded threw: ${err.message}`);
  }

  // ── Return-visitor recognition ──────────────────────────────────────
  // If the user has completed projects and is arriving in an entry state,
  // greet with a project reference. Only once per session.
  if (!__pendingRecap && !user.metadata?.returningGreetShown) {
    try {
      const returnGreeting = await buildReturningGreeting(user);
      if (returnGreeting) {
        __pendingRecap = returnGreeting;
        await updateUserMetadata(user.id, { returningGreetShown: true });
        user.metadata = { ...(user.metadata || {}), returningGreetShown: true };
      }
    } catch (err) {
      logger.warn(`[RETURNING] buildReturningGreeting threw: ${err.message}`);
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

  // Deliver the recap now (computed above, before the log write). It's
  // sent BEFORE the handler runs so the user sees "welcome back" first,
  // then the handler's normal next-question message.
  if (__pendingRecap) {
    await sendTextMessage(user.phone_number, __pendingRecap);
    await logMessage(user.id, __pendingRecap, 'assistant');
  }

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
      // Entity-prefill cache from the messageAnalyzer — clear on /reset so a
      // brand-new conversation doesn't auto-fill from previous-session state.
      extractedBusinessName: null,
      extractedIndustry: null,
      extractedEmail: null,
      extractedPhone: null,
      extractedServices: null,
      extractedColors: null,
      extractedLocation: null,
      extractedUrl: null,
      contactPrefillShown: false,
      frustrationCount: 0,
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

  // ── Document handler ──────────────────────────────────────────────────────
  // The parser already downloads doc metadata. We acknowledge politely and
  // continue — we don't try to parse the doc text as data input.
  if (message.type === 'document' && message.mediaId) {
    const docAck = `Thanks for sharing that${message.filename ? ` (*${message.filename}*)` : ''}! I'll note it for our team. Let me know if there's anything specific in there you want me to use.`;
    await sendTextMessage(user.phone_number, docAck);
    await logMessage(user.id, docAck, 'assistant');
    logger.info(`[DOC] ${from} sent document ${message.filename || message.mediaId}`);
    return; // stay in current state
  }

  // ── Location handler ─────────────────────────────────────────────────────
  // Extract the address from a location pin and feed into the entity
  // accumulator so downstream handlers (webdev contact, etc.) pick it up.
  if (message.type === 'location' && (message.latitude || message.longitude)) {
    const locText = `${message.latitude}, ${message.longitude}`;
    const locAck = `Got your location 📍 — I'll use it for your contact info on the site.`;
    await sendTextMessage(user.phone_number, locAck);
    await logMessage(user.id, locAck, 'assistant');
    // Store as extractedLocation so the accumulator carries it to handlers.
    if (!user.metadata?.extractedLocation) {
      await updateUserMetadata(user.id, { extractedLocation: locText });
      user.metadata = { ...(user.metadata || {}), extractedLocation: locText };
    }
    logger.info(`[LOC] ${from} sent location ${locText}`);
    return; // stay in current state
  }

  // ── Digit-to-button mapper (text fallback for interactive messages) ───────
  // If the user types a bare digit ("1", "2", "3") and we recently sent them
  // interactive buttons, treat the digit as a tap on the Nth button. This
  // helps older users who can't see/tap WhatsApp interactive messages.
  if (text && message.type === 'text' && !message.buttonId && /^\d$/.test(text.trim())) {
    const { getLastButtons } = require('../messages/sender');
    const lastBtns = getLastButtons(from);
    if (lastBtns) {
      const idx = parseInt(text.trim(), 10) - 1;
      if (idx >= 0 && idx < lastBtns.length) {
        const btn = lastBtns[idx];
        message.buttonId = btn.id;
        message.text = btn.title || text;
        message.type = 'interactive';
        logger.info(`[DIGIT-MAP] ${from} typed "${text.trim()}" → button ${btn.id} (${btn.title})`);
      }
    }
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

  // ── Frustration-button interceptor ────────────────────────────────────────
  // The frustration response (sent below in the analyzer block) shows three
  // buttons: Skip / Talk to a human / Continue. Button taps arrive as the
  // next inbound message with `buttonId` set — which means they SKIP the
  // analyzer (the analyzer only runs on free-text). Without this interceptor
  // the handler for the current state would receive the button title as raw
  // text and store "✅ Continue" as e.g. the user's industry. So we catch
  // these payload IDs here, BEFORE any handler dispatch, and short-circuit.
  if (
    message.buttonId === 'frustration_continue' ||
    message.buttonId === 'frustration_skip' ||
    message.buttonId === 'frustration_human'
  ) {
    const buttonId = message.buttonId;

    if (buttonId === 'frustration_human') {
      await updateUserMetadata(user.id, { humanTakeover: true });
      const msg = "Absolutely! Let me connect you with our team right away.";
      await sendTextMessage(user.phone_number, msg);
      await logMessage(user.id, msg, 'assistant');
      logger.info(`[FRUSTRATION-BUTTON] ${from} → human handoff`);
      return;
    }

    if (buttonId === 'frustration_continue') {
      const q = STATE_QUESTION[user.state];
      const msg = q ? `Sure — ${q}` : "Sure — what were you in the middle of?";
      await sendTextMessage(user.phone_number, msg);
      await logMessage(user.id, msg, 'assistant');
      logger.info(`[FRUSTRATION-BUTTON] ${from} → continue (re-asked ${user.state})`);
      return;
    }

    if (buttonId === 'frustration_skip') {
      // For optional states, hand the current handler a synthetic "skip"
      // text — handlers run it through isSkip() and treat it as a valid
      // opt-out. For required states, fall back to a re-ask (same as
      // Continue) so we never silently corrupt required data.
      const q = STATE_QUESTION[user.state] || '';
      const isOptional = OPTIONAL_STATES.has(user.state);

      if (isOptional) {
        const synthetic = { ...message, buttonId: '', listId: '', text: 'skip', type: 'text' };
        const handler = STATE_HANDLERS[user.state] || handleWelcome;
        const newState = await handler(user, synthetic);
        if (newState && newState !== user.state) {
          await updateUserState(user.id, newState);
        }
        logger.info(`[FRUSTRATION-BUTTON] ${from} → skipped optional (${user.state})`);
        return;
      }

      const msg = q ? `This one's required — ${q}` : "Let's keep going — what were you in the middle of?";
      await sendTextMessage(user.phone_number, msg);
      await logMessage(user.id, msg, 'assistant');
      logger.info(`[FRUSTRATION-BUTTON] ${from} → skip-on-required, re-asked ${user.state}`);
      return;
    }
  }

  // ── Message analyzer ──────────────────────────────────────────────────────
  // For free-text (non-payload) messages, run rich analysis once. The result
  // is attached to `message.analysis` so downstream handlers can read intent,
  // sentiment, entities, language, etc. Payload (button/list) messages skip
  // analysis via the analyzer's own fast path.
  if (text && message.type === 'text' && !message.buttonId && !message.listId) {
    const lastBotMessage = await getLastBotMessage(user.id);
    const analysis = await analyzeMessage(text, user, lastBotMessage);
    message.analysis = analysis;

    logger.info(
      `[MessageAnalyzer] ${from}: intent=${analysis.intent} sentiment=${analysis.sentiment} "${analysis.summary}"`
    );

    // ── Abuse guard ────────────────────────────────────────────────────────
    // Firm, polite boundary. Log for admin review. Do NOT engage further
    // on the topic — no LLM call, no handler dispatch.
    if (analysis.isAbusive) {
      const msg = "I'm not able to help with that. If you have a genuine business question, I'm here — otherwise I'll leave this chat to our team.";
      await sendTextMessage(user.phone_number, msg);
      await logMessage(user.id, msg, 'assistant');
      logger.warn(`[ABUSE] ${from}: "${(text || '').slice(0, 100)}" — flagged and blocked`);
      return;
    }

    // ── Multi-service intake (queue) ──────────────────────────────────────
    // Fresh inquiry mentioning 2+ services in one message — analyzer now
    // returns topicSwitches regardless of intent. If the user isn't in a
    // collection state yet, queue the services and route them into the
    // first one. (Inside a collection state we respect the current flow
    // and ignore the extras so we don't pull the rug.)
    const inOpen =
      user.state === STATES.WELCOME ||
      user.state === STATES.SALES_CHAT ||
      user.state === STATES.SERVICE_SELECTION ||
      user.state === STATES.GENERAL_CHAT ||
      user.state === STATES.INFORMATIVE_CHAT;
    const multiTopics = Array.isArray(analysis.topicSwitches)
      ? analysis.topicSwitches.filter((t) => TOPIC_TO_ENTRY_STATE[t])
      : [];
    if (inOpen && analysis.intent !== 'service_switch' && multiTopics.length >= 2) {
      const first = multiTopics[0];
      const entryState = TOPIC_TO_ENTRY_STATE[first];
      await setQueue(user, multiTopics);
      const ack = acknowledgeQueue(multiTopics);
      if (ack) {
        await sendTextMessage(user.phone_number, ack);
        await logMessage(user.id, ack, 'assistant');
      }
      await updateUserState(user.id, entryState);
      user.state = entryState;
      logger.info(`[QUEUE] ${from} multi-intake → [${multiTopics.join(', ')}] starting ${first}`);
      return;
    }

    // ── Language preference tracking ──────────────────────────────────────
    // Two-in-a-row signal: if the user writes in the same non-English
    // language twice, persist it so every downstream handler replies in
    // that language. First non-en turn just stores lastAnalyzedLanguage
    // and waits for confirmation — avoids flipping the session on one
    // loanword.
    await persistLanguage(user, analysis);

    // ── Entity persistence ────────────────────────────────────────────────
    // Delegated to entityAccumulator: it stashes any extracted entities on
    // user.metadata.extracted* (first mention wins) so later flows can
    // auto-skip steps whose field already has a value.
    logger.debug(`[ENTITIES] Extracted for ${from}: ${JSON.stringify(analysis.entities)}`);
    await hydrateMetadata(user, analysis);

    const inCollection = COLLECTION_STATES.has(user.state);
    const currentQuestion = STATE_QUESTION[user.state] || '';

    switch (analysis.intent) {
      // ── Greeting ──────────────────────────────────────────────────────────
      case 'greeting': {
        if (inCollection) {
          const msg = currentQuestion
            ? `Hey! 👋 Welcome back. We were working on your *${TOPIC_TO_LABEL[stateToTopic(user.state)] || 'project'}*. Ready to continue?\n\n${currentQuestion}`
            : `Hey! 👋 Welcome back. Ready to continue?`;
          await sendTextMessage(user.phone_number, msg);
          await logMessage(user.id, msg, 'assistant');
          // CRITICAL: must return so the state handler does NOT see "hi" as
          // raw input and try to parse it as e.g. an email/industry.
          return;
        }
        // SALES_CHAT / SERVICE_SELECTION / others → handler greets contextually
        break;
      }

      // ── Gratitude ─────────────────────────────────────────────────────────
      case 'gratitude': {
        if (inCollection) {
          const ack = currentQuestion
            ? `Happy to help! 😊 So, ${currentQuestion}`
            : 'Happy to help! 😊';
          await sendTextMessage(user.phone_number, ack);
          await logMessage(user.id, ack, 'assistant');
          // CRITICAL: must return so "thanks!" is not stored as user data.
          return;
        }
        // Outside collection: let handler reply contextually (no double-message).
        break;
      }

      // ── Noise (haha / ok / 👍 / lol …) ────────────────────────────────────
      case 'noise': {
        if (inCollection) {
          const ack = currentQuestion
            ? `Got it! 👍 ${currentQuestion}`
            : 'Got it! 👍';
          await sendTextMessage(user.phone_number, ack);
          await logMessage(user.id, ack, 'assistant');
          // CRITICAL: must return so "haha" is not stored as user data.
          return;
        }
        break;
      }

      // ── Frustration ───────────────────────────────────────────────────────
      case 'frustration': {
        const newCount = (user.metadata?.frustrationCount || 0) + 1;
        await updateUserMetadata(user.id, { frustrationCount: newCount });
        user.metadata = { ...(user.metadata || {}), frustrationCount: newCount };

        if (newCount >= 2) {
          // Escalate to human handoff
          await updateUserMetadata(user.id, { humanTakeover: true });
          const msg =
            "I hear you — I want to make this easier. Let me get a real person on this with you right away. Someone from our team will jump in shortly.";
          await sendTextMessage(user.phone_number, msg);
          await logMessage(user.id, msg, 'assistant');
          logger.info(`[FRUSTRATION] ${from} escalated to human handoff (count=${newCount})`);
          return;
        }

        const empathy = "I hear you, and I want to make this easier. What would help most right now?";
        await sendInteractiveButtons(user.phone_number, empathy, [
          { id: 'frustration_skip', title: '⏭ Skip optional steps' },
          { id: 'frustration_human', title: '👤 Talk to a human' },
          { id: 'frustration_continue', title: '✅ Continue' },
        ]);
        await logMessage(user.id, empathy, 'assistant', 'interactive');
        return;
      }

      // ── Human request ─────────────────────────────────────────────────────
      case 'human_request': {
        await updateUserMetadata(user.id, { humanTakeover: true });
        const msg = "Absolutely! Let me connect you with our team right away.";
        await sendTextMessage(user.phone_number, msg);
        await logMessage(user.id, msg, 'assistant');
        logger.info(`[HUMAN-REQUEST] ${from} bot paused, human takeover engaged`);
        return;
      }

      // ── Service switch ────────────────────────────────────────────────────
      case 'service_switch': {
        // Multi-service request: if the analyzer detected several topics in
        // one message ("website AND logo AND ads"), queue them and start
        // with the first. Singular requests fall through to the existing
        // single-topic behaviour.
        const topics = Array.isArray(analysis.topicSwitches) && analysis.topicSwitches.length > 0
          ? analysis.topicSwitches
          : (analysis.topicSwitch ? [analysis.topicSwitch] : []);

        if (topics.length === 0) break; // no clear target — fall through

        const target = topics[0];
        const entryState = TOPIC_TO_ENTRY_STATE[target];
        if (!entryState) break;

        const label = TOPIC_TO_LABEL[target] || 'that';

        // Carry over reusable identity entities, clear only the in-flight flow data.
        const ent = analysis.entities || {};
        const carryover = {};
        if (ent.business_name) carryover.businessName = ent.business_name;
        if (ent.industry) carryover.industry = ent.industry;
        if (ent.email) carryover.email = ent.email;
        if (ent.phone) carryover.phone = ent.phone;
        if (ent.colors) carryover.colors = ent.colors;

        const cleared = {};
        for (const key of FLOW_DATA_KEYS) cleared[key] = null;

        await updateUserMetadata(user.id, { ...cleared, carryover });
        await updateUserState(user.id, entryState);
        user.state = entryState;

        // Persist the queue when we detected multiple services so later
        // completion hooks know what to offer next.
        if (topics.length > 1) {
          await setQueue(user, topics);
          const ack = acknowledgeQueue(topics);
          if (ack) {
            await sendTextMessage(user.phone_number, ack);
            await logMessage(user.id, ack, 'assistant');
          }
        } else {
          // Single-topic classic switch — preserve the original message.
          const msg = `No problem! Let me switch you to *${label}*.`;
          await sendTextMessage(user.phone_number, msg);
          await logMessage(user.id, msg, 'assistant');
        }

        logger.info(`[SERVICE-SWITCH] ${from} → ${target} (state=${entryState}) queue=[${topics.join(', ')}]`);
        return;
      }

      // ── Undo ──────────────────────────────────────────────────────────────
      case 'undo': {
        // Pop one step off the state history stack. If we have a prior
        // state, rewind to it and re-ask. Otherwise fall back to the menu.
        const stack = Array.isArray(user.metadata?.stateHistory)
          ? [...user.metadata.stateHistory]
          : [];
        // Remove the current state from the top (it's the one we want to leave).
        while (stack.length && stack[stack.length - 1] === user.state) stack.pop();
        const previousState = stack.pop();

        if (previousState) {
          await updateUserMetadata(user.id, { stateHistory: stack });
          user.metadata = { ...(user.metadata || {}), stateHistory: stack };
          await updateUserState(user.id, previousState);
          user.state = previousState;
          const prevQuestion = STATE_QUESTION[previousState] || '';
          const msg = prevQuestion
            ? `No problem — taking you back. ${prevQuestion}`
            : `No problem — let me take you back a step.`;
          await sendTextMessage(user.phone_number, msg);
          await logMessage(user.id, msg, 'assistant');
          logger.info(`[UNDO] ${from} rewound to ${previousState} (stack now [${stack.join(', ')}])`);
          return;
        }

        // Empty stack — fall back to the service menu.
        await updateUserState(user.id, STATES.SERVICE_SELECTION);
        user.state = STATES.SERVICE_SELECTION;
        const msg = "No problem! Let me take you back to the menu.";
        await sendTextMessage(user.phone_number, msg);
        await logMessage(user.id, msg, 'assistant');
        const newState = await handleServiceSelection(user, { ...message, text: '', buttonId: '', listId: '' });
        if (newState && newState !== user.state) await updateUserState(user.id, newState);
        return;
      }

      // ── Farewell ──────────────────────────────────────────────────────────
      case 'farewell': {
        const msg = "Thanks for chatting! Feel free to message anytime. 👋";
        await sendTextMessage(user.phone_number, msg);
        await logMessage(user.id, msg, 'assistant');
        return; // keep state — they may come back
      }

      // ── Question ──────────────────────────────────────────────────────────
      case 'question': {
        if (inCollection) {
          // Answer the side question, then bring them back to the current step.
          const aside = await generateResponse(
            GENERAL_CHAT_PROMPT,
            [{ role: 'user', content: text }],
            { userId: user.id, operation: 'off_topic_aside' }
          );
          await sendTextMessage(user.phone_number, aside);
          await logMessage(user.id, aside, 'assistant');

          const flowLabel = TOPIC_TO_LABEL[stateToTopic(user.state)] || 'flow';
          await sendWithMenuButton(
            user.phone_number,
            `Now back to your *${flowLabel}* — ${currentQuestion}`
          );
          await logMessage(user.id, `Reminded user: ${currentQuestion}`, 'assistant');
          return; // Stay in same state
        }
        // Outside collection — handler (sales/info/general) handles the question.
        break;
      }

      // ── Objection ─────────────────────────────────────────────────────────
      case 'objection': {
        // Route to the dedicated objection handler: empathy + social proof +
        // low-commitment next step, plus tags metadata.objectionTopics so the
        // follow-up scheduler can pick the right re-engagement angle.
        //
        // NOTE: `return` here — the handler sends exactly one reply and we
        // keep the user in the same state. We must NOT also fire the state
        // handler afterwards, otherwise the user gets two responses (e.g.
        // empathy + "what's your industry?" one after the other).
        const { handleObjection } = require('./handlers/objectionHandler');
        await handleObjection(user, message);
        return;
      }

      // ── Answer ────────────────────────────────────────────────────────────
      case 'answer':
      default:
        // Fall through to the regular handler with analysis attached.
        break;
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  // Get handler for current state
  const handler = STATE_HANDLERS[user.state] || handleWelcome;

  logger.debug(`Routing message for ${from}`, { state: user.state });

  // Execute the handler
  const newState = await handler(user, message);

  // If handler returned a new state, update it
  if (newState && newState !== user.state) {
    // Push the prior state onto a small history stack so the undo handler
    // can rewind one step. Cap at 3 — that's enough for "oops wrong
    // button" without keeping unbounded state.
    const prevStack = Array.isArray(user.metadata?.stateHistory) ? user.metadata.stateHistory : [];
    if (prevStack[prevStack.length - 1] !== user.state) {
      const nextStack = [...prevStack, user.state].slice(-3);
      await updateUserMetadata(user.id, { stateHistory: nextStack });
      user.metadata = { ...(user.metadata || {}), stateHistory: nextStack };
    }

    await updateUserState(user.id, newState);
    logger.debug(`State transition for ${from}: ${user.state} → ${newState}`);

    // ── Multi-service queue: flow-completion hook ────────────────────────
    // When a productized flow finishes (state drops back to SALES_CHAT /
    // SERVICE_SELECTION / GENERAL_CHAT) AND the user had a queue, offer
    // the next flow. We pop the current head first, then peek.
    const isFlowEnd =
      newState === STATES.SALES_CHAT ||
      newState === STATES.SERVICE_SELECTION ||
      newState === STATES.GENERAL_CHAT;
    const wasInFlow =
      user.state !== STATES.SALES_CHAT &&
      user.state !== STATES.SERVICE_SELECTION &&
      user.state !== STATES.GENERAL_CHAT;
    const queue = Array.isArray(user.metadata?.serviceQueue) ? user.metadata.serviceQueue : [];

    if (isFlowEnd && wasInFlow && queue.length > 0) {
      const { dequeueAndPeekNext } = require('./serviceQueue');
      const nextTopic = await dequeueAndPeekNext(user);
      if (nextTopic) {
        const nextLabel = TOPIC_TO_LABEL[nextTopic] || nextTopic;
        const offer = `Nice — one done ✅. Ready to move on to your *${nextLabel}* now? Just say yes and I'll start it up.`;
        await sendTextMessage(user.phone_number, offer);
        await logMessage(user.id, offer, 'assistant');
        logger.info(`[QUEUE] ${from} flow-end hook → offered ${nextTopic}`);
      }
    }
  }
}

module.exports = { routeMessage };
