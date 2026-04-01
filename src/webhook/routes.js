const crypto = require('crypto');
const { Router } = require('express');
const { env } = require('../config/env');
const { parseWebhookPayload } = require('./parser');
const { routeMessage } = require('../conversation/router');
const { logger } = require('../utils/logger');

const router = Router();

/**
 * Verify the webhook signature from Meta (X-Hub-Signature-256 header).
 * Returns true if valid or if app secret is not configured.
 */
function verifySignature(req) {
  if (!env.whatsapp.appSecret) return true; // Skip if no secret configured

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const expectedSignature =
    'sha256=' +
    crypto
      .createHmac('sha256', env.whatsapp.appSecret)
      .update(req.rawBody)
      .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * GET /webhook — Meta webhook verification handshake.
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.whatsapp.verifyToken) {
    logger.info('Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  logger.warn('Webhook verification failed', { mode, token });
  return res.sendStatus(403);
});

/**
 * POST /webhook — Receive incoming WhatsApp messages.
 */
router.post('/webhook', async (req, res) => {
  // Always respond 200 immediately (Meta requirement — they retry on failure)
  res.sendStatus(200);

  // Verify signature
  if (!verifySignature(req)) {
    logger.warn('Invalid webhook signature');
    return;
  }

  // Parse the incoming message
  const message = parseWebhookPayload(req.body);
  if (!message) return; // Status update or unknown payload — skip

  logger.info('Incoming message', {
    from: message.from,
    type: message.type,
    text: message.text?.slice(0, 100),
  });

  // Route the message through the conversation engine
  try {
    await routeMessage(message);
  } catch (error) {
    logger.error('Error processing message:', error);
  }
});

module.exports = router;
