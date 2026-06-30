'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { AgentDashboard } from '@/components/pixie-lab/AgentDashboard';
import { useEntitlements } from '@/lib/pixie-lab/useEntitlements';
import { getAgentBySlug } from '@/lib/agents';
import type { FeedAgent } from '@/lib/pixie-lab/feed';

/**
 * AppAgentWorkspace — the canonical /app/agents/<slug> destination. Resolves the
 * agent through the registry (so the slug can never mismatch the backend key),
 * activates it in trial/setup mode on arrival if it isn't already enabled, then
 * renders the agent dashboard. This is where the signup → verify flow lands.
 */
export function AppAgentWorkspace({ slug, tenant, nowMs }: { slug: string; tenant: string; nowMs: number }) {
  const agent = getAgentBySlug(slug);
  const backendKey = (agent?.backendKey ?? '') as FeedAgent;
  const { stateOf, activate } = useEntitlements(tenant);
  const did = useRef(false);

  // Activate the selected agent in trial/setup mode, once. No payment.
  useEffect(() => {
    if (did.current || !backendKey) return;
    if (stateOf(backendKey) === 'locked') {
      did.current = true;
      activate(backendKey);
    }
  }, [backendKey, stateOf, activate]);

  return (
    <div className="min-h-screen bg-[#02070a] text-white">
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#02070a]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-2.5 font-display text-base font-extrabold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#25D366] to-[#22d3ee] text-[#02070a]"><Sparkles size={16} strokeWidth={2.5} /></span>
            Pixie
          </Link>
          <Link href="/app/dashboard" className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-white/75 transition hover:text-white">
            <ArrowLeft size={14} /> All agents
          </Link>
        </div>
      </header>

      {backendKey ? (
        <AgentDashboard agent={backendKey} tenant={tenant} nowMs={nowMs} />
      ) : (
        <div className="mx-auto max-w-md px-5 py-24 text-center">
          <p className="font-display text-xl font-bold">Agent not found</p>
          <p className="mt-2 text-sm text-white/50">That agent doesn’t exist. Head back to your dashboard.</p>
          <Link href="/app/dashboard" className="mt-5 inline-block rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-[#02070a]">Go to dashboard</Link>
        </div>
      )}
    </div>
  );
}
