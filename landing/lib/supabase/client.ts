'use client';

import { createBrowserClient } from '@supabase/ssr';

/** Are the Supabase env vars present? Lets the UI degrade gracefully before
 *  the project owner adds NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY to the env. */
export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Browser Supabase client (cookie-based session, shared with the server via
 *  @supabase/ssr). Call inside client components. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
