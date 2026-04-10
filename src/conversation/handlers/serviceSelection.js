const {
  sendTextMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  sendWithMenuButton,
} = require('../../messages/sender');
const { logMessage } = require('../../db/conversations');
const { STATES, SERVICE_IDS } = require('../states');

async function handleServiceSelection(user, message) {
  const buttonId = message.buttonId || message.listId || '';
  const text = (message.text || '').toLowerCase().trim();

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

  // Route based on selected service
  switch (buttonId || matchServiceFromText(text)) {
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

    case 'svc_webdev':
      await sendWithMenuButton(
        user.phone_number,
        '🌐 *Website Development*\n\n' +
          'I\'ll help you create a professional website! I just need a few details about your business.\n\n' +
          'First, what\'s your *business name*?'
      );
      await logMessage(user.id, 'Starting website development flow', 'assistant');
      return STATES.WEB_COLLECT_NAME;

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

    case 'svc_chatbot':
      await sendWithMenuButton(
        user.phone_number,
        '🤖 *AI Chatbot for Your Business*\n\n' +
          'Our AI Chatbot gives your business a 24/7 virtual assistant that answers customer questions, captures leads, and never misses a message.\n\n' +
          'Let me show you a live demo built specifically for YOUR business - it takes about 2 minutes!\n\n' +
          'First, what\'s your *business name*?'
      );
      await logMessage(user.id, 'Starting AI chatbot demo flow', 'assistant');
      return STATES.CB_COLLECT_NAME;

    case 'svc_info':
      await sendWithMenuButton(
        user.phone_number,
        '❓ *FAQ & Support*\n\n' +
          'Hi! I\'m Alex from the Bytes Platform support team. I can help you with:\n\n' +
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
        '💬 Sure! I\'m Mike from Bytes Platform. What can I help you with?'
      );
      await logMessage(user.id, 'Entering sales chat', 'assistant');
      return STATES.SALES_CHAT;

    default:
      // Didn't match any service - show the buttons again
      await sendInteractiveButtons(
        user.phone_number,
        'Please select one of our services to get started:',
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

/**
 * Try to match a service from free-text input.
 */
function matchServiceFromText(text) {
  if (/\b(seo|audit|analyz|analys)\b/i.test(text)) return 'svc_seo';
  if (/\b(ecommerce|e-commerce|online store|store|shop|shopify|sell online|product catalog|dropship)\b/i.test(text)) return 'svc_ecommerce';
  if (/\b(website|web ?dev|site|redesign)\b/i.test(text)) return 'svc_webdev';
  if (/\b(app|mobile|android|ios)\b/i.test(text)) return 'svc_appdev';
  if (/\b(market|advertis|ads|social media|ppc|brand)\b/i.test(text)) return 'svc_marketing';
  if (/\b(chatbot|chat ?bot|ai assistant|virtual assistant|ai chat)\b/i.test(text)) return 'svc_chatbot';
  if (/\b(faq|support|info|question|help|how|what)\b/i.test(text)) return 'svc_info';
  if (/\b(chat|talk|sales|general|buy|start|quote)\b/i.test(text)) return 'svc_general';
  return null;
}

module.exports = { handleServiceSelection };
