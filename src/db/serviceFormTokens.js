const crypto = require('crypto');
const { supabase } = require('../config/database');
const { withRetry, throwIfNetworkError } = require('./retry');

const TOKEN_TTL_HOURS = 24;

async function createToken(userId, industry) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('service_form_tokens')
      .insert({ token, user_id: userId, industry, expires_at: expiresAt })
      .select()
      .single();
    throwIfNetworkError(error);
    if (error) throw new Error(`Failed to create service form token: ${error.message}`);
    return data;
  }, 'serviceFormTokens:create');
}

async function getActiveToken(token) {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('service_form_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    throwIfNetworkError(error);
    return data || null;
  }, 'serviceFormTokens:get');
}

async function markSubmitted(token) {
  return withRetry(async () => {
    const { error } = await supabase
      .from('service_form_tokens')
      .update({ submitted_at: new Date().toISOString() })
      .eq('token', token)
      .is('submitted_at', null);
    throwIfNetworkError(error);
    if (error) throw new Error(`Failed to mark token submitted: ${error.message}`);
  }, 'serviceFormTokens:markSubmitted');
}

module.exports = { createToken, getActiveToken, markSubmitted };
