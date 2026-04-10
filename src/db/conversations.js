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

async function getConversationHistory(userId, limit = 20) {
  return await withRetry(async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select('message_text, role, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    throwIfNetworkError(error);
    if (error) throw new Error(`Failed to get conversation history: ${error.message}`);
    return (data || []).reverse();
  }, 'getConversationHistory');
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

module.exports = { logMessage, getConversationHistory, clearHistory };
