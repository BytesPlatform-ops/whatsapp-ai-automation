const { AsyncLocalStorage } = require('async_hooks');

const channelStore = new AsyncLocalStorage();

/**
 * Run a function with a channel context set.
 * All sender calls inside `fn` will use the specified channel.
 */
function runWithChannel(channel, fn) {
  return channelStore.run({ channel }, fn);
}

/**
 * Get the current channel from the async context.
 * Falls back to 'whatsapp' if no context is set.
 */
function getCurrentChannel() {
  return channelStore.getStore()?.channel || 'whatsapp';
}

module.exports = { runWithChannel, getCurrentChannel };
