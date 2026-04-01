const { supabase } = require('../config/database');

async function createAudit(userId, url) {
  const { data, error } = await supabase
    .from('website_audits')
    .insert({ user_id: userId, url, status: 'pending' })
    .select()
    .single();

  if (error) throw new Error(`Failed to create audit: ${error.message}`);
  return data;
}

async function updateAudit(auditId, fields) {
  const { error } = await supabase
    .from('website_audits')
    .update(fields)
    .eq('id', auditId);

  if (error) throw new Error(`Failed to update audit: ${error.message}`);
}

async function getLatestAudit(userId) {
  const { data, error } = await supabase
    .from('website_audits')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get audit: ${error.message}`);
  }
  return data || null;
}

module.exports = { createAudit, updateAudit, getLatestAudit };
