'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Users, Mail, Kanban, Send, Link2, Download, Upload, Loader2,
  Plus, CheckCircle2, X, AlertTriangle,
} from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type {
  SeoOutreachContact, SeoOutreachCampaign, SeoOutreachDraft, SeoLinkPlacement,
} from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';

const ACCENT = '#14B8A6';

type OutView = 'contacts' | 'campaigns' | 'drafts' | 'placements';

const VIEW_LABELS: { v: OutView; label: string; icon: typeof Users }[] = [
  { v: 'contacts', label: 'Contacts', icon: Users },
  { v: 'campaigns', label: 'Campaigns', icon: Kanban },
  { v: 'drafts', label: 'Drafts', icon: Mail },
  { v: 'placements', label: 'Placements', icon: Link2 },
];

const CAMPAIGN_STATUS_COLOR: Record<string, string> = {
  draft: '#64748b',
  active: ACCENT,
  paused: '#f59e0b',
  completed: '#22c55e',
  cancelled: '#ef4444',
};

function ContactsView() {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [contacts, setContacts] = useState<SeoOutreachContact[]>([]);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    const env = await seoApi.outreachContacts();
    if (!env.backendUp) { setStatus('offline'); return; }
    setContacts(env.contacts ?? []);
    setStatus('done');
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleExport() {
    const env = await seoApi.exportOutreachContacts();
    if (env.csv) {
      const blob = new Blob([env.csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'outreach-contacts.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const text = await file.text();
    await seoApi.importOutreachContacts(text);
    setImporting(false);
    load();
  }

  async function handleSuppress(id: string) {
    await seoApi.suppressOutreachContact(id);
    load();
  }

  if (status === 'loading') return <LoadingCards count={3} height="h-16" />;
  if (status === 'offline') return <OfflineState service="SEO" action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] text-[var(--pl-text-muted)]">{contacts.length} contacts</span>
        <div className="ml-auto flex gap-2">
          <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]">
            <Download size={12} style={{ color: ACCENT }} /> Export
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]">
            {importing ? <Loader2 size={12} className="animate-spin" style={{ color: ACCENT }} /> : <Upload size={12} style={{ color: ACCENT }} />}
            {importing ? 'Importing…' : 'Import CSV'}
            <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
          </label>
        </div>
      </div>

      {contacts.length === 0 ? (
        <EmptyState title="No contacts yet" body="Import a CSV of outreach contacts to get started." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--pl-border)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-[12.5px]">
              <thead>
                <tr className="border-b border-[var(--pl-border)] bg-[var(--pl-surface-soft)]">
                  {['Name', 'Email', 'Domain', 'Status', ''].map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left font-semibold text-[var(--pl-text-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contacts.map((c, i) => (
                  <tr key={c.id} className={`border-b border-[var(--pl-border)] ${i % 2 === 0 ? '' : 'bg-[var(--pl-surface-soft)]'}`}>
                    <td className="px-3 py-2 font-medium text-[var(--pl-text-soft)]">{c.name ?? '—'}</td>
                    <td className="px-3 py-2 text-[var(--pl-text-muted)]">{c.email ?? '—'}</td>
                    <td className="px-3 py-2 text-[var(--pl-text-muted)]">{c.domain ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className="capitalize rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                        style={c.status === 'suppressed'
                          ? { background: 'rgba(100,116,139,0.12)', color: '#64748b' }
                          : { background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`, color: ACCENT }}>
                        {c.status ?? 'active'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {c.status !== 'suppressed' && (
                        <button onClick={() => handleSuppress(c.id)} className="text-[11.5px] font-semibold text-[var(--pl-text-muted)] transition hover:text-red-500">
                          Suppress
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignsView() {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [campaigns, setCampaigns] = useState<SeoOutreachCampaign[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    const env = await seoApi.outreachCampaigns();
    if (!env.backendUp) { setStatus('offline'); return; }
    setCampaigns(env.campaigns ?? []);
    setStatus('done');
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    await seoApi.createOutreachCampaign({ name: newName.trim() });
    setCreating(false);
    setNewName('');
    setShowNew(false);
    load();
  }

  if (status === 'loading') return <LoadingCards count={3} height="h-20" />;
  if (status === 'offline') return <OfflineState service="SEO" action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] text-[var(--pl-text-muted)]">{campaigns.length} campaigns</span>
        <button onClick={() => setShowNew(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12.5px] font-bold text-[#02120f]" style={{ background: ACCENT }}>
          <Plus size={13} /> New Campaign
        </button>
      </div>

      {showNew && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Campaign name…"
            className="flex-1 bg-transparent text-[13px] text-[var(--pl-text)] outline-none placeholder:text-[var(--pl-text-muted)]"
          />
          <button onClick={handleCreate} disabled={creating || !newName.trim()} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-bold text-[#02120f] disabled:opacity-60" style={{ background: ACCENT }}>
            {creating ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Create
          </button>
          <button onClick={() => setShowNew(false)} className="text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]"><X size={14} /></button>
        </div>
      )}

      {campaigns.length === 0 ? (
        <EmptyState title="No campaigns yet" body="Create a campaign to start your outreach workflow." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {campaigns.map((c) => (
            <div key={c.id} className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-[14px] font-bold text-[var(--pl-text)]">{c.name}</p>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold capitalize" style={{ background: `color-mix(in srgb, ${CAMPAIGN_STATUS_COLOR[c.status ?? 'draft'] ?? ACCENT} 14%, transparent)`, color: CAMPAIGN_STATUS_COLOR[c.status ?? 'draft'] ?? ACCENT }}>
                  {c.status ?? 'draft'}
                </span>
              </div>
              <div className="flex gap-4 text-[12px] text-[var(--pl-text-muted)]">
                <span>{c.contact_count ?? 0} contacts</span>
                <span>{c.sent_count ?? 0} sent</span>
                <span>{c.reply_count ?? 0} replies</span>
                <span>{c.placement_count ?? 0} placements</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DraftsView() {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [drafts, setDrafts] = useState<SeoOutreachDraft[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    const env = await seoApi.outreachDrafts();
    if (!env.backendUp) { setStatus('offline'); return; }
    setDrafts(env.drafts ?? []);
    setStatus('done');
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(draft_id: string) {
    setApprovingId(draft_id);
    await seoApi.approveOutreachDraft(draft_id);
    setApprovingId(null);
    load();
  }

  async function handleSend(draft_id: string) {
    const d = drafts.find((x) => x.id === draft_id);
    if (d?.status !== 'approved') return;
    setSendingId(draft_id);
    await seoApi.sendOutreachDraft(draft_id);
    setSendingId(null);
    load();
  }

  if (status === 'loading') return <LoadingCards count={3} height="h-24" />;
  if (status === 'offline') return <OfflineState service="SEO" action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />;

  if (!drafts.length) {
    return <EmptyState title="No drafts yet" body="Drafts are generated for each contact in a campaign. Start a campaign to generate drafts." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-4 py-2.5">
        <AlertTriangle size={13} style={{ color: '#f59e0b' }} />
        <p className="text-[12.5px] text-[var(--pl-text-muted)]">Approval is required before any email is sent. Review and approve each draft below.</p>
      </div>
      {drafts.map((d) => (
        <div key={d.id} className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-[var(--pl-text)]">{d.subject ?? '(no subject)'}</p>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold capitalize" style={
              d.status === 'approved' ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e' }
                : d.status === 'sent' ? { background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`, color: ACCENT }
                : { background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }
            }>
              {d.status ?? 'pending'}
            </span>
          </div>
          {d.body && <pre className="whitespace-pre-wrap rounded-lg bg-[var(--pl-surface-soft)] p-3 text-[12px] text-[var(--pl-text-soft)] font-sans">{d.body}</pre>}
          <div className="flex gap-2">
            {d.status === 'pending' && (
              <button onClick={() => handleApprove(d.id)} disabled={approvingId === d.id} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold text-[#02120f] disabled:opacity-60" style={{ background: ACCENT }}>
                {approvingId === d.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                Approve
              </button>
            )}
            {d.status === 'approved' && (
              <button onClick={() => handleSend(d.id)} disabled={sendingId === d.id} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold text-[#02120f] disabled:opacity-60" style={{ background: ACCENT }}>
                {sendingId === d.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Send
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlacementsView() {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [placements, setPlacements] = useState<SeoLinkPlacement[]>([]);

  const load = useCallback(async () => {
    setStatus('loading');
    const env = await seoApi.linkPlacements();
    if (!env.backendUp) { setStatus('offline'); return; }
    setPlacements(env.placements ?? []);
    setStatus('done');
  }, []);

  useEffect(() => { load(); }, [load]);

  if (status === 'loading') return <LoadingCards count={3} height="h-16" />;
  if (status === 'offline') return <OfflineState service="SEO" action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />;
  if (!placements.length) return <EmptyState title="No placements yet" body="Link placements are confirmed once outreach replies with a published link." />;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--pl-border)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--pl-border)] bg-[var(--pl-surface-soft)]">
              {['Source Domain', 'Target URL', 'Anchor', 'Status', 'Confirmed'].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-[var(--pl-text-muted)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {placements.map((p, i) => (
              <tr key={p.id} className={`border-b border-[var(--pl-border)] ${i % 2 === 0 ? '' : 'bg-[var(--pl-surface-soft)]'}`}>
                <td className="px-3 py-2 font-medium text-[var(--pl-text-soft)]">{p.source_domain ?? '—'}</td>
                <td className="max-w-[180px] truncate px-3 py-2 text-[var(--pl-text-muted)]">{p.target_url ?? '—'}</td>
                <td className="max-w-[120px] truncate px-3 py-2 text-[var(--pl-text-muted)]">{p.anchor ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className="capitalize rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={
                    p.status === 'confirmed' ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e' }
                      : p.status === 'lost' ? { background: 'rgba(239,68,68,0.12)', color: '#ef4444' }
                      : { background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }
                  }>
                    {p.status ?? 'pending'}
                  </span>
                </td>
                <td className="px-3 py-2 text-[var(--pl-text-muted)]">
                  {p.confirmed_at ? new Date(p.confirmed_at).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SeoOutreachPanel() {
  const [view, setView] = useState<OutView>('contacts');

  return (
    <div className="mt-6 space-y-5">
      {/* Sub-view tabs */}
      <div className="flex flex-wrap gap-1.5">
        {VIEW_LABELS.map(({ v, label, icon: Icon }) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
            style={view === v
              ? { background: `color-mix(in srgb, ${ACCENT} 16%, transparent)`, color: ACCENT }
              : { color: 'var(--pl-text-muted)' }}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {view === 'contacts' && <ContactsView />}
      {view === 'campaigns' && <CampaignsView />}
      {view === 'drafts' && <DraftsView />}
      {view === 'placements' && <PlacementsView />}
    </div>
  );
}
