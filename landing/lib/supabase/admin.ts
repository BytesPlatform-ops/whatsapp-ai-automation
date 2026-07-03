import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client (server-only). Bypasses RLS and can read the
 * auth schema via the GoTrue admin API — used as a resilient fallback for
 * account-existence checks when the Prisma direct connection is unavailable.
 * NEVER import from client components; the service-role key must never ship to
 * the browser.
 */
let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (cached) return cached;
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

/**
 * Existence check via the GoTrue admin API. supabase-js has no getUserByEmail,
 * so we page through admin.listUsers and match locally. Bounded to a sane number
 * of pages so it can't run away on a large tenant; returns null (unknown) if the
 * admin client isn't configured or the scan is exhausted without a definitive
 * answer, so the caller can fall back rather than treat "not found" as truth.
 */
export async function emailExistsViaAdmin(email: string): Promise<boolean | null> {
  const admin = supabaseAdmin();
  if (!admin) return null;
  const target = email.trim().toLowerCase();
  if (!target) return false;

  const PER_PAGE = 1000;
  const MAX_PAGES = 20; // up to 20k users before we give up and report unknown
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) return null;
    const users = data?.users ?? [];
    if (users.some((u) => (u.email ?? '').toLowerCase() === target)) return true;
    if (users.length < PER_PAGE) return false; // last page, not found
  }
  return null; // exhausted the cap without certainty
}
