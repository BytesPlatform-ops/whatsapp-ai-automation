'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

// AP Biology exam structure (2024-2026):
//   MCQ: 60 questions → weighted to 50% of composite
//   FRQ: 6 questions (2 long ~8 pts, 4 short ~4 pts) = ~40 raw → weighted to 50% of composite

const MAX_MCQ = 60;
const MAX_FRQ = 40;

const CUTOFFS: { score: 5 | 4 | 3 | 2 | 1; minComposite: number }[] = [
  { score: 5, minComposite: 70 },
  { score: 4, minComposite: 55 },
  { score: 3, minComposite: 40 },
  { score: 2, minComposite: 25 },
  { score: 1, minComposite: 0 },
];

function getApScore(composite: number): 1 | 2 | 3 | 4 | 5 {
  for (const c of CUTOFFS) {
    if (composite >= c.minComposite) return c.score;
  }
  return 1;
}

function scoreLabel(s: 1 | 2 | 3 | 4 | 5): string {
  return {
    5: 'Extremely well qualified',
    4: 'Well qualified',
    3: 'Qualified',
    2: 'Possibly qualified',
    1: 'No recommendation',
  }[s];
}

function scoreColor(s: 1 | 2 | 3 | 4 | 5): string {
  if (s === 5) return 'text-wa-teal';
  if (s === 4) return 'text-wa-greenDark';
  if (s === 3) return 'text-ink-900';
  return 'text-orange-600';
}

export function ApBioWidget() {
  const [mcqRaw, setMcqRaw] = useState('40');
  const [frqRaw, setFrqRaw] = useState('26');

  const result = useMemo(() => {
    const m = Number(mcqRaw);
    const f = Number(frqRaw);
    if (!Number.isFinite(m) || !Number.isFinite(f)) return null;
    if (m < 0 || m > MAX_MCQ || f < 0 || f > MAX_FRQ) return null;

    const mcqPct = (m / MAX_MCQ) * 50;
    const frqPct = (f / MAX_FRQ) * 50;
    const composite = mcqPct + frqPct;
    const apScore = getApScore(composite);

    const nextCutoff = CUTOFFS.find((c) => c.minComposite > composite);
    const pointsToNext = nextCutoff ? nextCutoff.minComposite - composite : null;
    const nextScore = nextCutoff?.score ?? null;

    return { mcqPct, frqPct, composite, apScore, pointsToNext, nextScore };
  }, [mcqRaw, frqRaw]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">
            Multiple-choice score (out of {MAX_MCQ})
          </label>
          <input
            type="number"
            min="0"
            max={MAX_MCQ}
            value={mcqRaw}
            onChange={(e) => setMcqRaw(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
          <div className="mt-1 text-xs text-ink-400">90 minutes, 50% of composite</div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">
            Free-response total (out of {MAX_FRQ})
          </label>
          <input
            type="number"
            min="0"
            max={MAX_FRQ}
            step="0.5"
            value={frqRaw}
            onChange={(e) => setFrqRaw(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
          <div className="mt-1 text-xs text-ink-400">2 long (~8 pts) + 4 short (4 pts) = 40 max</div>
        </div>
      </div>

      {result ? (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/20">
          <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-wa-teal">
            Predicted AP score
          </div>
          <div className="flex items-baseline gap-4">
            <div className={`font-display text-7xl font-bold ${scoreColor(result.apScore)} sm:text-8xl`}>
              {result.apScore}
            </div>
            <div className="text-base text-ink-500">
              <div className="font-semibold text-ink-900">{scoreLabel(result.apScore)}</div>
              <div>Composite: {result.composite.toFixed(1)} / 100</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 border-t border-wa-green/20 pt-4 sm:grid-cols-2">
            <StatBlock label="MCQ contribution" value={`${result.mcqPct.toFixed(1)} / 50`} />
            <StatBlock label="FRQ contribution" value={`${result.frqPct.toFixed(1)} / 50`} />
          </div>

          {result.pointsToNext !== null && result.nextScore && (
            <div className="mt-4 rounded-lg bg-white px-4 py-3 text-sm text-ink-500 shadow-soft">
              You&apos;re <strong className="text-ink-900">{result.pointsToNext.toFixed(1)} composite points</strong>{' '}
              away from a <strong className="text-ink-900">{result.nextScore}</strong>. That&apos;s roughly{' '}
              <strong>{Math.ceil((result.pointsToNext / 50) * MAX_MCQ)}</strong> more MCQs or{' '}
              <strong>{Math.ceil((result.pointsToNext / 50) * MAX_FRQ)}</strong> more FRQ points.
            </div>
          )}

          <p className="mt-4 text-xs text-ink-400">
            Estimate based on recent College Board curves (±1 score band). Real cutoffs adjust yearly based on exam difficulty.
          </p>

          {(() => {
            const cta = buildToolPrefill('ap-bio-score-calculator', {
              apScore: result.apScore,
              composite: result.composite,
            });
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-8 text-center text-sm text-ink-500">
          Enter your MCQ score (0–{MAX_MCQ}) and FRQ total (0–{MAX_FRQ}) to see your predicted AP score.
        </div>
      )}
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</div>
      <div className="mt-1 font-display text-xl font-bold text-ink-900">{value}</div>
    </div>
  );
}
