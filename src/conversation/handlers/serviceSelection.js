const {
  sendTextMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  sendWithMenuButton,
  sendCTAButton,
} = require('../../messages/sender');
const { logMessage } = require('../../db/conversations');
const { updateUserMetadata } = require('../../db/users');
const { STATES, SERVICE_IDS } = require('../states');

// Send the main menu (3 top-level buttons). Called from the /menu command
// path in the router so the user sees a proper greeting instead of the
// "hmm, didn't catch that" preface that the default case uses for truly
// unrecognized input. Also reusable if any other handler wants to bounce
// the user back to the menu cleanly.
async function sendMainMenu(user) {
  await sendInteractiveButtons(
    user.phone_number,
    "Here's what I can help with — pick one to get started:",
    [
      { id: 'svc_seo', title: '🔍 SEO Audit' },
      { id: 'svc_webdev', title: '🌐 Website' },
      { id: 'svc_more', title: '📋 More Services' },
    ]
  );
  await logMessage(user.id, 'Showed main menu', 'assistant', 'interactive');
  return STATES.SERVICE_SELECTION;
}

// Exploratory phrases that mean "show me more options" — "any other
// services?", "what else do you have?", "show me everything". Checked
// BEFORE matchServiceFromText so /what/ doesn't misroute these to the
// FAQ handler.
function looksExploratory(text) {
  const t = String(text || '').toLowerCase();
  return (
    /\b(other|more|else|additional|full|all|whole|every|complete|rest|anything|available|offerings?|more services|more options)\b/i.test(t) ||
    /\b(what else|what other|what services|whats available|what.s available|anything else|any other|show.*(all|list|everything))\b/i.test(t)
  );
}

async function handleServiceSelection(user, message) {
  const buttonId = message.buttonId || message.listId || '';
  const text = (message.text || '').toLowerCase().trim();

  // Phase 12: multi-service intent. "I need a website, logo and some ads"
  // → queue all three, start the first. Must run BEFORE looksExploratory /
  // matchServiceFromText so phrasings like "website AND logo" don't get
  // collapsed to a single regex hit. LLM-backed detector — won't fire on
  // single-service messages or on false positives like "my friend has a
  // website and a logo already".
  if (!buttonId && text) {
    const { detectServiceQueue, startServiceQueue } = require('../serviceQueue');
    const queue = await detectServiceQueue(message.text || '', user.id);
    if (queue.length >= 2) {
      const newState = await startServiceQueue(user, queue);
      return newState || STATES.SERVICE_SELECTION;
    }
  }

  // Early: exploratory phrases ("what other services?", "more options",
  // "whats available") should go to the full list, NOT match /what/ below
  // and land in the FAQ handler. Pre-empts matchServiceFromText.
  if (!buttonId && text && looksExploratory(text)) {
    return handleServiceSelection(user, { ...message, buttonId: 'svc_more', text: '' });
  }

  // Handle "More Services" button - show full list
  if (buttonId === 'svc_more') {
    await sendInteractiveList(
      user.phone_number,
      'Here are all our services. Pick one to learn more or get started:',
      'View Services',
      [
        {
          title: 'Our Services',
          rows: [
            { id: 'svc_seo', title: '🔍 Free SEO Audit', description: 'Get a free analysis of your website' },
            { id: 'svc_webdev', title: '🌐 Website Development', description: 'Get a professional website built' },
            { id: 'svc_ecommerce', title: '🛒 Online Store', description: 'Launch a free store with ByteScart' },
            { id: 'svc_appdev', title: '📱 App Development', description: 'Mobile & web app development' },
            { id: 'svc_marketing', title: '📈 Digital Marketing', description: 'SEO, ads, social media strategy' },
            { id: 'svc_adgen', title: '🎨 Marketing Ads', description: 'Custom social media ad images for your brand' },
            { id: 'svc_logo', title: '✨ Logo Maker', description: 'Professional brand logos in 60 seconds' },
            { id: 'svc_chatbot', title: '🤖 AI Chatbot', description: 'Get a 24/7 AI assistant for your business' },
            { id: 'svc_info', title: '❓ FAQ & Support', description: 'Get answers to your questions' },
            { id: 'svc_general', title: '💬 Talk to Sales', description: 'Chat with our sales team' },
          ],
        },
      ]
    );
    await logMessage(user.id, 'Showing full service list', 'assistant', 'interactive');
    return STATES.SERVICE_SELECTION;
  }

  // Route based on selected service. Regex-first for the obvious cases
  // (instant, no API call). When the regex finds nothing — natural
  // phrasings like "we need someone for growth" or "make me a poster" —
  // fall through to pickServiceFromSwitch (LLM-backed) so the user gets
  // routed instead of bounced back to the menu with "didn't catch that".
  let svcId = buttonId || matchServiceFromText(text);
  if (!svcId && text) {
    svcId = await pickServiceFromSwitch(text, user.id);
  }
  switch (svcId) {
    case 'svc_seo':
      await sendWithMenuButton(
        user.phone_number,
        '🔍 *Free Website SEO Audit*\n\n' +
          'I\'ll analyze your website and provide a detailed report covering:\n' +
          '• SEO health & meta tags\n' +
          '• Page performance & speed\n' +
          '• Design & usability issues\n' +
          '• Content quality\n' +
          '• Top recommendations\n\n' +
          'Please send me your website URL to get started!'
      );
      await logMessage(user.id, 'Asked for website URL for SEO audit', 'assistant');
      return STATES.SEO_COLLECT_URL;

    case 'svc_webdev': {
      // Honors cross-flow carryover: if webdev data already exists (from a
      // prior partial attempt or from the shared pool populated by other
      // flows), resume at the first missing step instead of re-asking for
      // the business name.
      const { startWebdevFlow } = require('./webDev');
      return startWebdevFlow(user);
    }

    case 'svc_ecommerce': {
      const pitch =
        '🛒 *Want your own online store?*\n\n' +
        'Great news — you can launch one *today* with *ByteScart*, our done-for-you ecommerce platform. And the best part? It\'s *100% FREE* to get started!\n\n' +
        '✨ *What you get — completely free:*\n' +
        '• Free signup — no credit card needed\n' +
        '• List your first few products at zero cost\n' +
        '• Ready-to-sell storefront on mobile & desktop\n' +
        '• Built-in checkout & secure payments\n' +
        '• No coding, no design work — go live in minutes\n\n' +
        'Thousands of sellers have already launched their store with ByteScart. Tap the button below to claim yours 👇';
      await sendCTAButton(
        user.phone_number,
        pitch,
        '🚀 Launch Free Store',
        'https://www.bytescart.ai'
      );
      await logMessage(user.id, 'Sent ByteScart ecommerce pitch with CTA link', 'assistant');
      await sendWithMenuButton(
        user.phone_number,
        'Once you\'ve had a look, let me know if you want help setting it up — or tap the menu button to explore our other services.'
      );
      await logMessage(user.id, 'Offered ByteScart follow-up + menu', 'assistant');
      return STATES.SERVICE_SELECTION;
    }

    case 'svc_appdev':
      await sendWithMenuButton(
        user.phone_number,
        '📱 *App Development*\n\n' +
          'We build mobile and web applications tailored to your needs.\n\n' +
          'Tell me about your app idea - what problem does it solve, who is it for, and what features do you envision?'
      );
      await logMessage(user.id, 'Starting app development flow', 'assistant');
      return STATES.APP_COLLECT_REQUIREMENTS;

    case 'svc_marketing':
      await sendWithMenuButton(
        user.phone_number,
        '📈 *Digital Marketing*\n\n' +
          'We offer comprehensive digital marketing services including SEO, PPC, social media, and content marketing.\n\n' +
          'Tell me about your business and what marketing goals you\'re looking to achieve.'
      );
      await logMessage(user.id, 'Starting marketing flow', 'assistant');
      return STATES.MARKETING_COLLECT_DETAILS;

    case 'svc_adgen': {
      // Phase 11: cross-flow entry pre-fills businessName + industry from
      // metadata.websiteData (set by the webdev flow) and jumps straight
      // to the first missing state. Greeting + state transition both
      // live in startAdFlow so the two paths (menu tap here vs sales-bot
      // trigger) can never drift.
      const { startAdFlow } = require('./adGeneration');
      return startAdFlow(user);
    }

    case 'svc_logo': {
      const { startLogoFlow } = require('./logoGeneration');
      return startLogoFlow(user);
    }

    case 'svc_chatbot': {
      const { startChatbotFlow } = require('./chatbotService');
      return startChatbotFlow(user);
    }

    case 'svc_info':
      await sendWithMenuButton(
        user.phone_number,
        '❓ *FAQ & Support*\n\n' +
          'Hi! I\'m Pixie. I can help you with:\n\n' +
          '• Information about our services\n' +
          '• Pricing & timelines\n' +
          '• How our process works\n' +
          '• Technical questions\n\n' +
          'What would you like to know?'
      );
      await logMessage(user.id, 'Entering informative/FAQ chat', 'assistant');
      return STATES.INFORMATIVE_CHAT;

    case 'svc_general':
      await sendWithMenuButton(
        user.phone_number,
        '💬 Sure! I\'m Pixie. What can I help you with?'
      );
      await logMessage(user.id, 'Entering sales chat', 'assistant');
      return STATES.SALES_CHAT;

    default: {
      // Exploratory phrases already pre-empted at the top of the handler,
      // so if we're here the user's input isn't asking for "more / other
      // / else" services. Tailor the re-show based on whether the input
      // looks like a question (so the preface reads right).
      const isQuestion =
        /\?$/.test(text) ||
        /^(what|whats|which|how|hows|when|whens|where|wheres|why|whys|does|do|can|could|should|would|is|are|will|who|whos|tell)\b/i.test(text);

      const preface = isQuestion
        ? "good question — I’ll show the main options; tap 📋 More Services for the full list."
        : "hmm, didn’t catch that. Here are our main services:";

      await sendInteractiveButtons(
        user.phone_number,
        preface,
        [
          { id: 'svc_seo', title: '🔍 SEO Audit' },
          { id: 'svc_webdev', title: '🌐 Website' },
          { id: 'svc_more', title: '📋 More Services' },
        ]
      );
      await logMessage(user.id, 'Re-showing service selection', 'assistant', 'interactive');
      return STATES.SERVICE_SELECTION;
    }
  }
}

/**
 * Try to match a service from free-text input.
 */
function matchServiceFromText(text) {
  if (/\b(seo|audit|analyz|analys)\b/i.test(text)) return 'svc_seo';
  if (/\b(ecommerce|e-commerce|online store|store|shop|shopify|sell online|product catalog|dropship)\b/i.test(text)) return 'svc_ecommerce';
  if (/\b(website|web ?dev|site|redesign)\b/i.test(text)) return 'svc_webdev';
  if (/\b(app|mobile|android|ios)\b/i.test(text)) return 'svc_appdev';
  if (/\b(market|advertis|social media|ppc|brand)\b/i.test(text)) return 'svc_marketing';
  if (/\b(ad\s*gen|ads?\s*creat|ad\s*design|ad\s*image|ad\s*maker|create\s*ads?|design\s*ads?|marketing\s*ads?)\b/i.test(text)) return 'svc_adgen';
  if (/\b(logo|brand\s*mark|wordmark|brand\s*design|design\s*logo|create\s*logo|make\s*logo|logo\s*maker)\b/i.test(text)) return 'svc_logo';
  if (/\b(chatbot|chat ?bot|ai assistant|virtual assistant|ai chat)\b/i.test(text)) return 'svc_chatbot';
  if (/\b(faq|support|info|question|help|how|what)\b/i.test(text)) return 'svc_info';
  if (/\b(chat|talk|sales|general|buy|start|quote)\b/i.test(text)) return 'svc_general';
  return null;
}

/**
 * LLM-backed service picker for flow-switch messages. Use this when the
 * intent classifier has already marked a message as `menu` or `exit`
 * and we need to figure out WHICH service the user wants to switch to —
 * especially cases where regex gets confused (negation: "forget the
 * website, do chatbot"; plurals: "marketing ads"; filler words).
 *
 * Returns one of the svc_* ids, or null if the user just wants the menu
 * without a specific target.
 */
async function pickServiceFromSwitch(text, userId) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  // Fast path: regex already handles the clear cases cleanly. Only fall
  // through to LLM when regex found nothing OR the text contains words
  // that often trip the regex (negation + another service word).
  const regexHit = matchServiceFromText(raw);
  const hasNegation = /\b(forget|skip|scrap|cancel|drop|leave|nvm|never\s*mind|instead)\b/i.test(raw);
  if (regexHit && !hasNegation) return regexHit;

  const { generateResponse } = require('../../llm/provider');
  const { logger } = require('../../utils/logger');

  const prompt = `The user is switching between services mid-flow. Pick which service they want to DO NEXT from this exact list. Return ONLY JSON: {"service": "<id>"|null}.

Services:
- svc_seo: free SEO audit of a website
- svc_webdev: build a new website
- svc_ecommerce: online store (ByteScart)
- svc_appdev: mobile / web app development
- svc_marketing: digital marketing / SEO package / strategy
- svc_adgen: generate marketing AD IMAGES for social media
- svc_logo: make a brand logo
- svc_chatbot: AI chatbot for a business
- svc_info: FAQ / info / support
- svc_general: talk to sales

Rules:
- If the user says "forget/skip/cancel X, do Y", pick Y — ignore what they're leaving behind.
- Match plurals and synonyms: "marketing ads" → svc_adgen, "chat bot" → svc_chatbot, "website" → svc_webdev.
- If they just want to go back to the menu with no specific target, return {"service": null}.
- If nothing in the message maps to a service, return {"service": null}.

User message: "${raw.replace(/"/g, '\\"').slice(0, 300)}"`;

  try {
    const resp = await generateResponse(
      prompt,
      [{ role: 'user', content: 'Pick the service now.' }],
      { userId, operation: 'service_switch_pick', timeoutMs: 10_000 }
    );
    const m = String(resp || '').match(/\{[\s\S]*?\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const svc = parsed?.service;
    if (typeof svc !== 'string') return null;
    // Only accept known service ids
    const known = new Set(['svc_seo', 'svc_webdev', 'svc_ecommerce', 'svc_appdev', 'svc_marketing', 'svc_adgen', 'svc_logo', 'svc_chatbot', 'svc_info', 'svc_general']);
    return known.has(svc) ? svc : null;
  } catch (err) {
    logger.warn(`[SERVICE-PICK] LLM call failed: ${err.message}`);
    return null;
  }
}

module.exports = { handleServiceSelection, sendMainMenu, matchServiceFromText, pickServiceFromSwitch };
