const { supabase } = require('../config/database');
const { withRetry, throwIfNetworkError } = require('./retry');

/**
 * Look up or create the user for an inbound message.
 *
 * Identity key is (phone_number, channel, via_phone_number_id) — so the same
 * customer texting two different WhatsApp business numbers gets two separate
 * user rows with independent state/history. `via_phone_number_id` is
 * whichever of OUR numbers received the message.
 *
 * Legacy auto-adoption: if no exact match is found, we try a legacy row with
 * via_phone_number_id = NULL (pre-migration data). If one exists, we adopt it
 * onto the current line by backfilling via_phone_number_id and return it.
 * Ensures existing customers don't lose their session on the first inbound
 * after this migration ships.
 */
async function findOrCreateUser(phoneNumber, channel = 'whatsapp', viaPhoneNumberId = null) {
  const normalisedVia = viaPhoneNumberId || null;

  // 1. Exact match on (phone, channel, via).
  const exact = await selectUser(phoneNumber, channel, normalisedVia);
  if (exact) return exact;

  // 2. Legacy adoption: if a pre-migration row exists with via IS NULL and we
  //    have a concrete viaPhoneNumberId this turn, claim it onto this line.
  if (normalisedVia) {
    const legacy = await selectUser(phoneNumber, channel, null);
    if (legacy) {
      const adopted = await withRetry(async () => {
        const { data, error } = await supabase
          .from('users')
          .update({ via_phone_number_id: normalisedVia })
          .eq('id', legacy.id)
          // Double-check nobody raced us to it.
          .is('via_phone_number_id', null)
          .select()
          .maybeSingle();
        throwIfNetworkError(error);
        return data;
      }, 'findOrCreateUser:adopt-legacy');
      if (adopted) return adopted;
      // Race — someone else adopted this legacy row on another line.
      // Fall through to create a fresh row for this line.
    }
  }

  // 3. Create new row for this line.
  let createError = null;
  const newUser = await withRetry(async () => {
    const { data, error } = await supabase
      .from('users')
      .insert({
        phone_number: phoneNumber,
        channel,
        via_phone_number_id: normalisedVia,
        state: 'WELCOME',
      })
      .select()
      .single();
    throwIfNetworkError(error);
    createError = error;
    return data;
  }, 'findOrCreateUser:insert');

  if (newUser) return newUser;

  // Race condition: another concurrent webhook created the row between our
  // SELECT and INSERT. Unique-violation → re-fetch and return.
  if (createError && createError.code === '23505') {
    const retryUser = await selectUser(phoneNumber, channel, normalisedVia);
    if (retryUser) return retryUser;
  }

  throw new Error(`Failed to create user: ${createError?.message || 'unknown error'}`);
}

// Use COALESCE(via_phone_number_id, '') to treat NULL and undefined
// consistently — matches the Postgres unique index definition so the
// app-side lookup semantics equal the DB-side uniqueness.
async function selectUser(phoneNumber, channel, viaPhoneNumberId) {
  return withRetry(async () => {
    let q = supabase
      .from('users')
      .select('*')
      .eq('phone_number', phoneNumber)
      .eq('channel', channel);
    q = viaPhoneNumberId === null
      ? q.is('via_phone_number_id', null)
      : q.eq('via_phone_number_id', viaPhoneNumberId);
    const { data, error } = await q.maybeSingle();
    throwIfNetworkError(error);
    return data;
  }, 'findOrCreateUser:select');
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
