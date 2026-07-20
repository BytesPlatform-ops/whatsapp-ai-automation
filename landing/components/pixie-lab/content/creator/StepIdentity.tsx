'use client';

import { useState } from 'react';
import { createIdentityFromCharacteristics, invalidateFrom, type CreatorError } from '@/lib/pixie-lab/contentCreatorClient';
import { StepCard, TextField, PrimaryButton, ErrorNote, DoneRow, Badge } from './ui';
import { staleGatesFor, type StepProps } from './stepProps';

/**
 * Stage 2 — Influencer identity. The backend exposes two methods; Phase 2 wires
 * the characteristics path (mock-safe, no upload). Reference-image upload reuses
 * the existing asset service in a later pass; here we are honest that mock mode
 * does not produce a real paid-provider character.
 */
export function StepIdentity({ state, advance, reload }: StepProps) {
  const id = state.identity;
  const c = (id?.characteristics || {}) as Record<string, string>;
  const [look, setLook] = useState(c.look || '');
  const [vibe, setVibe] = useState(c.vibe || '');
  const [outfit, setOutfit] = useState(c.outfit || '');
  const [persona, setPersona] = useState(c.content_persona || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<CreatorError | null>(null);
  const editing = Boolean(id);
  const stale = staleGatesFor(state, 'influencer_setup');

  async function save() {
    if (!look.trim() && !vibe.trim()) {
      setErr({ kind: 'validation', status: 422, message: 'Describe at least the look or vibe.' });
      return;
    }
    if (stale.length && !window.confirm(`Changing the influencer identity resets ${stale.length} approval(s) and later work. Continue?`)) return;
    setBusy(true); setErr(null);
    if (stale.length) await invalidateFrom('influencer_setup');
    const res = await createIdentityFromCharacteristics({ look, vibe, outfit, content_persona: persona });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    await (editing ? reload() : advance());
  }

  return (
    <StepCard
      title="Influencer setup"
      description="Describe one AI influencer identity. It is reused across every generated video for consistency."
      footer={<PrimaryButton busy={busy} onClick={save}>{editing ? 'Save identity' : 'Lock identity and continue'}</PrimaryButton>}
    >
      {editing ? <div className="mb-3"><DoneRow label={`Identity locked (${id?.source})`} /></div> : null}
      <div className="mb-4"><Badge tone="warn">Mock mode: no paid-provider character is produced. Real face consistency needs a reference image (added later).</Badge></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="id-look" label="Look" value={look} onChange={setLook} placeholder="athletic, 20s, natural" />
        <TextField id="id-vibe" label="Vibe" value={vibe} onChange={setVibe} placeholder="warm, energetic" />
        <TextField id="id-outfit" label="Outfit" value={outfit} onChange={setOutfit} placeholder="activewear" />
        <TextField id="id-persona" label="Content persona" value={persona} onChange={setPersona} placeholder="approachable coach" />
      </div>
      {stale.length ? <p className="mt-3 text-xs text-amber-500">Editing resets: {stale.join(', ')}.</p> : null}
      <ErrorNote error={err} />
    </StepCard>
  );
}
