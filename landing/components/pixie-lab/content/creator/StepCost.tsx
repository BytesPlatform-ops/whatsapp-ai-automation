'use client';

import { useEffect, useState } from 'react';
import { getCostEstimate, approveProduction, type CreatorError } from '@/lib/pixie-lab/contentCreatorClient';
import type { CostEstimate } from '@/lib/pixie-lab/contentCreatorTypes';
import { GatePanel } from './GatePanel';
import { Badge } from './ui';
import type { StepProps } from './stepProps';

/** Stage 8 — Cost estimate + Gate 3 (production). Shows the estimate, then the hard
 *  no-spend production gate. Mock mode makes no paid call and charges nothing. */
export function StepCost({ state, advance }: StepProps) {
  const scriptId = state.approved_script_id;
  const [est, setEst] = useState<CostEstimate | null>(null);
  const [err, setErr] = useState<CreatorError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!scriptId) { setLoading(false); return; }
      const r = await getCostEstimate(scriptId, 15, 2);
      if (!alive) return;
      setLoading(false);
      if (r.ok) setEst(r.data); else setErr(r.error);
    })();
    return () => { alive = false; };
  }, [scriptId]);

  const c = est?.cost_estimate || {};
  const unavailable = est?.estimate_type === 'unavailable' || est?.status === 'provider_not_configured';

  return (
    <GatePanel
      title="Cost estimate · Gate 3 production"
      gate="production"
      status={state.gates.production}
      approveLabel="Approve production"
      spendWarning
      mock={state.mock}
      requireConfirm={state.mock ? undefined : 'Approving production authorises a paid video generation. Continue?'}
      whatSummary={
        <div className="space-y-2">
          {loading ? <p className="text-sm text-[var(--pl-text-soft)]">Estimating…</p> : null}
          {!loading && !scriptId ? <p className="text-sm text-amber-500">Approve a script first.</p> : null}
          {est ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-[var(--pl-text-soft)]">Provider</span><span className="text-[var(--pl-text)]">{est.provider}</span>
              <span className="text-[var(--pl-text-soft)]">Mode</span><span className="text-[var(--pl-text)]">{est.provider_mode}</span>
              <span className="text-[var(--pl-text-soft)]">Estimated credits</span><span className="text-[var(--pl-text)]">{c.estimated_credits ?? '—'}</span>
              <span className="text-[var(--pl-text-soft)]">Estimated cost</span><span className="text-[var(--pl-text)]">{c.estimated_provider_cost != null ? `$${Number(c.estimated_provider_cost).toFixed(2)}` : '—'}</span>
              {c.final_user_price != null ? <><span className="text-[var(--pl-text-soft)]">Your price</span><span className="text-[var(--pl-text)]">${Number(c.final_user_price).toFixed(2)}</span></> : null}
              <span className="text-[var(--pl-text-soft)]">Duration</span><span className="text-[var(--pl-text)]">{c.duration_seconds ?? 15}s</span>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {est ? <Badge tone={est.estimate_type === 'mock_estimated' ? 'warn' : unavailable ? 'muted' : 'info'}>{
              est.estimate_type === 'mock_estimated' ? 'Mock estimate' : unavailable ? 'Provider not configured' : est.estimate_type
            }</Badge> : null}
            <Badge tone="muted">Billing not enforced yet</Badge>
          </div>
        </div>
      }
      consequence="No provider spend happens before this gate. Approving unlocks video generation."
      onApprove={async () => {
        const r = await approveProduction();
        if (!r.ok) return r.error;
        await advance();
        return null;
      }}
    >
      {err ? <p role="alert" className="mt-3 text-sm text-red-500">{err.message}</p> : null}
    </GatePanel>
  );
}
