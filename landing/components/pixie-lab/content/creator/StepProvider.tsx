'use client';

import { useState } from 'react';
import { connectProvider, type CreatorError } from '@/lib/pixie-lab/contentCreatorClient';
import { StepCard, PrimaryButton, GhostButton, ErrorNote, DoneRow, Badge } from './ui';
import type { StepProps } from './stepProps';

/**
 * Stage 3 — Provider connection. In mock mode we default to Pixie-managed (no key
 * needed). BYOK / prompt-export are shown but selecting Pixie-managed is the safe
 * mock path. No credential is ever entered here in Phase 2.
 */
const MODES: { mode: string; title: string; blurb: string }[] = [
  { mode: 'pixie_managed', title: 'Pixie-managed', blurb: 'Pixie fronts generation. No key needed. Best for a mock walkthrough.' },
  { mode: 'prompt_export', title: 'Prompt export', blurb: 'No API — Pixie emits a prompt to paste into Higgsfield yourself.' },
  { mode: 'client_own_account', title: 'Your own key (BYOK)', blurb: 'Bring your own Higgsfield key. Adding the key comes in a later phase.' },
];

export function StepProvider({ state, advance, reload }: StepProps) {
  const current = (state.provider as { mode?: string } | null)?.mode || 'pixie_managed';
  const [mode, setMode] = useState<string>(current);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<CreatorError | null>(null);
  const connected = Boolean(state.provider);

  async function save() {
    setBusy(true); setErr(null);
    const res = await connectProvider({ mode });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    await (connected ? reload() : advance());
  }

  return (
    <StepCard
      title="Provider connection"
      description="Choose how videos are produced. In mock mode, Pixie-managed runs everything at $0."
      footer={<>
        <PrimaryButton busy={busy} onClick={save}>{connected ? 'Update provider' : 'Continue'}</PrimaryButton>
        {mode === 'client_own_account' ? <GhostButton disabled>Add key (later phase)</GhostButton> : null}
      </>}
    >
      {connected ? <div className="mb-3"><DoneRow label={`Provider set: ${current}`} /></div> : null}
      <fieldset className="grid gap-3">
        <legend className="sr-only">Provider mode</legend>
        {MODES.map((m) => (
          <label key={m.mode} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${mode === m.mode ? 'border-[var(--pl-accent,#D4AF37)] bg-[var(--pl-surface-soft)]' : 'border-[var(--pl-border)]'}`}>
            <input type="radio" name="provider-mode" value={m.mode} checked={mode === m.mode} onChange={() => setMode(m.mode)} className="mt-1" />
            <span>
              <span className="block text-sm font-semibold text-[var(--pl-text)]">{m.title}</span>
              <span className="block text-xs text-[var(--pl-text-soft)]">{m.blurb}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {state.mock ? <div className="mt-4"><Badge tone="warn">Mock mode — no real provider call is made regardless of choice.</Badge></div> : null}
      <ErrorNote error={err} />
    </StepCard>
  );
}
