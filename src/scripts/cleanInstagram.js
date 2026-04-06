/**
 * One-time script to remove all Instagram conversations and users from the database.
 * Run with: node src/scripts/cleanInstagram.js
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function clean() {
  // 1. Get all Instagram user IDs
  const { data: users, error: userErr } = await supabase
    .from('users')
    .select('id, phone_number')
    .eq('channel', 'instagram');

  if (userErr) {
    console.error('Failed to fetch Instagram users:', userErr);
    return;
  }

  if (!users || users.length === 0) {
    console.log('No Instagram users found.');
    return;
  }

  const userIds = users.map(u => u.id);
  console.log(`Found ${users.length} Instagram users:`, users.map(u => u.phone_number));

  // 2. Delete their conversations
  const { error: convErr, count: convCount } = await supabase
    .from('conversations')
    .delete({ count: 'exact' })
    .in('user_id', userIds);

  if (convErr) {
    console.error('Failed to delete conversations:', convErr);
    return;
  }
  console.log(`Deleted ${convCount} conversation messages.`);

  // 3. Delete related generated_sites
  const { error: sitesErr } = await supabase
    .from('generated_sites')
    .delete()
    .in('user_id', userIds);

  if (sitesErr) console.warn('Sites deletion (may not exist):', sitesErr.message);

  // 4. Delete related meetings
  const { error: meetErr } = await supabase
    .from('meetings')
    .delete()
    .eq('channel', 'instagram');

  if (meetErr) console.warn('Meetings deletion (may not exist):', meetErr.message);

  // 5. Delete the Instagram users
  const { error: delErr, count: delCount } = await supabase
    .from('users')
    .delete({ count: 'exact' })
    .eq('channel', 'instagram');

  if (delErr) {
    console.error('Failed to delete users:', delErr);
    return;
  }
  console.log(`Deleted ${delCount} Instagram users.`);
  console.log('Done!');
}

clean().catch(console.error);
