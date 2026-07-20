'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { ApprovalStatus, CreatorGate } from '@/lib/pixie-lab/contentCreatorTypes';
import type { CreatorError } from '@/lib/pixie-lab/contentCreatorClient';
import { StepCard, PrimaryButton, GhostButton, ErrorNote, Badge } from './ui';

/** Reusable approval-gate panel. The status is ALWAYS driven by backend state
 *  (never simulated locally). `spendWarning` is shown for Gate 3 (production). */
export function GatePanel({
  title, gate, status, whatSummary, consequence, spendWarning, mock, children,
  onApprove, onReject, approveLabel = 'Approve', requireConfirm,
}: {
  title: string;
  gate: CreatorGate;
  status: ApprovalStatus;
  whatSummary: React.ReactNode;
  consequence: string;
  spendWarning?: boolean;
  mock?: boolean;
  children?: React.ReactNode;
  onApprove: () => Promise<CreatorError | null>;
  onReject?: () => Promise<CreatorError | null>;
  approveLabel?: string;
  requireConfirm?: string;
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [err, setErr] = useState<CreatorError | null>(null);
  const approved = status === 'approved';

  async function run(kind: 'approve' | 'reject', fn: () => Promise<CreatorError | null>) {
    if (kind === 'approve' && requireConfirm && !window.confirm(requireConfirm)) return;
    setBusy(kind); setErr(null);
    const e = await fn();
    setBusy(null);
    if (e) setErr(e);
  }

  return (
    <StepCard
      title={title}
      description="Owner approval is required before the pipeline continues."
      footer={
        <>
          <PrimaryButton busy={busy === 'approve'} disabled={approved} onClick={() => run('approve', onApprove)}>
            <ShieldCheck className="h-4 w-4" aria-hidden /> {approved ? 'Approved' : approveLabel}
          </PrimaryButton>
          {onReject ? (
            <GhostButton disabled={busy !== null} onClick={() => run('reject', onReject)}>Return for edits</GhostButton>
          ) : null}
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={approved ? 'ok' : status === 'needs_changes' || status === 'rejected' ? 'warn' : 'muted'}>
          {approved ? 'Approved' : status === 'pending' ? 'Awaiting approval' : status.replace('_', ' ')}
        </Badge>
        <span className="sr-only">Gate: {gate}</span>
        {spendWarning ? <Badge tone={mock ? 'warn' : 'info'}>{mock ? 'Mock — no charge is made' : 'Next step can incur provider cost'}</Badge> : null}
      </div>
      <div className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3 text-sm text-[var(--pl-text)]">
        {whatSummary}
      </div>
      {children}
      <p className="mt-3 text-xs text-[var(--pl-text-soft)]">{consequence}</p>
      {spendWarning && mock ? (
        <p className="mt-1 text-xs text-amber-500">Mock mode: approving does NOT trigger a paid provider call and no billing is charged.</p>
      ) : null}
      <ErrorNote error={err} />
    </StepCard>
  );
}
