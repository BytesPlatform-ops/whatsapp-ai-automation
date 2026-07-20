'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { generateScript, invalidateFrom, type CreatorError } from '@/lib/pixie-lab/contentCreatorClient';
import { StepCard, PrimaryButton, GhostButton, ErrorNote, Badge, TextBlock } from './ui';
import { staleGatesFor, type StepProps } from './stepProps';

/** Stage 6 — Script generation (AI, mock). Drafts an AIDA script from the approved
 *  idea. Handles the Gate-1 conflict if the idea is not approved. */
export function StepScript({ state, advance, reload }: StepProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<CreatorError | null>(null);
  const ideaId = state.approved_idea_id;
  const script = state.scripts.length ? state.scripts[state.scripts.length - 1].script : null;
  const stale = staleGatesFor(state, 'script_generation');

  async function run() {
    if (!ideaId) { setErr({ kind: 'conflict', status: 409, message: 'Approve an idea first (Gate 1).' }); return; }
    if (stale.length && !window.confirm(`Regenerating the script resets ${stale.join(', ')}. Continue?`)) return;
    setBusy(true); setErr(null);
    if (stale.length) await invalidateFrom('script_generation');
    const res = await generateScript(ideaId);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    await reload();
  }

  return (
    <StepCard
      title="Script generation"
      description="Draft a short-form AIDA script from the approved idea."
      footer={
        <>
          <PrimaryButton busy={busy} disabled={!ideaId} onClick={run}><Sparkles className="h-4 w-4" aria-hidden /> {script ? 'Regenerate script' : 'Generate script'}</PrimaryButton>
          {script ? <GhostButton onClick={() => advance()}>Continue to approval</GhostButton> : null}
        </>
      }
    >
      {state.mock ? <div className="mb-3"><Badge tone="warn">Mock mode — script is deterministic sample copy.</Badge></div> : null}
      {!ideaId ? <p className="text-sm text-amber-500">Approve an idea in Gate 1 before generating a script.</p> : null}
      {script ? (
        <div className="space-y-3 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
          <div><span className="text-xs font-semibold uppercase text-[var(--pl-text-soft)]">Hook</span><TextBlock text={script.hook} /></div>
          <div><span className="text-xs font-semibold uppercase text-[var(--pl-text-soft)]">Body</span><TextBlock text={script.body} /></div>
          <div><span className="text-xs font-semibold uppercase text-[var(--pl-text-soft)]">CTA</span><TextBlock text={script.cta} /></div>
          <p className="text-xs text-[var(--pl-text-soft)]">{script.word_count} words · ~{script.approx_seconds}s</p>
        </div>
      ) : null}
      <ErrorNote error={err} />
    </StepCard>
  );
}
