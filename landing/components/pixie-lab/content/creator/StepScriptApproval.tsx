'use client';

import { approveScript, rejectScript } from '@/lib/pixie-lab/contentCreatorClient';
import { GatePanel } from './GatePanel';
import { TextBlock } from './ui';
import type { StepProps } from './stepProps';

/** Stage 7 — Gate 2 · Script approval. Approve the script to unlock the cost estimate. */
export function StepScriptApproval({ state, advance, reload }: StepProps) {
  const entry = state.scripts.length ? state.scripts[state.scripts.length - 1] : null;
  const script = entry?.script;

  return (
    <GatePanel
      title="Gate 2 · Script approval"
      gate="script"
      status={state.gates.script}
      approveLabel="Approve script"
      whatSummary={
        script ? (
          <div className="space-y-1">
            <p className="font-semibold">{script.hook}</p>
            <TextBlock text={script.body} />
            <p className="text-xs text-[var(--pl-text-soft)]">{script.cta} · {script.word_count} words</p>
          </div>
        ) : <p>No script found. Generate one first.</p>
      }
      consequence="Only an approved script proceeds to the production cost estimate."
      onApprove={async () => {
        if (!entry) return { kind: 'not_found', status: 404, message: 'No script to approve.' };
        const r = await approveScript(entry.id);
        if (!r.ok) return r.error;
        await advance();
        return null;
      }}
      onReject={async () => {
        if (!entry) return null;
        const r = await rejectScript(entry.id);
        if (!r.ok) return r.error;
        await reload();
        return null;
      }}
    />
  );
}
