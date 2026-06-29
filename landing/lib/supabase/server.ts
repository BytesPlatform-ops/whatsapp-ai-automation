import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Server Supabase client (App Router / RSC + route handlers). Reads & writes
 *  the auth cookies via next/headers. */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore; the middleware
            // refreshes the session cookie on the next request.
          }
        },
      },
    },
  );
}
