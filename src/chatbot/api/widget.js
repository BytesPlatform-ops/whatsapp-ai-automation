const express = require('express');
const { logger } = require('../../utils/logger');
const { getClient } = require('../db/clients');

const router = express.Router();

// GET /api/v1/widget/:client_id/config - Widget configuration
router.get('/:client_id/config', async (req, res) => {
  try {
    const client = await getClient(req.params.client_id);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({
      business_name: client.business_name,
      chatbot_name: client.chatbot_name || `${client.business_name} Assistant`,
      welcome_message: client.welcome_message || 'Hi! How can I help you today?',
      widget_color: client.widget_color || '#1A73E8',
      logo_url: client.logo_url || null,
      status: client.status,
    });
  } catch (error) {
    logger.error('[CHATBOT] Widget config error:', error.message);
    res.status(500).json({ error: 'Failed to get widget config' });
  }
});

module.exports = router;
