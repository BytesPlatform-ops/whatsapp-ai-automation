'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Send, AlertTriangle } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpGmailDraft } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Section, Pill, GhostButton, fmtDate } from './widgets';

type Status = 'loading' | 'offline' | 'ready';

/** Honest draft state — never shows "sent" without a provider message id. */
function draftState(d: RcpGmailDraft): { label: string; color: string } {
  const s = d.status || 'generated';
  if (s === 'sent' && d.provider_message_id) return { label: 'Sent', color: '#16a34a' };
  if (s === 'sent') return { label: 'Provider pending', color: '#f59e0b' };
  if (s === 'pending_approval') return { label: 'Pending approval', color: '#3b82f6' };
  if (s === 'failed') return { label: 'Failed', color: '#dc2626' };
  if (s === 'reconciliation_required') return { label: 'Reconciliation required', color: '#f97316' };
  return { label: s.replace(/_/g, ' '), color: '#64748b' };
}

export default function GmailDraftsPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [drafts, setDrafts] = useState<RcpGmailDraft[]>([]);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const r = await receptionistApi.getGmailDrafts();
    if (!r.backendUp) { setStatus('offline'); return; }
    setDrafts((r as { drafts?: RcpGmailDraft[] }).drafts || []);
    setStatus('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function retry(id: string) { setBusy(id); await receptionistApi.retryGmailDraft(id); setBusy(''); await load(); }
  async function reconcile(id: string) { setBusy(id); await receptionistApi.reconcileGmailDraft(id); setBusy(''); await load(); }

  if (status === 'loading') return <LoadingCards />;
  if (status === 'offline') return <OfflineState service="AI Receptionist" />;

  return (
    <div className="space-y-4" data-testid="gmail-drafts-panel">
      <div className="flex justify-end"><GhostButton onClick={load} aria-label="Refresh"><RefreshCw size={14} /></GhostButton></div>
      <Section title="Gmail drafts & replies" sub="Approve in the Approvals tab. Sends are confirmed by the provider before showing as sent.">
        {drafts.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No Gmail drafts yet. Run a sync from the Providers tab.</p></Card>
        ) : (
          <div className="space-y-2">
            {drafts.map((d) => {
              const st = draftState(d);
              return (
                <Card key={d.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{d.subject || '(no subject)'}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <Pill color={st.color}>{st.label}</Pill>
                        <span>to {d.to || '—'}</span>
                        {d.provider_message_id ? <span>· msg {d.provider_message_id}</span> : null}
                        <span>· {fmtDate(d.updated_at)}</span>
                      </div>
                      {d.body ? <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-700">{d.body.slice(0, 200)}{d.body.length > 200 ? '…' : ''}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {d.status === 'failed' && (
                        <GhostButton onClick={() => retry(d.id)} disabled={busy === d.id} aria-label="Retry send"><Send size={14} /> Retry</GhostButton>
                      )}
                      {d.status === 'reconciliation_required' && (
                        <GhostButton onClick={() => reconcile(d.id)} disabled={busy === d.id} aria-label="Reconcile"><AlertTriangle size={14} /> Reconcile</GhostButton>
                      )}
                    </div>
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
