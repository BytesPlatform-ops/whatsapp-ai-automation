const { supabase } = require('../config/database');

async function createSite(userId, templateId = 'business-starter') {
  const { data, error } = await supabase
    .from('generated_sites')
    .insert({ user_id: userId, template_id: templateId, status: 'collecting' })
    .select()
    .single();

  if (error) throw new Error(`Failed to create site: ${error.message}`);
  return data;
}

async function updateSite(siteId, fields) {
  const { error } = await supabase
    .from('generated_sites')
    .update(fields)
    .eq('id', siteId);

  if (error) throw new Error(`Failed to update site: ${error.message}`);
}

async function getLatestSite(userId) {
  const { data, error } = await supabase
    .from('generated_sites')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get site: ${error.message}`);
  }
  return data || null;
}

module.exports = { createSite, updateSite, getLatestSite };
