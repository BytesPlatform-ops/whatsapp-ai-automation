'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { generateIdeas, invalidateFrom, type CreatorError } from '@/lib/pixie-lab/contentCreatorClient';
import { StepCard, PrimaryButton, GhostButton, ErrorNote, Badge, TextField } from './ui';
import { staleGatesFor, type StepProps } from './stepProps';
import { useCreditEstimate } from '@/lib/pixie-lab/useCreditEstimate';
import { CreditEstimateBadge } from '@/components/pixie-lab/billing/CreditEstimateBadge';
import { InsufficientCreditsNotice } from '@/components/pixie-lab/billing/InsufficientCreditsNotice';

/** Stage 4 — Idea generation (AI, mock by default). Generates + scores reel ideas.
 *  Complete once ideas exist; approval is the next stage. Regeneration overwrites. */
export function StepIdeas({ state, advance, reload }: StepProps) {
  const [seeds, setSeeds] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<CreatorError | null>(null);
  const ideas = state.ideas;
  const stale = staleGatesFor(state, 'idea_generation');

  // Non-blocking credit estimate — only renders when credit system is enabled.
  const { show: showEstimate, estimate } = useCreditEstimate({
    operation: 'influencer_idea',
    is_mock: state.mock,
    byok: false,
  });

  async function run() {
    if (stale.length && !window.confirm(`Regenerating ideas resets ${stale.join(', ')} and later work. Continue?`)) return;
    setBusy(true); setErr(null);
    if (stale.length) await invalidateFrom('idea_generation');
    const res = await generateIdeas(seeds.split(',').map((s) => s.trim()).filter(Boolean));
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    await reload();
  }

  // Derive billing error code — only handle insufficient_credits as the creator
  // client doesn't expose BillingErrorCode directly.
  const billingCode =
    err?.kind === 'unknown' || err?.kind === 'server'
      ? (() => {
          const d = err?.detail as Record<string, unknown> | undefined;
          const code = typeof d?.error === 'string' ? d.error : null;
          return code === 'insufficient_credits' ? 'insufficient_credits' as const : null;
        })()
      : null;

  return (
    <StepCard
      title="Idea generation"
      description="Generate and score short-form reel ideas from the business profile and current trends."
      footer={
        <>
          {/* Credit estimate badge — only renders when credit system is enabled */}
          {showEstimate && estimate && (
            <CreditEstimateBadge estimate={estimate} />
          )}
          <PrimaryButton busy={busy} onClick={run}><Sparkles className="h-4 w-4" aria-hidden /> {ideas.length ? 'Regenerate ideas' : 'Generate ideas'}</PrimaryButton>
          {ideas.length ? <GhostButton onClick={() => advance()}>Continue to approval</GhostButton> : null}
        </>
      }
    >
      {state.mock ? <div className="mb-3"><Badge tone="warn">Mock mode — ideas are deterministic sample content.</Badge></div> : null}
      <TextField id="idea-seeds" label="Optional seed topics (comma-separated)" value={seeds} onChange={setSeeds} placeholder="summer sale, behind the scenes" />
      <ul className="mt-4 space-y-2">
        {ideas.map(({ id, idea }) => (
          <li key={id} className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-[var(--pl-text)]">{idea.title || 'Untitled idea'}</span>
              <Badge tone="info">Score {idea.score}</Badge>
            </div>
            {idea.hook ? <p className="mt-1 text-xs text-[var(--pl-text-soft)]">Hook: {idea.hook}</p> : null}
          </li>
        ))}
        {!ideas.length ? <li className="text-sm text-[var(--pl-text-soft)]">No ideas yet — generate a set to begin.</li> : null}
      </ul>
      {/* Billing error notice — only renders when a billing code is detected */}
      {billingCode ? (
        <InsufficientCreditsNotice
          code={billingCode}
          detail={
            (() => {
              const d = err?.detail as Record<string, unknown> | undefined;
              return {
                available_mc: typeof d?.available_mc === 'number' ? d.available_mc : undefined,
                required_mc: typeof d?.required_mc === 'number' ? d.required_mc : undefined,
              };
            })()
          }
          planId={state.tenant_id ?? ''}
        />
      ) : (
        <ErrorNote error={err} />
      )}
    </StepCard>
  );
}
