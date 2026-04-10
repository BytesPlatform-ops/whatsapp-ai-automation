const { supabase } = require('../config/database');
const { withRetry, throwIfNetworkError } = require('./retry');

async function findOrCreateUser(phoneNumber, channel = 'whatsapp') {
  // Try to find existing user by phone/ID + channel.
  // Use .maybeSingle() so 0 rows returns { data: null } instead of an error.
  const existing = await withRetry(async () => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone_number', phoneNumber)
      .eq('channel', channel)
      .maybeSingle();
    throwIfNetworkError(error);
    return data;
  }, 'findOrCreateUser:select');

  if (existing) return existing;

  // Create new user
  let createError = null;
  const newUser = await withRetry(async () => {
    const { data, error } = await supabase
      .from('users')
      .insert({ phone_number: phoneNumber, channel, state: 'WELCOME' })
      .select()
      .single();
    throwIfNetworkError(error);
    createError = error; // capture non-network errors (e.g. unique violation)
    return data;
  }, 'findOrCreateUser:insert');

  if (newUser) return newUser;

  // Race condition: another concurrent webhook created the user between our
  // SELECT and INSERT. Postgres unique-violation code is 23505. Re-fetch and return.
  if (createError && createError.code === '23505') {
    const retryUser = await withRetry(async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('phone_number', phoneNumber)
        .eq('channel', channel)
        .maybeSingle();
      throwIfNetworkError(error);
      return data;
    }, 'findOrCreateUser:retry-select');
    if (retryUser) return retryUser;
  }

  throw new Error(`Failed to create user: ${createError?.message || 'unknown error'}`);
}

async function updateUserState(userId, state) {
  await withRetry(async () => {
    const { error } = await supabase
      .from('users')
      .update({ state })
      .eq('id', userId);
    throwIfNetworkError(error);
    if (error) throw new Error(`Failed to update user state: ${error.message}`);
  }, 'updateUserState');
}

async function updateUserMetadata(userId, metadata) {
  await withRetry(async () => {
    // Merge with existing metadata
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('metadata')
      .eq('id', userId)
      .single();
    throwIfNetworkError(fetchError);
    if (fetchError) throw new Error(`Failed to fetch user: ${fetchError.message}`);

    const merged = { ...(user.metadata || {}), ...metadata };

    const { error } = await supabase
      .from('users')
      .update({ metadata: merged })
      .eq('id', userId);
    throwIfNetworkError(error);
    if (error) throw new Error(`Failed to update user metadata: ${error.message}`);
  }, 'updateUserMetadata');
}

async function updateUser(userId, fields) {
  await withRetry(async () => {
    const { error } = await supabase
      .from('users')
      .update(fields)
      .eq('id', userId);
    throwIfNetworkError(error);
    if (error) throw new Error(`Failed to update user: ${error.message}`);
  }, 'updateUser');
}

module.exports = { findOrCreateUser, updateUserState, updateUserMetadata, updateUser };
