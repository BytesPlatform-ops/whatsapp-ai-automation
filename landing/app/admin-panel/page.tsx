import { redirect } from 'next/navigation';
import { ShieldX } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fetchLeads } from '@/lib/waitlistStore';
import { AdminClient } from './AdminClient';
import { SignOutButton } from './SignOutButton';

export const dynamic = 'force-dynamic';

/** Who may view the panel. Comma-separated emails in ADMIN_EMAILS. */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || 'bytesuite@bytesplatform.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export default async function AdminPanelPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already redirects unauthenticated users, but guard here too.
  if (!user) redirect('/admin-panel/login');

  const email = (user.email || '').toLowerCase();
  if (!adminEmails().includes(email)) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/70 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30">
            <ShieldX className="h-6 w-6" strokeWidth={2.2} />
          </div>
          <h1 className="text-lg font-semibold text-white">Not authorized</h1>
          <p className="mt-1 text-sm text-slate-400">
            <span className="text-slate-300">{email}</span> isn’t on the admin allowlist.
          </p>
          <div className="mt-6 flex justify-center">
            <SignOutButton />
          </div>
        </div>
      </main>
    );
  }

  const leads = await fetchLeads();
  return <AdminClient leads={leads} adminEmail={email} />;
}
