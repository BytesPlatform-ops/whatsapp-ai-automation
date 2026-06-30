import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { displayName, tenantForUser } from '@/lib/supabase/auth';
import { ForYou } from '@/components/pixie-lab/ForYou';

export const metadata: Metadata = {
  title: 'For You — Pixie Lab',
  description: 'Pixie proactively surfaces the next best actions for your business.',
  robots: { index: false, follow: false },
};

// Reads the signed-in user for the greeting; render per-request.
export const dynamic = 'force-dynamic';

function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export default async function ForYouPage({ searchParams }: { searchParams: { tenant?: string } }) {
  let user = null;
  if (configured()) {
    try {
      user = (await createClient().auth.getUser()).data.user;
    } catch {
      user = null;
    }
  }
  // `now` is stamped server-side so TrialBadge countdown is deterministic on first paint.
  // A ?tenant override stays available for demos/local use without auth.
  return <ForYou name={displayName(user)} tenant={searchParams.tenant || tenantForUser(user)} nowMs={Date.now()} />;
}
