import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { displayName, tenantForUser } from '@/lib/supabase/auth';
import { SettingsView } from '@/components/pixie-lab/AccountViews';

export const metadata: Metadata = { title: 'Settings — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export default async function SettingsPage() {
  let user = null;
  if (configured()) { try { user = (await createClient().auth.getUser()).data.user; } catch { user = null; } }
  return <SettingsView name={displayName(user)} email={user?.email ?? ''} tenant={tenantForUser(user)} />;
}
