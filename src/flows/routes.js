'use strict';

// POST /flow — the WhatsApp Flow data-exchange endpoint.
//
// Meta sends a JSON body with three base64 fields (encrypted_flow_data,
// encrypted_aes_key, initial_vector). We decrypt, run the screen logic in
// endpoint.js, then return the AES-GCM-encrypted response as a bare
// base64 string with Content-Type text/plain (Meta's required shape).
//
// Status codes Meta cares about:
//   200  normal encrypted response
//   421  our key is stale — Meta re-fetches the public key and retries
//   432  signature mismatch
//   500  anything else (Meta shows the user a generic error)

const crypto = require('crypto');
const { Router } = require('express');
const { env } = require('../config/env');
const { decryptRequest, encryptResponse } = require('./crypto');
const { handleFlow } = require('./endpoint');
const { logger } = require('../utils/logger');

const router = Router();

// Secret-gated diagnostic — reports whether the private key loads on the
// server and its derived public-key fingerprint, WITHOUT exposing the key.
// Lets us confirm the env value is a valid PEM and matches the public key
// uploaded to the phone number. Gated on WHATSAPP_APP_SECRET so only we
// can call it. Safe to leave in — returns nothing sensitive.
router.get('/flow/keycheck', (req, res) => {
  if (!env.whatsapp.appSecret || req.query.secret !== env.whatsapp.appSecret) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const out = { keyEnvPresent: !!(process.env.WHATSAPP_FLOW_PRIVATE_KEY || process.env.FLOW_PRIVATE_KEY) };
  const rawLen = (process.env.WHATSAPP_FLOW_PRIVATE_KEY || process.env.FLOW_PRIVATE_KEY || '').length;
  out.rawLen = rawLen;
  try {
    const { loadPrivateKey } = require('./crypto');
    const key = loadPrivateKey();
    const keyObj = crypto.createPrivateKey(key);
    const pub = crypto.createPublicKey(keyObj).export({ type: 'spki', format: 'pem' });
    out.keyLoads = true;
    out.pubFingerprint = crypto.createHash('sha256').update(pub).digest('hex').slice(0, 16);
  } catch (err) {
    out.keyLoads = false;
    out.error = err.message;
  }
  return res.json(out);
});

// Verify Meta's X-Hub-Signature-256 over the raw body (same scheme as the
// WhatsApp webhook). Skips when no app secret is configured.
function verifySignature(req) {
  const secret = env.whatsapp.appSecret;
  if (!secret) return true;
  const sig = req.headers['x-hub-signature-256'];
  if (!sig || !req.rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

router.post('/flow', async (req, res) => {
  // Signature check (best-effort — skipped if no secret set).
  if (!verifySignature(req)) {
    logger.warn('[FLOW] signature verification failed');
    return res.status(432).send();
  }

  const body = req.body || {};
  if (!body.encrypted_flow_data || !body.encrypted_aes_key || !body.initial_vector) {
    logger.warn('[FLOW] request missing encrypted fields');
    return res.status(400).send();
  }

  // 1. Decrypt.
  let decrypted;
  let aesKeyBuffer;
  let initialVectorBuffer;
  try {
    ({ decrypted, aesKeyBuffer, initialVectorBuffer } = decryptRequest(body));
  } catch (err) {
    if (err.code === 'FLOW_KEY_DECRYPT_FAILED') {
      // Tell Meta to re-fetch our public key and retry.
      logger.warn(`[FLOW] key decrypt failed → 421: ${err.message}`);
      return res.status(421).send();
    }
    logger.error(`[FLOW] decrypt error: ${err.message}`);
    return res.status(500).send();
  }

  // 2. Run the screen logic. Language is resolved inside handleFlow from
  //    the persisted session (set when the flow was sent). ping/INIT have
  //    no session yet → default 'en'.
  let responseObj;
  try {
    responseObj = await handleFlow(decrypted, {});
  } catch (err) {
    logger.error(`[FLOW] handler error: ${err.message}`);
    return res.status(500).send();
  }

  // 3. Encrypt + return as bare base64 text.
  try {
    const encrypted = encryptResponse(responseObj, aesKeyBuffer, initialVectorBuffer);
    res.set('Content-Type', 'text/plain');
    return res.status(200).send(encrypted);
  } catch (err) {
    logger.error(`[FLOW] encrypt error: ${err.message}`);
    return res.status(500).send();
  }
});

module.exports = router;
