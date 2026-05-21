'use client';

import { useMemo, useState } from 'react';

type Mode = '2d' | '3d';

function formatNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(4).replace(/\.?0+$/, '');
}

function parseNum(s: string): number | null {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function MidpointWidget() {
  const [mode, setMode] = useState<Mode>('2d');
  const [x1, setX1] = useState('2');
  const [y1, setY1] = useState('4');
  const [z1, setZ1] = useState('0');
  const [x2, setX2] = useState('6');
  const [y2, setY2] = useState('10');
  const [z2, setZ2] = useState('0');

  const result = useMemo(() => {
    const a = [parseNum(x1), parseNum(y1), mode === '3d' ? parseNum(z1) : 0];
    const b = [parseNum(x2), parseNum(y2), mode === '3d' ? parseNum(z2) : 0];
    if (a.some((v) => v === null) || b.some((v) => v === null)) return null;
    const mx = ((a[0] as number) + (b[0] as number)) / 2;
    const my = ((a[1] as number) + (b[1] as number)) / 2;
    const mz = ((a[2] as number) + (b[2] as number)) / 2;
    return {
      mx,
      my,
      mz,
      a: a as number[],
      b: b as number[],
    };
  }, [x1, y1, z1, x2, y2, z2, mode]);

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="inline-flex rounded-full bg-ink-100 p-1">
        {(['2d', '3d'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              mode === m ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {m === '2d' ? '2D (x, y)' : '3D (x, y, z)'}
          </button>
        ))}
      </div>

      {/* Inputs */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-5">
          <div className="mb-3 text-sm font-bold text-ink-700">Point A</div>
          <div className={`grid gap-3 ${mode === '3d' ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <CoordInput label="x₁" value={x1} onChange={setX1} />
            <CoordInput label="y₁" value={y1} onChange={setY1} />
            {mode === '3d' && <CoordInput label="z₁" value={z1} onChange={setZ1} />}
          </div>
        </div>
        <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-5">
          <div className="mb-3 text-sm font-bold text-ink-700">Point B</div>
          <div className={`grid gap-3 ${mode === '3d' ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <CoordInput label="x₂" value={x2} onChange={setX2} />
            <CoordInput label="y₂" value={y2} onChange={setY2} />
            {mode === '3d' && <CoordInput label="z₂" value={z2} onChange={setZ2} />}
          </div>
        </div>
      </div>

      {/* Result */}
      {result ? (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/20">
          <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-wa-teal">
            Midpoint
          </div>
          <div className="font-display text-3xl font-bold text-ink-900 sm:text-4xl">
            ({formatNum(result.mx)}, {formatNum(result.my)}
            {mode === '3d' && <>, {formatNum(result.mz)}</>})
          </div>

          <div className="mt-5 border-t border-wa-green/20 pt-4 text-sm">
            <div className="font-semibold text-ink-700">Step-by-step</div>
            <div className="mt-2 space-y-1 font-mono text-ink-500">
              <div>
                M = ((x₁ + x₂)/2, (y₁ + y₂)/2{mode === '3d' && ', (z₁ + z₂)/2'})
              </div>
              <div>
                M = (({formatNum(result.a[0])} + {formatNum(result.b[0])})/2, (
                {formatNum(result.a[1])} + {formatNum(result.b[1])})/2
                {mode === '3d' && (
                  <>
                    , ({formatNum(result.a[2])} + {formatNum(result.b[2])})/2
                  </>
                )}
                )
              </div>
              <div className="font-semibold text-ink-900">
                M = ({formatNum(result.mx)}, {formatNum(result.my)}
                {mode === '3d' && <>, {formatNum(result.mz)}</>})
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-8 text-center text-sm text-ink-500">
          Enter valid numbers for both points to see the midpoint.
        </div>
      )}
    </div>
  );
}

function CoordInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-ink-500">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
      />
    </div>
  );
}
