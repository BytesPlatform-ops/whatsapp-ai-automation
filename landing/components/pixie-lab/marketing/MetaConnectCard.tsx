'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Megaphone } from 'lucide-react';
import { MetaSetupBar, deriveReadiness, type MetaReadiness } from './MetaSetupBar';
import { MetaDiagnosticsPanel } from './MetaDiagnosticsPanel';
import { metaApi } from '@/lib/pixie-lab/servicesClient';
import type { MetaStatus } from '@/lib/pixie-lab/serviceTypes';

const ACCENT = '#EC4899';

/**
 * MetaConnectCard — the Meta integration entry point shown at the top of the
 * Marketing overview (`/pixie-lab/marketing`). Reuses MetaSetupBar so the exact
 * same Connect / demo / status controls appear here as inside the workspace —
 * no logic is duplicated. When connected it links straight to the Meta Ads tab.
 * Rendered ABOVE ServiceView so the existing marketing overview is untouched.
 */
export function MetaConnectCard() {
  const [status, setStatus] = useState<(MetaStatus & { backendUp?: boolean }) | null>(null);
  const [readiness, setReadiness] = useState<MetaReadiness>('loading');

  const fetchStatus = useCallback(() => {
    setReadiness('loading');
    metaApi.status().then((d) => {
      setStatus(d as MetaStatus & { backendUp?: boolean });
      setReadiness(deriveReadiness(d as MetaStatus & { backendUp?: boolean }));
    });
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  return (
    <section className="mx-auto w-full max-w-4xl px-[clamp(20px,4vw,52px)] pt-9">
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-8 w-8 place-items-center rounded-xl border border-[var(--pl-border)]"
          style={{ background: `${ACCENT}1a`, color: ACCENT }}
        >
          <Megaphone size={16} />
        </span>
        <h2 className="font-display text-[15px] font-bold text-[var(--pl-text)]">Meta integration</h2>
        {readiness === 'ready' && (
          <Link
            href="/pixie-lab/marketing/ads"
            className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-semibold transition hover:opacity-80"
            style={{ color: ACCENT }}
          >
            Manage Meta Ads <ArrowRight size={13} />
          </Link>
        )}
      </div>

      {/* Same Connect / demo / status controls used inside the workspace. */}
      {status !== null ? (
        <MetaSetupBar status={status} readiness={readiness} onRefresh={fetchStatus} />
      ) : (
        <div className="mt-4 h-16 animate-pulse rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)]" />
      )}

      {/* Post-connect health check — only once Meta is connected. */}
      {readiness === 'ready' && <MetaDiagnosticsPanel />}
    </section>
  );
}
