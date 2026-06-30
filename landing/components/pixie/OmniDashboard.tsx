'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { ForYou } from '@/components/pixie-lab/ForYou';
import { OpenFullServiceButton } from '@/components/pixie/OpenFullServiceButton';

/**
 * OmniDashboard — /app/omni. The central Pixie brain: a header that opens the
 * Omni full-service pipeline, over the proactive cross-agent For You feed.
 */
export function OmniDashboard({ name, tenant, nowMs }: { name: string; tenant: string; nowMs: number }) {
  return (
    <div className="min-h-screen bg-[#02070a] text-white">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#02070a]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Link href="/app/dashboard" className="inline-flex items-center gap-2.5 font-display text-base font-extrabold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#25D366] text-[#02070a]"><Sparkles size={16} strokeWidth={2.5} /></span>
            Pixie Omni
          </Link>
          <OpenFullServiceButton slug="omni" accent="#22D3EE" />
        </div>
      </header>
      <ForYou name={name} tenant={tenant} nowMs={nowMs} />
    </div>
  );
}
