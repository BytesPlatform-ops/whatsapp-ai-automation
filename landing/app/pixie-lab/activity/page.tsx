import { createClient } from '@/lib/supabase/server';
import { tenantForUser } from '@/lib/supabase/auth';
import { ActivityView } from '@/components/pixie-lab/ActivityView';

export const dynamic = 'force-dynamic';
function configured() { return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY); }

export default async function ActivityPage() {
  let user = null;
  if (configured()) { try { user = (await createClient().auth.getUser()).data.user; } catch { user = null; } }
  return <ActivityView tenant={tenantForUser(user)} />;
}
