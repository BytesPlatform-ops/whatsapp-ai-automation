import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { displayName, tenantForUser } from '@/lib/supabase/auth';
import { ProfileView } from '@/components/pixie-lab/ProfileView';

export const metadata: Metadata = {
  title: 'Profile — Pixie Lab',
  description: 'Your Pixie Lab account, workspace and preferences.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export default async function ProfilePage() {
  let user = null;
  if (configured()) {
    try {
      user = (await createClient().auth.getUser()).data.user;
    } catch {
      user = null;
    }
  }
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const role = typeof meta.role === 'string' ? meta.role : 'Workspace owner';

  return (
    <ProfileView
      name={displayName(user)}
      email={user?.email ?? ''}
      tenant={tenantForUser(user)}
      role={role}
    />
  );
}
