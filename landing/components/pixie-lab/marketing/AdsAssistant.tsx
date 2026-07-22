'use client';

import { useState } from 'react';
import { Loader2, Sparkles, TrendingDown, AlertTriangle, Lightbulb, Info } from 'lucide-react';
import { metaApi } from '@/lib/pixie-lab/servicesClient';
import type { MetaAdsAnalysis, MetaAdsSignal } from '@/lib/pixie-lab/serviceTypes';

const ACCENT = '#EC4899';

const SIGNAL_META: Record<MetaAdsSignal['type'], { color: string; Icon: typeof TrendingDown }> = {
  weak: { color: '#ef4444', Icon: TrendingDown },
  attention: { color: '#f59e0b', Icon: AlertTriangle },
  opportunity: { color: '#22c55e', Icon: Lightbulb },
};

/**
 * AdsAssistant — read-only intelligence for the selected ad account. On demand it
 * calls /api/meta/ads/analyze, which NEVER creates or changes a campaign: it
 * returns deterministic signals (always) plus AI-written angles + PAUSED campaign
 * ideas (only in real-model mode). Suggested campaigns are ideas the user acts on
 * via the PAUSED-only creator above — nothing here writes to Meta.
 */
export function AdsAssistant({ adAccountId, range }: { adAccountId: string; range: string }) {
  const [data, setData] = useState<(MetaAdsAnalysis & { backendUp?: boolean }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function analyze() {
    if (!adAccountId) return;
    setLoading(true); setErr(''); setData(null);
    const d = await metaApi.analyzeAds(adAccountId, range);
    setLoading(false);
    if (!d || d.backendUp === false) { setErr('The marketing service is offline.'); return; }
    if (d.status === 'error' || d.error) { setErr(d.message || 'Could not analyze this ad account.'); return; }
    if (d.status === 'not_connected') { setErr(d.message || 'Connect Meta first.'); return; }
    setData(d);
  }

  const box = 'rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5';
  const mockAI = data && data.llm_provider !== 'openai';

  return (
    <div className={box}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-[14.5px] font-bold text-[var(--pl-text)]">Ads assistant</h3>
          <p className="mt-1 text-[12px] text-[var(--pl-text-muted)]">
            A read-only read on this ad account. Never creates or changes a campaign.
          </p>
        </div>
        <button
          onClick={() => void analyze()}
          disabled={loading || !adAccountId}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: ACCENT }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {data ? 'Re-analyze' : 'Analyze with Pixie'}
        </button>
      </div>

      {err && <p className="mt-3 text-[13px]" style={{ color: '#ef4444' }}>{err}</p>}

      {data && (
        <div className="mt-4 space-y-4">
          {data.summary && (
            <p className="text-[13px] leading-relaxed text-[var(--pl-text-soft)]">{data.summary}</p>
          )}

          {/* Deterministic signals */}
          {(data.signals || []).length > 0 && (
            <div className="space-y-2">
              {(data.signals || []).map((s, i) => {
                const meta = SIGNAL_META[s.type] || SIGNAL_META.attention;
                const Icon = meta.Icon;
                return (
                  <div key={i} className="flex items-start gap-2.5 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
                    <Icon size={16} className="mt-0.5 flex-none" style={{ color: meta.color }} />
                    <div>
                      <p className="text-[13px] font-semibold text-[var(--pl-text)]">{s.title}</p>
                      <p className="text-[12.5px] text-[var(--pl-text-muted)]">{s.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* AI angles */}
          {(data.suggested_angles || []).length > 0 && (
            <div>
              <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--pl-text-muted)]">Suggested ad angles</p>
              <ul className="mt-2 space-y-1.5">
                {(data.suggested_angles || []).map((a, i) => (
                  <li key={i} className="text-[13px] text-[var(--pl-text-soft)]">
                    <span className="font-semibold text-[var(--pl-text)]">{a.angle}</span> — {a.rationale}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI suggested PAUSED campaigns (ideas only) */}
          {(data.suggested_paused_campaigns || []).length > 0 && (
            <div>
              <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--pl-text-muted)]">Campaign ideas (create paused)</p>
              <ul className="mt-2 space-y-1.5">
                {(data.suggested_paused_campaigns || []).map((c, i) => (
                  <li key={i} className="text-[13px] text-[var(--pl-text-soft)]">
                    <span className="font-semibold text-[var(--pl-text)]">{c.name}</span>
                    <span className="ml-1.5 rounded px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ background: 'var(--pl-surface-soft)' }}>{c.objective?.replace('OUTCOME_', '') || 'TRAFFIC'}</span>
                    <span className="block text-[12.5px] text-[var(--pl-text-muted)]">{c.rationale}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mockAI && (
            <p className="flex items-start gap-1.5 text-[12px] text-[var(--pl-text-muted)]">
              <Info size={13} className="mt-0.5 flex-none" />
              Signals above are computed from your real numbers. AI-written angles &amp; campaign ideas appear when the backend runs with a real model (PIXIE_MODEL_MODE=openai).
            </p>
          )}

          {data.note && <p className="text-[11.5px] text-[var(--pl-text-muted)]">{data.note}</p>}
        </div>
      )}
    </div>
  );
}
