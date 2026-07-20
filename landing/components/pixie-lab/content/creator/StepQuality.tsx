'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { runQualityCheck, type CreatorError } from '@/lib/pixie-lab/contentCreatorClient';
import { StepCard, PrimaryButton, GhostButton, ErrorNote, Badge } from './ui';
import type { StepProps } from './stepProps';

/** Stage 10 — Quality check. Runs deterministic checks on the generated video. */
export function StepQuality({ state, advance, reload }: StepProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<CreatorError | null>(null);
  const videoId = state.video?.id;
  const quality = state.quality?.quality;

  async function run() {
    if (!videoId) { setErr({ kind: 'not_found', status: 404, message: 'Generate a video first.' }); return; }
    setBusy(true); setErr(null);
    const res = await runQualityCheck(videoId);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    await reload();
  }

  const flags = quality?.deterministic_flags || [];
  const pass = quality?.status === 'pass';

  return (
    <StepCard
      title="Quality check"
      description="Run deterministic checks on the generated video before publishing."
      footer={
        <>
          <PrimaryButton busy={busy} disabled={!videoId} onClick={run}><ShieldCheck className="h-4 w-4" aria-hidden /> {quality ? 'Re-run check' : 'Run quality check'}</PrimaryButton>
          {quality ? <GhostButton onClick={() => advance()}>Continue to publish approval</GhostButton> : null}
        </>
      }
    >
      {!videoId ? <p className="text-sm text-amber-500">Generate a video first.</p> : null}
      {quality ? (
        <div className="space-y-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
          <Badge tone={pass ? 'ok' : 'warn'}>{pass ? 'Passed' : (quality.status || 'reviewed').replace('_', ' ')}</Badge>
          {flags.length ? (
            <ul className="list-inside list-disc text-xs text-[var(--pl-text-soft)]">{flags.map((f) => <li key={f}>{f}</li>)}</ul>
          ) : <p className="text-xs text-[var(--pl-text-soft)]">No issues flagged.</p>}
          <p className="text-xs text-[var(--pl-text-soft)]">Retries: {quality.retry_count ?? 0}</p>
        </div>
      ) : null}
      <ErrorNote error={err} />
    </StepCard>
  );
}
