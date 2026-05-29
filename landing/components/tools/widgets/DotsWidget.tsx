'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

type Sex = 'male' | 'female';
type Unit = 'kg' | 'lb';

// Official DOTS coefficients (the IPF-replacement formula used by most meets).
// DOTS = total × 500 / (A·bw⁴ + B·bw³ + C·bw² + D·bw + E), bw in kg.
const COEFF: Record<Sex, [number, number, number, number, number]> = {
  male: [-0.000001093, 0.0007391293, -0.1918759221, 24.0900756, -307.75076],
  female: [-0.0000010706, 0.0005158568, -0.1126655495, 13.6175032, -57.96288],
};

const LB_TO_KG = 0.45359237;

function dotsRating(score: number): { label: string; color: string } {
  if (score >= 500) return { label: 'World class', color: 'text-wa-teal' };
  if (score >= 400) return { label: 'Elite', color: 'text-green-600' };
  if (score >= 300) return { label: 'Advanced', color: 'text-lime-600' };
  if (score >= 200) return { label: 'Intermediate', color: 'text-amber-600' };
  return { label: 'Novice', color: 'text-ink-500' };
}

export function DotsWidget() {
  const [sex, setSex] = useState<Sex>('male');
  const [unit, setUnit] = useState<Unit>('kg');
  const [bodyweight, setBodyweight] = useState('80');
  const [total, setTotal] = useState('500');

  const result = useMemo(() => {
    const bwRaw = Number(bodyweight);
    const totalRaw = Number(total);
    if (!Number.isFinite(bwRaw) || !Number.isFinite(totalRaw) || bwRaw <= 0 || totalRaw <= 0) return null;

    const bw = unit === 'lb' ? bwRaw * LB_TO_KG : bwRaw;
    const totalKg = unit === 'lb' ? totalRaw * LB_TO_KG : totalRaw;
    // DOTS is only defined/sensible roughly 40–210 kg bodyweight.
    if (bw < 40 || bw > 210) return null;

    const [A, B, C, D, E] = COEFF[sex];
    const denom = A * bw ** 4 + B * bw ** 3 + C * bw ** 2 + D * bw + E;
    if (denom <= 0) return null;

    const dots = (totalKg * 500) / denom;
    const rounded = Math.round(dots * 100) / 100;
    return { dots: rounded, rating: dotsRating(rounded) };
  }, [sex, unit, bodyweight, total]);

  const inputClass =
    'w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20';
  const pill = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-semibold transition ${active ? 'bg-wa-green text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setSex('male')} className={pill(sex === 'male')}>Male</button>
        <button onClick={() => setSex('female')} className={pill(sex === 'female')}>Female</button>
        <span className="mx-1 w-px self-stretch bg-ink-200" />
        <button onClick={() => setUnit('kg')} className={pill(unit === 'kg')}>kg</button>
        <button onClick={() => setUnit('lb')} className={pill(unit === 'lb')}>lb</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">Bodyweight ({unit})</label>
          <input type="number" min="0" step="0.1" value={bodyweight} onChange={(e) => setBodyweight(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">Total lifted ({unit})</label>
          <input type="number" min="0" step="0.5" value={total} onChange={(e) => setTotal(e.target.value)} className={inputClass} />
          <div className="mt-1 text-xs text-ink-400">Squat + bench + deadlift (or any total you want to score).</div>
        </div>
      </div>

      {result ? (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/20">
          <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-wa-teal">DOTS Score</div>
          <div className="flex items-baseline gap-4">
            <div className="font-display text-7xl font-bold text-ink-900 sm:text-8xl">{result.dots.toFixed(2)}</div>
            <div className="text-base text-ink-500">
              <div className="font-semibold text-ink-900">DOTS points</div>
              <div className={`font-semibold ${result.rating.color}`}>{result.rating.label}</div>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-white px-4 py-3 text-sm text-ink-500 shadow-soft">
            DOTS normalizes your total against bodyweight so lifters of any size can be compared on one scale.
            Higher is stronger pound-for-pound.
          </div>

          {(() => {
            const cta = buildToolPrefill('dots-calculator', { dots: result.dots });
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-8 text-center text-sm text-ink-500">
          Enter your bodyweight and total lifted to score your lift on the DOTS scale.
        </div>
      )}
    </div>
  );
}
