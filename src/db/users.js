const { supabase } = require('../config/database');

async function findOrCreateUser(phoneNumber, channel = 'whatsapp') {
  // Try to find existing user by phone/ID + channel
  const { data: existing, error: findError } = await supabase
    .from('users')
    .select('*')
    .eq('phone_number', phoneNumber)
    .eq('channel', channel)
    .single();

  if (existing) return existing;

  // Create new user
  const { data: newUser, error: createError } = await supabase
    .from('users')
    .insert({ phone_number: phoneNumber, channel, state: 'WELCOME' })
    .select()
    .single();

  if (createError) throw new Error(`Failed to create user: ${createError.message}`);
  return newUser;
}

async function updateUserState(userId, state) {
  const { error } = await supabase
    .from('users')
    .update({ state })
    .eq('id', userId);

  if (error) throw new Error(`Failed to update user state: ${error.message}`);
}

async function updateUserMetadata(userId, metadata) {
  // Merge with existing metadata
  const { data: user, error: fetchError } = await supabase
    .from('users')
    .select('metadata')
    .eq('id', userId)
    .single();

  if (fetchError) throw new Error(`Failed to fetch user: ${fetchError.message}`);

  const merged = { ...(user.metadata || {}), ...metadata };

  const { error } = await supabase
    .from('users')
    .update({ metadata: merged })
    .eq('id', userId);

  if (error) throw new Error(`Failed to update user metadata: ${error.message}`);
}

async function updateUser(userId, fields) {
  const { error } = await supabase
    .from('users')
    .update(fields)
    .eq('id', userId);

  if (error) throw new Error(`Failed to update user: ${error.message}`);
}

module.exports = { findOrCreateUser, updateUserState, updateUserMetadata, updateUser };
