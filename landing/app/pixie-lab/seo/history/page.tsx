import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { tenantForUser } from '@/lib/supabase/auth';
import { SeoWorkspace } from '@/components/pixie-lab/seo/SeoWorkspace';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';

export const metadata: Metadata = { title: 'SEO History — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export default async function SeoHistoryPage() {
  const guard = await guardPermission('seo.view');
  if (!guard.ok) return <AccessRestricted what="SEO" />;

  let user = null;
  if (configured()) {
    try { user = (await createClient().auth.getUser()).data.user; } catch { user = null; }
  }
  return <SeoWorkspace tab="history" tenant={tenantForUser(user)} />;
}
