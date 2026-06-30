import { createClient } from '@/lib/supabase/server';
import { displayName, tenantForUser } from '@/lib/supabase/auth';
import { OmniDashboard } from '@/components/pixie/OmniDashboard';

export const dynamic = 'force-dynamic';
function configured() { return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY); }

export default async function OmniPage() {
  let user = null;
  if (configured()) { try { user = (await createClient().auth.getUser()).data.user; } catch { user = null; } }
  return <OmniDashboard name={displayName(user)} tenant={tenantForUser(user)} nowMs={Date.now()} />;
}
