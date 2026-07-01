import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { tenantForUser } from '@/lib/supabase/auth';
import { ServiceView } from '@/components/pixie-lab/ServiceView';

export const metadata: Metadata = { title: 'Website — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export default async function WebsitePage() {
  let user = null;
  if (configured()) {
    try { user = (await createClient().auth.getUser()).data.user; } catch { user = null; }
  }
  return <ServiceView agent="website" tenant={tenantForUser(user)} nowMs={Date.now()} />;
}
