'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Lightbulb, Sparkles, Bookmark, BookmarkCheck, Trash2, Info } from 'lucide-react';
import { metaApi } from '@/lib/pixie-lab/servicesClient';
import type { ContentIdea } from '@/lib/pixie-lab/serviceTypes';

const ACCENT = '#EC4899';
const box = 'rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5';

const IDEA_TYPES: { type: string; label: string }[] = [
  { type: 'carousel', label: 'Carousel' },
  { type: 'reel', label: 'Reel' },
  { type: 'caption_hook', label: 'Caption hooks' },
  { type: 'ad_angle', label: 'Ad angles' },
  { type: 'retargeting', label: 'Retargeting' },
  { type: 'educational', label: 'Educational' },
  { type: 'pain_point', label: 'Pain-point' },
  { type: 'before_after', label: 'Before / after' },
  { type: 'case_study', label: 'Case study' },
];

function IdeaCard({ idea, saved, onSave, onDelete }: {
  idea: ContentIdea; saved?: boolean; onSave?: () => void; onDelete?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: `${ACCENT}1a`, color: ACCENT }}>
          {idea.type_label || idea.type}
        </span>
        {onSave && (
          <button onClick={onSave} disabled={saved} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-60">
            {saved ? <BookmarkCheck size={13} style={{ color: '#22c55e' }} /> : <Bookmark size={13} />} {saved ? 'Saved' : 'Save'}
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--pl-text-muted)] transition hover:text-red-500">
            <Trash2 size={13} /> Remove
          </button>
        )}
      </div>
      <h4 className="mt-2 font-display text-[14px] font-bold text-[var(--pl-text)]">{idea.title}</h4>
      {idea.hook && <p className="mt-1 text-[12.5px] font-medium text-[var(--pl-text-soft)]">“{idea.hook}”</p>}
      <dl className="mt-2.5 space-y-1.5 text-[12.5px]">
        {idea.slide_flow_or_script && <Row label="Flow / script" value={idea.slide_flow_or_script} />}
        {idea.visual_direction && <Row label="Visual" value={idea.visual_direction} />}
        {idea.caption && <Row label="Caption" value={idea.caption} />}
        {idea.cta && <Row label="CTA" value={idea.cta} />}
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-[70px] flex-none text-[11px] font-bold uppercase tracking-wide text-[var(--pl-text-muted)]">{label}</dt>
      <dd className="text-[var(--pl-text-soft)]">{value}</dd>
    </div>
  );
}

/**
 * IdeaCuratorPanel — generate on-brand content ideas across 9 types (grounded in
 * the Brand Brain), then save the good ones to a persisted library. Read-only over
 * Meta. The AI writes ideas with a real model; a deterministic fallback keeps demo
 * mode useful. Saving/removing requires marketing.manage (proxy-enforced).
 */
export function IdeaCuratorPanel() {
  const [selected, setSelected] = useState<string[]>(['carousel', 'reel', 'educational']);
  const [perType, setPerType] = useState(2);
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [library, setLibrary] = useState<ContentIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<{ brand_brain_used?: boolean; ai_generated?: boolean; note?: string } | null>(null);
  const [err, setErr] = useState('');

  const loadLibrary = useCallback(async () => {
    const d = await metaApi.ideas();
    if (d.ideas) setLibrary(d.ideas);
  }, []);
  useEffect(() => { void loadLibrary(); }, [loadLibrary]);

  function toggle(t: string) {
    setSelected((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  }

  async function generate() {
    setLoading(true); setErr(''); setMeta(null);
    const d = await metaApi.generateIdeas(selected, perType);
    setLoading(false);
    if (!d || d.backendUp === false) { setErr('The marketing service is offline.'); return; }
    if (d.status === 'not_connected') { setErr(d.message || 'Connect Meta first.'); return; }
    setIdeas(d.ideas || []);
    setMeta({ brand_brain_used: d.brand_brain_used, ai_generated: d.ai_generated, note: d.note });
  }

  async function save(idea: ContentIdea) {
    const d = await metaApi.saveIdea(idea);
    if (d.status === 'saved') {
      setSavedIds((p) => new Set(p).add(idea.id));
      void loadLibrary();
    }
  }

  async function remove(id: string) {
    await metaApi.deleteIdea(id);
    void loadLibrary();
  }

  return (
    <div className="mt-6 space-y-5">
      {/* Controls */}
      <div className={box}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--pl-border)]" style={{ background: `${ACCENT}1a`, color: ACCENT }}>
            <Lightbulb size={18} />
          </span>
          <div>
            <h3 className="font-display text-[15px] font-bold text-[var(--pl-text)]">Idea Curator</h3>
            <p className="text-[12px] text-[var(--pl-text-muted)]">Generate on-brand ideas, then save the best to your library.</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {IDEA_TYPES.map((t) => {
            const on = selected.includes(t.type);
            return (
              <button key={t.type} onClick={() => toggle(t.type)}
                className="rounded-full border px-3 py-1.5 text-[12px] font-semibold transition"
                style={on
                  ? { background: ACCENT, color: '#fff', borderColor: ACCENT }
                  : { borderColor: 'var(--pl-border)', color: 'var(--pl-text-soft)' }}>
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <label className="text-[12.5px] text-[var(--pl-text-muted)]">Per type</label>
          <select value={perType} onChange={(e) => setPerType(Number(e.target.value))} className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)]">
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button onClick={() => void generate()} disabled={loading || selected.length === 0}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: ACCENT }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate ideas
          </button>
        </div>
        {err && <p className="mt-3 text-[13px]" style={{ color: '#ef4444' }}>{err}</p>}
        {meta && (meta.brand_brain_used === false || meta.ai_generated === false) && (
          <p className="mt-3 flex items-start gap-1.5 text-[12px] text-[var(--pl-text-muted)]">
            <Info size={13} className="mt-0.5 flex-none" />
            {meta.note}{meta.ai_generated === false ? ' AI-written ideas appear with a real model (PIXIE_MODEL_MODE=openai).' : ''}
          </p>
        )}
      </div>

      {/* Generated ideas */}
      {ideas.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} saved={savedIds.has(idea.id)} onSave={() => void save(idea)} />
          ))}
        </div>
      )}

      {/* Saved library */}
      <div className={box}>
        <h3 className="font-display text-[14.5px] font-bold text-[var(--pl-text)]">Idea library <span className="text-[12px] font-normal text-[var(--pl-text-muted)]">({library.length})</span></h3>
        {library.length === 0 ? (
          <p className="mt-2 text-[13px] text-[var(--pl-text-muted)]">Nothing saved yet. Generate ideas above and hit Save.</p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {library.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} onDelete={() => void remove(idea.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
