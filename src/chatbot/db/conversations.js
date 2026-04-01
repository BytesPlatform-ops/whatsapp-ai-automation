const { supabase } = require('../../config/database');

async function findOrCreateConversation(clientId, sessionId, source = 'widget', meta = {}) {
  // Try to find existing conversation by session
  const { data: existing } = await supabase
    .from('chatbot_conversations')
    .select('*')
    .eq('client_id', clientId)
    .eq('session_id', sessionId)
    .single();

  if (existing) return existing;

  // Create new conversation
  const { data, error } = await supabase
    .from('chatbot_conversations')
    .insert({
      client_id: clientId,
      session_id: sessionId,
      source,
      messages: [],
      ip_address: meta.ip || null,
      user_agent: meta.userAgent || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create conversation: ${error.message}`);
  return data;
}

async function appendMessage(conversationId, role, content) {
  // Fetch current messages
  const { data: convo, error: fetchError } = await supabase
    .from('chatbot_conversations')
    .select('messages, message_count')
    .eq('id', conversationId)
    .single();

  if (fetchError) throw new Error(`Failed to fetch conversation: ${fetchError.message}`);

  const messages = convo.messages || [];
  messages.push({ role, content, timestamp: new Date().toISOString() });

  const { error } = await supabase
    .from('chatbot_conversations')
    .update({
      messages,
      message_count: (convo.message_count || 0) + 1,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  if (error) throw new Error(`Failed to append message: ${error.message}`);
}

async function updateVisitorInfo(conversationId, visitorInfo) {
  const fields = {};
  if (visitorInfo.name) fields.visitor_name = visitorInfo.name;
  if (visitorInfo.email) fields.visitor_email = visitorInfo.email;
  if (visitorInfo.phone) fields.visitor_phone = visitorInfo.phone;

  if (Object.keys(fields).length === 0) return;

  const { error } = await supabase
    .from('chatbot_conversations')
    .update(fields)
    .eq('id', conversationId);

  if (error) throw new Error(`Failed to update visitor info: ${error.message}`);
}

async function getConversationsByClient(clientId, limit = 50) {
  const { data, error } = await supabase
    .from('chatbot_conversations')
    .select('*')
    .eq('client_id', clientId)
    .order('last_message_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to get conversations: ${error.message}`);
  return data || [];
}

async function getConversation(conversationId) {
  const { data, error } = await supabase
    .from('chatbot_conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get conversation: ${error.message}`);
  }
  return data || null;
}

module.exports = {
  findOrCreateConversation,
  appendMessage,
  updateVisitorInfo,
  getConversationsByClient,
  getConversation,
};
