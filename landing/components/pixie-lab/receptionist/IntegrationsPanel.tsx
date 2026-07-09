'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2, FlaskConical, Cpu, HardDrive } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpIntegrationStatus, RcpProviderStatus } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, StatusPill, GhostButton, statusColor } from './widgets';

type Status = 'loading' | 'offline' | 'ready';

type TestState = { loading?: boolean; status?: unknown; result?: unknown; error?: string };

function pretty(s?: string): string {
  return (s || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function asText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function Dot({ connected }: { connected: boolean }) {
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: connected ? '#22c55e' : '#94a3b8' }}
      aria-hidden
    />
  );
}

function EnvChip({ label, missing }: { label: string; missing?: boolean }) {
  const color = missing ? '#ef4444' : '#64748b';
  return (
    <span
      className="rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      {label}
    </span>
  );
}

/** Shared shell: green tint when connected, muted otherwise. */
function ConnCard({
  connected,
  icon,
  title,
  statusText,
  children,
}: {
  connected: boolean;
  icon?: React.ReactNode;
  title: string;
  statusText?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card
      className="p-4"
      // green accent tint when connected; neutral surface otherwise
    >
      <div
        className="-m-4 mb-3 rounded-t-2xl border-b border-[var(--pl-border)] px-4 py-3"
        style={connected ? { background: 'color-mix(in srgb, #22c55e 8%, transparent)' } : undefined}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Dot connected={connected} />
            {icon}
            <span className="truncate font-display text-[14px] font-bold text-[var(--pl-text)]">{title}</span>
          </div>
          {statusText && <StatusPill status={statusText} />}
        </div>
      </div>
      {children}
    </Card>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <p className="text-[12.5px] text-[var(--pl-text-muted)]">
      <span className="font-semibold text-[var(--pl-text-soft)]">{label}:</span> {value}
    </p>
  );
}

function ProviderCard({
  p,
  test,
  onTest,
}: {
  p: RcpProviderStatus;
  test?: TestState;
  onTest: (capability: string) => void;
}) {
  const connected = p.connected === true || p.status === 'connected' || p.status === 'ready';
  const required = p.required_env || [];
  const missing = p.missing_env || [];
  return (
    <ConnCard connected={connected} title={pretty(p.capability)} statusText={p.status}>
      <div className="space-y-2">
        <Row label="Provider" value={p.provider} />
        <Row label="Mode" value={p.mode} />
        {required.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Env</span>
            {required.map((e) => (
              <EnvChip key={e} label={e} missing={missing.includes(e)} />
            ))}
          </div>
        )}
        {missing.length > 0 && (
          <p className="text-[12px] text-[#ef4444]">Missing: {missing.join(', ')}</p>
        )}
        {p.note && <p className="text-[12px] leading-relaxed text-[var(--pl-text-muted)]">{p.note}</p>}

        <div className="pt-1">
          <GhostButton onClick={() => onTest(p.capability)} disabled={test?.loading}>
            {test?.loading ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
            Test
          </GhostButton>
        </div>

        {test && !test.loading && (test.status !== undefined || test.result !== undefined || test.error) && (
          <div className="mt-1 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-2.5">
            {test.error ? (
              <p className="text-[12px] text-[#ef4444]">{test.error}</p>
            ) : (
              <>
                {test.status !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Result</span>
                    <StatusPill status={asText(test.status)} />
                  </div>
                )}
                {test.result !== undefined && (
                  <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[11.5px] text-[var(--pl-text-soft)]">
                    {asText(test.result)}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </ConnCard>
  );
}

export function IntegrationsPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<RcpIntegrationStatus>({});
  const [tests, setTests] = useState<Record<string, TestState>>({});

  const load = useCallback(async () => {
    setStatus('loading');
    const d = await receptionistApi.getIntegrationStatus();
    if (!d.backendUp) {
      setStatus('offline');
      return;
    }
    setData(d);
    setStatus('ready');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runTest = useCallback(async (capability: string) => {
    setTests((t) => ({ ...t, [capability]: { loading: true } }));
    const d = await receptionistApi.testIntegration(capability);
    if (!d.backendUp) {
      setTests((t) => ({ ...t, [capability]: { error: d.error || 'Backend offline' } }));
      return;
    }
    setTests((t) => ({ ...t, [capability]: { status: d.status, result: d.result } }));
  }, []);

  if (status === 'loading') {
    return (
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <LoadingCards count={4} height="h-40" />
      </div>
    );
  }

  if (status === 'offline') {
    return (
      <div className="mt-6">
        <OfflineState
          service="receptionist"
          action={<GhostButton onClick={() => void load()}><RefreshCw size={13} /> Retry</GhostButton>}
        />
      </div>
    );
  }

  const llm = data.llm || {};
  const providers = data.receptionist_providers || [];
  const core = data.core_capabilities || [];
  const persistence = data.persistence || {};
  const mode = data.mode || {};
  const banner = typeof mode.banner === 'string' ? mode.banner : undefined;

  const llmConnected = llm.status === 'connected' || llm.status === 'ready' || llm.status === 'active';
  const supabaseOk = persistence.supabase_configured === true;

  return (
    <div className="mt-6">
      {/* mode banner + refresh */}
      <div className="flex flex-wrap items-center gap-3">
        {banner ? (
          <div
            className="flex-1 rounded-xl border border-[var(--pl-border)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--pl-text-soft)]"
            style={{ background: `color-mix(in srgb, ${statusColor(llm.status)} 10%, transparent)` }}
          >
            {banner}
          </div>
        ) : (
          <p className="flex-1 text-[13px] text-[var(--pl-text-muted)]">Connection status for every capability the receptionist can use.</p>
        )}
        <GhostButton onClick={() => void load()}><RefreshCw size={13} /> Refresh</GhostButton>
      </div>

      {/* cards */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* LLM */}
        <ConnCard
          connected={llmConnected}
          icon={<Cpu size={14} style={{ color: statusColor(llm.status) }} />}
          title="LLM / OpenAI"
          statusText={llm.status}
        >
          <div className="space-y-2">
            <Row label="Provider" value={llm.provider} />
            <Row label="Model" value={llm.model} />
            {llm.note && <p className="text-[12px] leading-relaxed text-[var(--pl-text-muted)]">{llm.note}</p>}
          </div>
        </ConnCard>

        {/* receptionist providers (testable) */}
        {providers.map((p) => (
          <ProviderCard key={p.capability} p={p} test={tests[p.capability]} onTest={runTest} />
        ))}

        {/* core capabilities */}
        {core.map((c) => {
          const connected = c.status === 'connected' || c.status === 'ready' || c.status === 'active';
          return (
            <ConnCard key={c.capability} connected={connected} title={pretty(c.capability)} statusText={c.status}>
              <div className="space-y-2">
                <Row label="Provider" value={c.provider} />
                <Row label="Mode" value={c.mode} />
              </div>
            </ConnCard>
          );
        })}

        {/* persistence */}
        <ConnCard
          connected={supabaseOk}
          icon={<HardDrive size={14} style={{ color: supabaseOk ? '#22c55e' : '#94a3b8' }} />}
          title="Persistence"
          statusText={supabaseOk ? 'connected' : 'missing_connection'}
        >
          <div className="space-y-2">
            <Row label="Backend" value={persistence.backend} />
            <Row label="Durable" value={persistence.durable === undefined ? undefined : persistence.durable ? 'yes' : 'no'} />
            <Row label="Multi-instance" value={persistence.multi_instance === undefined ? undefined : persistence.multi_instance ? 'yes' : 'no'} />
            <Row label="Supabase" value={supabaseOk ? 'configured' : 'not configured'} />
          </div>
        </ConnCard>
      </div>
    </div>
  );
}
