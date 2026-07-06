'use client';

import { useState } from 'react';
import { Loader2, Wifi, WifiOff, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { metaApi } from '@/lib/pixie-lab/servicesClient';
import type { MetaStatus, MetaPermState } from '@/lib/pixie-lab/serviceTypes';

const ACCENT = '#EC4899';

/** What the setup bar communicates to the workspace about data-panel visibility. */
export type MetaReadiness =
  | 'loading'
  | 'offline'
  | 'unconfigured'   // backend up but META_APP_ID/SECRET missing
  | 'disconnected'   // configured but no OAuth token
  | 'ready';         // connected — show data panels

function PermPill({ label, state }: { label: string; state?: MetaPermState }) {
  if (!state) return null;
  const color = state === 'available' ? '#22c55e' : state === 'app_review_needed' ? '#f59e0b' : '#ef4444';
  const tip = state === 'available' ? 'Available' : state === 'app_review_needed' ? 'Needs App Review' : 'Missing';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
      title={tip}
    >
      {label}
    </span>
  );
}

interface MetaSetupBarProps {
  status: MetaStatus & { backendUp?: boolean; inbox_permissions?: unknown };
  readiness: MetaReadiness;
  onRefresh: () => void;
}

/**
 * MetaSetupBar — honest status strip at the top of the Marketing workspace.
 * Shows: mode badge (live/demo), display_name, per-permission availability, and
 * connect/demo controls when not yet connected.
 */
export function MetaSetupBar({ status, readiness, onRefresh }: MetaSetupBarProps) {
  const [seeding, setSeeding] = useState(false);
  const [connecting, setConnecting] = useState(false);

  async function handleSeedDemo() {
    setSeeding(true);
    try {
      await metaApi.seedDemo();
      onRefresh();
    } finally {
      setSeeding(false);
    }
  }

  function handleConnect() {
    setConnecting(true);
    const url = metaApi.connectUrl();
    const popup = window.open(url, 'meta_oauth', 'width=600,height=720');
    // Poll until popup closes, then refresh
    const timer = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(timer);
        setConnecting(false);
        onRefresh();
      }
    }, 800);
  }

  if (readiness === 'loading') return null;

  if (readiness === 'offline') {
    return (
      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-3">
        <WifiOff size={16} className="flex-none text-red-500" />
        <p className="text-[13px] text-[var(--pl-text-muted)]">Marketing service is offline — make sure the backend is running.</p>
        <button
          onClick={onRefresh}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]"
        >
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  if (readiness === 'unconfigured') {
    const canManage = status.can_manage !== false; // default to showing detail in demo/local
    const missing = status.missing_config && status.missing_config.length
      ? status.missing_config
      : ['META_APP_ID', 'META_APP_SECRET'];
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-[var(--pl-border)] bg-[var(--pl-surface)] p-5">
        <div className="flex items-start gap-3">
          <AlertCircle size={18} className="mt-0.5 flex-none" style={{ color: ACCENT }} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[14.5px] font-bold text-[var(--pl-text)]">
              {canManage ? 'Meta isn’t configured yet' : 'Meta connection is not configured yet'}
            </p>
            {canManage ? (
              <div className="mt-1 text-[13px] text-[var(--pl-text-muted)]">
                <p>Add these to the backend environment, then restart the backend:</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {missing.map((v) => (
                    <code key={v} className="rounded bg-[var(--pl-surface-soft)] px-1.5 py-0.5 text-[12px] text-[var(--pl-text-soft)]">{v}</code>
                  ))}
                </div>
                <p className="mt-2">Create an app at developers.facebook.com. You can still explore the UI with demo data.</p>
              </div>
            ) : (
              <p className="mt-1 text-[13px] text-[var(--pl-text-muted)]">
                Ask a workspace admin to finish connecting Meta. It isn&apos;t available yet.
              </p>
            )}
          </div>
        </div>
        {canManage && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handleSeedDemo}
              disabled={seeding}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-50"
            >
              {seeding ? <Loader2 size={14} className="animate-spin" /> : null}
              Seed demo data
            </button>
          </div>
        )}
      </div>
    );
  }

  if (readiness === 'disconnected') {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-[var(--pl-border)] bg-[var(--pl-surface)] p-5">
        <div className="flex items-start gap-3">
          <Wifi size={18} className="mt-0.5 flex-none" style={{ color: ACCENT }} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[14.5px] font-bold text-[var(--pl-text)]">Connect Facebook / Instagram</p>
            <p className="mt-1 text-[13px] text-[var(--pl-text-muted)]">
              Link your Meta account to manage inbox messages, comments, and content publishing in one place.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {connecting ? <Loader2 size={14} className="animate-spin" /> : null}
            Connect Facebook / Instagram
          </button>
          <button
            onClick={handleSeedDemo}
            disabled={seeding}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-50"
          >
            {seeding ? <Loader2 size={14} className="animate-spin" /> : null}
            Try demo data
          </button>
        </div>
      </div>
    );
  }

  // readiness === 'ready' → compact status strip
  const perms = status.permissions;
  const modeColor = status.mode === 'live' ? '#22c55e' : '#f59e0b';
  const modeLabel = status.mode === 'live' ? 'Live' : status.mode === 'demo' ? 'Demo' : status.mode || 'Connected';

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-3">
      <CheckCircle2 size={15} className="flex-none" style={{ color: modeColor }} />
      <span
        className="rounded-full px-2 py-0.5 text-[10.5px] font-bold"
        style={{ background: `color-mix(in srgb, ${modeColor} 16%, transparent)`, color: modeColor }}
      >
        {modeLabel}
      </span>
      {status.display_name && (
        <span className="text-[13px] font-semibold text-[var(--pl-text)]">{status.display_name}</span>
      )}
      {perms && (
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <PermPill label="Comments" state={perms.comments} />
          <PermPill label="DMs" state={perms.dms} />
          <PermPill label="Publishing" state={perms.publishing} />
          <PermPill label="Insights" state={perms.insights} />
        </div>
      )}
    </div>
  );
}

/** Derive readiness from a raw metaApi.status() response. */
export function deriveReadiness(
  data: (MetaStatus & { backendUp?: boolean }) | null,
): MetaReadiness {
  if (!data) return 'loading';
  if (!data.backendUp) return 'offline';
  if (data.configured === false) return 'unconfigured';
  if (data.connected === false) return 'disconnected';
  return 'ready';
}
