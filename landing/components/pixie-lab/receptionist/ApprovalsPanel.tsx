'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, X, Mail, Calendar, ShieldAlert, RefreshCw } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpApproval } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Section, Pill, PrimaryButton, GhostButton, RCP_ACCENT, fmtDate } from './widgets';

type Status = 'loading' | 'offline' | 'ready';

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b', approved: '#3b82f6', executed: '#16a34a', completed: '#16a34a',
  rejected: '#dc2626', failed: '#dc2626', expired: '#64748b', skipped: '#64748b',
};

/** Distinguish Gmail vs Calendar vs other actions (Part 29). */
function actionKind(a: RcpApproval): { label: string; icon: React.ReactNode; color: string } {
  const t = (a.action_type || '').toLowerCase();
  if (t.includes('gmail') || t.includes('email')) return { label: 'Gmail', icon: <Mail size={14} />, color: '#ea4335' };
  if (t.includes('calendar') || t.includes('booking')) return { label: 'Calendar', icon: <Calendar size={14} />, color: '#4285f4' };
  return { label: a.action_type || 'Action', icon: <ShieldAlert size={14} />, color: RCP_ACCENT };
}

const FILTERS = ['all', 'pending', 'approved', 'executed', 'rejected', 'failed'] as const;
type Filter = (typeof FILTERS)[number];

export default function ApprovalsPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [items, setItems] = useState<RcpApproval[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const r = await receptionistApi.getApprovals();
    if (!r.backendUp) { setStatus('offline'); return; }
    setItems(r.items || []);
    setStatus('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => (i.status || 'pending') === filter)),
    [items, filter],
  );

  async function act(id: string, decision: 'approve' | 'reject') {
    setBusy(id); setErr('');
    const r = decision === 'approve' ? await receptionistApi.approveApproval(id) : await receptionistApi.rejectApproval(id);
    setBusy('');
    if (!r.backendUp || (r as { error?: string }).error) { setErr((r as { error?: string }).error || 'Action failed.'); }
    await load(); // reconcile with worker/execution state
  }

  if (status === 'loading') return <LoadingCards />;
  if (status === 'offline') return <OfflineState service="AI Receptionist" />;

  return (
    <div className="space-y-4" data-testid="approvals-panel">
      {err && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs capitalize ${filter === f ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600'}`}>
            {f}
          </button>
        ))}
        <GhostButton onClick={load} aria-label="Refresh"><RefreshCw size={14} /></GhostButton>
      </div>

      <Section title="Approvals" sub={`${filtered.length} shown · sensitive actions require explicit approval before they run`}>
        {filtered.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No approvals in this view.</p></Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((a) => {
              const kind = actionKind(a);
              const st = a.status || 'pending';
              const payload = a.prepared_output || {};
              return (
                <Card key={a.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-white" style={{ background: kind.color }}>
                          {kind.icon} {kind.label}
                        </span>
                        <span className="truncate">{a.title || a.action_type}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <Pill color={STATUS_COLORS[st] || '#64748b'}>{st}</Pill>
                        {a.risk_level ? <span>risk: {a.risk_level}</span> : null}
                        <span>· {fmtDate(a.created_at)}</span>
                      </div>
                      {a.description ? <p className="mt-1 text-xs text-slate-600">{a.description}</p> : null}
                      {/* validated payload preview (redacted long bodies) */}
                      {typeof payload.body === 'string' && (
                        <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-700">
                          {String(payload.body).slice(0, 240)}{String(payload.body).length > 240 ? '…' : ''}
                        </p>
                      )}
                      {a.execution_result ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Result: {a.execution_result.ok ? 'executed' : 'failed'}
                          {typeof a.execution_result.status === 'string' ? ` (${a.execution_result.status})` : ''}
                        </p>
                      ) : null}
                    </div>
                    {st === 'pending' && (
                      <div className="flex items-center gap-2">
                        <PrimaryButton onClick={() => act(a.id, 'approve')} disabled={busy === a.id} aria-label="Approve">
                          <Check size={14} /> Approve
                        </PrimaryButton>
                        <GhostButton onClick={() => act(a.id, 'reject')} disabled={busy === a.id} aria-label="Reject">
                          <X size={14} /> Reject
                        </GhostButton>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
