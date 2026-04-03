const crypto = require('crypto');
const { Router } = require('express');
const { env } = require('../config/env');
const { parseMessengerPayload } = require('./messengerParser');
const { routeMessage } = require('../conversation/router');
const { logger } = require('../utils/logger');

const router = Router();

/**
 * Verify webhook signature for Messenger/Instagram (same mechanism as WhatsApp).
 */
function verifySignature(req) {
  const appSecret = env.messenger.appSecret || env.whatsapp.appSecret;
  if (!appSecret) return true;

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    logger.warn('No x-hub-signature-256 header found');
    return false;
  }

  if (!req.rawBody) {
    logger.warn('No rawBody available on request');
    return false;
  }

  const expectedSignature =
    'sha256=' +
    crypto
      .createHmac('sha256', appSecret)
      .update(req.rawBody)
      .digest('hex');

  const match = expectedSignature === signature;
  if (!match) {
    logger.warn('Signature mismatch', {
      secretUsed: appSecret ? `${appSecret.slice(0, 4)}...` : 'none',
      received: signature.slice(0, 20) + '...',
      expected: expectedSignature.slice(0, 20) + '...',
    });
  }

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * GET /msg-webhook — Messenger/Instagram verification handshake.
 */
router.get('/msg-webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = env.messenger.verifyToken || env.whatsapp.verifyToken;

  if (mode === 'subscribe' && token === verifyToken) {
    logger.info('Messenger/IG webhook verified successfully');
    return res.status(200).send(challenge);
  }

  logger.warn('Messenger/IG webhook verification failed', { mode, token });
  return res.sendStatus(403);
});

/**
 * POST /msg-webhook — Receive incoming Messenger/Instagram messages.
 */
router.post('/msg-webhook', async (req, res) => {
  // Always respond 200 immediately (Meta requirement)
  res.sendStatus(200);

  if (!verifySignature(req)) {
    logger.warn('Invalid Messenger/IG webhook signature');
    return;
  }

  const message = parseMessengerPayload(req.body);
  if (!message) return;

  logger.info('Incoming Messenger/IG message', {
    from: message.from,
    channel: message.channel,
    type: message.type,
    text: message.text?.slice(0, 100),
  });

  try {
    await routeMessage(message);
  } catch (error) {
    logger.error('Error processing Messenger/IG message:', error);
  }
});

module.exports = router;
