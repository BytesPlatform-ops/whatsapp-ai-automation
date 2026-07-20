'use client';

import { useState } from 'react';
import { BarChart3, Copy, ExternalLink } from 'lucide-react';
import { syncAnalytics, type CreatorError } from '@/lib/pixie-lab/contentCreatorClient';
import { StepCard, PrimaryButton, GhostButton, ErrorNote, Badge, DoneRow } from './ui';
import type { CreatorStage } from '@/lib/pixie-lab/contentCreatorTypes';
import type { StepProps } from './stepProps';

/** Stage 13 — Analytics + learning, doubling as the final review / completion
 *  screen. Metrics are synthetic in mock mode and clearly labelled. */
export function StepAnalytics({ state, reload, goTo }: StepProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<CreatorError | null>(null);
  const learning = (state.learning || {}) as { insights?: string[]; next_focus?: string; samples?: number };
  const hasMetrics = state.metrics.length > 0 || state.learning != null;
  const script = state.scripts.length ? state.scripts[state.scripts.length - 1].script : null;
  const video = state.video?.video;
  const url = video && /^https?:\/\//.test(video.storage_url) ? video.storage_url : '';

  async function run() {
    setBusy(true); setErr(null);
    const res = await syncAnalytics();
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    await reload();
  }

  async function copyScript() {
    if (script) { try { await navigator.clipboard.writeText(`${script.hook}\n\n${script.body}\n\n${script.cta}`); } catch { /* ignore */ } }
  }

  const summary: Array<{ label: string; value: string; edit?: CreatorStage }> = [
    { label: 'Business', value: state.profile?.business_name || '—', edit: 'intake' },
    { label: 'Influencer', value: state.identity ? String((state.identity.characteristics as Record<string, string>)?.look || state.identity.source) : '—', edit: 'influencer_setup' },
    { label: 'Idea', value: state.ideas.find((i) => i.id === state.approved_idea_id)?.idea.title || '—', edit: 'idea_approval' },
    { label: 'Script', value: script ? `${script.word_count} words` : '—', edit: 'script_approval' },
    { label: 'Video', value: video?.status || '—', edit: 'video_generation' },
    { label: 'Quality', value: state.quality?.quality.status || '—' },
    { label: 'Posts', value: `${state.posts.length} scheduled${state.dry_run ? ' (dry-run)' : ''}` },
  ];

  return (
    <StepCard
      title="Analytics + final review"
      description="Sync performance and review the full pipeline. Metrics are synthetic in mock mode."
      footer={<PrimaryButton busy={busy} onClick={run}><BarChart3 className="h-4 w-4" aria-hidden /> {hasMetrics ? 'Re-sync analytics' : 'Sync analytics'}</PrimaryButton>}
    >
      {state.complete ? <div className="mb-3"><DoneRow label="Pipeline complete" /></div> : null}
      <div className="mb-3 flex flex-wrap gap-2">
        {state.mock ? <Badge tone="warn">Mock analytics — synthetic values</Badge> : null}
        {state.dry_run ? <Badge tone="muted">Publishing was dry-run — not live</Badge> : null}
        {Object.entries(state.gates).every(([, v]) => v === 'approved') ? <Badge tone="ok">All 4 gates approved</Badge> : null}
      </div>

      <div className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--pl-text-soft)]">Pipeline summary</h3>
        <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {summary.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-2">
              <dt className="text-xs text-[var(--pl-text-soft)]">{r.label}</dt>
              <dd className="flex items-center gap-2 text-sm text-[var(--pl-text)]">
                <span className="truncate">{r.value}</span>
                {r.edit ? <button type="button" onClick={() => goTo(r.edit!)} className="text-xs font-semibold text-sky-500 underline">Edit</button> : null}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {hasMetrics ? (
        <div className="mt-3 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase text-[var(--pl-text-soft)]">Learning{state.mock ? ' (mock)' : ''}</h3>
          {learning.insights?.length ? (
            <ul className="list-inside list-disc text-sm text-[var(--pl-text)]">{learning.insights.map((i) => <li key={i}>{i}</li>)}</ul>
          ) : <p className="text-sm text-[var(--pl-text-soft)]">Synced.</p>}
          {learning.next_focus ? <p className="mt-1 text-xs text-[var(--pl-text-soft)]">Next focus: {learning.next_focus}</p> : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        {script ? <GhostButton onClick={copyScript}><Copy className="h-3.5 w-3.5" aria-hidden /> Copy script</GhostButton> : null}
        {url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-4 py-2 text-sm font-semibold text-sky-500"><ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open video</a> : null}
      </div>
      <ErrorNote error={err} />
    </StepCard>
  );
}
