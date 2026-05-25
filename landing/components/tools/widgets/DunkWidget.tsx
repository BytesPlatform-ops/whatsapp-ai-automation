'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

// Rim height = 10 ft = 120 in. Need hand 6" above = 126 in touch point.
// Standing reach default = height_inches × 1.33 (average ratio)

function cmToInches(cm: number): number {
  return cm / 2.54;
}

function verticalRating(vertIn: number): { label: string; color: string } {
  if (vertIn <= 0) return { label: 'You can already dunk! 🔥', color: 'text-wa-teal' };
  if (vertIn <= 6) return { label: 'Very close — elite athlete range', color: 'text-wa-greenDark' };
  if (vertIn <= 12) return { label: 'Athletic — achievable with training', color: 'text-wa-greenDark' };
  if (vertIn <= 20) return { label: 'Challenging — serious plyometric work needed', color: 'text-ink-700' };
  if (vertIn <= 30) return { label: 'Difficult — elite vertical required', color: 'text-orange-600' };
  return { label: 'Extremely difficult — NBA-level athleticism', color: 'text-red-600' };
}

export function DunkWidget() {
  const [heightUnit, setHeightUnit] = useState<'imperial' | 'metric'>('imperial');
  const [heightFt, setHeightFt] = useState('6');
  const [heightIn, setHeightIn] = useState('0');
  const [heightCm, setHeightCm] = useState('183');
  const [reachOverride, setReachOverride] = useState('');
  const [rimHeight] = useState(120); // standard 10 ft rim in inches

  const result = useMemo(() => {
    let totalHeightIn: number;
    if (heightUnit === 'imperial') {
      const ft = Number(heightFt);
      const inches = Number(heightIn);
      if (!Number.isFinite(ft) || !Number.isFinite(inches)) return null;
      totalHeightIn = ft * 12 + inches;
    } else {
      const cm = Number(heightCm);
      if (!Number.isFinite(cm)) return null;
      totalHeightIn = cmToInches(cm);
    }

    if (totalHeightIn < 36 || totalHeightIn > 120) return null;

    const standingReach =
      reachOverride !== '' && Number.isFinite(Number(reachOverride))
        ? Number(reachOverride)
        : Math.round(totalHeightIn * 1.33);

    const touchPoint = rimHeight + 6; // 6 inches above rim to place ball
    const vertNeeded = Math.max(0, touchPoint - standingReach);

    const totalHeightFt = Math.floor(totalHeightIn / 12);
    const totalHeightRemIn = Math.round(totalHeightIn % 12);
    const rating = verticalRating(vertNeeded);

    return {
      totalHeightIn: Math.round(totalHeightIn),
      totalHeightFt,
      totalHeightRemIn,
      standingReach,
      touchPoint,
      vertNeeded: Math.round(vertNeeded),
      rating,
      canDunk: vertNeeded <= 0,
    };
  }, [heightUnit, heightFt, heightIn, heightCm, reachOverride, rimHeight]);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex gap-2">
          <button
            onClick={() => setHeightUnit('imperial')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${heightUnit === 'imperial' ? 'bg-wa-green text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}
          >
            Feet / Inches
          </button>
          <button
            onClick={() => setHeightUnit('metric')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${heightUnit === 'metric' ? 'bg-wa-green text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}
          >
            Centimeters
          </button>
        </div>

        {heightUnit === 'imperial' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink-700">Height — feet</label>
              <input
                type="number"
                min="3"
                max="9"
                value={heightFt}
                onChange={(e) => setHeightFt(e.target.value)}
                className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink-700">Height — inches</label>
              <input
                type="number"
                min="0"
                max="11"
                value={heightIn}
                onChange={(e) => setHeightIn(e.target.value)}
                className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink-700">Height (cm)</label>
            <input
              type="number"
              min="100"
              max="250"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
            />
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-ink-700">
          Standing reach — inches (optional)
        </label>
        <input
          type="number"
          min="60"
          max="120"
          placeholder={result ? `Default: ${result.standingReach}"` : 'Leave blank to auto-estimate'}
          value={reachOverride}
          onChange={(e) => setReachOverride(e.target.value)}
          className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
        <div className="mt-1 text-xs text-ink-400">How high you can reach flat-footed, arm fully extended. Measure at home or leave blank.</div>
      </div>

      {result ? (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/20">
          <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-wa-teal">
            Your dunk analysis
          </div>

          {result.canDunk ? (
            <div className="text-center">
              <div className="font-display text-5xl font-bold text-wa-teal mb-2">You can dunk! 🏀</div>
              <div className="text-base text-ink-500">Your standing reach of <strong>{result.standingReach}"</strong> already clears the {result.touchPoint}" touch point.</div>
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-4">
                <div className="font-display text-7xl font-bold text-ink-900 sm:text-8xl">
                  {result.vertNeeded}"
                </div>
                <div className="text-base text-ink-500">
                  <div className="font-semibold text-ink-900">vertical jump needed</div>
                  <div className={result.rating.color}>{result.rating.label}</div>
                </div>
              </div>
            </>
          )}

          <div className="mt-6 grid gap-4 border-t border-wa-green/20 pt-4 sm:grid-cols-3">
            <StatBlock label="Your height" value={`${result.totalHeightFt}'${result.totalHeightRemIn}"`} />
            <StatBlock label="Standing reach" value={`${result.standingReach}"`} />
            <StatBlock label="Touch point needed" value={`${result.touchPoint}"`} />
          </div>

          {!result.canDunk && (
            <div className="mt-4 rounded-lg bg-white px-4 py-3 text-sm text-ink-500 shadow-soft">
              <strong className="text-ink-900">How to get there:</strong> Box jumps, depth jumps, squats, and Romanian deadlifts are the fastest path.
              Most athletes add 4–8 inches to their vertical in 8–12 weeks of focused training.
            </div>
          )}

          {(() => {
            const cta = buildToolPrefill('dunk-calculator', { vertNeeded: result.vertNeeded });
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-8 text-center text-sm text-ink-500">
          Enter your height to calculate how high you need to jump to dunk.
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
