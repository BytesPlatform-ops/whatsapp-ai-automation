'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, CalendarDays, Sparkles, Trash2, Info, Check, X, Pencil,
  RefreshCw, Bookmark, Send, Save,
} from 'lucide-react';
import { metaApi } from '@/lib/pixie-lab/servicesClient';
import type { CalendarItem, CalendarStatus } from '@/lib/pixie-lab/serviceTypes';

const ACCENT = '#EC4899';
const box = 'rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5';

const STATUS_COLOR: Record<CalendarStatus, string> = {
  draft: '#94a3b8', review: '#f59e0b', approved: '#22c55e',
  scheduled: '#6366f1', published: '#0ea5e9', rejected: '#ef4444',
};

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

type EditDraft = Pick<CalendarItem, 'topic' | 'hook' | 'caption' | 'visual_direction'>;

/**
 * ContentCalendarPanel — a 7/30-day plan grounded in the Brand Brain, with the
 * full approval workflow: Draft → Review → Approved → Scheduled/Published. Each
 * item can be approved, rejected, edited, regenerated, saved to the idea library,
 * or sent to publish. Publishing NEVER happens here — "Request publish" files an
 * approval in the Approvals tab; the existing gate does the (mock/real) publish.
 */
export function ContentCalendarPanel() {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [horizon, setHorizon] = useState(7);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [meta, setMeta] = useState<{ brand_brain_used?: boolean; ai_generated?: boolean; note?: string } | null>(null);
  const [err, setErr] = useState('');

  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [busyId, setBusyId] = useState('');
  const [toast, setToast] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const d = await metaApi.calendar();
    if (d.items) setItems(d.items);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const flash = (id: string, msg: string) => {
    setToast((p) => ({ ...p, [id]: msg }));
    setTimeout(() => setToast((p) => { const n = { ...p }; delete n[id]; return n; }), 4000);
  };

  async function generate() {
    setGenerating(true); setErr(''); setMeta(null);
    const d = await metaApi.generateCalendar(horizon);
    setGenerating(false);
    if (!d || d.backendUp === false) { setErr('The marketing service is offline.'); return; }
    if (d.status === 'not_connected') { setErr(d.message || 'Connect Meta first.'); return; }
    setItems(d.items || []);
    setMeta({ brand_brain_used: d.brand_brain_used, ai_generated: d.ai_generated, note: d.note });
  }

  const patchLocal = (id: string, p: Partial<CalendarItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));

  async function setStatus(id: string, status: CalendarStatus) {
    patchLocal(id, { status });
    await metaApi.updateCalendarItem(id, { status });
  }

  function startEdit(it: CalendarItem) {
    setEditingId(it.id);
    setDraft({ topic: it.topic, hook: it.hook, caption: it.caption, visual_direction: it.visual_direction });
  }
  async function saveEdit(id: string) {
    if (!draft) return;
    setBusyId(id);
    patchLocal(id, draft);
    await metaApi.updateCalendarItem(id, draft);
    setBusyId(''); setEditingId(''); setDraft(null);
  }

  async function regenerate(id: string) {
    setBusyId(id);
    const d = await metaApi.regenerateCalendarItem(id);
    setBusyId('');
    if (d.item) patchLocal(id, d.item);
  }
  async function saveToLibrary(id: string) {
    setBusyId(id);
    const d = await metaApi.saveCalendarItemToLibrary(id);
    setBusyId('');
    flash(id, d.status === 'saved' ? 'Saved to Idea library ✓' : 'Could not save');
  }
  async function requestPublish(id: string) {
    setBusyId(id);
    const d = await metaApi.requestPublishCalendarItem(id);
    setBusyId('');
    if (d.status === 'approval_required') {
      patchLocal(id, { status: 'scheduled' });
      flash(id, 'Queued — approve it in the Approvals tab.');
    } else {
      flash(id, d.message || 'Could not queue for publish.');
    }
  }
  async function remove(id: string) {
    patchLocal(id, {}); setItems((p) => p.filter((it) => it.id !== id));
    await metaApi.deleteCalendarItem(id);
  }

  const btn = 'inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-50';

  return (
    <div className="mt-6 space-y-5">
      {/* Header / generate */}
      <div className={box}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--pl-border)]" style={{ background: `${ACCENT}1a`, color: ACCENT }}>
              <CalendarDays size={18} />
            </span>
            <div>
              <h3 className="font-display text-[15px] font-bold text-[var(--pl-text)]">Content Calendar</h3>
              <p className="text-[12px] text-[var(--pl-text-muted)]">Plan → review → approve → schedule. Publishing goes through Approvals.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-[var(--pl-border)] p-0.5">
              {[7, 30].map((h) => (
                <button key={h} onClick={() => setHorizon(h)}
                  className="rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition"
                  style={horizon === h ? { background: ACCENT, color: '#fff' } : { color: 'var(--pl-text-soft)' }}>
                  {h}-day
                </button>
              ))}
            </div>
            <button onClick={() => void generate()} disabled={generating}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: ACCENT }}>
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate
            </button>
          </div>
        </div>
        {err && <p className="mt-3 text-[13px]" style={{ color: '#ef4444' }}>{err}</p>}
        {meta && (meta.brand_brain_used === false || meta.ai_generated === false) && (
          <p className="mt-3 flex items-start gap-1.5 text-[12px] text-[var(--pl-text-muted)]">
            <Info size={13} className="mt-0.5 flex-none" />
            {meta.note}{meta.ai_generated === false ? ' AI-written drafts appear with a real model (PIXIE_MODEL_MODE=openai).' : ''}
          </p>
        )}
        <p className="mt-2 text-[11.5px] text-[var(--pl-text-muted)]">Generating replaces the current calendar. Nothing publishes automatically.</p>
      </div>

      {/* Items */}
      {loading && items.length === 0 ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--pl-text-muted)]"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : items.length === 0 ? (
        <div className={box}><p className="text-[13px] text-[var(--pl-text-muted)]">No calendar yet. Pick 7-day or 30-day and hit Generate.</p></div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => {
            const busy = busyId === it.id;
            const editing = editingId === it.id;
            const color = STATUS_COLOR[it.status];
            return (
              <div key={it.id} className={box}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-2.5 py-1 text-[12px] font-bold text-[var(--pl-text)]">{fmtDate(it.date)}</span>
                    <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold capitalize" style={{ background: `${ACCENT}1a`, color: ACCENT }}>{it.platform}</span>
                    <span className="rounded-full border border-[var(--pl-border)] px-2 py-0.5 text-[10.5px] font-semibold uppercase text-[var(--pl-text-soft)]">{it.content_type}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold capitalize" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>{it.status}</span>
                    <button onClick={() => void remove(it.id)} className="text-[var(--pl-text-muted)] transition hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                </div>

                {editing && draft ? (
                  <div className="mt-3 space-y-2">
                    {(['topic', 'hook', 'caption', 'visual_direction'] as const).map((f) => (
                      <div key={f}>
                        <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--pl-text-muted)]">{f.replace('_', ' ')}</label>
                        <textarea value={draft[f] || ''} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                          rows={f === 'caption' ? 3 : 2}
                          className="mt-1 w-full rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)]" />
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <button onClick={() => void saveEdit(it.id)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: ACCENT }}>
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
                      </button>
                      <button onClick={() => { setEditingId(''); setDraft(null); }} className={btn}><X size={13} /> Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-2.5 font-display text-[14px] font-bold text-[var(--pl-text)]">{it.topic}</p>
                    {it.hook && <p className="mt-0.5 text-[12.5px] font-medium text-[var(--pl-text-soft)]">“{it.hook}”</p>}
                    {it.caption && <p className="mt-1.5 text-[12.5px] text-[var(--pl-text-muted)]">{it.caption}</p>}
                    {it.visual_direction && <p className="mt-1.5 text-[12px] text-[var(--pl-text-muted)]"><span className="font-semibold">Visual:</span> {it.visual_direction}</p>}

                    {/* Action bar */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--pl-border)] pt-3">
                      {it.status !== 'approved' && it.status !== 'scheduled' && it.status !== 'published' && (
                        <button onClick={() => void setStatus(it.id, 'approved')} className={btn} style={{ color: '#22c55e' }}><Check size={13} /> Approve</button>
                      )}
                      {it.status !== 'rejected' && (
                        <button onClick={() => void setStatus(it.id, 'rejected')} className={btn}><X size={13} /> Reject</button>
                      )}
                      <button onClick={() => startEdit(it)} className={btn}><Pencil size={13} /> Edit</button>
                      <button onClick={() => void regenerate(it.id)} disabled={busy} className={btn}>{busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Regenerate</button>
                      <button onClick={() => void saveToLibrary(it.id)} disabled={busy} className={btn}><Bookmark size={13} /> Save to library</button>
                      {(it.status === 'approved') && (
                        <button onClick={() => void requestPublish(it.id)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: ACCENT }}>
                          {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Request publish
                        </button>
                      )}
                    </div>
                    {toast[it.id] && <p className="mt-2 text-[12px]" style={{ color: ACCENT }}>{toast[it.id]}</p>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
