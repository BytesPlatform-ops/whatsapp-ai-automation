'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { schedulePosts, type CreatorError } from '@/lib/pixie-lab/contentCreatorClient';
import { StepCard, PrimaryButton, GhostButton, ErrorNote, Badge } from './ui';
import type { StepProps } from './stepProps';

const PLATFORMS = ['meta', 'instagram', 'tiktok', 'youtube'];

/** Stage 12 — Posting. Schedules the post (dry-run only). Requires Gate 4. */
export function StepPosting({ state, advance, reload }: StepProps) {
  const [selected, setSelected] = useState<string[]>(['meta', 'instagram']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<CreatorError | null>(null);
  const videoId = state.video?.id;
  const posts = state.posts;

  function toggle(p: string) {
    setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  }

  async function run() {
    if (!videoId) { setErr({ kind: 'not_found', status: 404, message: 'No video to post.' }); return; }
    if (!selected.length) { setErr({ kind: 'validation', status: 422, message: 'Pick at least one platform.' }); return; }
    setBusy(true); setErr(null);
    const res = await schedulePosts(videoId, selected);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    await reload();
  }

  return (
    <StepCard
      title="Posting"
      description="Schedule the post across platforms. Dry-run only — nothing is published live."
      footer={
        <>
          <PrimaryButton busy={busy} disabled={!videoId} onClick={run}><Send className="h-4 w-4" aria-hidden /> {posts.length ? 'Re-schedule' : 'Schedule (dry-run)'}</PrimaryButton>
          {posts.length ? <GhostButton onClick={() => advance()}>Continue to analytics</GhostButton> : null}
        </>
      }
    >
      <div className="mb-3"><Badge tone="muted">Dry-run — no live publishing</Badge></div>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Platforms</legend>
        {PLATFORMS.map((p) => (
          <label key={p} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${selected.includes(p) ? 'border-[var(--pl-accent,#D4AF37)] bg-[var(--pl-surface-soft)] text-[var(--pl-text)]' : 'border-[var(--pl-border)] text-[var(--pl-text-soft)]'}`}>
            <input type="checkbox" checked={selected.includes(p)} onChange={() => toggle(p)} /> {p}
          </label>
        ))}
      </fieldset>
      {posts.length ? (
        <ul className="mt-4 space-y-1.5">
          {posts.map(({ id, post }) => {
            const pp = post as { platform?: string; status?: string; dry_run?: boolean };
            return (
              <li key={id} className="flex items-center justify-between rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-sm">
                <span className="text-[var(--pl-text)]">{pp.platform}</span>
                <Badge tone={pp.dry_run ? 'muted' : 'ok'}>{pp.status || 'scheduled'}{pp.dry_run ? ' · dry-run' : ''}</Badge>
              </li>
            );
          })}
        </ul>
      ) : null}
      <ErrorNote error={err} />
    </StepCard>
  );
}
