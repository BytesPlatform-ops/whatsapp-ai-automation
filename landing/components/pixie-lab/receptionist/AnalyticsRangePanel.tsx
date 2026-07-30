'use client';

import { useCallback, useEffect, useState } from 'react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpAnalyticsRange } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Section, StatCard, RCP_ACCENT } from './widgets';

type Status = 'loading' | 'offline' | 'ready';

const PRESETS: { key: string; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' }, { key: '90d', label: '90 days' }, { key: 'mtd', label: 'MTD' },
];

const CORE = [
  ['conversations', 'Conversations'], ['ai_messages', 'AI messages'], ['human_messages', 'Human messages'],
  ['new_contacts', 'New contacts'], ['leads', 'Leads'], ['escalations', 'Escalations'],
  ['knowledge_queries', 'Knowledge queries'], ['knowledge_gaps', 'Knowledge gaps'], ['credits_consumed', 'Credits'],
] as const;

// Gmail + Calendar provider metrics (real persisted values; 0 when empty).
const GMAIL = [
  ['ai_messages', 'Replies drafted'], ['escalations', 'Escalations'], ['failed_actions', 'Failed actions'],
] as const;

export default function AnalyticsRangePanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<RcpAnalyticsRange | undefined>();
  const [preset, setPreset] = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [rangeErr, setRangeErr] = useState('');

  const load = useCallback(async (p: string, s?: string, e?: string) => {
    setStatus('loading');
    const r = await receptionistApi.getAnalyticsRange(p, s, e);
    if (!r.backendUp) { setStatus('offline'); return; }
    setData(r as RcpAnalyticsRange);
    setStatus('ready');
  }, []);

  useEffect(() => { void load(preset); }, [load, preset]);

  function applyCustom() {
    setRangeErr('');
    if (!customStart || !customEnd) { setRangeErr('Pick both a start and end date.'); return; }
    if (customStart > customEnd) { setRangeErr('Start date must be before end date.'); return; }
    setPreset('');
    void load('', customStart, customEnd);
  }

  const m = data?.metrics || {};

  return (
    <div className="space-y-5" data-testid="analytics-panel">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date range">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => setPreset(p.key)}
            aria-pressed={preset === p.key}
            className={`rounded-full px-3 py-1 text-xs ${preset === p.key ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600'}`}>
            {p.label}
          </button>
        ))}
        <span className="mx-1 text-slate-300">|</span>
        <input type="date" aria-label="Start date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
          className="rounded border border-slate-200 px-2 py-1 text-xs" data-testid="custom-start" />
        <input type="date" aria-label="End date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
          className="rounded border border-slate-200 px-2 py-1 text-xs" data-testid="custom-end" />
        <button onClick={applyCustom} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">Custom</button>
      </div>
      {rangeErr && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-700">{rangeErr}</div>}

      {status === 'loading' && <LoadingCards />}
      {status === 'offline' && <OfflineState service="AI Receptionist" />}
      {status === 'ready' && (
        <>
          <p className="text-xs text-slate-500">
            {data?.range?.start?.slice(0, 10)} → {data?.range?.end?.slice(0, 10)} · generated {data?.generated_at?.slice(0, 16)?.replace('T', ' ')}
          </p>
          <Section title="Overview">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {CORE.map(([k, label]) => <StatCard key={k} label={label} value={m[k] ?? 0} />)}
            </div>
          </Section>
          <Section title="Gmail" sub="Real persisted values — zero when there is no activity.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {GMAIL.map(([k, label]) => <StatCard key={k} label={label} value={m[k] ?? 0} tone="#ea4335" />)}
            </div>
          </Section>
          <Section title="Bookings" sub="Confirmed bookings and follow-ups in range.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatCard label="Follow-ups" value={m.follow_ups ?? 0} tone="#4285f4" />
              <StatCard label="Reminders" value={m.reminders ?? 0} tone="#4285f4" />
              <StatCard label="Resolutions" value={m.resolutions ?? 0} tone="#4285f4" />
            </div>
          </Section>
          {(m.conversations ?? 0) === 0 && (
            <Card><p className="text-sm text-slate-500">No activity in this range yet.</p></Card>
          )}
        </>
      )}
    </div>
  );
}
