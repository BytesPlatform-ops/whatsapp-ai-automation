'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';
import { getAgentDashboardPath } from '@/lib/agents';

/**
 * AgentStartButton — the public agent-page CTA. On click it routes by auth state:
 *   not signed in        → /signup?agent=<slug>&redirect=<dashboard?agent>
 *   signed in, unverified → /verify-email?agent=<slug>
 *   signed in, verified   → /dashboard?agent=<key>   (no payment)
 *
 * Uses Supabase (the configured auth). When Supabase isn't set up (local without
 * keys), it falls through to /signup so the flow is still demonstrable.
 */
export function AgentStartButton({
  agentSlug,
  label,
  className,
  size = 'lg',
}: {
  agentSlug: string;
  label?: string;
  className?: string;
  size?: 'md' | 'lg';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    const redirect = getAgentDashboardPath(agentSlug);
    try {
      if (!supabaseConfigured()) {
        router.push(`/signup?agent=${encodeURIComponent(agentSlug)}&redirect=${encodeURIComponent(redirect)}`);
        return;
      }
      const { data } = await createClient().auth.getUser();
      const user = data.user;
      if (!user) {
        router.push(`/signup?agent=${encodeURIComponent(agentSlug)}&redirect=${encodeURIComponent(redirect)}`);
      } else if (!user.email_confirmed_at) {
        router.push(`/verify-email?agent=${encodeURIComponent(agentSlug)}`);
      } else {
        router.push(redirect);
      }
    } finally {
      setBusy(false);
    }
  }

  const sizeCls = size === 'lg' ? 'h-12 px-6 text-[15px]' : 'h-11 px-5 text-sm';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={
        className ??
        `inline-flex ${sizeCls} items-center justify-center gap-2 rounded-full font-semibold text-[#02070a] transition-transform hover:-translate-y-0.5 disabled:opacity-70`
      }
      style={className ? undefined : { background: 'var(--accent, #25D366)', boxShadow: '0 12px 36px color-mix(in srgb, var(--accent, #25D366) 26%, transparent)' }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{label ?? 'Start with Pixie'} <ArrowRight className="h-4 w-4" /></>}
    </button>
  );
}
