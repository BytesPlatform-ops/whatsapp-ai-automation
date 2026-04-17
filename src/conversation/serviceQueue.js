/**
 * serviceQueue.js
 *
 * Tracks when a user says "I want a website AND a logo AND some ads" so
 * that after finishing the first flow we can naturally suggest the next
 * one — with their business name, industry, colors etc. already carried
 * over by the entity accumulator.
 *
 * State lives in `user.metadata.serviceQueue` as an array of topic keys
 * ('webdev', 'logo', 'adgen', 'chatbot', 'seo', 'marketing'). The FIRST
 * entry is the one currently in progress. When a flow wraps up, callers
 * `pop()` the head; `peek()` returns the next queued flow (head of the
 * REMAINING queue after the current one).
 *
 * Usage from the router:
 *   - On a multi-service message, call `setQueue(user, topics)` and
 *     route the user into the first flow's entry state.
 *   - When a flow completes (user returns to SALES_CHAT), call
 *     `dequeueAndPeekNext(user)` — if it returns a next topic, offer
 *     to transition.
 */

'use strict';

const { updateUserMetadata } = require('../db/users');
const { logger } = require('../utils/logger');

const VALID_TOPICS = new Set(['webdev', 'logo', 'adgen', 'chatbot', 'seo', 'marketing', 'appdev', 'scheduling']);

const TOPIC_LABELS = Object.freeze({
  webdev: 'website',
  logo: 'logo',
  adgen: 'marketing ad',
  chatbot: 'AI chatbot',
  seo: 'SEO audit',
  marketing: 'digital marketing',
  appdev: 'app',
  scheduling: 'call with our team',
});

/**
 * Validate + dedup a queue of topic strings. Bad entries dropped silently
 * (logged). Returns a sanitised list.
 */
function sanitiseTopics(topics) {
  if (!Array.isArray(topics)) return [];
  const out = [];
  const seen = new Set();
  for (const t of topics) {
    if (!VALID_TOPICS.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Write the queue for a user. Replaces any existing queue.
 */
async function setQueue(user, topics) {
  const clean = sanitiseTopics(topics);
  await updateUserMetadata(user.id, { serviceQueue: clean });
  user.metadata = { ...(user.metadata || {}), serviceQueue: clean };
  logger.info(`[QUEUE] ${user.phone_number} queue set: [${clean.join(', ')}]`);
  return clean;
}

/**
 * Remove the head of the queue (the flow the user just finished) and
 * return the NEXT queued topic, or null when the queue is empty.
 */
async function dequeueAndPeekNext(user) {
  const queue = Array.isArray(user.metadata?.serviceQueue)
    ? [...user.metadata.serviceQueue]
    : [];
  if (queue.length === 0) return null;
  queue.shift(); // remove the one that just completed
  await updateUserMetadata(user.id, { serviceQueue: queue });
  user.metadata = { ...(user.metadata || {}), serviceQueue: queue };
  const next = queue[0] || null;
  logger.info(`[QUEUE] ${user.phone_number} dequeue → next: ${next || '(empty)'}`);
  return next;
}

/**
 * Read the queue without mutating. Useful when a handler wants to know
 * "what's still pending?" to phrase a prompt.
 */
function peek(user) {
  const queue = Array.isArray(user.metadata?.serviceQueue) ? user.metadata.serviceQueue : [];
  return queue.slice();
}

/**
 * Build a short "here's what we'll tackle" acknowledgment for a freshly
 * set queue. Example: "Got it — website first, then logo, then ads."
 */
function acknowledgeQueue(topics) {
  const clean = sanitiseTopics(topics);
  if (clean.length === 0) return '';
  if (clean.length === 1) return '';
  const labels = clean.map((t) => TOPIC_LABELS[t] || t);
  const head = labels[0];
  const rest = labels.slice(1);
  const restText = rest.length === 1 ? rest[0] : rest.slice(0, -1).join(', ') + ' and ' + rest[rest.length - 1];
  return `Got it — we'll start with your *${head}*, then move on to the *${restText}*. Let's take them one at a time.`;
}

/**
 * Offer to start the next queued flow after the current one completes.
 * Returns the prompt text, or null when the queue is empty.
 */
function nextPromptFor(user) {
  const queue = peek(user);
  // Index 1 because 0 is the CURRENT flow (still in progress at call time).
  // But most callers call this AFTER dequeue — in that case 0 IS next.
  // Callers who haven't dequeued yet should look at queue[1].
  const next = queue[0];
  if (!next) return null;
  const label = TOPIC_LABELS[next] || next;
  return `Ready to move on to your *${label}*? Just say the word and we'll jump in.`;
}

module.exports = {
  setQueue,
  dequeueAndPeekNext,
  peek,
  acknowledgeQueue,
  nextPromptFor,
  sanitiseTopics,
  VALID_TOPICS,
  TOPIC_LABELS,
};
