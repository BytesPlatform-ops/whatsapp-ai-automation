const { env } = require('../config/env');
const { sendTextMessage, sendInteractiveButtons } = require('./sender');
const { logger } = require('../utils/logger');

/**
 * Send a template message (for messages outside the 24-hour window).
 * Templates must be pre-approved in the Meta dashboard.
 */
async function sendTemplateMessage(to, templateName, languageCode = 'en', components = []) {
  const axios = require('axios');

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
    },
  };

  if (components.length > 0) {
    payload.template.components = components;
  }

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${env.whatsapp.phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${env.whatsapp.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    logger.error('Template message error:', error.response?.data || error);
    throw error;
  }
}

module.exports = { sendTemplateMessage };
