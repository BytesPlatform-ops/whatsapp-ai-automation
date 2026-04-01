const express = require('express');
const { logger } = require('../../utils/logger');
const { createClient, getClient, updateClient, deactivateClient, listClients } = require('../db/clients');
const { generateUniqueSlug } = require('../services/slug-generator');

const router = express.Router();

// POST /api/v1/clients - Create a new client
router.post('/', async (req, res) => {
  try {
    const { business_name, industry, owner_name, owner_phone, owner_email, website_url,
            chatbot_data, tier, status, widget_color, welcome_message, logo_url, chatbot_name } = req.body;

    if (!business_name) {
      return res.status(400).json({ error: 'business_name is required' });
    }

    const client_id = await generateUniqueSlug(business_name);

    const client = await createClient({
      client_id,
      business_name,
      industry: industry || null,
      owner_name: owner_name || null,
      owner_phone: owner_phone || null,
      owner_email: owner_email || null,
      website_url: website_url || null,
      chatbot_data: chatbot_data || {},
      tier: tier || 'starter',
      status: status || 'demo',
      widget_color: widget_color || '#1A73E8',
      welcome_message: welcome_message || 'Hi! How can I help you today?',
      logo_url: logo_url || null,
      chatbot_name: chatbot_name || null,
    });

    logger.info(`[CHATBOT] Created client: ${client_id}`);
    res.status(201).json(client);
  } catch (error) {
    logger.error('[CHATBOT] Create client error:', error.message);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// GET /api/v1/clients - List all clients
router.get('/', async (req, res) => {
  try {
    const { status, tier, search } = req.query;
    const clients = await listClients({ status, tier, search });
    res.json(clients);
  } catch (error) {
    logger.error('[CHATBOT] List clients error:', error.message);
    res.status(500).json({ error: 'Failed to list clients' });
  }
});

// GET /api/v1/clients/:client_id - Get client profile
router.get('/:client_id', async (req, res) => {
  try {
    const client = await getClient(req.params.client_id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (error) {
    logger.error('[CHATBOT] Get client error:', error.message);
    res.status(500).json({ error: 'Failed to get client' });
  }
});

// PUT /api/v1/clients/:client_id - Update client profile
router.put('/:client_id', async (req, res) => {
  try {
    const client = await getClient(req.params.client_id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    // Only allow updating specific fields
    const allowed = ['business_name', 'industry', 'owner_name', 'owner_phone', 'owner_email',
                     'website_url', 'chatbot_data', 'tier', 'status', 'trial_ends_at',
                     'widget_color', 'welcome_message', 'logo_url', 'chatbot_name', 'activated_at'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const updated = await updateClient(req.params.client_id, updates);
    res.json(updated);
  } catch (error) {
    logger.error('[CHATBOT] Update client error:', error.message);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// DELETE /api/v1/clients/:client_id - Deactivate client
router.delete('/:client_id', async (req, res) => {
  try {
    const client = await getClient(req.params.client_id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    await deactivateClient(req.params.client_id);
    res.json({ message: 'Client deactivated' });
  } catch (error) {
    logger.error('[CHATBOT] Deactivate client error:', error.message);
    res.status(500).json({ error: 'Failed to deactivate client' });
  }
});

module.exports = router;
