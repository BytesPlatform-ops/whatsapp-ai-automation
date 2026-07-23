'use client';

/**
 * Stage 12 — Posting. The REAL publishing engine (not a content_creator-only record):
 * it confirms Gate 4, loads compatible destinations, lets the user edit the caption,
 * publish now or schedule, and creates a durable publish job. On refresh/restart the
 * job is recovered from `state.publish_job` (see wizard.py::_publish_job_for_video),
 * so we never show the blank form over an existing job or create a duplicate. Gate 4
 * is ALSO enforced server-side — the frontend checks are UX, not the gate.
 */

import { useEffect, useMemo, useState } from 'react';
import { Send, Clock, X, RotateCcw, ExternalLink, Play, ShieldAlert, Lock } from 'lucide-react';
import {
  listConnections, createPublishJob, cancelJob, retryJob, rescheduleJob, runWorkerOnce,
  getPublishingConfig, type SocialConnection, type PublishingConfig, type PubError, type Platform,
} from '@/lib/pixie-lab/publishingClient';
import { statusMeta, formatDateTime, isSimulatedPostId, platformLabel } from '@/lib/pixie-lab/publishingFormat';
import type { PublishJobRef } from '@/lib/pixie-lab/contentCreatorTypes';
import { StepCard, PrimaryButton, GhostButton, ErrorNote, Badge, TextField, DoneRow } from './ui';
import type { StepProps } from './stepProps';

const LOCAL_TZ = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : 'UTC';

function isVideoCapable(c: SocialConnection): boolean {
  const f = c.capabilities?.formats_supported || {};
  if (f.video || f.reel) return true;
  // Fallback: our live-capable Meta platforms both accept video/reel.
  return c.platform === 'facebook' || c.platform === 'instagram';
}

function defaultCaption(state: StepProps['state']): string {
  const sid = state.approved_script_id;
  const s = sid ? state.scripts.find((x) => x.id === sid)?.script : undefined;
  if (!s) return '';
  return [s.hook, s.body, s.cta].filter(Boolean).join('\n\n').trim();
}

export function StepPosting(props: StepProps) {
  const job = props.state.publish_job;
  return job
    ? <PostingStatus job={job} advance={props.advance} reload={props.reload} />
    : <PostingForm {...props} />;
}

// ── Create form ─────────────────────────────────────────────────────────────────
function PostingForm({ state, reload }: StepProps) {
  const gateOk = state.gates.publish === 'approved';
  const video = state.video;
  const videoReady = !!video && (video.video.status === 'ready' || video.video.status === 'mock');
  const assetId = video?.video.asset_ref || video?.id || '';

  const [conns, setConns] = useState<SocialConnection[] | null>(null);
  const [config, setConfig] = useState<PublishingConfig | null>(null);
  const [connId, setConnId] = useState('');
  const [caption, setCaption] = useState(() => defaultCaption(state));
  const [when, setWhen] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<PubError | null>(null);

  useEffect(() => {
    let alive = true;
    if (!gateOk) return;
    listConnections().then((r) => { if (alive && r.ok) setConns(r.data.connections); });
    getPublishingConfig().then((r) => { if (alive && r.ok) setConfig(r.data); });
    return () => { alive = false; };
  }, [gateOk]);

  const destinations = useMemo(() => (conns || []).filter(isVideoCapable), [conns]);
  const selected = destinations.find((d) => d.connection_id === connId) || null;

  if (!gateOk) {
    return (
      <StepCard title="Posting" description="Publishing is locked until the video is approved.">
        <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
          <Lock className="h-4 w-4 shrink-0" aria-hidden /> Gate 4 (publish approval) is required before you can publish or schedule this video.
        </p>
      </StepCard>
    );
  }
  if (!videoReady) {
    return (
      <StepCard title="Posting" description="Publish the approved video across your connected accounts.">
        <p role="alert" className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-sm text-[var(--pl-text-soft)]">
          The video isn’t ready yet. Finish video generation before posting.
        </p>
      </StepCard>
    );
  }

  async function submit() {
    if (!selected) { setErr({ kind: 'validation', status: 422, message: 'Choose a destination.' }); return; }
    if (!confirming) { setConfirming(true); return; }
    setBusy(true); setErr(null);
    const res = await createPublishJob({
      sourceProduct: 'ai_influencer',
      connectionId: selected.connection_id,
      platform: selected.platform as Platform,
      contentFormat: selected.platform === 'instagram' ? 'reel' : 'video',
      text: caption,
      mediaAssetIds: assetId ? [assetId] : [],
      influencerVideoId: video!.id,
      mode: 'dry_run',
      scheduledLocal: when || undefined,
      timezone: when ? LOCAL_TZ : undefined,
      confirm: true,
    });
    setBusy(false); setConfirming(false);
    if (!res.ok) { setErr(res.error); return; }
    await reload(); // pulls state.publish_job → PostingStatus takes over
  }

  return (
    <StepCard
      title="Posting"
      description="Publish the approved video now or schedule it. Dry-run by default — nothing goes live."
      footer={
        <>
          <PrimaryButton busy={busy} disabled={!selected} onClick={submit}>
            {confirming ? <>Confirm {when ? 'schedule' : 'publish'}</> : <><Send className="h-4 w-4" aria-hidden /> {when ? 'Schedule' : 'Publish now'}</>}
          </PrimaryButton>
          {confirming && <GhostButton onClick={() => setConfirming(false)}>Cancel</GhostButton>}
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Badge tone={config?.live_allowed ? 'warn' : 'muted'}>{config?.live_allowed ? 'Live enabled' : 'Dry-run — no live publishing'}</Badge>
        <Badge tone="muted"><Clock className="h-3 w-3" aria-hidden /> {LOCAL_TZ}</Badge>
      </div>

      <fieldset className="mb-4">
        <legend className="mb-1.5 text-sm font-medium text-[var(--pl-text)]">Destination</legend>
        {conns === null ? (
          <p className="text-sm text-[var(--pl-text-soft)]">Loading connected accounts…</p>
        ) : destinations.length === 0 ? (
          <p className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-sm text-[var(--pl-text-soft)]">
            No video-capable account is connected. Connect a Facebook Page or Instagram account under Settings → Connections.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {destinations.map((d) => {
              const on = d.connection_id === connId;
              return (
                <label key={d.connection_id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${on ? 'border-[var(--pl-accent,#D4AF37)] bg-[var(--pl-surface-soft)]' : 'border-[var(--pl-border)]'}`}>
                  <span className="flex items-center gap-2 text-[var(--pl-text)]">
                    <input type="radio" name="destination" checked={on} onChange={() => setConnId(d.connection_id)} />
                    {platformLabel(d.platform)} · {d.display_name}
                  </span>
                  {d.reconnection_required && <Badge tone="warn"><ShieldAlert className="h-3 w-3" aria-hidden /> Reconnect for live</Badge>}
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      <TextField id="posting-caption" label="Caption" value={caption} onChange={setCaption} textarea
        hint={selected ? `${platformLabel(selected.platform)} caption — edit without changing the saved script.` : 'Platform caption.'} />

      <div className="mt-4">
        <label htmlFor="posting-when" className="block text-sm">
          <span className="font-medium text-[var(--pl-text)]">Schedule (optional)</span>
          <input id="posting-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-sm text-[var(--pl-text)] outline-none focus:border-[var(--pl-accent,#D4AF37)] sm:w-auto" />
          <span className="mt-1 block text-xs text-[var(--pl-text-soft)]">Leave empty to publish now. Times are in {LOCAL_TZ}.</span>
        </label>
      </div>

      <ErrorNote error={err} />
    </StepCard>
  );
}

// ── Recovered job status ──────────────────────────────────────────────────────────
function PostingStatus({ job, advance, reload }: { job: PublishJobRef } & Pick<StepProps, 'advance' | 'reload'>) {
  const meta = statusMeta(job.status);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState<PubError | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState('');

  async function act(kind: string, fn: () => Promise<{ ok: boolean; error?: PubError }>) {
    setBusy(kind); setErr(null);
    const r = await fn();
    setBusy('');
    if (!r.ok && r.error) { setErr(r.error); return; }
    await reload();
  }

  const simulated = isSimulatedPostId(job.platform_post_id);

  return (
    <StepCard
      title="Posting"
      description="This video has a durable publish job. It resumes here after refresh or restart."
      footer={
        <>
          {meta.active && (
            <GhostButton disabled={busy !== ''} onClick={() => act('cancel', () => cancelJob(job.id))}><X className="h-4 w-4" aria-hidden /> Cancel</GhostButton>
          )}
          {meta.retryable && (
            <GhostButton disabled={busy !== ''} onClick={() => act('retry', () => retryJob(job.id))}><RotateCcw className="h-4 w-4" aria-hidden /> Retry</GhostButton>
          )}
          <GhostButton disabled={busy !== ''} onClick={() => act('worker', () => runWorkerOnce())}><Play className="h-4 w-4" aria-hidden /> Run worker (dry-run)</GhostButton>
          <PrimaryButton onClick={() => advance()}>Continue to analytics</PrimaryButton>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--pl-text)]">
            <span className="h-2 w-2 rounded-full" style={{ background: meta.dot }} aria-hidden />{meta.label}
          </span>
          <Badge tone="muted">{platformLabel(job.platform)} · {job.account_id}</Badge>
          <Badge tone={job.mode === 'live' ? 'warn' : 'muted'}>{job.mode === 'live' ? 'Live' : 'Dry-run'}</Badge>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
          <Field label="Scheduled for">{formatDateTime(job.scheduled_utc)}</Field>
          <Field label="Timezone">{job.timezone}</Field>
          <Field label="Attempts">{job.attempt_count}/{job.max_attempts}</Field>
          {job.next_retry_utc && <Field label="Next retry">{formatDateTime(job.next_retry_utc)}</Field>}
          {job.error_category && <Field label="Last error">{job.error_category}</Field>}
        </dl>

        {job.status === 'published' && (
          <DoneRow label={simulated ? 'Published (simulated dry-run)' : 'Published'} />
        )}
        {job.platform_post_id && (
          <p className="text-sm text-[var(--pl-text-soft)]">
            Post ID <code className="rounded bg-[var(--pl-surface-soft)] px-1.5 py-0.5 text-[var(--pl-text)]">{job.platform_post_id}</code>
            {simulated && <Badge tone="muted"> Simulated</Badge>}
          </p>
        )}
        {job.platform_permalink && (
          <a href={job.platform_permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--pl-accent,#D4AF37)]">
            <ExternalLink className="h-4 w-4" aria-hidden /> Open published post
          </a>
        )}
        {job.status === 'reconnection_required' && (
          <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden /> This account needs reconnecting before it can publish. Reconnect it under Settings → Connections, then retry.
          </p>
        )}

        {meta.active && (
          <div className="flex flex-wrap items-end gap-2 border-t border-[var(--pl-border)] pt-3">
            <label htmlFor="reschedule-at" className="text-sm">
              <span className="font-medium text-[var(--pl-text)]">Reschedule</span>
              <input id="reschedule-at" type="datetime-local" value={rescheduleAt} onChange={(e) => setRescheduleAt(e.target.value)}
                className="mt-1 block rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-1.5 text-sm text-[var(--pl-text)] outline-none focus:border-[var(--pl-accent,#D4AF37)]" />
            </label>
            <GhostButton disabled={busy !== '' || !rescheduleAt} onClick={() => act('reschedule', () => rescheduleJob(job.id, rescheduleAt, job.timezone))}>
              <Clock className="h-4 w-4" aria-hidden /> Apply
            </GhostButton>
          </div>
        )}

        <ErrorNote error={err} />
      </div>
    </StepCard>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--pl-text-soft)]">{label}</dt>
      <dd className="text-[var(--pl-text)]">{children}</dd>
    </div>
  );
}
