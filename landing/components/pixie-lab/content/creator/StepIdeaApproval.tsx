'use client';

import { useState } from 'react';
import { approveIdea, rejectIdea } from '@/lib/pixie-lab/contentCreatorClient';
import { GatePanel } from './GatePanel';
import type { StepProps } from './stepProps';

/** Stage 5 — Gate 1 · Idea approval. Pick one idea and approve it to unlock the
 *  script. Status comes from backend gate state. */
export function StepIdeaApproval({ state, advance, reload }: StepProps) {
  const ideas = state.ideas;
  const preselect = state.approved_idea_id || (ideas[0]?.id ?? '');
  const [selected, setSelected] = useState<string>(preselect);
  const chosen = ideas.find((i) => i.id === selected)?.idea;

  return (
    <GatePanel
      title="Gate 1 · Idea approval"
      gate="idea"
      status={state.gates.idea}
      approveLabel="Approve idea"
      whatSummary={
        <div>
          <p className="font-semibold">Approving this idea unlocks script generation.</p>
          {chosen ? <p className="mt-1 text-xs text-[var(--pl-text-soft)]">{chosen.title} — {chosen.hook}</p> : null}
        </div>
      }
      consequence="Only an approved idea can be turned into a script."
      onApprove={async () => {
        if (!selected) return { kind: 'validation', status: 422, message: 'Select an idea first.' };
        const r = await approveIdea(selected);
        if (!r.ok) return r.error;
        await advance();
        return null;
      }}
      onReject={async () => {
        if (!selected) return null;
        const r = await rejectIdea(selected);
        if (!r.ok) return r.error;
        await reload();
        return null;
      }}
    >
      <fieldset className="mt-3 grid gap-2">
        <legend className="text-xs font-medium text-[var(--pl-text-soft)]">Choose the idea to produce</legend>
        {ideas.map(({ id, idea }) => (
          <label key={id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm ${selected === id ? 'border-[var(--pl-accent,#D4AF37)] bg-[var(--pl-surface-soft)]' : 'border-[var(--pl-border)]'}`}>
            <input type="radio" name="approve-idea" value={id} checked={selected === id} onChange={() => setSelected(id)} />
            <span className="font-medium text-[var(--pl-text)]">{idea.title || 'Untitled'}</span>
            <span className="ml-auto text-xs text-[var(--pl-text-soft)]">Score {idea.score}</span>
          </label>
        ))}
      </fieldset>
    </GatePanel>
  );
}
