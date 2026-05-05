// Test-user helpers — fetch + cleanup.
//
// We DON'T pre-create test users; we let the router's findOrCreateUser
// path do it on the first turn. That keeps the test path identical to
// production. After a fixture finishes (pass or fail), deleteTestUser
// removes the user row plus every related row in conversations,
// classifier_decisions, llm_usage, sites, etc. so test runs don't
// pollute the real DB.

const { supabase } = require('../../src/config/database');

/**
 * Pre-create a test user with a specific state + metadata so a fixture
 * can isolate the regression it cares about, instead of navigating
 * there through N LLM-driven turns (each of which compounds non-
 * determinism). Use when a fixture needs the user to start at e.g.
 * WEB_COLLECT_CONTACT with certain websiteData already filled in —
 * the fixture's first turn then tests THAT specific transition.
 *
 * Caller passes `phone` (use newTestPhone), the desired state, and
 * any metadata fields to seed. Returns the created row.
 */
async function seedUser(phone, { state, metadata, channel } = {}) {
  const row = {
    phone_number: phone,
    channel: channel || 'whatsapp',
    state: state || 'SALES_CHAT',
    metadata: metadata || {},
  };
  const { data, error } = await supabase.from('users').insert(row).select().single();
  if (error) throw new Error(`seedUser: ${error.message}`);
  return data;
}

async function getUserByPhone(phone) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('phone_number', phone)
    .maybeSingle();
  if (error) {
    throw new Error(`getUserByPhone: ${error.message}`);
  }
  return data || null;
}

/**
 * Delete the test user and ALL related rows so the DB is left clean.
 * Tables with `ON DELETE CASCADE` from users.id (e.g. classifier_decisions)
 * clean up automatically; for the rest we issue explicit deletes.
 *
 * Best-effort — failures are logged but don't throw, so a partially
 * failed cleanup doesn't mask the original assertion failure that
 * triggered it.
 */
async function deleteTestUser(userId) {
  if (!userId) return;
  const tables = [
    'classifier_decisions',
    'llm_usage',
    'conversations',
    'meetings',
    'lead_summaries',
    'feedback_signals',
    'feedback_messages',
    'payments',
    'website_audits',
    'generated_sites',
    'form_submissions',
    'appointments',
  ];
  for (const t of tables) {
    try {
      await supabase.from(t).delete().eq('user_id', userId);
    } catch (err) {
      // Some tables may not exist in every environment — silently skip.
      // Real cleanup failures will surface as the user_id row failing
      // its own delete below.
    }
  }
  try {
    await supabase.from('users').delete().eq('id', userId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[test-cleanup] failed to delete user ${userId}: ${err.message}`);
  }
}

/**
 * Build a fresh phone-number string per fixture run. Constrained to
 * <=20 chars because the users.phone_number column is varchar(20).
 * Format: "test_" + 14-char base36 random/timestamp blob = 19 chars.
 *
 * The fixture name is intentionally NOT in the string — there's no
 * room. Identification happens via the conversations + classifier_decisions
 * rows we create immediately after, not the phone string itself.
 */
function newTestPhone(/* fixtureName intentionally unused */) {
  // 14 chars of base36 entropy (timestamp tail + random bits).
  const stamp = Date.now().toString(36).slice(-7);  // ~7 chars
  const rand = Math.floor(Math.random() * 1e10).toString(36).padStart(7, '0').slice(0, 7);  // 7 chars
  // 5 + 7 + 7 = 19 chars (room for the underscore = 20 total — but we
  // omit the underscore to keep a 1-char buffer; 5 + 7 + 7 = 19.)
  return `test_${stamp}${rand}`;
}

module.exports = {
  getUserByPhone,
  deleteTestUser,
  newTestPhone,
  seedUser,
};
