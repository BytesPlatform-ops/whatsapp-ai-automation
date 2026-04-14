const { sendTextMessage, sendInteractiveButtons, sendWithMenuButton } = require('../../messages/sender');
const { logMessage, getRecentMessages } = require('../../db/conversations');
const { generateResponse } = require('../../llm/provider');
const { INFORMATIVE_BOT_PROMPT } = require('../../llm/prompts');
const { logger } = require('../../utils/logger');
const { STATES } = require('../states');

/**
 * Informative / FAQ bot handler.
 * Unlike the sales bot (Pixie), this bot is purely informational -
 * it answers customer queries, provides support, and helps with FAQs
 * without pushing toward a sale.
 *
 * If the user shows clear buying intent, it offers to connect them
 * with the sales team.
 */
async function handleInformativeBot(user, message) {
  const text = (message.text || '').trim();

  // Handle button presses
  if (message.buttonId === 'menu_main') {
    return STATES.SERVICE_SELECTION;
  }

  if (message.buttonId === 'info_talk_sales') {
    await sendTextMessage(
      user.phone_number,
      "Sure! Let me connect you with our sales team. They'll take it from here."
    );
    await logMessage(user.id, 'Transferred to sales bot', 'assistant');
    return STATES.SALES_CHAT;
  }

  if (!text) {
    await sendWithMenuButton(
      user.phone_number,
      "Hi! I'm here to help answer any questions you have about our services, process, pricing, and more. Just ask away!"
    );
    return STATES.INFORMATIVE_CHAT;
  }

  try {
    // Get recent conversation history for context
    const history = await getRecentMessages(user.id, 20);
    const messages = history.map((m) => ({
      role: m.role,
      content: m.message_text,
    }));
    messages.push({ role: 'user', content: text });

    // Try to get knowledge base context if available
    let knowledgeContext = '';
    try {
      const { retrieveContext } = require('../../knowledge/retriever');
      const chunks = await retrieveContext(text, 3);
      if (chunks && chunks.length > 0) {
        knowledgeContext = '\n\nRelevant knowledge base context:\n' + chunks.map((c) => c.content).join('\n---\n');
      }
    } catch {
      // Knowledge base not set up - that's fine, continue without it
    }

    const systemPrompt = INFORMATIVE_BOT_PROMPT + knowledgeContext;
    const response = await generateResponse(systemPrompt, messages);

    // Check if the bot detected buying intent and wants to hand off
    const salesHandoff = response.includes('[HANDOFF_SALES]');
    const cleanResponse = response.replace(/\[HANDOFF_SALES\]/g, '').trim();

    await sendTextMessage(user.phone_number, cleanResponse);
    await logMessage(user.id, cleanResponse, 'assistant');

    if (salesHandoff) {
      await sendInteractiveButtons(
        user.phone_number,
        'Would you like to speak with our sales team to get started?',
        [
          { id: 'info_talk_sales', title: 'Talk to Sales' },
          { id: 'info_more_questions', title: 'More Questions' },
        ]
      );
    }

    return STATES.INFORMATIVE_CHAT;
  } catch (error) {
    logger.error('Informative bot error:', error);
    await sendTextMessage(
      user.phone_number,
      "Sorry, I'm having trouble right now. Let me connect you with our team."
    );
    await sendTextMessage(user.phone_number, 'Type "menu" to go back to the main menu, or "sales" to talk to our team.');
    return STATES.INFORMATIVE_CHAT;
  }
}

module.exports = { handleInformativeBot };
