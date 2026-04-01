const { supabase } = require('../../config/database');

async function incrementAnalytics(clientId, fields) {
  const today = new Date().toISOString().split('T')[0];

  // Try to get existing row for today
  const { data: existing } = await supabase
    .from('chatbot_analytics')
    .select('*')
    .eq('client_id', clientId)
    .eq('date', today)
    .single();

  if (existing) {
    const updates = {};
    if (fields.conversations) updates.total_conversations = existing.total_conversations + fields.conversations;
    if (fields.messages) updates.total_messages = existing.total_messages + fields.messages;
    if (fields.leads) updates.leads_captured = existing.leads_captured + fields.leads;
    if (fields.visitors) updates.unique_visitors = existing.unique_visitors + fields.visitors;

    const { error } = await supabase
      .from('chatbot_analytics')
      .update(updates)
      .eq('id', existing.id);

    if (error) throw new Error(`Failed to update analytics: ${error.message}`);
  } else {
    const { error } = await supabase
      .from('chatbot_analytics')
      .insert({
        client_id: clientId,
        date: today,
        total_conversations: fields.conversations || 0,
        total_messages: fields.messages || 0,
        leads_captured: fields.leads || 0,
        unique_visitors: fields.visitors || 0,
      });

    if (error) throw new Error(`Failed to create analytics: ${error.message}`);
  }
}

async function getAnalytics(clientId, days = 30) {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  const { data, error } = await supabase
    .from('chatbot_analytics')
    .select('*')
    .eq('client_id', clientId)
    .gte('date', sinceDate.toISOString().split('T')[0])
    .order('date', { ascending: true });

  if (error) throw new Error(`Failed to get analytics: ${error.message}`);
  return data || [];
}

async function getAnalyticsSummary(clientId, days = 30) {
  const rows = await getAnalytics(clientId, days);

  return {
    total_conversations: rows.reduce((s, r) => s + r.total_conversations, 0),
    total_messages: rows.reduce((s, r) => s + r.total_messages, 0),
    leads_captured: rows.reduce((s, r) => s + r.leads_captured, 0),
    unique_visitors: rows.reduce((s, r) => s + r.unique_visitors, 0),
    daily: rows,
  };
}

async function getGlobalAnalytics() {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [todayRes, weekRes, monthRes, clientsRes] = await Promise.all([
    supabase.from('chatbot_analytics').select('total_conversations, total_messages, leads_captured').eq('date', today),
    supabase.from('chatbot_analytics').select('total_conversations, total_messages, leads_captured').gte('date', weekAgo.toISOString().split('T')[0]),
    supabase.from('chatbot_analytics').select('total_conversations, total_messages, leads_captured').gte('date', monthAgo.toISOString().split('T')[0]),
    supabase.from('chatbot_clients').select('client_id, tier, status'),
  ]);

  const sum = (rows, field) => (rows || []).reduce((s, r) => s + (r[field] || 0), 0);
  const clients = clientsRes.data || [];

  return {
    today: {
      conversations: sum(todayRes.data, 'total_conversations'),
      messages: sum(todayRes.data, 'total_messages'),
      leads: sum(todayRes.data, 'leads_captured'),
    },
    week: {
      conversations: sum(weekRes.data, 'total_conversations'),
      messages: sum(weekRes.data, 'total_messages'),
      leads: sum(weekRes.data, 'leads_captured'),
    },
    month: {
      conversations: sum(monthRes.data, 'total_conversations'),
      messages: sum(monthRes.data, 'total_messages'),
      leads: sum(monthRes.data, 'leads_captured'),
    },
    clients: {
      total: clients.length,
      active: clients.filter(c => c.status === 'active').length,
      trial: clients.filter(c => c.status === 'trial').length,
      demo: clients.filter(c => c.status === 'demo').length,
      by_tier: {
        starter: clients.filter(c => c.tier === 'starter').length,
        growth: clients.filter(c => c.tier === 'growth').length,
        premium: clients.filter(c => c.tier === 'premium').length,
      },
    },
  };
}

module.exports = { incrementAnalytics, getAnalytics, getAnalyticsSummary, getGlobalAnalytics };
