import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { tenantForUser } from '@/lib/supabase/auth';
import { ContentWorkspace } from '@/components/pixie-lab/content/ContentWorkspace';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';

export const metadata: Metadata = {
  title: 'Content Library — Pixie Lab',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export default async function ContentLibraryPage() {
  const guard = await guardPermission('content.view');
  if (!guard.ok) return <AccessRestricted what="Content" />;

  let user = null;
  if (configured()) {
    try { user = (await createClient().auth.getUser()).data.user; } catch { user = null; }
  }
  return <ContentWorkspace tab="library" tenant={tenantForUser(user)} />;
}
