'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

export function CrosswindWidget() {
  const [windDir, setWindDir] = useState('270');
  const [windSpeed, setWindSpeed] = useState('15');
  const [runwayHdg, setRunwayHdg] = useState('240');
  const [unit, setUnit] = useState<'kts' | 'mph'>('kts');

  const result = useMemo(() => {
    const wd = Number(windDir);
    const ws = Number(windSpeed);
    const rh = Number(runwayHdg);
    if (!Number.isFinite(wd) || !Number.isFinite(ws) || !Number.isFinite(rh)) return null;
    if (ws < 0 || ws > 200) return null;
    if (wd < 0 || wd > 360 || rh < 0 || rh > 360) return null;

    // Wind angle: difference between wind direction and runway heading
    let windAngle = Math.abs(wd - rh);
    if (windAngle > 180) windAngle = 360 - windAngle;
    const windAngleRad = (windAngle * Math.PI) / 180;

    const crosswind = Math.abs(ws * Math.sin(windAngleRad));
    const headwind = ws * Math.cos(windAngleRad); // negative = tailwind

    return {
      windAngle: Math.round(windAngle),
      crosswind: Math.round(crosswind * 10) / 10,
      headwind: Math.round(headwind * 10) / 10,
      isTailwind: headwind < 0,
    };
  }, [windDir, windSpeed, runwayHdg]);

  const unitLabel = unit;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">Wind direction (°)</label>
          <input
            type="number"
            min="0"
            max="360"
            value={windDir}
            onChange={(e) => setWindDir(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
          <div className="mt-1 text-xs text-ink-400">From ATIS/METAR (0–360°)</div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">
            Wind speed ({unitLabel})
          </label>
          <input
            type="number"
            min="0"
            max="200"
            value={windSpeed}
            onChange={(e) => setWindSpeed(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
          <div className="mt-1 flex items-center gap-2 text-xs text-ink-400">
            <button
              onClick={() => setUnit('kts')}
              className={`rounded px-2 py-0.5 ${unit === 'kts' ? 'bg-wa-green text-white' : 'bg-ink-100 text-ink-600'}`}
            >
              Knots
            </button>
            <button
              onClick={() => setUnit('mph')}
              className={`rounded px-2 py-0.5 ${unit === 'mph' ? 'bg-wa-green text-white' : 'bg-ink-100 text-ink-600'}`}
            >
              MPH
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">Runway heading (°)</label>
          <input
            type="number"
            min="0"
            max="360"
            value={runwayHdg}
            onChange={(e) => setRunwayHdg(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
          <div className="mt-1 text-xs text-ink-400">Runway × 10 (rwy 27 = 270°)</div>
        </div>
      </div>

      {result ? (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/20">
          <div className="mb-4 text-sm font-semibold uppercase tracking-wider text-wa-teal">
            Wind components — wind angle {result.windAngle}°
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-1">Crosswind</div>
              <div className="font-display text-5xl font-bold text-ink-900">
                {result.crosswind}
              </div>
              <div className="mt-1 text-sm text-ink-500">{unitLabel} from {result.windAngle < 90 ? 'left' : result.windAngle > 90 ? 'right' : 'direct'}</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-1">
                {result.isTailwind ? 'Tailwind' : 'Headwind'}
              </div>
              <div className={`font-display text-5xl font-bold ${result.isTailwind ? 'text-orange-600' : 'text-wa-teal'}`}>
                {Math.abs(result.headwind)}
              </div>
              <div className="mt-1 text-sm text-ink-500">{unitLabel} {result.isTailwind ? '⚠️ tailwind' : 'headwind'}</div>
            </div>
          </div>

          <div className="mt-6 rounded-lg bg-white px-4 py-3 text-sm text-ink-500 shadow-soft">
            <strong className="text-ink-900">Crosswind formula:</strong> {windSpeed} {unitLabel} × sin({result.windAngle}°) ={' '}
            <strong className="text-ink-900">{result.crosswind} {unitLabel}</strong>
            <br />
            <strong className="text-ink-900">Headwind formula:</strong> {windSpeed} {unitLabel} × cos({result.windAngle}°) ={' '}
            <strong className={result.isTailwind ? 'text-orange-600' : 'text-ink-900'}>
              {result.headwind} {unitLabel}
            </strong>
          </div>

          <p className="mt-4 text-xs text-ink-400">
            Always verify actual conditions and check aircraft POH for demonstrated crosswind limits.
          </p>

          {(() => {
            const cta = buildToolPrefill('crosswind-calculator', {});
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-8 text-center text-sm text-ink-500">
          Enter wind direction, wind speed, and runway heading to calculate crosswind and headwind components.
        </div>
      )}
    </div>
  );
}
