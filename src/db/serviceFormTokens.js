const crypto = require('crypto');
const { supabase } = require('../config/database');
const { withRetry, throwIfNetworkError } = require('./retry');

const TOKEN_TTL_HOURS = 24;
const TOKEN_LENGTH = 6;
// base32-ish alphabet: digits + lowercase, minus look-alikes (0/o, 1/l/i)
// so the token reads cleanly in a WhatsApp message.
const TOKEN_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

function generateShortToken() {
  const bytes = crypto.randomBytes(TOKEN_LENGTH);
  let out = '';
  for (let i = 0; i < TOKEN_LENGTH; i += 1) {
    out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

async function createToken(userId, industry) {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();
  // 31^6 = ~887M combinations; collisions are vanishingly rare against the
  // ~tens of active tokens at any time, but retry a few times on insert
  // failure just in case Postgres bounces a unique-key conflict.
  const MAX_ATTEMPTS = 5;
  let lastErr = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const token = generateShortToken();
    try {
      return await withRetry(async () => {
        const { data, error } = await supabase
          .from('service_form_tokens')
          .insert({ token, user_id: userId, industry, expires_at: expiresAt })
          .select()
          .single();
        throwIfNetworkError(error);
        if (error) throw new Error(`Failed to create service form token: ${error.message}`);
        return data;
      }, 'serviceFormTokens:create');
    } catch (err) {
      lastErr = err;
      if (!/duplicate|unique|conflict/i.test(String(err.message))) throw err;
    }
  }
  throw new Error(`Failed to mint unique form token after ${MAX_ATTEMPTS} attempts: ${lastErr?.message}`);
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
