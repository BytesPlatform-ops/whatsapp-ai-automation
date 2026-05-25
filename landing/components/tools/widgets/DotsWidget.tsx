'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

type Mode = '2d' | '3d';

export function DotsWidget() {
  const [mode, setMode] = useState<Mode>('2d');
  const [ax, setAx] = useState('3');
  const [ay, setAy] = useState('4');
  const [az, setAz] = useState('0');
  const [bx, setBx] = useState('1');
  const [by, setBy] = useState('2');
  const [bz, setBz] = useState('0');

  const result = useMemo(() => {
    const vals = [ax, ay, bx, by, ...(mode === '3d' ? [az, bz] : [])].map(Number);
    if (vals.some((v) => !Number.isFinite(v))) return null;

    const [aX, aY, bX, bY] = vals;
    const aZ = mode === '3d' ? Number(az) : 0;
    const bZ = mode === '3d' ? Number(bz) : 0;

    const dot = aX * bX + aY * bY + (mode === '3d' ? aZ * bZ : 0);
    const magA = Math.sqrt(aX ** 2 + aY ** 2 + (mode === '3d' ? aZ ** 2 : 0));
    const magB = Math.sqrt(bX ** 2 + bY ** 2 + (mode === '3d' ? bZ ** 2 : 0));

    let angleDeg: number | null = null;
    let angleRad: number | null = null;
    if (magA > 0 && magB > 0) {
      const cosTheta = Math.max(-1, Math.min(1, dot / (magA * magB)));
      angleRad = Math.acos(cosTheta);
      angleDeg = (angleRad * 180) / Math.PI;
    }

    const perpendicular = Math.abs(dot) < 1e-10;
    const parallel = angleDeg !== null && (Math.abs(angleDeg) < 0.01 || Math.abs(angleDeg - 180) < 0.01);

    const steps = [
      `A · B = (${aX})(${bX}) + (${aY})(${bY})${mode === '3d' ? ` + (${aZ})(${bZ})` : ''}`,
      `     = ${aX * bX} + ${aY * bY}${mode === '3d' ? ` + ${aZ * bZ}` : ''}`,
      `     = ${dot}`,
    ];

    return { dot, magA: round(magA), magB: round(magB), angleDeg: angleDeg !== null ? round(angleDeg) : null, angleRad: angleRad !== null ? round(angleRad) : null, perpendicular, parallel, steps };
  }, [mode, ax, ay, az, bx, by, bz]);

  function round(n: number) {
    return Math.round(n * 10000) / 10000;
  }

  const inputClass = 'w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20';

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <button
          onClick={() => setMode('2d')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${mode === '2d' ? 'bg-wa-green text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}
        >
          2D vectors
        </button>
        <button
          onClick={() => setMode('3d')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${mode === '3d' ? 'bg-wa-green text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}
        >
          3D vectors
        </button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-3">
          <div className="text-sm font-semibold text-ink-700">Vector A</div>
          <div className={`grid gap-3 ${mode === '3d' ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <div><label className="mb-1 block text-xs text-ink-500">x</label><input type="number" value={ax} onChange={(e) => setAx(e.target.value)} className={inputClass} /></div>
            <div><label className="mb-1 block text-xs text-ink-500">y</label><input type="number" value={ay} onChange={(e) => setAy(e.target.value)} className={inputClass} /></div>
            {mode === '3d' && <div><label className="mb-1 block text-xs text-ink-500">z</label><input type="number" value={az} onChange={(e) => setAz(e.target.value)} className={inputClass} /></div>}
          </div>
        </div>
        <div className="space-y-3">
          <div className="text-sm font-semibold text-ink-700">Vector B</div>
          <div className={`grid gap-3 ${mode === '3d' ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <div><label className="mb-1 block text-xs text-ink-500">x</label><input type="number" value={bx} onChange={(e) => setBx(e.target.value)} className={inputClass} /></div>
            <div><label className="mb-1 block text-xs text-ink-500">y</label><input type="number" value={by} onChange={(e) => setBy(e.target.value)} className={inputClass} /></div>
            {mode === '3d' && <div><label className="mb-1 block text-xs text-ink-500">z</label><input type="number" value={bz} onChange={(e) => setBz(e.target.value)} className={inputClass} /></div>}
          </div>
        </div>
      </div>

      {result ? (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/20">
          <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-wa-teal">Results</div>
          <div className="flex items-baseline gap-4">
            <div className="font-display text-7xl font-bold text-ink-900 sm:text-8xl">{result.dot}</div>
            <div className="text-base text-ink-500">
              <div className="font-semibold text-ink-900">Dot product A · B</div>
              {result.perpendicular && <div className="text-wa-teal font-semibold">Vectors are perpendicular ⊥</div>}
              {result.parallel && <div className="text-ink-500">Vectors are parallel ∥</div>}
            </div>
          </div>

          <div className="mt-6 grid gap-4 border-t border-wa-green/20 pt-4 sm:grid-cols-3">
            <StatBlock label="|A| magnitude" value={String(result.magA)} />
            <StatBlock label="|B| magnitude" value={String(result.magB)} />
            {result.angleDeg !== null && (
              <StatBlock label="Angle θ" value={`${result.angleDeg}°`} />
            )}
          </div>

          {result.angleRad !== null && (
            <div className="mt-1 text-xs text-ink-400 text-right">
              θ = {result.angleRad} radians
            </div>
          )}

          <div className="mt-4 rounded-lg bg-white px-4 py-3 font-mono text-xs text-ink-500 shadow-soft">
            {result.steps.map((s, i) => <div key={i}>{s}</div>)}
          </div>

          {(() => {
            const cta = buildToolPrefill('dots-calculator', { dot: result.dot });
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-8 text-center text-sm text-ink-500">
          Enter the components of Vector A and Vector B to calculate the dot product and angle between them.
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
