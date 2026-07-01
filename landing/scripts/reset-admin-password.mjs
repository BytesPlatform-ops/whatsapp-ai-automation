#!/usr/bin/env node
/**
 * Reset (or create) the Pixie admin-panel user's password.
 *
 * The admin panel signs in via Supabase Auth (signInWithPassword) and only lets
 * through emails on ADMIN_EMAILS. This script uses the SERVICE-ROLE key to set a
 * password directly — no recovery email round-trip. Run it locally only; the
 * service-role key must never reach a browser.
 *
 *   Usage:
 *     node scripts/reset-admin-password.mjs <email> <new-password>
 *     node scripts/reset-admin-password.mjs                      # prompts interactively
 *
 *   Env (read from landing/.env.local, or the current environment):
 *     NEXT_PUBLIC_SUPABASE_URL
 *     SUPABASE_SERVICE_ROLE_KEY
 *
 * Examples:
 *   node scripts/reset-admin-password.mjs bytesuite@bytesplatform.com 'S0me-Strong-Pass!'
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Minimal .env loader — fills process.env without overwriting existing vars. */
function loadEnvFile(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return; // file is optional; env may already be set
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (val.startsWith('#')) continue;
    // strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// landing/.env.local sits one level up from scripts/.
loadEnvFile(resolve(__dirname, '..', '.env.local'));

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE_KEY) {
  console.error(
    '✖ Missing env. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY\n' +
      '  (looked in landing/.env.local and the current environment).',
  );
  process.exit(1);
}

async function prompt(question, { mask = false } = {}) {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  if (!mask) {
    const answer = await rl.question(question);
    rl.close();
    return answer.trim();
  }
  // Masked input for the password.
  const onData = () => {
    // Re-render the prompt with no echoed characters.
    stdout.write(`\r${question}`);
  };
  stdin.on('data', onData);
  const answer = await rl.question(question);
  stdin.off('data', onData);
  rl.close();
  stdout.write('\n');
  return answer.trim();
}

async function main() {
  let [, , email, password] = process.argv;

  if (!email) email = await prompt('Admin email: ');
  if (!email) {
    console.error('✖ Email is required.');
    process.exit(1);
  }
  email = email.trim().toLowerCase();

  if (!password) password = await prompt(`New password for ${email}: `, { mask: true });
  if (!password || password.length < 8) {
    console.error('✖ Password must be at least 8 characters.');
    process.exit(1);
  }

  const supabase = createClient(URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Find the existing user by paging through the admin user list.
  console.log(`→ Looking up ${email} …`);
  let existing = null;
  for (let page = 1; page <= 50 && !existing; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error('✖ Could not list users:', error.message);
      process.exit(1);
    }
    existing = data.users.find((u) => (u.email || '').toLowerCase() === email) || null;
    if (data.users.length < 200) break; // last page
  }

  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) {
      console.error('✖ Failed to update password:', error.message);
      process.exit(1);
    }
    console.log(`✓ Password reset for existing user ${email} (id ${existing.id}).`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      console.error('✖ Failed to create user:', error.message);
      process.exit(1);
    }
    console.log(`✓ Created new admin user ${email} (id ${data.user.id}).`);
  }

  const allowlist = (process.env.ADMIN_EMAILS || 'bytesuite@bytesplatform.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allowlist.includes(email)) {
    console.warn(
      `\n⚠ ${email} is NOT on ADMIN_EMAILS (${allowlist.join(', ') || 'empty'}).\n` +
        '  They can sign in but will see "Not authorized" until you add the email\n' +
        '  to ADMIN_EMAILS in the deployment env (Vercel).',
    );
  }

  console.log('\nDone. Sign in at /admin-panel/login with this email + password.');
}

main().catch((err) => {
  console.error('✖ Unexpected error:', err?.message || err);
  process.exit(1);
});
