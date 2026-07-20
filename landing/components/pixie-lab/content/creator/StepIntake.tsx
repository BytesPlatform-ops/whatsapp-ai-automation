'use client';

import { useState } from 'react';
import { createCreatorProfile, invalidateFrom, type CreatorError } from '@/lib/pixie-lab/contentCreatorClient';
import type { CreatorProfile } from '@/lib/pixie-lab/contentCreatorTypes';
import { StepCard, TextField, PrimaryButton, ErrorNote, DoneRow, Badge } from './ui';
import { staleGatesFor, type StepProps } from './stepProps';

const EMPTY: CreatorProfile = {
  business_name: '', business_type: '', product_or_service: '', target_audience: '',
  niche: '', content_goal: '', brand_tone: '', language: 'en',
  selling_points: [], competitors: [], cta_style: '', compliance_notes: '',
};

export function StepIntake({ state, advance, reload }: StepProps) {
  const p = state.profile;
  const [f, setF] = useState<CreatorProfile>({ ...EMPTY, ...(p || {}) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<CreatorError | null>(null);
  const set = (k: keyof CreatorProfile) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const stale = staleGatesFor(state, 'intake');
  const editing = Boolean(p);

  async function save() {
    if (!f.business_name.trim()) {
      setErr({ kind: 'validation', status: 422, message: 'Business name is required.' });
      return;
    }
    if (stale.length && !window.confirm(`Editing the business profile will reset ${stale.length} downstream approval(s) and require regenerating later steps. Continue?`)) return;
    setBusy(true);
    setErr(null);
    if (stale.length) await invalidateFrom('intake');
    const res = await createCreatorProfile({ ...f });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    await (editing ? reload() : advance());
  }

  return (
    <StepCard
      title="Business intake"
      description="Tell Pixie about the business so every idea, script and video stays on-brand."
      footer={<PrimaryButton busy={busy} onClick={save}>{editing ? 'Save changes' : 'Save and continue'}</PrimaryButton>}
    >
      {editing ? <div className="mb-4"><DoneRow label="Profile saved" /></div> : null}
      {stale.length ? <div className="mb-4"><Badge tone="warn">Editing resets {stale.join(', ')} approval(s)</Badge></div> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="biz-name" label="Business / creator name" value={f.business_name} onChange={set('business_name')} required placeholder="Acme Studio" />
        <TextField id="biz-niche" label="Niche" value={f.niche} onChange={set('niche')} placeholder="fitness, food, real estate…" />
        <TextField id="biz-audience" label="Target audience" value={f.target_audience} onChange={set('target_audience')} placeholder="busy parents, gym-goers…" />
        <TextField id="biz-goal" label="Content goal" value={f.content_goal} onChange={set('content_goal')} placeholder="grow followers, drive bookings…" />
        <TextField id="biz-tone" label="Brand voice / tone" value={f.brand_tone} onChange={set('brand_tone')} placeholder="warm, bold, expert…" />
        <TextField id="biz-lang" label="Language" value={f.language} onChange={set('language')} placeholder="en" />
        <TextField id="biz-product" label="Product or service" value={f.product_or_service} onChange={set('product_or_service')} placeholder="what you sell" />
        <TextField id="biz-cta" label="CTA style" value={f.cta_style} onChange={set('cta_style')} placeholder="book now, DM us…" />
      </div>
      <ErrorNote error={err} />
    </StepCard>
  );
}
