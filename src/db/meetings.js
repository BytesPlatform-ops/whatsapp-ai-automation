const { supabase } = require('../config/database');

async function createMeeting(userId, phoneNumber, topic) {
  const { data, error } = await supabase
    .from('meetings')
    .insert({ user_id: userId, phone_number: phoneNumber, topic, status: 'pending' })
    .select()
    .single();

  if (error) throw new Error(`Failed to create meeting: ${error.message}`);
  return data;
}

async function updateMeeting(meetingId, fields) {
  const { data, error } = await supabase
    .from('meetings')
    .update(fields)
    .eq('id', meetingId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update meeting: ${error.message}`);
  return data;
}

async function getLatestMeeting(userId) {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(`Failed to get meeting: ${error.message}`);
  return data || null;
}

module.exports = { createMeeting, updateMeeting, getLatestMeeting };
