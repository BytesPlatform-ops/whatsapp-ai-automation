import { createClient } from '@/lib/supabase/server';
import { tenantForUser } from '@/lib/supabase/auth';
import { ApprovalsView } from '@/components/pixie-lab/ApprovalsView';

export const dynamic = 'force-dynamic';
function configured() { return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY); }

export default async function ApprovalsPage() {
  let user = null;
  if (configured()) { try { user = (await createClient().auth.getUser()).data.user; } catch { user = null; } }
  return <ApprovalsView tenant={tenantForUser(user)} />;
}
