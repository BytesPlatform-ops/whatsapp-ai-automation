import { Suspense } from 'react';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { tenantForUser, displayName } from '@/lib/supabase/auth';
import { DashboardView } from '@/components/dashboard/DashboardView';

export const metadata: Metadata = {
  title: 'Dashboard — Pixie Lab',
  description: 'Your Pixie command center — every AI agent in one place.',
  robots: { index: false, follow: false },
};

// Always render per-request (reads the signed-in user).
export const dynamic = 'force-dynamic';

function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export default async function PixieLabDashboardPage({
  searchParams,
}: {
  searchParams: { tenant?: string };
}) {
  let user = null;
  if (configured()) {
    try {
      user = (await createClient().auth.getUser()).data.user;
    } catch {
      user = null;
    }
  }

  const tenant = searchParams.tenant || tenantForUser(user);

  const intendedAgent =
    typeof (user?.user_metadata as Record<string, unknown> | undefined)?.intended_agent === 'string'
      ? ((user!.user_metadata as Record<string, string>).intended_agent)
      : undefined;

  return (
    <Suspense fallback={null}>
      <DashboardView
        tenant={tenant}
        name={displayName(user)}
        email={user?.email ?? ''}
        authed={Boolean(user)}
        intendedAgent={intendedAgent}
      />
    </Suspense>
  );
}
