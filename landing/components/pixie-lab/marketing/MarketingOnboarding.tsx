'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquareText, Check, CheckCircle2 } from 'lucide-react';
import { metaApi } from '@/lib/pixie-lab/servicesClient';
import type { BusinessProfile, ProfileQuestion } from '@/lib/pixie-lab/serviceTypes';

const ACCENT = '#EC4899';
const box = 'rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5';
const BATCH = 3; // ask a few at a time — never block the page

type Answer = string | string[];

function Field({ q, value, onChange }: { q: ProfileQuestion; value: Answer; onChange: (v: Answer) => void }) {
  if (q.kind === 'single') {
    return (
      <div className="flex flex-wrap gap-1.5">
        {(q.options || []).map((o) => {
          const on = value === o;
          return (
            <button key={o} type="button" onClick={() => onChange(on ? '' : o)}
              className="rounded-full border px-3 py-1.5 text-[12px] font-semibold transition"
              style={on ? { background: ACCENT, color: '#fff', borderColor: ACCENT } : { borderColor: 'var(--pl-border)', color: 'var(--pl-text-soft)' }}>
              {o}
            </button>
          );
        })}
      </div>
    );
  }
  if (q.kind === 'multi') {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {(q.options || []).map((o) => {
          const on = arr.includes(o);
          return (
            <button key={o} type="button" onClick={() => onChange(on ? arr.filter((x) => x !== o) : [...arr, o])}
              className="rounded-full border px-3 py-1.5 text-[12px] font-semibold transition"
              style={on ? { background: ACCENT, color: '#fff', borderColor: ACCENT } : { borderColor: 'var(--pl-border)', color: 'var(--pl-text-soft)' }}>
              {o}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <input value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)}
      placeholder="Type your answer…"
      className="w-full rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)]" />
  );
}

/**
 * MarketingOnboarding — Pixie acts like a marketer taking a brief. When the
 * business profile is incomplete it asks a few questions at a time (never blocks
 * the page); answers are saved to pixie_kv and feed the Brand Brain. Collapses to
 * a slim "complete" note once fully answered. Calls onSaved so the parent can
 * re-analyze with the new context.
 */
export function MarketingOnboarding({ onSaved }: { onSaved?: () => void }) {
  const [profile, setProfile] = useState<(BusinessProfile & { backendUp?: boolean }) | null>(null);
  const [draft, setDraft] = useState<Record<string, Answer>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const d = await metaApi.marketingProfile();
    if (d && d.backendUp !== false) setProfile(d);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!profile) return null;
  if (profile.complete) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-2.5">
        <CheckCircle2 size={15} style={{ color: '#22c55e' }} />
        <span className="text-[12.5px] text-[var(--pl-text-soft)]">Business profile complete — Pixie is using it to personalize everything.</span>
      </div>
    );
  }

  const missing = (profile.missing || []).slice(0, BATCH);
  const pct = Math.round((profile.completion || 0) * 100);

  async function save() {
    const filled: Record<string, Answer> = {};
    for (const [k, v] of Object.entries(draft)) {
      if ((typeof v === 'string' && v.trim()) || (Array.isArray(v) && v.length)) filled[k] = v;
    }
    if (!Object.keys(filled).length) return;
    setSaving(true);
    const d = await metaApi.saveMarketingProfile(filled);
    setSaving(false);
    if (d && d.backendUp !== false) { setProfile(d); setDraft({}); onSaved?.(); }
  }

  return (
    <div className={`mt-4 ${box}`} style={{ borderColor: ACCENT }}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${ACCENT}1a`, color: ACCENT }}>
          <MessageSquareText size={18} />
        </span>
        <div className="flex-1">
          <h3 className="font-display text-[14.5px] font-bold text-[var(--pl-text)]">Pixie needs a little more context</h3>
          <p className="text-[12px] text-[var(--pl-text-muted)]">Answer a few quick questions so Pixie can plan for YOUR business. No pressure — do it gradually.</p>
        </div>
        <span className="text-[12px] font-semibold text-[var(--pl-text-muted)]">{profile.answered}/{profile.total}</span>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--pl-surface-soft)]">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: ACCENT }} />
      </div>

      <div className="mt-4 space-y-3.5">
        {missing.map((q) => (
          <div key={q.id}>
            <label className="text-[12.5px] font-semibold text-[var(--pl-text)]">{q.question}</label>
            <div className="mt-1.5"><Field q={q} value={draft[q.id] ?? (q.kind === 'multi' ? [] : '')} onChange={(v) => setDraft((p) => ({ ...p, [q.id]: v }))} /></div>
          </div>
        ))}
      </div>

      <button onClick={() => void save()} disabled={saving}
        className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: ACCENT }}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save &amp; continue
      </button>
    </div>
  );
}
