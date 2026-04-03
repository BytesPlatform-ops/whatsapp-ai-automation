const { supabase } = require('../config/database');

async function logMessage(userId, messageText, role, messageType = 'text', waMessageId = null) {
  const { error } = await supabase
    .from('conversations')
    .insert({
      user_id: userId,
      message_text: messageText,
      role,
      message_type: messageType,
      whatsapp_message_id: waMessageId ? waMessageId.slice(0, 100) : null,
    });

  if (error) throw new Error(`Failed to log message: ${error.message}`);
}

async function getConversationHistory(userId, limit = 20) {
  const { data, error } = await supabase
    .from('conversations')
    .select('message_text, role, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to get conversation history: ${error.message}`);
  return (data || []).reverse();
}

async function clearHistory(userId) {
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to clear history: ${error.message}`);
}

module.exports = { logMessage, getConversationHistory, clearHistory };
