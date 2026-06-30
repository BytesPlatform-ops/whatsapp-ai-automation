import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { tenantForUser } from '@/lib/supabase/auth';
import { AppAgentWorkspace } from '@/components/agents/AppAgentWorkspace';
import { getAgentBySlug } from '@/lib/agents';

export const dynamic = 'force-dynamic';

function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export default async function AppAgentPage({ params }: { params: { slug: string } }) {
  if (!getAgentBySlug(params.slug)) notFound();
  let user = null;
  if (configured()) {
    try { user = (await createClient().auth.getUser()).data.user; } catch { user = null; }
  }
  return <AppAgentWorkspace slug={params.slug} tenant={tenantForUser(user)} nowMs={Date.now()} />;
}
