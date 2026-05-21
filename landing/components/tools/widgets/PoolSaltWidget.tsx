'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

type Unit = 'gallons' | 'liters';

// Pounds of salt to raise X gallons by 1 ppm.
// Formula: lbs = (target_ppm - current_ppm) * gallons * 0.00000834
// (1 ppm in a gallon of water ≈ 8.34 × 10⁻⁶ lbs)
const LBS_PER_GAL_PPM = 0.00000834;
// 1 US gallon = 3.78541 liters

function poundsToKg(lbs: number): number {
  return lbs * 0.45359237;
}

function litersToGallons(l: number): number {
  return l / 3.78541;
}

export function PoolSaltWidget() {
  const [unit, setUnit] = useState<Unit>('gallons');
  const [volume, setVolume] = useState('15000');
  const [currentPpm, setCurrentPpm] = useState('0');
  const [targetPpm, setTargetPpm] = useState('3200');

  const result = useMemo(() => {
    const v = Number(volume);
    const cur = Number(currentPpm);
    const tgt = Number(targetPpm);
    if (!Number.isFinite(v) || !Number.isFinite(cur) || !Number.isFinite(tgt)) return null;
    if (v <= 0 || cur < 0 || tgt < 0) return null;

    const gallons = unit === 'gallons' ? v : litersToGallons(v);
    const ppmDelta = tgt - cur;

    if (ppmDelta < 0) {
      return {
        status: 'too-high' as const,
        ppmDelta,
        gallons,
      };
    }

    const lbs = ppmDelta * gallons * LBS_PER_GAL_PPM;
    const kg = poundsToKg(lbs);
    const bags40 = Math.ceil(lbs / 40);

    return {
      status: 'ok' as const,
      lbs,
      kg,
      bags40,
      ppmDelta,
      gallons,
    };
  }, [unit, volume, currentPpm, targetPpm]);

  const targetInRange = Number(targetPpm) >= 3000 && Number(targetPpm) <= 3500;

  return (
    <div className="space-y-6">
      {/* Unit toggle */}
      <div className="inline-flex rounded-full bg-ink-100 p-1">
        {(['gallons', 'liters'] as Unit[]).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setUnit(u)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${
              unit === u ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {u}
          </button>
        ))}
      </div>

      {/* Inputs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">
            Pool volume ({unit})
          </label>
          <input
            type="number"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">
            Current salt (ppm)
          </label>
          <input
            type="number"
            value={currentPpm}
            onChange={(e) => setCurrentPpm(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">
            Target salt (ppm)
          </label>
          <input
            type="number"
            value={targetPpm}
            onChange={(e) => setTargetPpm(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
          <div className="mt-1 text-xs text-ink-400">
            {targetInRange ? (
              <span className="inline-flex items-center gap-1 text-wa-teal">
                <CheckCircle2 className="h-3 w-3" />
                Ideal range (3000–3500 ppm)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-orange-600">
                <AlertTriangle className="h-3 w-3" />
                Outside ideal 3000–3500 ppm range
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Result */}
      {result?.status === 'ok' ? (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/20">
          <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-wa-teal">
            Add this much salt
          </div>
          <div className="font-display text-4xl font-bold text-ink-900 sm:text-5xl">
            {result.lbs.toFixed(0)} lbs
            <span className="ml-2 text-xl font-normal text-ink-500">
              ({result.kg.toFixed(1)} kg)
            </span>
          </div>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink-700 shadow-soft">
            ≈ {result.bags40} × 40-lb bag{result.bags40 === 1 ? '' : 's'}
          </div>

          <div className="mt-5 border-t border-wa-green/20 pt-4 text-sm text-ink-500">
            <p>
              Use food-grade pool salt (≥99% pure NaCl, no iodine, no anti-caking agents). Brush the bottom of the pool after adding to prevent staining. Allow 24 hours with pumps running for full dissolution.
            </p>
          </div>

          {(() => {
            const cta = buildToolPrefill('pool-salt-calculator', {
              lbs: result.lbs,
              targetPpm,
              volume,
              unit,
              status: 'ok',
            });
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      ) : result?.status === 'too-high' ? (
        <div className="rounded-2xl bg-orange-50 p-6 ring-1 ring-orange-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-orange-600" />
            <div className="flex-1">
              <div className="font-display text-lg font-bold text-ink-900">
                Your salt is already too high
              </div>
              <p className="mt-1 text-sm text-ink-500">
                Current salt ({currentPpm} ppm) exceeds your target ({targetPpm} ppm). You can&apos;t remove salt by adding more — partially drain and refill with fresh water to dilute.
              </p>
              {(() => {
                const cta = buildToolPrefill('pool-salt-calculator', { status: 'too-high' });
                return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
              })()}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-8 text-center text-sm text-ink-500">
          Enter valid pool volume and salt levels to see the calculation.
        </div>
      )}
    </div>
  );
}
