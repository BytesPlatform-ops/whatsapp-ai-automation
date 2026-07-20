'use client';

/**
 * Content Creator wizard shell — the real 13-stage AI Influencer pipeline in Pixie
 * Lab. Backend-authoritative: every stage/gate status comes from /wizard-state and
 * every action goes through the authenticated proxy. Resumes on the correct stage
 * after refresh / relogin / backend restart. Replaces the Phase-1 connectivity-only
 * screen while keeping its connection + mock/dry-run status.
 */

import { AlertTriangle, ArrowLeft, CheckCircle2, Circle, Loader2, Lock, WifiOff } from 'lucide-react';
import { useCreatorWizard } from '@/lib/pixie-lab/useCreatorWizard';
import { progressPercent } from '@/lib/pixie-lab/wizardNav';
import { PageContainer, PageHeader, BackToDashboard } from '@/components/pixie-lab/PageKit';
import { MockBadge, Badge } from './ui';
import { STEP_COMPONENTS } from './registry';

export function CreatorWizard() {
  const wiz = useCreatorWizard();
  const { loading, error, state, activeStage } = wiz;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="AI Content Creator"
        title="Content Creator"
        description="Take one business through the full AI-influencer pipeline: intake → identity → ideas → script → video → publish."
      />

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-6 text-sm text-[var(--pl-text-soft)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading your pipeline…
        </div>
      ) : error && !state ? (
        <ErrorState kind={error.kind} message={error.message} onRetry={wiz.reload} />
      ) : state ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <MockBadge mock={state.mock} dryRun={state.dry_run} />
            <div className="flex items-center gap-2 text-xs text-[var(--pl-text-soft)]">
              <span aria-hidden><CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-500" /></span>
              Connected · {state.completed_count}/{state.total_stages} steps
            </div>
          </div>

          <Progress percent={progressPercent(state)} />

          <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
            <Stepper wiz={wiz} />
            <div>
              {activeStage ? <StepBody wiz={wiz} /> : null}
              <div className="mt-5 flex items-center justify-between">
                <BackButton wiz={wiz} />
                <BackToDashboard />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <ErrorState kind="offline" message="Could not load the pipeline." onRetry={wiz.reload} />
      )}
    </PageContainer>
  );
}

function Progress({ percent }: { percent: number }) {
  return (
    <div className="rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-1">
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Pipeline ${percent}% complete`}
        className="h-2 rounded-full bg-[var(--pl-accent,#D4AF37)] transition-all"
        style={{ width: `${Math.max(4, percent)}%` }}
      />
    </div>
  );
}

function Stepper({ wiz }: { wiz: ReturnType<typeof useCreatorWizard> }) {
  const { state, activeStage, goTo } = wiz;
  if (!state) return null;
  return (
    <nav aria-label="Pipeline steps" className="lg:sticky lg:top-4 lg:self-start">
      <ol className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
        {state.stages.map((s) => {
          const isActive = s.stage === activeStage;
          const navigable = s.status === 'complete' || s.status === 'current';
          const Icon = s.status === 'complete' ? CheckCircle2 : s.status === 'locked' ? Lock : Circle;
          return (
            <li key={s.stage} className="shrink-0">
              <button
                type="button"
                onClick={() => navigable && goTo(s.stage)}
                disabled={!navigable}
                aria-current={isActive ? 'step' : undefined}
                className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
                  isActive ? 'border-[var(--pl-accent,#D4AF37)] bg-[var(--pl-surface-soft)]'
                  : 'border-[var(--pl-border)] hover:bg-[var(--pl-surface-soft)]'
                } ${!navigable ? 'cursor-not-allowed opacity-55' : ''}`}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${s.status === 'complete' ? 'text-emerald-500' : 'text-[var(--pl-text-soft)]'}`} aria-hidden />
                <span className="whitespace-nowrap font-medium text-[var(--pl-text)] lg:whitespace-normal">
                  {s.n}. {s.title}
                </span>
                {s.gate ? <span className="sr-only"> (approval gate)</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepBody({ wiz }: { wiz: ReturnType<typeof useCreatorWizard> }) {
  const { state, activeStage, reload, advance, goTo, reloading } = wiz;
  if (!state || !activeStage) return null;
  const Step = STEP_COMPONENTS[activeStage];
  return (
    <div aria-busy={reloading}>
      <Step state={state} reload={reload} advance={advance} goTo={goTo} />
    </div>
  );
}

function BackButton({ wiz }: { wiz: ReturnType<typeof useCreatorWizard> }) {
  const { state, activeStage, goTo } = wiz;
  if (!state || !activeStage) return <span />;
  const idx = state.stages.findIndex((s) => s.stage === activeStage);
  const prev = idx > 0 ? state.stages[idx - 1] : null;
  const canBack = prev && (prev.status === 'complete' || prev.status === 'current');
  if (!canBack) return <span />;
  return (
    <button type="button" onClick={() => goTo(prev!.stage)}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pl-border)] px-3.5 py-2 text-xs font-semibold text-[var(--pl-text-soft)] hover:text-[var(--pl-text)]">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
    </button>
  );
}

function ErrorState({ kind, message, onRetry }: { kind: string; message: string; onRetry: () => void }) {
  const unauth = kind === 'unauthorized' || kind === 'forbidden';
  const Icon = kind === 'offline' ? WifiOff : AlertTriangle;
  return (
    <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--pl-text)]">
        <Icon className="h-4 w-4 text-amber-500" aria-hidden /> {unauth ? 'Access issue' : 'Service unavailable'}
      </div>
      <p className="mt-1.5 text-sm text-[var(--pl-text-soft)]">{message}</p>
      {!unauth ? (
        <button type="button" onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--pl-accent,#D4AF37)] px-4 py-2 text-sm font-semibold text-black">
          Retry
        </button>
      ) : null}
    </div>
  );
}
