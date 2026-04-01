const { sendWithMenuButton } = require('../../messages/sender');
const { logger } = require('../../utils/logger');
const { STATES } = require('../states');

async function handleGeneralChat(user, message) {
  const text = (message.text || '').trim();

  if (!text) {
    await sendWithMenuButton(
      user.phone_number,
      'I can help you with questions about our services! Just type your question.'
    );
    return STATES.GENERAL_CHAT;
  }

  // Route ALL messages to the sales bot — general chat should not be a long-term state
  // The sales bot handles everything: service pitches, questions, objections
  logger.info(`Routing ${user.phone_number} from GENERAL_CHAT to sales bot`);
  const { handleSalesBot } = require('./salesBot');
  return handleSalesBot(user, message);
}

module.exports = { handleGeneralChat };
