'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Megaphone, Brain, ChevronRight, ArrowRight } from 'lucide-react';
import { ServiceGate } from '@/components/pixie-lab/services/ServiceGate';
import { MetaSetupBar, deriveReadiness, type MetaReadiness } from './MetaSetupBar';
import { MetaDiagnosticsPanel } from './MetaDiagnosticsPanel';
import { MarketingRecommendations } from './MarketingRecommendations';
import { MarketingOnboarding } from './MarketingOnboarding';
import { metaApi } from '@/lib/pixie-lab/servicesClient';
import type { MetaStatus } from '@/lib/pixie-lab/serviceTypes';

const ACCENT = '#EC4899';
const box = 'rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5';

function WhatPixieAnalyzes() {
  const items = [
    'Your Facebook Page & Instagram business account',
    'Ad accounts, campaigns, spend & performance',
    'Recent posts, captions & engagement (your Brand Brain)',
    'Comments & DMs, where permissions allow',
    'Your best-performing topics, hooks & content gaps',
  ];
  return (
    <div className={`mt-6 ${box}`}>
      <div className="flex items-center gap-2">
        <Brain size={16} style={{ color: ACCENT }} />
        <h3 className="font-display text-[14px] font-bold text-[var(--pl-text)]">What Pixie will analyze once connected</h3>
      </div>
      <ul className="mt-3 space-y-1.5">
        {items.map((t) => (
          <li key={t} className="flex items-start gap-2 text-[13px] text-[var(--pl-text-soft)]">
            <ChevronRight size={14} className="mt-0.5 flex-none" style={{ color: ACCENT }} /> {t}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-[var(--pl-text-muted)]">Connect above, or try demo data to explore the full experience with a sample business.</p>
    </div>
  );
}

/**
 * MarketingCommandCenter — the unified home of Pixie Marketing (main page).
 * Connection-aware wrapper: not-connected → connect controls + what-Pixie-analyzes;
 * connected → the shared MarketingRecommendations intelligence panel + connection
 * diagnostics, plus a link into the detailed full-service workspace.
 */
export function MarketingCommandCenter({ tenant }: { tenant: string }) {
  const [status, setStatus] = useState<(MetaStatus & { backendUp?: boolean }) | null>(null);
  const [readiness, setReadiness] = useState<MetaReadiness>('loading');
  const [analyzeSignal, setAnalyzeSignal] = useState(0);

  const fetchStatus = useCallback(() => {
    setReadiness('loading');
    metaApi.status().then((d) => {
      setStatus(d as MetaStatus & { backendUp?: boolean });
      setReadiness(deriveReadiness(d as MetaStatus & { backendUp?: boolean }));
    });
  }, []);
  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  return (
    <ServiceGate agent="marketing" tenant={tenant}>
      <main className="mx-auto w-full max-w-4xl px-[clamp(20px,4vw,52px)] py-9 text-[var(--pl-text)]">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--pl-border)]" style={{ background: `${ACCENT}1a`, color: ACCENT }}>
            <Megaphone size={20} />
          </span>
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pl-text-muted)]">Marketing Agent</p>
            <h1 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-tight tracking-tight">Marketing Command Center</h1>
          </div>
          {readiness === 'ready' && (
            <Link href="/pixie-lab/marketing/full-service?tab=overview" className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-2 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]">
              Open workspace <ArrowRight size={13} />
            </Link>
          )}
        </div>

        {status !== null && <MetaSetupBar status={status} readiness={readiness} onRefresh={fetchStatus} />}

        {/* Pixie takes a brief — shown whenever the profile is incomplete, connected or not. */}
        <MarketingOnboarding onSaved={() => setAnalyzeSignal((s) => s + 1)} />

        {readiness !== 'ready' ? (
          <WhatPixieAnalyzes />
        ) : (
          <>
            <MarketingRecommendations analyzeSignal={analyzeSignal} />
            <MetaDiagnosticsPanel />
          </>
        )}
      </main>
    </ServiceGate>
  );
}
