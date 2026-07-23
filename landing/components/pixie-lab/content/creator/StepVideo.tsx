'use client';

import { useEffect, useRef, useState } from 'react';
import { Film, Loader2 } from 'lucide-react';
import { startVideoGeneration, pollVideo, type CreatorError } from '@/lib/pixie-lab/contentCreatorClient';
import type { Video } from '@/lib/pixie-lab/contentCreatorTypes';
import { StepCard, PrimaryButton, GhostButton, ErrorNote, Badge } from './ui';
import type { StepProps } from './stepProps';
import { useCreditEstimate } from '@/lib/pixie-lab/useCreditEstimate';
import { CreditEstimateBadge } from '@/components/pixie-lab/billing/CreditEstimateBadge';
import { InsufficientCreditsNotice } from '@/components/pixie-lab/billing/InsufficientCreditsNotice';

const TERMINAL = new Set<Video['status']>(['ready', 'mock', 'failed']);
const isTerminal = (v: Video | null) => !!v && TERMINAL.has(v.status);
const httpUrl = (v?: string) => (v && /^https?:\/\//.test(v) ? v : '');

/**
 * Stage 9 — Video generation. Real backend job submission + bounded polling of the
 * real status endpoint. Polling resumes after refresh when a job is still pending,
 * stops on terminal status / unmount, and never loops forever. Mock output is
 * labelled honestly (no real file). No paid call is made in mock mode.
 */
export function StepVideo({ state, advance, reload }: StepProps) {
  const approvedScript = state.approved_script_id;
  const productionApproved = state.gates.production === 'approved';
  const initial = state.video;

  const [videoId, setVideoId] = useState<string | null>(initial?.id ?? null);
  const [video, setVideo] = useState<Video | null>(initial?.video ?? null);
  const [phase, setPhase] = useState<'idle' | 'starting' | 'polling' | 'done' | 'error'>(
    isTerminal(initial?.video ?? null) ? 'done' : initial ? 'polling' : 'idle',
  );
  const [attempt, setAttempt] = useState(0);
  const [err, setErr] = useState<CreatorError | null>(null);
  const acRef = useRef<AbortController | null>(null);

  // Non-blocking credit estimate — only renders when credit system is enabled.
  // duration_seconds matches the value passed to startVideoGeneration below (15s).
  const { show: showEstimate, estimate } = useCreditEstimate({
    operation: 'influencer_video',
    duration_seconds: 15,
    is_mock: state.mock,
    byok: false,
  });

  async function beginPolling(id: string) {
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setPhase('polling');
    const res = await pollVideo(id, {
      intervalMs: 1500,
      maxAttempts: 40,
      signal: ac.signal,
      onUpdate: (v, a) => { setVideo(v); setAttempt(a); },
    });
    if (ac.signal.aborted) return;
    if (!res.ok) { setErr(res.error); setPhase('error'); return; }
    setVideo(res.data);
    setPhase(res.data.status === 'failed' ? 'error' : 'done');
    await reload();
  }

  // Resume a pending job after a refresh; abort on unmount.
  useEffect(() => {
    if (videoId && video && !isTerminal(video)) void beginPolling(videoId);
    return () => acRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    if (!approvedScript) { setErr({ kind: 'conflict', status: 409, message: 'Approve a script first.' }); return; }
    if (!productionApproved) { setErr({ kind: 'conflict', status: 409, message: 'Approve production (Gate 3) first.' }); return; }
    acRef.current?.abort();
    setPhase('starting'); setErr(null); setAttempt(0);
    const res = await startVideoGeneration(approvedScript, 15);
    if (!res.ok) { setErr(res.error); setPhase('error'); return; }
    setVideoId(res.data.id); setVideo(res.data.video);
    if (isTerminal(res.data.video)) { setPhase(res.data.video.status === 'failed' ? 'error' : 'done'); await reload(); }
    else void beginPolling(res.data.id);
  }

  const busy = phase === 'starting' || phase === 'polling';
  const url = httpUrl(video?.storage_url) || httpUrl(video?.result_url);
  const ready = phase === 'done' && video && video.status !== 'failed';

  // Only handle insufficient_credits from structured detail; existing error
  // handling is preserved for all other error kinds.
  const billingCode =
    err && (err.kind === 'unknown' || err.kind === 'server')
      ? (() => {
          const d = err.detail as Record<string, unknown> | undefined;
          const code = typeof d?.error === 'string' ? d.error : null;
          return code === 'insufficient_credits' ? 'insufficient_credits' as const : null;
        })()
      : null;

  return (
    <StepCard
      title="Video generation"
      description="Generate the video from the locked identity and approved script, then poll until it is ready."
      footer={
        <>
          {/* Credit estimate badge — only renders when credit system is enabled */}
          {showEstimate && estimate && (
            <CreditEstimateBadge estimate={estimate} />
          )}
          <PrimaryButton busy={busy} disabled={!approvedScript || !productionApproved} onClick={generate}>
            <Film className="h-4 w-4" aria-hidden /> {video ? 'Regenerate video' : 'Generate video'}
          </PrimaryButton>
          {ready ? <GhostButton onClick={() => advance()}>Continue to quality check</GhostButton> : null}
        </>
      }
    >
      {!productionApproved ? <p className="mb-3 text-sm text-amber-500">Production approval (Gate 3) is required before generating a video.</p> : null}
      {state.mock ? <div className="mb-3"><Badge tone="warn">Mock mode — a placeholder video is produced; no real file and no charge.</Badge></div> : null}

      {busy ? (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4" aria-live="polite">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--pl-accent,#D4AF37)]" aria-hidden />
          <div>
            <p className="text-sm font-medium text-[var(--pl-text)]">
              {video && video.progress > 0 ? `Generating… ${Math.round(video.progress * 100)}%` : 'Generating…'}
            </p>
            <p className="text-xs text-[var(--pl-text-soft)]">Status: {video?.status || 'submitting'} · poll {attempt}</p>
          </div>
        </div>
      ) : null}

      {ready ? (
        <div className="space-y-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4">
          <div className="flex items-center gap-2"><Badge tone="ok">Ready</Badge><span className="text-xs text-[var(--pl-text-soft)]">{video?.status}</span></div>
          {url ? (
            <video controls className="mt-2 w-full max-w-sm rounded-lg" src={url} aria-label="Generated video preview" />
          ) : (
            <p className="text-sm text-[var(--pl-text-soft)]">Mock output — no real video file is produced in mock mode. Enable a real provider in a later phase to render a file.</p>
          )}
          {url ? <a href={url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-sky-500 underline">Open video</a> : null}
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-500">{video?.error || err?.message || 'Generation failed.'}</p>
          <button type="button" onClick={generate} className="mt-2 rounded-full bg-[var(--pl-accent,#D4AF37)] px-3.5 py-1.5 text-xs font-semibold text-black">Retry</button>
          {/* Billing notice — only renders when insufficient_credits is detected */}
          {billingCode && (
            <div className="mt-3">
              <InsufficientCreditsNotice
                code={billingCode}
                detail={
                  (() => {
                    const d = err?.detail as Record<string, unknown> | undefined;
                    return {
                      available_mc: typeof d?.available_mc === 'number' ? d.available_mc : undefined,
                      required_mc: typeof d?.required_mc === 'number' ? d.required_mc : undefined,
                    };
                  })()
                }
                planId={state.tenant_id ?? ''}
              />
            </div>
          )}
        </div>
      ) : null}

      <ErrorNote error={phase !== 'error' ? err : null} />
    </StepCard>
  );
}
