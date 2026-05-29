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
  // `turnId` groups every classifier decision made in response to a
  // single inbound message — set by the router after findOrCreateUser
  // and read by classifierDecisions.recordClassifierDecision so each
  // verdict can be tied back to the user-message that triggered it.
  // `voiceMode` mirrors user.metadata.voiceReplies for the current turn so
  // the sender facade — which only has the async context, not the user
  // object — can turn every plain-text reply into a voice note when the
  // user has opted in. Set by the router at turn start (and flipped live by
  // the voice-preference interceptor when the user toggles it this turn).
  return channelStore.run({ channel, phoneNumberId: phoneNumberId || null, sendCount: 0, userId: null, turnId: null, preferredLanguage: null, voiceMode: false }, fn);
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
 * Set the per-turn classifier-trace id. Router calls this once after
 * findOrCreateUser so every classifier decision recorded inside the
 * turn shares the same turn_id. Reads via getTurnId().
 */
function setTurnId(turnId) {
  const store = channelStore.getStore();
  if (store) store.turnId = turnId || null;
}

function getTurnId() {
  return channelStore.getStore()?.turnId || null;
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

/**
 * Stash the current user's preferred language on the async-context store.
 * Set once per turn by the router after resolveLanguage runs. Read by
 * sender-side helpers (e.g. the interactive-buttons hint generator in
 * interactiveReplyMatcher.js) so they can localize without plumbing a
 * user object through every send call.
 */
function setPreferredLanguage(lang) {
  const store = channelStore.getStore();
  if (store) store.preferredLanguage = lang || null;
}

function getPreferredLanguage() {
  return channelStore.getStore()?.preferredLanguage || null;
}

/**
 * Voice-reply mode for the current turn. When true, the sender facade sends
 * plain-text replies as voice notes (TTS) instead of text, falling back to
 * text if synthesis fails. Set by the router from user.metadata.voiceReplies.
 */
function setVoiceMode(on) {
  const store = channelStore.getStore();
  if (store) store.voiceMode = !!on;
}

function getVoiceMode() {
  return channelStore.getStore()?.voiceMode || false;
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
  setTurnId,
  getTurnId,
  setPreferredLanguage,
  getPreferredLanguage,
  setVoiceMode,
  getVoiceMode,
};
