import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { tenantForUser } from '@/lib/supabase/auth';
import { ServiceView } from '@/components/pixie-lab/ServiceView';
import { MetaConnectCard } from '@/components/pixie-lab/marketing/MetaConnectCard';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Marketing — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export default async function MarketingPage() {
  const guard = await guardPermission('marketing.view');
  if (!guard.ok) return <AccessRestricted what="Marketing" />;

  let user = null;
  if (configured()) {
    try { user = (await createClient().auth.getUser()).data.user; } catch { user = null; }
  }
  return (
    <>
      {/* Meta integration entry (Connect Meta + status) — above the existing
          marketing overview, which is left exactly as-is. */}
      <MetaConnectCard />
      <ServiceView agent="marketing" tenant={tenantForUser(user)} nowMs={Date.now()} />
    </>
  );
}
