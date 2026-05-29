'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

// Convert innings-pitched baseball notation into true innings.
// In baseball, the decimal part of IP counts OUTS, not tenths:
//   6.1 IP = 6 innings + 1 out  = 6.3333…
//   6.2 IP = 6 innings + 2 outs = 6.6667…
// Any other decimal is treated as a literal fraction of an inning.
function parseInnings(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 10);
  if (frac === 1) return whole + 1 / 3;
  if (frac === 2) return whole + 2 / 3;
  return n; // 0, .3+ → treat as written
}

function eraRating(era: number): { label: string; color: string } {
  if (era < 2.0) return { label: 'Elite — Cy Young territory', color: 'text-wa-teal' };
  if (era < 3.0) return { label: 'Excellent — front-of-rotation', color: 'text-green-600' };
  if (era < 4.0) return { label: 'Good — solid starter', color: 'text-lime-600' };
  if (era < 5.0) return { label: 'Average — back-of-rotation', color: 'text-amber-600' };
  return { label: 'High — room to improve', color: 'text-red-600' };
}

export function EraWidget() {
  const [earnedRuns, setEarnedRuns] = useState('3');
  const [innings, setInnings] = useState('7');

  const result = useMemo(() => {
    const er = Number(earnedRuns);
    const ip = parseInnings(innings);
    if (!Number.isFinite(er) || er < 0 || ip === null || ip <= 0) return null;

    const era = (er * 9) / ip;
    const rounded = Math.round(era * 100) / 100;
    const rating = eraRating(rounded);
    const ipDisplay = Math.round(ip * 1000) / 1000;
    const steps = [
      `ERA = (Earned Runs ÷ Innings Pitched) × 9`,
      `    = (${er} ÷ ${ipDisplay}) × 9`,
      `    = ${rounded.toFixed(2)}`,
    ];
    return { era: rounded, rating, steps };
  }, [earnedRuns, innings]);

  const inputClass =
    'w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20';

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">Earned runs (ER)</label>
          <input type="number" min="0" step="1" value={earnedRuns} onChange={(e) => setEarnedRuns(e.target.value)} className={inputClass} />
          <div className="mt-1 text-xs text-ink-400">Runs charged to the pitcher (exclude unearned).</div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">Innings pitched (IP)</label>
          <input type="number" min="0" step="0.1" value={innings} onChange={(e) => setInnings(e.target.value)} className={inputClass} />
          <div className="mt-1 text-xs text-ink-400">.1 = 1 out, .2 = 2 outs (e.g. 6.2 = 6⅔).</div>
        </div>
      </div>

      {result ? (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/20">
          <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-wa-teal">Earned Run Average</div>
          <div className="flex items-baseline gap-4">
            <div className="font-display text-7xl font-bold text-ink-900 sm:text-8xl">{result.era.toFixed(2)}</div>
            <div className="text-base text-ink-500">
              <div className="font-semibold text-ink-900">ERA</div>
              <div className={`font-semibold ${result.rating.color}`}>{result.rating.label}</div>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-white px-4 py-3 font-mono text-xs text-ink-500 shadow-soft">
            {result.steps.map((s, i) => (
              <div key={i}>{s}</div>
            ))}
          </div>

          {(() => {
            const cta = buildToolPrefill('era-calculator', { era: result.era });
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-8 text-center text-sm text-ink-500">
          Enter earned runs and innings pitched to calculate the exact ERA.
        </div>
      )}
    </div>
  );
}
