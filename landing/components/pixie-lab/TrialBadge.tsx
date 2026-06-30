'use client';

import { Clock } from 'lucide-react';
import type { AgentState } from '@/lib/pixie-lab/feed';

/**
 * TrialBadge — shows entitlement state. For trials it renders a live-ish day
 * countdown to `trialEndsAt`. Reusable in cards, dashboards, and the topbar.
 * (Pure render from props + a fixed "now" passed in to stay deterministic SSR.)
 */
export function TrialBadge({
  state,
  trialEndsAt,
  nowMs,
  compact,
}: {
  state: AgentState;
  trialEndsAt?: string;
  nowMs?: number;
  compact?: boolean;
}) {
  if (state === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-2.5 py-1 text-[11px] font-semibold text-[#7ef0a8]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#25D366]" /> Active
      </span>
    );
  }

  if (state === 'locked') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/55">
        Locked
      </span>
    );
  }

  // trial
  const now = nowMs ?? 0;
  const end = trialEndsAt ? Date.parse(trialEndsAt) : 0;
  const daysLeft = end && now ? Math.max(0, Math.ceil((end - now) / 86_400_000)) : null;
  const ending = daysLeft !== null && daysLeft <= 2;
  const label =
    daysLeft === null ? 'Trial' : daysLeft === 0 ? 'Trial · ends today' : `Trial · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
        ending ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-violet-400/30 bg-violet-400/10 text-violet-200'
      }`}
    >
      <Clock size={11} />
      {compact ? (daysLeft ?? '·') : label}
    </span>
  );
}
