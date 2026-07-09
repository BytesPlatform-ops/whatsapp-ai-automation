'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Cpu, Database, Layers, Sparkles } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpOverview, RcpHealth } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Section, Pill, StatCard, Breakdown, GhostButton, RCP_ACCENT, statusColor } from './widgets';

type Status = 'loading' | 'offline' | 'ready';

/** Stat tiles that always render (zeros are fine). */
const CORE_STATS: { key: string; label: string }[] = [
  { key: 'conversations', label: 'Conversations' },
  { key: 'leads', label: 'Leads' },
  { key: 'bookings_requested', label: 'Bookings req.' },
  { key: 'bookings_confirmed', label: 'Bookings conf.' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'escalations', label: 'Escalations' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'pending_followups', label: 'Pending follow-ups' },
  { key: 'payments', label: 'Payments' },
  { key: 'opt_outs', label: 'Opt-outs' },
  { key: 'campaign_replies', label: 'Campaign replies' },
];

/** Extra tiles that only render when the backend reports them. */
const OPTIONAL_STATS: { key: string; label: string }[] = [
  { key: 'callbacks', label: 'Callbacks' },
  { key: 'voicemails', label: 'Voicemails' },
  { key: 'waitlist', label: 'Waitlist' },
  { key: 'reminders', label: 'Reminders' },
];

/** Ordered conversion funnel; 'lost' is rendered muted at the end. */
const FUNNEL_ORDER: { key: string; label: string; muted?: boolean }[] = [
  { key: 'new', label: 'New' },
  { key: 'follow_up_needed', label: 'Follow-up needed' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'converted', label: 'Converted' },
  { key: 'lost', label: 'Lost', muted: true },
];

function Funnel({ data }: { data: Record<string, number> }) {
  const rows = FUNNEL_ORDER.filter((r) => r.key in data);
  const max = Math.max(1, ...rows.map((r) => data[r.key] || 0));
  if (rows.length === 0) return <p className="text-[13px] text-[var(--pl-text-muted)]">No funnel data yet</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const v = data[r.key] || 0;
        const tone = r.muted ? '#94a3b8' : RCP_ACCENT;
        return (
          <div key={r.key} className="flex items-center gap-3">
            <span className="w-36 shrink-0 truncate text-[12.5px] font-medium capitalize text-[var(--pl-text-muted)]">{r.label}</span>
            <span className="h-6 flex-1 overflow-hidden rounded-lg bg-[var(--pl-surface-soft)]">
              <span
                className="flex h-full items-center rounded-lg px-2 text-[11px] font-bold text-[#1a1204] transition-all"
                style={{ width: `${Math.max((v / max) * 100, v > 0 ? 8 : 0)}%`, background: tone, opacity: r.muted ? 0.7 : 1 }}
              >
                {v > 0 ? v : ''}
              </span>
            </span>
            <span className="w-8 shrink-0 text-right text-[12.5px] font-semibold text-[var(--pl-text-soft)]">{v}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DashboardPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [overview, setOverview] = useState<RcpOverview>({});
  const [health, setHealth] = useState<RcpHealth>({});

  const load = useCallback(async () => {
    setStatus('loading');
    const [ov, hl] = await Promise.all([receptionistApi.getOverview(), receptionistApi.getHealth()]);
    if (!ov.backendUp) {
      setStatus('offline');
      return;
    }
    setOverview(ov);
    setHealth(hl.backendUp ? hl : {});
    setStatus('ready');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === 'loading') {
    return (
      <div className="mt-6 space-y-4">
        <LoadingCards count={2} height="h-9" />
        <LoadingCards count={4} height="h-24" />
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

  const totals = overview.totals || {};
  const rates = overview.rates || {};
  const llm = health.llm_provider || 'unknown';
  const backend = health.persistence?.backend;
  const handlers = health.handlers;

  const optionalShown = OPTIONAL_STATS.filter((s) => s.key in totals);
  const funnel = overview.conversion_funnel || {};

  const pct = (n?: number) => `${Math.round((n || 0) * 100)}%`;

  return (
    <div className="mt-6">
      {/* top strip: brain / persistence / handlers + refresh */}
      <div className="flex flex-wrap items-center gap-2">
        <Pill color={statusColor(llm === 'mock' ? 'mock' : 'connected')}>
          <Cpu size={11} /> {llm}
        </Pill>
        {llm === 'mock' && <Pill color="#f59e0b"><Sparkles size={11} /> demo brain</Pill>}
        {backend && (
          <Pill color="#3b82f6">
            <Database size={11} /> {backend}
            {health.persistence?.durable === false ? ' · volatile' : ''}
          </Pill>
        )}
        {typeof handlers === 'number' && (
          <Pill color="#8b5cf6"><Layers size={11} /> {handlers} handlers</Pill>
        )}
        {health.model && <Pill color="#64748b">{health.model}</Pill>}
        <div className="ml-auto">
          <GhostButton onClick={() => void load()}><RefreshCw size={13} /> Refresh</GhostButton>
        </div>
      </div>

      {/* stat grid */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {CORE_STATS.map((s) => (
          <StatCard key={s.key} label={s.label} value={totals[s.key] ?? 0} />
        ))}
        {optionalShown.map((s) => (
          <StatCard key={s.key} label={s.label} value={totals[s.key] ?? 0} />
        ))}
        <StatCard label="AI resolution" value={pct(rates.ai_resolution_rate)} tone="#22c55e" hint="handled without a human" />
        <StatCard label="Human escalation" value={pct(rates.human_escalation_rate)} tone="#f97316" hint="handed to a person" />
      </div>

      {/* conversion funnel */}
      <Section title="Conversion funnel" sub="Lead pipeline from first touch to won">
        <Card className="p-5">
          <Funnel data={funnel} />
        </Card>
      </Section>

      {/* breakdowns */}
      <div className="mt-2 grid gap-4 md:grid-cols-2">
        <Section title="Channel mix">
          <Card className="p-4"><Breakdown data={overview.channel_breakdown} /></Card>
        </Section>
        <Section title="Sentiment">
          <Card className="p-4"><Breakdown data={overview.sentiment_breakdown} /></Card>
        </Section>
        <Section title="Top intents">
          <Card className="p-4"><Breakdown data={overview.intent_distribution} /></Card>
        </Section>
        <Section title="Booking status">
          <Card className="p-4"><Breakdown data={overview.booking_status_breakdown} /></Card>
        </Section>
        <Section title="Lead pipeline">
          <Card className="p-4"><Breakdown data={overview.lead_status_breakdown} /></Card>
        </Section>
        <Section title="Ticket priority">
          <Card className="p-4"><Breakdown data={overview.ticket_priority_breakdown} /></Card>
        </Section>
        <Section title="Campaign replies">
          <Card className="p-4"><Breakdown data={overview.campaign_reply_classification} /></Card>
        </Section>
      </div>
    </div>
  );
}
