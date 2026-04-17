const { sendTextMessage, sendInteractiveButtons, sendWithMenuButton } = require('../../messages/sender');
const { logMessage, getConversationHistory } = require('../../db/conversations');
const { generateResponse } = require('../../llm/provider');
const { GENERAL_CHAT_PROMPT } = require('../../llm/prompts');
const { formatWhatsApp } = require('../../utils/formatWhatsApp');
const { STATES } = require('../states');
const { buildSummaryContext } = require('../summaryManager');

async function handleAppDev(user, message) {
  switch (user.state) {
    case STATES.APP_COLLECT_REQUIREMENTS:
      return handleCollectRequirements(user, message);
    case STATES.APP_PROPOSAL:
    case STATES.APP_FOLLOW_UP:
      return handleFollowUp(user, message);
    default:
      return STATES.APP_COLLECT_REQUIREMENTS;
  }
}

async function handleCollectRequirements(user, message) {
  const requirements = (message.text || '').trim();

  if (!requirements || requirements.length < 10) {
    await sendWithMenuButton(
      user.phone_number,
      'Please tell me more about your app idea. Include:\n\n' +
        '• What problem does it solve?\n' +
        '• Who is the target audience?\n' +
        '• Key features you need\n' +
        '• Platform (iOS, Android, Web, or all?)'
    );
    return STATES.APP_COLLECT_REQUIREMENTS;
  }

  // Use LLM to generate a proposal summary
  const systemPrompt =
    GENERAL_CHAT_PROMPT +
    '\n\nThe user has described an app idea. Provide a brief, professional response that:\n' +
    '1. Summarizes their requirements back to them\n' +
    '2. Suggests a recommended tech stack\n' +
    '3. Outlines a rough project phases (3-4 phases)\n' +
    '4. Mentions that you\'ll prepare a detailed proposal with timeline and pricing\n\n' +
    'Keep it concise for WhatsApp (under 1000 characters).';

  const response = await generateResponse(systemPrompt, [
    { role: 'user', content: requirements },
  ], { userId: user.id, operation: 'appdev_proposal' });

  await sendTextMessage(user.phone_number, formatWhatsApp(response));
  await logMessage(user.id, response, 'assistant');

  await sendInteractiveButtons(user.phone_number, 'Would you like to proceed?', [
    { id: 'app_proceed', title: '✅ Get Full Proposal' },
    { id: 'app_question', title: '❓ Ask a Question' },
    { id: 'back_menu', title: '📋 Back to Menu' },
  ]);

  return STATES.APP_FOLLOW_UP;
}

async function handleFollowUp(user, message) {
  const buttonId = message.buttonId || '';

  if (buttonId === 'app_proceed') {
    await sendTextMessage(
      user.phone_number,
      '📋 *Proposal Request Noted!*\n\n' +
        'Our development team will prepare a detailed proposal including:\n' +
        '• Technical architecture\n' +
        '• Development timeline\n' +
        '• Milestone deliverables\n' +
        '• Pricing breakdown\n\n' +
        'Someone will reach out within 24 hours. Is there anything else you\'d like to know?'
    );
    await logMessage(user.id, 'User wants full app proposal', 'assistant');
    return STATES.APP_FOLLOW_UP;
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
    GENERAL_CHAT_PROMPT + '\n\nThis user is interested in app development. Help them with their questions.' + buildSummaryContext(user),
    messages,
    { userId: user.id, operation: 'appdev_followup' }
  );

  await sendTextMessage(user.phone_number, response);
  await logMessage(user.id, response, 'assistant');

  return STATES.APP_FOLLOW_UP;
}

module.exports = { handleAppDev };
