const { sendTextMessage, sendInteractiveButtons, sendWithMenuButton } = require('../../messages/sender');
const { logMessage, getConversationHistory } = require('../../db/conversations');
const { generateResponse } = require('../../llm/provider');
const { GENERAL_CHAT_PROMPT } = require('../../llm/prompts');
const { formatWhatsApp } = require('../../utils/formatWhatsApp');
const { STATES } = require('../states');

async function handleMarketing(user, message) {
  switch (user.state) {
    case STATES.MARKETING_COLLECT_DETAILS:
      return handleCollectDetails(user, message);
    case STATES.MARKETING_STRATEGY:
    case STATES.MARKETING_FOLLOW_UP:
      return handleFollowUp(user, message);
    default:
      return STATES.MARKETING_COLLECT_DETAILS;
  }
}

async function handleCollectDetails(user, message) {
  const details = (message.text || '').trim();

  if (!details || details.length < 10) {
    await sendWithMenuButton(
      user.phone_number,
      'Tell me about your business and marketing goals:\n\n' +
        '• What does your business do?\n' +
        '• Who is your target audience?\n' +
        '• What marketing have you tried so far?\n' +
        '• What\'s your monthly marketing budget range?'
    );
    return STATES.MARKETING_COLLECT_DETAILS;
  }

  // Use LLM to generate a marketing strategy outline
  const systemPrompt =
    GENERAL_CHAT_PROMPT +
    '\n\nThe user has described their business and marketing needs. Provide:\n' +
    '1. A brief assessment of their current situation\n' +
    '2. 3-4 recommended marketing channels/strategies for their business\n' +
    '3. Quick-win suggestions they can start immediately\n' +
    '4. Mention that you can prepare a full strategy document\n\n' +
    'Keep it concise for WhatsApp (under 1000 characters).';

  const response = await generateResponse(systemPrompt, [
    { role: 'user', content: details },
  ]);

  await sendTextMessage(user.phone_number, formatWhatsApp(response));
  await logMessage(user.id, response, 'assistant');

  await sendInteractiveButtons(user.phone_number, 'What would you like to do next?', [
    { id: 'mkt_strategy', title: '📊 Full Strategy' },
    { id: 'mkt_question', title: '❓ Ask a Question' },
    { id: 'back_menu', title: '📋 Back to Menu' },
  ]);

  return STATES.MARKETING_FOLLOW_UP;
}

async function handleFollowUp(user, message) {
  const buttonId = message.buttonId || '';

  if (buttonId === 'mkt_strategy') {
    await sendTextMessage(
      user.phone_number,
      '📊 *Marketing Strategy Request Noted!*\n\n' +
        'Our marketing team will prepare a comprehensive strategy including:\n' +
        '• Channel recommendations\n' +
        '• Content calendar\n' +
        '• Budget allocation\n' +
        '• KPI targets\n' +
        '• Timeline\n\n' +
        'Someone will reach out within 24 hours. Anything else you\'d like to know?'
    );
    await logMessage(user.id, 'User wants full marketing strategy', 'assistant');
    return STATES.MARKETING_FOLLOW_UP;
  }

  if (buttonId === 'back_menu') {
    const { handleWelcome } = require('./welcome');
    return handleWelcome(user, message);
  }

  // Handle follow-up questions with LLM
  const history = await getConversationHistory(user.id, 20);
  const messages = history.map((h) => ({
    role: h.role,
    content: h.message_text,
  }));

  const response = await generateResponse(
    GENERAL_CHAT_PROMPT + '\n\nThis user is interested in digital marketing services. Help them with their questions.',
    messages
  );

  await sendTextMessage(user.phone_number, response);
  await logMessage(user.id, response, 'assistant');

  return STATES.MARKETING_FOLLOW_UP;
}

module.exports = { handleMarketing };
