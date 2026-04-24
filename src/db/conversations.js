const { supabase } = require('../config/database');
const { withRetry, throwIfNetworkError } = require('./retry');

async function logMessage(userId, messageText, role, messageType = 'text', waMessageId = null, mediaData = null, mediaMime = null) {
  await withRetry(async () => {
    const { error } = await supabase
      .from('conversations')
      .insert({
        user_id: userId,
        message_text: messageText,
        role,
        message_type: messageType,
        whatsapp_message_id: waMessageId ? waMessageId.slice(0, 100) : null,
        media_data: mediaData,
        media_mime: mediaMime,
      });
    throwIfNetworkError(error);
    if (error) throw new Error(`Failed to log message: ${error.message}`);
  }, 'logMessage');
}

async function getConversationHistory(userId, limit = 20, options = {}) {
  return await withRetry(async () => {
    // Order by seq (monotonic bigserial) so simultaneous same-millisecond
    // inserts keep their true order. See migration 015.
    let q = supabase
      .from('conversations')
      .select('message_text, role, created_at')
      .eq('user_id', userId);

    // /reset now keeps the underlying rows for admin diagnostics but
    // LLM-facing callers pass options.afterTimestamp = metadata.lastResetAt
    // so the bot sees a truly fresh slate. Omit the option (or pass
    // null) to get everything — that's what admin views use.
    if (options.afterTimestamp) {
      q = q.gte('created_at', options.afterTimestamp);
    }

    // System-role rows are non-user-visible markers (/reset sentinel,
    // friction annotations written by the router) and must never reach
    // an LLM as conversational context. Callers asking for LLM context
    // pass includeSystem=false (default); admin views that want to see
    // the markers pass includeSystem=true explicitly.
    if (options.includeSystem === false || options.includeSystem === undefined) {
      q = q.neq('role', 'system');
    }

    const { data, error } = await q
      .order('seq', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    throwIfNetworkError(error);
    if (error) throw new Error(`Failed to get conversation history: ${error.message}`);
    return (data || []).reverse();
  }, 'getConversationHistory');
}

/**
 * Look up a previously-logged message by its platform message id (the
 * WhatsApp/Messenger `wamid` / `mid`). Used by the router to resolve a
 * quoted-reply context: the inbound webhook tells us "the user replied to
 * <id>", and we fetch the original text + role so handlers/LLM can see
 * what the user is referring back to.
 *
 * Scoped to userId so a stranger forwarding someone else's message id
 * can't surface that other conversation. Returns null if not found.
 */
async function findMessageByPlatformId(userId, platformMessageId) {
  if (!userId || !platformMessageId) return null;
  return await withRetry(async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select('message_text, role, message_type, created_at')
      .eq('user_id', userId)
      .eq('whatsapp_message_id', platformMessageId.slice(0, 100))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    throwIfNetworkError(error);
    if (error) throw new Error(`Failed to find quoted message: ${error.message}`);
    return data || null;
  }, 'findMessageByPlatformId');
}

async function clearHistory(userId) {
  await withRetry(async () => {
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('user_id', userId);
    throwIfNetworkError(error);
    if (error) throw new Error(`Failed to clear history: ${error.message}`);
  }, 'clearHistory');
}

module.exports = { logMessage, getConversationHistory, clearHistory, findMessageByPlatformId };
