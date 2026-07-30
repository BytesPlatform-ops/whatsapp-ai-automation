'use client';

import { useEffect, useState } from 'react';
import { Mail, Calendar, MessageSquare, BookOpen } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpUsageSummary, RcpLimit } from '@/lib/pixie-lab/serviceTypes';

/**
 * AI Receptionist provider-usage breakdown for the neutral Billing surface.
 * Rendered only when the AI Receptionist product is selected. Reads real,
 * period-scoped counters from the receptionist usage/limits endpoints — no
 * customer message content, and empty usage shows zero (never sample data).
 */

type Status = 'loading' | 'offline' | 'ready';

const GROUPS: { title: string; icon: React.ReactNode; rows: [string, string][] }[] = [
  {
    title: 'Conversations', icon: <MessageSquare size={15} color="#E6B45A" />, rows: [
      ['monthly_conversations', 'Conversations'],
      ['monthly_ai_turns', 'AI turns'],
      ['summaries', 'Summaries'],
      ['escalations', 'Escalations'],
    ],
  },
  {
    title: 'Gmail', icon: <Mail size={15} color="#ea4335" />, rows: [
      ['gmail_operations', 'Sync operations'],
      ['gmail_replies', 'Replies sent'],
    ],
  },
  {
    title: 'Calendar', icon: <Calendar size={15} color="#4285f4" />, rows: [
      ['calendar_operations', 'Calendar operations'],
      ['bookings', 'Bookings'],
      ['reschedules', 'Reschedules'],
      ['cancellations', 'Cancellations'],
      ['reminders', 'Booking reminders'],
    ],
  },
  {
    title: 'Knowledge', icon: <BookOpen size={15} color="#16a34a" />, rows: [
      ['knowledge_ingestions', 'Ingestions'],
      ['follow_ups', 'Follow-ups'],
    ],
  },
];

export function ReceptionistBillingBreakdown() {
  const [status, setStatus] = useState<Status>('loading');
  const [usage, setUsage] = useState<RcpUsageSummary | undefined>();
  const [limits, setLimits] = useState<Record<string, RcpLimit>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const [u, l] = await Promise.all([receptionistApi.getUsage(), receptionistApi.getLimits()]);
      if (!alive) return;
      if (!u.backendUp) { setStatus('offline'); return; }
      setUsage(u as RcpUsageSummary);
      if (l.backendUp) setLimits((l as { limits?: Record<string, RcpLimit> }).limits || {});
      setStatus('ready');
    })();
    return () => { alive = false; };
  }, []);

  if (status === 'loading') {
    return <div data-testid="rcp-billing-breakdown" className="animate-pulse rounded-xl border border-[var(--pl-border)] p-6 text-sm text-[var(--pl-text-muted)]">Loading AI Receptionist usage…</div>;
  }
  if (status === 'offline') {
    return <div data-testid="rcp-billing-breakdown" className="rounded-xl border border-[var(--pl-border)] p-6 text-sm text-[var(--pl-text-muted)]">AI Receptionist usage is unavailable — the service is offline.</div>;
  }

  const counters = usage?.counters || {};
  const gauges = usage?.gauges || {};
  const period = usage?.period;

  return (
    <section data-testid="rcp-billing-breakdown" aria-label="AI Receptionist provider usage"
      className="rounded-xl border border-[var(--pl-border)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold uppercase tracking-[0.14em] text-[var(--pl-text)]">Provider usage</h3>
        {period?.start ? (
          <span className="text-xs text-[var(--pl-text-muted)]">
            {period.start.slice(0, 10)} → {period.end?.slice(0, 10)}{period.fallback ? ' (calendar month)' : ''}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <div key={g.title} className="rounded-lg border border-[var(--pl-border)] p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--pl-text)]">{g.icon}{g.title}</div>
            <dl className="space-y-1">
              {g.rows.map(([key, label]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <dt className="text-[var(--pl-text-muted)]">{label}</dt>
                  <dd className="font-mono text-[var(--pl-text)]">{counters[key] ?? 0}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[['stored_contacts', 'Stored contacts'], ['stored_conversations', 'Stored conversations'], ['knowledge_sources', 'Knowledge sources']].map(([k, label]) => {
          const lim = limits[k === 'stored_contacts' ? 'contact' : k === 'stored_conversations' ? 'stored_conversation' : 'knowledge_source'];
          return (
            <div key={k} className="rounded-lg border border-[var(--pl-border)] p-3 text-sm">
              <div className="text-[var(--pl-text-muted)]">{label}</div>
              <div className="mt-1 font-mono text-[var(--pl-text)]">
                {gauges[k] ?? 0}
                {lim && lim.limit !== undefined && lim.limit >= 0 ? <span className="text-[var(--pl-text-muted)]"> / {lim.limit}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
