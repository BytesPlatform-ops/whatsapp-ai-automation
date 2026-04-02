const { findOrCreateUser, updateUserState } = require('../db/users');
const { logMessage } = require('../db/conversations');
const { markAsRead, sendTextMessage, sendInteractiveButtons, sendWithMenuButton, setLastMessageId } = require('../messages/sender');
const { runWithChannel } = require('../messages/channelContext');
const { STATES } = require('./states');
const { logger } = require('../utils/logger');
const { generateResponse } = require('../llm/provider');
const { INTENT_CLASSIFIER_PROMPT, GENERAL_CHAT_PROMPT } = require('../llm/prompts');
const { transcribeAudio } = require('../llm/transcribe');

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
  [STATES.WEB_COLLECT_INDUSTRY]: handleWebDev,
  [STATES.WEB_COLLECT_SERVICES]: handleWebDev,
  [STATES.WEB_COLLECT_COLORS]: handleWebDev,
  [STATES.WEB_COLLECT_LOGO]: handleWebDev,
  [STATES.WEB_COLLECT_CONTACT]: handleWebDev,
  [STATES.WEB_GENERATING]: handleWebDev,
  [STATES.WEB_GENERATION_FAILED]: handleGenerationFailed,
  [STATES.WEB_PREVIEW]: handleWebDev,
  [STATES.WEB_REVISIONS]: handleWebDev,

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
};

// States that collect free-text input - apply intent checking here
const COLLECTION_STATES = new Set([
  STATES.WEB_COLLECT_NAME,
  STATES.WEB_COLLECT_INDUSTRY,
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
]);

// Human-readable description of what the bot was asking in each state
const STATE_QUESTION = {
  [STATES.WEB_COLLECT_NAME]: 'What is your business name?',
  [STATES.WEB_COLLECT_INDUSTRY]: 'What industry are you in?',
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
};

/**
 * Classify whether a free-text message is answering the current question
 * or doing something else (asking a question, wanting the menu, exiting).
 * Returns: "answer" | "question" | "menu" | "exit"
 */
async function classifyIntent(state, text) {
  const currentQuestion = STATE_QUESTION[state];
  if (!currentQuestion) return 'answer';

  try {
    const prompt = INTENT_CLASSIFIER_PROMPT.replace('{{CURRENT_QUESTION}}', currentQuestion);
    const response = await generateResponse(prompt, [{ role: 'user', content: text }]);
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
  return runWithChannel(channel, () => _routeMessage(message));
}

async function _routeMessage(message) {
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

  // Find or create user (channel-aware)
  const user = await findOrCreateUser(from, channel);

  // Log incoming message
  await logMessage(user.id, text || '', 'user', message.type, messageId);

  // Check for reset command
  if (text && text.toLowerCase().trim() === '/reset') {
    await updateUserState(user.id, STATES.WELCOME);
    // Clear trigger flags so flows can be re-triggered
    const { updateUserMetadata } = require('../db/users');
    await updateUserMetadata(user.id, {
      websiteDemoTriggered: false,
      seoAuditTriggered: false,
      chatbotDemoTriggered: false,
      chatbotDemoAgreed: false,
      returnToSales: false,
      leadClosed: false,
      meetingBooked: false,
      leadBriefSent: false,
      followupSteps: [],
      lastSeoAnalysis: null,
      lastSeoUrl: null,
      chatbotData: null,
      chatbotDemoSentAt: null,
      chatbotDemoFollowedUp: false,
      chatbotTrialActivated: false,
      chatbotSlug: null,
      chatbotTrialEndsAt: null,
    });
    // Clear conversation history so the sales bot starts fresh
    const { clearHistory } = require('../db/conversations');
    await clearHistory(user.id);
    user.state = STATES.WELCOME;
    logger.info(`User ${from} reset conversation, metadata, and history`);
  }

  // Check for menu command (text or button) - go back to service selection
  if ((text && text.toLowerCase().trim() === '/menu') || message.buttonId === 'menu_main') {
    await updateUserState(user.id, STATES.SERVICE_SELECTION);
    user.state = STATES.SERVICE_SELECTION;
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
    const intent = await classifyIntent(user.state, text);
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
      // Answer their question, then bring them back to where they were
      const currentQuestion = STATE_QUESTION[user.state];
      const aside = await generateResponse(
        GENERAL_CHAT_PROMPT,
        [{ role: 'user', content: text }]
      );
      await sendTextMessage(user.phone_number, aside);
      await logMessage(user.id, aside, 'assistant');

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

  // Execute the handler
  const newState = await handler(user, message);

  // If handler returned a new state, update it
  if (newState && newState !== user.state) {
    await updateUserState(user.id, newState);
    logger.debug(`State transition for ${from}: ${user.state} → ${newState}`);
  }
}

module.exports = { routeMessage };
