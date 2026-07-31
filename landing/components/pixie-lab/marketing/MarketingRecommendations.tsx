'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Loader2, ArrowRight, Brain, Database, Zap, X, Info } from 'lucide-react';
import { metaApi } from '@/lib/pixie-lab/servicesClient';
import { recTargetHref, actionLabel } from '@/lib/pixie-lab/marketingNav';
import type {
  MarketingRecommendation, MarketingBrandView, MarketingAnalysisState, MarketingPriority,
} from '@/lib/pixie-lab/serviceTypes';

const ACCENT = '#EC4899';
const box = 'rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5';

const PRIORITY_COLOR: Record<MarketingPriority, string> = { high: '#ef4444', medium: '#f59e0b', low: '#94a3b8' };
const REAL_SOURCES = new Set(['ads_insights', 'old_posts', 'page_content', 'instagram_content']);
const SOURCE_LABEL: Record<string, string> = {
  ads_insights: 'Ads data', old_posts: 'Your posts', page_content: 'Page activity',
  instagram_content: 'Instagram', no_data_setup: 'Setup', manual_business_context: 'Business context',
};

function pill(n: unknown): string {
  return typeof n === 'number' ? n.toLocaleString() : String(n ?? '—');
}

function RecCard({ rec, onResolve }: { rec: MarketingRecommendation; onResolve: (id: string, d: 'approve' | 'skip') => void }) {
  const color = PRIORITY_COLOR[rec.priority] || '#94a3b8';
  const fromMeta = REAL_SOURCES.has(rec.source);
  return (
    <div className={box}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold capitalize" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} /> {rec.priority}
        </span>
        <span className="rounded-full border border-[var(--pl-border)] px-2 py-0.5 text-[10.5px] font-semibold uppercase text-[var(--pl-text-soft)]">{rec.category}</span>
        {fromMeta && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: `${ACCENT}1a`, color: ACCENT }}>
            <Zap size={10} /> Generated from Meta data
          </span>
        )}
        <span className="ml-auto text-[11px] font-semibold text-[var(--pl-text-muted)]">{Math.round((rec.confidence || 0) * 100)}% match</span>
      </div>

      <h4 className="mt-2.5 font-display text-[14.5px] font-bold text-[var(--pl-text)]">{rec.title}</h4>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--pl-text-muted)]">{rec.reason}</p>

      {rec.draft && (
        <div className="mt-2.5 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-2.5 text-[12px]">
          <span className="font-semibold text-[var(--pl-text)]">Draft: </span>
          <span className="text-[var(--pl-text-soft)]">{rec.draft.campaign_name}</span>
          {rec.draft.status && (
            <span className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'color-mix(in srgb,#f59e0b 16%,transparent)', color: '#f59e0b' }}>{rec.draft.status}</span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Link href={recTargetHref(rec.target_tab, rec.draft ? rec.id : undefined)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white" style={{ background: ACCENT }}>
          {actionLabel(rec.action)} <ArrowRight size={13} />
        </Link>
        {rec.action !== 'connect' && (
          <button onClick={() => onResolve(rec.id, 'skip')} className="inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-3 py-2 text-[12.5px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]">
            <X size={13} /> Skip
          </button>
        )}
        <span className="ml-auto text-[10.5px] font-medium text-[var(--pl-text-muted)]">{SOURCE_LABEL[rec.source] || rec.source}</span>
      </div>
    </div>
  );
}

function Snapshot({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]"><Database size={11} /> {label}</div>
      <div className="mt-1 font-display text-[17px] font-extrabold text-[var(--pl-text)]">{value}</div>
    </div>
  );
}

/**
 * MarketingRecommendations — the shared intelligence panel: analyze CTA, data
 * snapshot, personalized recommendation cards (deep-linking into the workspace),
 * and a Brand Brain preview. Fetches its own data from the Marketing Brain and
 * assumes Meta is connected. Reused by the Command Center (main page) and the
 * full-service Overview tab so both stay in sync. Local-first analysis — never
 * hangs on a model.
 */
export function MarketingRecommendations({ analyzeSignal }: { analyzeSignal?: number } = {}) {
  const [recs, setRecs] = useState<MarketingRecommendation[]>([]);
  const [brand, setBrand] = useState<MarketingBrandView | null>(null);
  const [state, setState] = useState<MarketingAnalysisState | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [err, setErr] = useState('');

  const analyze = useCallback(async () => {
    setAnalyzing(true); setErr('');
    const d = await metaApi.marketingAnalyze();
    setAnalyzing(false);
    if (!d || d.backendUp === false) { setErr('The marketing service is offline — start the backend and try again.'); return; }
    setRecs(d.recommendations || []);
    setBrand(d.brand || null);
    setState(d.analysis_state || null);
  }, []);

  const loadStored = useCallback(async () => {
    const [s, r, b] = await Promise.all([metaApi.marketingState(), metaApi.marketingRecommendations(), metaApi.marketingBrain()]);
    if (s && s.backendUp !== false) setState(s);
    if (r?.recommendations) setRecs(r.recommendations);
    if (b && b.backendUp !== false) setBrand(b);
    return s;
  }, []);

  useEffect(() => {
    void loadStored().then((s) => { if (!s || !s.last_analyzed) void analyze(); });
  }, [loadStored, analyze]);

  // Re-analyze when the parent signals new context (e.g. onboarding answers saved).
  useEffect(() => {
    if (analyzeSignal) void analyze();
  }, [analyzeSignal, analyze]);

  async function resolve(id: string, decision: 'approve' | 'skip') {
    setRecs((p) => p.filter((r) => r.id !== id));
    await metaApi.resolveRecommendation(id, decision);
  }

  const summary = state?.data_source_summary || {};
  const lastAnalyzed = state?.last_analyzed ? new Date(state.last_analyzed).toLocaleString() : null;

  return (
    <div className="mt-6 space-y-4">
      {/* Analyze bar */}
      <div className={box}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-[14.5px] font-bold text-[var(--pl-text)]">Pixie's read on your business</h3>
            <p className="mt-0.5 text-[12.5px] text-[var(--pl-text-muted)]">
              {analyzing ? 'Analyzing your Meta account…' : state?.summary || 'Run an analysis to generate a personalized plan.'}
            </p>
            {lastAnalyzed && !analyzing && <p className="mt-0.5 text-[11px] text-[var(--pl-text-muted)]">Last analyzed {lastAnalyzed}</p>}
          </div>
          <button onClick={() => void analyze()} disabled={analyzing}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: ACCENT }}>
            {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Analyze with Pixie
          </button>
        </div>
        {err && <p className="mt-3 text-[13px]" style={{ color: '#ef4444' }}>{err}</p>}
      </div>

      {/* Data snapshot */}
      {state?.last_analyzed && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Snapshot label="Campaigns" value={pill(summary.campaigns)} />
          <Snapshot label="Ad spend" value={summary.has_spend ? 'Active' : 'None yet'} />
          <Snapshot label="Recent posts" value={pill(summary.posts)} />
          <Snapshot label="Instagram" value={summary.has_instagram ? 'Linked' : 'Not linked'} />
        </div>
      )}

      {/* Recommendations */}
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[15px] font-bold text-[var(--pl-text)]">Recommended for you</h3>
        {recs.length > 0 && <span className="text-[12px] text-[var(--pl-text-muted)]">{recs.length} suggestion{recs.length === 1 ? '' : 's'}</span>}
      </div>
      {analyzing && recs.length === 0 ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--pl-text-muted)]"><Loader2 size={14} className="animate-spin" /> Generating recommendations…</div>
      ) : recs.length === 0 ? (
        <div className={box}><p className="text-[13px] text-[var(--pl-text-muted)]">No suggestions right now — you're on top of things. Re-analyze after new activity.</p></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {recs.map((rec) => <RecCard key={rec.id} rec={rec} onResolve={resolve} />)}
        </div>
      )}

      {/* Brand preview */}
      {brand && (
        <div className={box}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Brain size={16} style={{ color: ACCENT }} />
              <h3 className="font-display text-[14px] font-bold text-[var(--pl-text)]">Brand Brain</h3>
              {brand.data_source && <span className="rounded-full border border-[var(--pl-border)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--pl-text-muted)]">{brand.data_source}</span>}
            </div>
            <Link href="/pixie-lab/marketing/full-service?tab=brand-brain" className="inline-flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: ACCENT }}>Open Brand Brain <ArrowRight size={13} /></Link>
          </div>
          <p className="mt-2 text-[13px] text-[var(--pl-text-soft)]">{brand.brand_summary}</p>
          {(brand.missing_data_warnings || []).length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-[12px] text-[var(--pl-text-muted)]">
              <Info size={13} className="mt-0.5 flex-none" /> {(brand.missing_data_warnings || [])[0]}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
