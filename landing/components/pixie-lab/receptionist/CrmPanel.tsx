'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, LayoutGrid, Table2, CheckCircle2, UserCheck, BellPlus, Mail, Phone, Clock } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpContact } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Pill, StatusPill, GhostButton, fmtDate, statusColor, initials, RCP_ACCENT } from './widgets';

type Status = 'loading' | 'offline' | 'ready';
type View = 'board' | 'table';

/** Kanban columns, in pipeline order. */
const COLUMNS: { key: string; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'follow_up_needed', label: 'Follow-up needed' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'converted', label: 'Converted' },
  { key: 'lost', label: 'Lost' },
];

const STATUS_OPTIONS = ['', ...COLUMNS.map((c) => c.key)];

function scoreColor(score?: number): string {
  const s = score ?? 0;
  if (s >= 60) return '#22c55e';
  if (s >= 30) return '#f59e0b';
  return '#64748b';
}

function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined || score === null) return null;
  const color = scoreColor(score);
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
      {score}
    </span>
  );
}

function LeadDetail({ lead }: { lead: RcpContact }) {
  const activity = lead.activity || [];
  const fields: { label: string; value?: string | null }[] = [
    { label: 'Company', value: lead.company },
    { label: 'Service interest', value: lead.service_interest },
    { label: 'Budget', value: lead.budget },
    { label: 'Urgency', value: lead.urgency },
    { label: 'Intent', value: lead.intent },
    { label: 'Source', value: lead.source },
    { label: 'Consent', value: lead.consent === undefined ? undefined : lead.consent ? 'given' : 'not given' },
    { label: 'Created', value: fmtDate(lead.created_at) || undefined },
  ].filter((f) => f.value);

  return (
    <div className="mt-3 border-t border-[var(--pl-border)] pt-3">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Contact details</p>
          {fields.length === 0 ? (
            <p className="text-[13px] text-[var(--pl-text-muted)]">No extra details recorded.</p>
          ) : (
            <dl className="space-y-1.5">
              {fields.map((f) => (
                <div key={f.label} className="flex gap-2 text-[13px]">
                  <dt className="w-28 shrink-0 text-[var(--pl-text-muted)]">{f.label}</dt>
                  <dd className="min-w-0 flex-1 break-words capitalize text-[var(--pl-text-soft)]">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {lead.notes && (
            <p className="mt-3 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3 text-[13px] text-[var(--pl-text-soft)]">{lead.notes}</p>
          )}
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Activity timeline</p>
          {activity.length === 0 ? (
            <p className="text-[13px] text-[var(--pl-text-muted)]">No activity logged yet.</p>
          ) : (
            <ol className="space-y-2.5">
              {activity.map((a, i) => (
                <li key={i} className="relative border-l border-[var(--pl-border)] pl-4">
                  <span className="absolute -left-[3px] top-1.5 h-1.5 w-1.5 rounded-full" style={{ background: RCP_ACCENT }} />
                  <p className="text-[13px] text-[var(--pl-text-soft)]">{a.note || '—'}</p>
                  {a.at && <p className="text-[11px] text-[var(--pl-text-muted)]">{fmtDate(a.at)}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function LeadCard({ lead, expanded, onToggle, onAction, busy }: {
  lead: RcpContact;
  expanded: boolean;
  onToggle: () => void;
  onAction: (action: 'qualify' | 'convert' | 'follow-up') => void;
  busy: boolean;
}) {
  const tags = lead.tags || [];
  return (
    <Card className="p-3.5">
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 text-left">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: `color-mix(in srgb, ${RCP_ACCENT} 18%, transparent)`, color: RCP_ACCENT }}>
          {initials(lead.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-display text-[14px] font-bold text-[var(--pl-text)]">{lead.name || 'Unknown lead'}</p>
            <ScoreBadge score={lead.score} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-[var(--pl-text-muted)]">
            {lead.email && <span className="inline-flex items-center gap-1"><Mail size={11} /> {lead.email}</span>}
            {lead.phone && <span className="inline-flex items-center gap-1"><Phone size={11} /> {lead.phone}</span>}
          </div>
        </div>
        <StatusPill status={lead.status} />
      </button>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {lead.source && <Pill color="#3b82f6">{lead.source}</Pill>}
        {lead.intent && <Pill color="#8b5cf6">{lead.intent}</Pill>}
        {lead.service_interest && <Pill color={RCP_ACCENT}>{lead.service_interest}</Pill>}
        {lead.budget && <span className="text-[11.5px] text-[var(--pl-text-muted)]">· {lead.budget}</span>}
      </div>

      {lead.last_message_summary && (
        <p className="mt-2 line-clamp-2 text-[12.5px] text-[var(--pl-text-soft)]">{lead.last_message_summary}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {lead.last_contact_at && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--pl-text-muted)]"><Clock size={11} /> {fmtDate(lead.last_contact_at)}</span>
        )}
        {tags.map((t) => (
          <span key={t} className="rounded-md bg-[var(--pl-surface-soft)] px-1.5 py-0.5 text-[10.5px] text-[var(--pl-text-muted)]">#{t}</span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <GhostButton onClick={() => onAction('qualify')} disabled={busy}><UserCheck size={12} /> Qualify</GhostButton>
        <GhostButton onClick={() => onAction('convert')} disabled={busy}><CheckCircle2 size={12} /> Convert</GhostButton>
        <GhostButton onClick={() => onAction('follow-up')} disabled={busy}><BellPlus size={12} /> Follow-up</GhostButton>
      </div>

      {expanded && <LeadDetail lead={lead} />}
    </Card>
  );
}

export function CrmPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [leads, setLeads] = useState<RcpContact[]>([]);
  const [view, setView] = useState<View>('board');
  const [filter, setFilter] = useState<string>('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (statusFilter?: string) => {
    setStatus('loading');
    const d = await receptionistApi.getLeads(statusFilter || undefined);
    if (!d.backendUp) {
      setStatus('offline');
      return;
    }
    setLeads(Array.isArray(d.leads) ? d.leads : []);
    setStatus('ready');
  }, []);

  useEffect(() => {
    void load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function runAction(lead: RcpContact, action: 'qualify' | 'convert' | 'follow-up') {
    setBusyId(lead.id);
    if (action === 'qualify') await receptionistApi.updateLead(lead.id, { status: 'qualified' });
    else if (action === 'convert') await receptionistApi.updateLead(lead.id, { status: 'converted' });
    else await receptionistApi.leadFollowUp(lead.id);
    setBusyId(null);
    await load(filter);
  }

  if (status === 'loading') {
    return (
      <div className="mt-6 space-y-4">
        <LoadingCards count={1} height="h-9" />
        <LoadingCards count={4} height="h-28" />
      </div>
    );
  }

  if (status === 'offline') {
    return (
      <div className="mt-6">
        <OfflineState service="receptionist" action={<GhostButton onClick={() => void load(filter)}><RefreshCw size={13} /> Retry</GhostButton>} />
      </div>
    );
  }

  const renderCard = (lead: RcpContact) => (
    <LeadCard
      key={lead.id}
      lead={lead}
      expanded={expanded === lead.id}
      onToggle={() => setExpanded(expanded === lead.id ? null : lead.id)}
      onAction={(a) => void runAction(lead, a)}
      busy={busyId === lead.id}
    />
  );

  return (
    <div className="mt-6">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-0.5">
          {(['board', 'table'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold capitalize transition"
              style={view === v ? { background: 'var(--pl-surface)', color: RCP_ACCENT } : { color: 'var(--pl-text-muted)' }}
            >
              {v === 'board' ? <LayoutGrid size={13} /> : <Table2 size={13} />} {v}
            </button>
          ))}
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s || 'all'} value={s}>{s ? s.replace(/_/g, ' ') : 'All statuses'}</option>
          ))}
        </select>
        <span className="text-[12px] text-[var(--pl-text-muted)]">{leads.length} lead{leads.length === 1 ? '' : 's'}</span>
        <div className="ml-auto">
          <GhostButton onClick={() => void load(filter)}><RefreshCw size={13} /> Refresh</GhostButton>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="mt-5">
          <EmptyState title="No leads yet" body="Leads captured by the AI Receptionist will appear here — with score, intent and a full activity timeline." />
        </div>
      ) : view === 'board' ? (
        <div className="mt-5 flex gap-3 overflow-x-auto pb-3">
          {COLUMNS.map((col) => {
            const items = leads.filter((l) => (l.status || 'new') === col.key);
            return (
              <div key={col.key} className="w-[280px] shrink-0">
                <div className="mb-2.5 flex items-center justify-between px-1">
                  <span className="inline-flex items-center gap-2 text-[12.5px] font-bold text-[var(--pl-text)]">
                    <span className="h-2 w-2 rounded-full" style={{ background: statusColor(col.key) }} />
                    {col.label}
                  </span>
                  <span className="text-[11.5px] font-semibold text-[var(--pl-text-muted)]">{items.length}</span>
                </div>
                <div className="space-y-3">
                  {items.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[var(--pl-border)] px-3 py-6 text-center text-[12px] text-[var(--pl-text-muted)]">Empty</p>
                  ) : (
                    items.map(renderCard)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {leads.map(renderCard)}
        </div>
      )}
    </div>
  );
}
