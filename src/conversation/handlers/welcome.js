const { logMessage } = require('../../db/conversations');
const { updateUser } = require('../../db/users');
const { STATES } = require('../states');
const { handleSalesBot } = require('./salesBot');

async function handleWelcome(user, message) {
  // Persist contact name if provided
  if (message.contactName && !user.name) {
    await updateUser(user.id, { name: message.contactName });
    user = { ...user, name: message.contactName };
  }

  // Log the incoming message and immediately hand off to the sales bot
  // The sales bot detects an empty history and opens with the appropriate greeting
  user = { ...user, state: STATES.SALES_CHAT };
  return handleSalesBot(user, message);
}

module.exports = { handleWelcome };
