const { supabase } = require('../../config/database');

async function createClient(fields) {
  // Default chatbot_name to business name + " Assistant"
  if (!fields.chatbot_name) {
    fields.chatbot_name = `${fields.business_name} Assistant`;
  }

  const { data, error } = await supabase
    .from('chatbot_clients')
    .insert(fields)
    .select()
    .single();

  if (error) throw new Error(`Failed to create client: ${error.message}`);
  return data;
}

async function getClient(clientId) {
  const { data, error } = await supabase
    .from('chatbot_clients')
    .select('*')
    .eq('client_id', clientId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get client: ${error.message}`);
  }
  return data || null;
}

async function updateClient(clientId, fields) {
  const { data, error } = await supabase
    .from('chatbot_clients')
    .update(fields)
    .eq('client_id', clientId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update client: ${error.message}`);
  return data;
}

async function deactivateClient(clientId) {
  return updateClient(clientId, { status: 'cancelled' });
}

async function listClients(filters = {}) {
  let query = supabase
    .from('chatbot_clients')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.tier) query = query.eq('tier', filters.tier);
  if (filters.search) query = query.ilike('business_name', `%${filters.search}%`);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list clients: ${error.message}`);
  return data || [];
}

async function clientIdExists(clientId) {
  const { data } = await supabase
    .from('chatbot_clients')
    .select('client_id')
    .eq('client_id', clientId)
    .single();

  return !!data;
}

module.exports = { createClient, getClient, updateClient, deactivateClient, listClients, clientIdExists };
