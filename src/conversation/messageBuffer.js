/**
 * messageBuffer.js
 *
 * Rapid-message buffering for WhatsApp. Real users often split a thought
 * across several quick messages:
 *
 *   "my name is Glow Studio"
 *   "and I do nails"
 *   "and my number is 0300-1234567"
 *
 * Without buffering, each fires an independent handler turn — the bot
 * replies three times, and each reply races the next inbound so fields
 * get parsed out of order.
 *
 * This module accepts incoming *text* messages, holds them for
 * QUIET_MS, and invokes the processor with the concatenated text once
 * the user stops typing. Button taps, interactive replies, images and
 * audio skip the buffer entirely — those are real actions that need
 * immediate handling.
 *
 * Trade-off: ALL plain-text messages incur a QUIET_MS (3s default)
 * delay before processing. That's the cost of letting fast-typing users
 * stream their thought without a chatty bot interrupting. Accepted per
 * plan.txt 6.2.
 *
 * Tests: `flushAll()` forces any pending batches to flush right now.
 */

'use strict';

const { logger } = require('../utils/logger');

const QUIET_MS = Number(process.env.MESSAGE_BUFFER_QUIET_MS) || 3000;
const MAX_HOLD_MS = Number(process.env.MESSAGE_BUFFER_MAX_MS) || 12000;

// key = `${channel}:${phoneNumberId}:${from}`; value = in-flight batch.
const _batches = new Map();

function _keyFor(message) {
  return `${message.channel || 'whatsapp'}:${message.phoneNumberId || ''}:${message.from}`;
}

/**
 * Enqueue a text message. If an active batch exists for this user, the
 * message is appended and the quiet timer is reset. Otherwise a new
 * batch is opened. Returns a promise that resolves AFTER the processor
 * finishes for this user's current batch, so tests can await it.
 */
function enqueue(message, processor) {
  const key = _keyFor(message);
  const now = Date.now();
  let batch = _batches.get(key);

  if (!batch) {
    batch = {
      key,
      openedAt: now,
      messages: [],
      processor, // locked in on first message of the batch
      donePromise: null,
      resolveDone: null,
    };
    batch.donePromise = new Promise((res) => { batch.resolveDone = res; });
    _batches.set(key, batch);
  }

  batch.messages.push(message);
  clearTimeout(batch.quietTimer);
  const elapsed = now - batch.openedAt;
  const wait = Math.min(QUIET_MS, Math.max(0, MAX_HOLD_MS - elapsed));
  batch.quietTimer = setTimeout(() => _flush(key).catch(() => {}), wait);
  logger.debug(`[BUFFER] ${key} queued (${batch.messages.length} msgs, wait=${wait}ms)`);
  return batch.donePromise;
}

/**
 * Force-flush all pending batches. Used by tests to avoid waiting for
 * the quiet timer.
 */
async function flushAll() {
  const keys = [..._batches.keys()];
  await Promise.all(keys.map((k) => _flush(k)));
}

/**
 * Internal: process a batch right now.
 */
async function _flush(key) {
  const batch = _batches.get(key);
  if (!batch) return;
  _batches.delete(key);
  clearTimeout(batch.quietTimer);

  if (batch.messages.length === 0) {
    batch.resolveDone();
    return;
  }

  const combinedText = batch.messages.map((m) => m.text || '').filter(Boolean).join('\n');
  const first = batch.messages[0];
  const synthetic = {
    ...first,
    text: combinedText,
    messageId: batch.messages.length === 1
      ? first.messageId
      : `${first.messageId || 'batch'}-merged-${Date.now()}`,
    _buffered: batch.messages.length > 1,
    _batchSize: batch.messages.length,
  };

  if (batch.messages.length > 1) {
    logger.info(`[BUFFER] ${key} flushing ${batch.messages.length} messages (${combinedText.length} chars)`);
  }

  try {
    await batch.processor(synthetic);
  } catch (err) {
    logger.error(`[BUFFER] flush processor failed: ${err.message}`);
  } finally {
    batch.resolveDone();
  }
}

/**
 * Should this inbound message be buffered at all? Non-text / payload /
 * media messages are routed immediately.
 */
function shouldBuffer(message) {
  if (!message) return false;
  if (message.type && message.type !== 'text') return false;
  if (message.buttonId || message.listId) return false;
  if (!message.text) return false;
  return true;
}

module.exports = {
  enqueue,
  flushAll,
  shouldBuffer,
  QUIET_MS,
  MAX_HOLD_MS,
};
