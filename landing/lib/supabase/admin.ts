import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client — bypasses Row Level Security, so it can read &
 * write the `waitlist_responses` table that anon/auth users are locked out of.
 *
 * SERVER ONLY. Never import this into a Client Component — the `server-only`
 * guard above turns that into a build error. The service-role key must never
 * reach the browser.
 *
 * Returns null when env isn't configured so callers can degrade gracefully.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
