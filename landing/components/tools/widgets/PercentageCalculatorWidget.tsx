'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

type Mode = 'of' | 'isWhat' | 'change';

const MODES: { id: Mode; label: string }[] = [
  { id: 'of', label: 'What is X% of Y' },
  { id: 'isWhat', label: 'X is what % of Y' },
  { id: 'change', label: '% increase / decrease' },
];

const fmt = (n: number) => (Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : 0);

function inputClass() {
  return 'w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20';
}

export function PercentageCalculatorWidget() {
  const [mode, setMode] = useState<Mode>('of');
  const [a, setA] = useState('');
  const [b, setB] = useState('');

  const result = useMemo(() => {
    const x = parseFloat(a);
    const y = parseFloat(b);
    if (Number.isNaN(x) || Number.isNaN(y)) return null;
    if (mode === 'of') return { value: fmt((x / 100) * y), label: `${x}% of ${y}` };
    if (mode === 'isWhat') {
      if (y === 0) return null;
      return { value: fmt((x / y) * 100), label: `${x} is this % of ${y}`, suffix: '%' };
    }
    if (x === 0) return null;
    return { value: fmt(((y - x) / x) * 100), label: `change from ${x} to ${y}`, suffix: '%' };
  }, [mode, a, b]);

  const labels =
    mode === 'of'
      ? ['Percent (X%)', 'Of value (Y)']
      : mode === 'isWhat'
        ? ['Value (X)', 'Total (Y)']
        : ['From value', 'To value'];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            aria-pressed={mode === m.id}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              mode === m.id ? 'border-wa-green bg-wa-green/10 text-ink-900' : 'border-ink-200 bg-white text-ink-500 hover:border-wa-green/40'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pct-a" className="mb-2 block text-sm font-semibold text-ink-700">{labels[0]}</label>
          <input id="pct-a" type="number" inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} className={inputClass()} />
        </div>
        <div>
          <label htmlFor="pct-b" className="mb-2 block text-sm font-semibold text-ink-700">{labels[1]}</label>
          <input id="pct-b" type="number" inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} className={inputClass()} />
        </div>
      </div>

      {result && (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 text-center ring-1 ring-wa-green/15">
          <div className="font-display text-4xl font-bold text-ink-900">
            {result.value}
            {'suffix' in result ? result.suffix : ''}
          </div>
          <div className="mt-1 text-sm text-ink-500">{result.label}</div>
          {(() => {
            const cta = buildToolPrefill('percentage-calculator', {});
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      )}

      <p className="text-xs text-ink-400">
        Tip: switch modes for the three everyday questions — a percentage of a number, what percent
        one number is of another, and the percent increase or decrease between two numbers.
      </p>
    </div>
  );
}
