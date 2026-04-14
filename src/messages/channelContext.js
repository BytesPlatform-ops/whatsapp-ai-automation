const { AsyncLocalStorage } = require('async_hooks');

const channelStore = new AsyncLocalStorage();

/**
 * Run a function with a full message context (channel + the specific business
 * phone_number_id that received the inbound message). All sender calls inside
 * `fn` pick up this context so replies go out on the same WhatsApp number the
 * user messaged.
 */
function runWithContext({ channel, phoneNumberId }, fn) {
  return channelStore.run({ channel, phoneNumberId: phoneNumberId || null }, fn);
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

module.exports = { runWithContext, runWithChannel, getCurrentChannel, getCurrentPhoneNumberId };
