'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** Who may mutate data. Mirrors the gate in page.tsx. */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || 'bytesuite@bytesplatform.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Delete one waitlist response. Re-verifies the caller server-side — the
 * service-role client bypasses RLS, so the auth + allowlist check here is the
 * only thing standing between a request and a delete. Never trust the client.
 */
export async function deleteLead(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!id || typeof id !== 'string') return { ok: false, error: 'Invalid id.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  if (!adminEmails().includes((user.email || '').toLowerCase())) {
    return { ok: false, error: 'Not authorized.' };
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: 'Server not configured.' };

  const { error } = await admin.from('waitlist_responses').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin-panel');
  return { ok: true };
}
