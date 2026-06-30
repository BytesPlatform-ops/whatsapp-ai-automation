import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { tenantForUser } from '@/lib/supabase/auth';
import { TrialUnlock } from '@/components/pixie-lab/TrialUnlock';
import type { FeedAgent } from '@/lib/pixie-lab/feed';

export const dynamic = 'force-dynamic';

const VALID: FeedAgent[] = ['website', 'receptionist', 'seo', 'marketing', 'content'];

function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export default async function TrialPage({ params }: { params: { agent: string } }) {
  if (!VALID.includes(params.agent as FeedAgent)) notFound();
  let user = null;
  if (configured()) {
    try { user = (await createClient().auth.getUser()).data.user; } catch { user = null; }
  }
  return <TrialUnlock agent={params.agent as FeedAgent} tenant={tenantForUser(user)} />;
}
