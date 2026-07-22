'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Brain, Sparkles, RefreshCw, Info, TrendingUp, TrendingDown } from 'lucide-react';
import { metaApi } from '@/lib/pixie-lab/servicesClient';
import type { BrandBrain } from '@/lib/pixie-lab/serviceTypes';

const ACCENT = '#EC4899';
const box = 'rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5';

function Chips({ items }: { items?: string[] }) {
  if (!items?.length) return <p className="text-[13px] text-[var(--pl-text-muted)]">—</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <span key={i} className="rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--pl-text-soft)]">{t}</span>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--pl-text-muted)]">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/**
 * BrandBrainPanel — learns the business's voice from its own old Facebook/Instagram
 * posts and shows it back: tone, audience, services, best/weak topics & hooks,
 * content pillars, CTA style, posting suggestions — plus deterministic engagement
 * stats (top/weak posts, post-type mix). Read-only over Meta. The AI summary needs
 * a real model; deterministic stats always show. Persisted per workspace.
 */
export function BrandBrainPanel() {
  const [data, setData] = useState<(BrandBrain & { backendUp?: boolean }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const d = await metaApi.brandBrain();
    setData(d);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function generate() {
    setGenerating(true); setErr('');
    const d = await metaApi.generateBrandBrain();
    setGenerating(false);
    if (!d || d.backendUp === false) { setErr('The marketing service is offline.'); return; }
    if (d.status === 'not_connected') { setErr(d.message || 'Connect Meta first.'); return; }
    setData(d);
  }

  if (loading && !data) {
    return (
      <div className="mt-6 flex items-center gap-2 text-[13px] text-[var(--pl-text-muted)]">
        <Loader2 size={14} className="animate-spin" /> Loading Brand Brain…
      </div>
    );
  }

  const exists = data?.exists;
  const a = data?.analyzed || {};
  const s = data?.stats || {};

  return (
    <div className="mt-6 space-y-5">
      {/* Header / generate */}
      <div className={box}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--pl-border)]" style={{ background: `${ACCENT}1a`, color: ACCENT }}>
              <Brain size={18} />
            </span>
            <div>
              <h3 className="font-display text-[15px] font-bold text-[var(--pl-text)]">Brand Brain</h3>
              <p className="text-[12px] text-[var(--pl-text-muted)]">
                {exists
                  ? `Learned from ${data?.post_count ?? 0} recent posts · ${data?.source === 'demo' ? 'demo data' : 'your account'}`
                  : 'Learn your brand voice from your own old posts.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => void generate()}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : exists ? <RefreshCw size={14} /> : <Sparkles size={14} />}
            {exists ? 'Rebuild' : 'Build Brand Brain'}
          </button>
        </div>
        {err && <p className="mt-3 text-[13px]" style={{ color: '#ef4444' }}>{err}</p>}
        {exists && data?.ai_generated === false && (
          <p className="mt-3 flex items-start gap-1.5 text-[12px] text-[var(--pl-text-muted)]">
            <Info size={13} className="mt-0.5 flex-none" />
            {data?.source === 'demo'
              ? 'Showing a demo brand profile. The AI writes this from your real posts when the backend runs with a real model.'
              : 'Engagement stats are from your real posts. The AI-written summary appears when the backend runs with a real model (PIXIE_MODEL_MODE=openai).'}
          </p>
        )}
      </div>

      {!exists ? (
        <div className={box}>
          <p className="text-[13px] text-[var(--pl-text-muted)]">
            No Brand Brain yet. Click <b>Build Brand Brain</b> and Pixie will read your recent Facebook &amp;
            Instagram posts, find what performs, and summarize your brand’s voice, audience, and best topics.
          </p>
        </div>
      ) : (
        <>
          {/* Identity */}
          <div className={box}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Brand tone"><p className="text-[13px] text-[var(--pl-text-soft)]">{a.brand_tone || '—'}</p></Field>
              <Field label="Audience"><p className="text-[13px] text-[var(--pl-text-soft)]">{a.audience || '—'}</p></Field>
              <Field label="Main services / offers"><Chips items={a.services} /></Field>
              <Field label="Recommended CTA style"><p className="text-[13px] text-[var(--pl-text-soft)]">{a.cta_style || '—'}</p></Field>
            </div>
          </div>

          {/* Topics + hooks */}
          <div className={box}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Best-performing topics"><Chips items={a.best_topics} /></Field>
              <Field label="Best-performing hooks">
                {a.best_hooks?.length
                  ? <ul className="space-y-1">{a.best_hooks.map((h, i) => <li key={i} className="text-[13px] text-[var(--pl-text-soft)]">“{h}”</li>)}</ul>
                  : <p className="text-[13px] text-[var(--pl-text-muted)]">—</p>}
              </Field>
              <Field label="Weak topics"><Chips items={a.weak_topics} /></Field>
              <Field label="Suggested content pillars"><Chips items={a.content_pillars} /></Field>
            </div>
          </div>

          {/* Posting suggestions */}
          {a.posting_suggestions?.length ? (
            <div className={box}>
              <Field label="Posting suggestions">
                <ul className="mt-1 space-y-1.5">
                  {a.posting_suggestions.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--pl-text-soft)]">
                      <Sparkles size={13} className="mt-0.5 flex-none" style={{ color: ACCENT }} />{p}
                    </li>
                  ))}
                </ul>
              </Field>
            </div>
          ) : null}

          {/* Engagement stats (deterministic) */}
          <div className={box}>
            <h4 className="font-display text-[14px] font-bold text-[var(--pl-text)]">From your posts</h4>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Posts</div>
                <div className="mt-1 font-display text-[18px] font-extrabold text-[var(--pl-text)]">{s.total_posts ?? 0}</div>
              </div>
              <div className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Avg engagement</div>
                <div className="mt-1 font-display text-[18px] font-extrabold text-[var(--pl-text)]">{s.avg_engagement ?? 0}</div>
              </div>
              <div className="col-span-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Post types</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {Object.entries(s.post_types || {}).map(([t, n]) => (
                    <span key={t} className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${ACCENT}1a`, color: ACCENT }}>{t.replace('_ALBUM', '')} · {n}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--pl-text)]"><TrendingUp size={13} style={{ color: '#22c55e' }} /> Top posts</p>
                <ul className="mt-2 space-y-1.5">
                  {(s.top_posts || []).map((p, i) => (
                    <li key={i} className="text-[12.5px] text-[var(--pl-text-soft)]">
                      <span className="text-[var(--pl-text-muted)]">{p.engagement}·{p.type?.replace('_ALBUM', '')}</span> {p.caption}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--pl-text)]"><TrendingDown size={13} style={{ color: '#ef4444' }} /> Weak posts</p>
                <ul className="mt-2 space-y-1.5">
                  {(s.weak_posts || []).map((p, i) => (
                    <li key={i} className="text-[12.5px] text-[var(--pl-text-soft)]">
                      <span className="text-[var(--pl-text-muted)]">{p.engagement}·{p.type?.replace('_ALBUM', '')}</span> {p.caption}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
