const { AsyncLocalStorage } = require('async_hooks');

const channelStore = new AsyncLocalStorage();

/**
 * Run a function with a full message context (channel + the specific business
 * phone_number_id that received the inbound message). All sender calls inside
 * `fn` pick up this context so replies go out on the same WhatsApp number the
 * user messaged.
 */
function runWithContext({ channel, phoneNumberId }, fn) {
  // `sendCount` is incremented by sender.js every time a user-visible
  // message actually goes out. The router reads it after a failed turn to
  // decide whether a retry would duplicate already-delivered content.
  // `userId` is null at turn start; router fills it in after findOrCreateUser
  // so the sender can auto-log outbound messages against the right user.
  return channelStore.run({ channel, phoneNumberId: phoneNumberId || null, sendCount: 0, userId: null }, fn);
}

/**
 * Attach the current turn's user.id onto the async-context store. The
 * sender facade reads this to auto-log outbound messages to the
 * conversations table — previously handlers had to call logMessage
 * manually after every sendTextMessage, and the 50%+ of cases where
 * they forgot left the admin panel's chat history incomplete.
 */
function setUserId(userId) {
  const store = channelStore.getStore();
  if (store) store.userId = userId || null;
}

function getUserId() {
  return channelStore.getStore()?.userId || null;
}

/**
 * Called from sender.js after a successful outbound send. Bumps the per-turn
 * counter so the router can tell whether the user has already seen anything.
 */
function noteSendSucceeded() {
  const store = channelStore.getStore();
  if (store) store.sendCount = (store.sendCount || 0) + 1;
}

/**
 * How many messages this turn has already delivered to the user. 0 when
 * outside an inbound-triggered context.
 */
function getSendCount() {
  return channelStore.getStore()?.sendCount || 0;
}

/**
 * Back-compat shim: earlier callers only passed a channel. Kept so background
 * jobs and legacy paths don't break — they fall back to the env default
 * phoneNumberId inside the sender when no inbound context is present.
 */
function runWithChannel(channel, fn) {
  return runWithContext({ channel, phoneNumberId: null }, fn);
}

function getCurrentChannel() {
  return channelStore.getStore()?.channel || 'whatsapp';
}

/**
 * The WhatsApp phone_number_id that received the inbound message in the
 * current turn. `null` outside inbound-triggered contexts (proactive
 * followups, scheduled messages). Sender falls back to env default.
 */
function getCurrentPhoneNumberId() {
  return channelStore.getStore()?.phoneNumberId || null;
}

module.exports = {
  runWithContext,
  runWithChannel,
  getCurrentChannel,
  getCurrentPhoneNumberId,
  noteSendSucceeded,
  getSendCount,
  setUserId,
  getUserId,
};
