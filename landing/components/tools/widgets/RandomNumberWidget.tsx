'use client';

import { useCallback, useEffect, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';

function randInt(min: number, max: number): number {
  const range = max - min + 1;
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const a = new Uint32Array(1);
    window.crypto.getRandomValues(a);
    return min + (a[0] % range);
  }
  return min + Math.floor(Math.random() * range);
}

export function RandomNumberWidget() {
  const [min, setMin] = useState('1');
  const [max, setMax] = useState('100');
  const [count, setCount] = useState(1);
  const [unique, setUnique] = useState(false);
  const [results, setResults] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const roll = useCallback(() => {
    const lo = Math.ceil(Number(min));
    const hi = Math.floor(Number(max));
    if (Number.isNaN(lo) || Number.isNaN(hi) || hi < lo) {
      setError('Max must be greater than or equal to min.');
      setResults([]);
      return;
    }
    const n = Math.max(1, Math.min(1000, count));
    if (unique && n > hi - lo + 1) {
      setError(`Can't pick ${n} unique numbers from a range of ${hi - lo + 1}.`);
      setResults([]);
      return;
    }
    setError(null);
    if (unique) {
      const pool = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = randInt(0, i);
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      setResults(pool.slice(0, n));
    } else {
      setResults(Array.from({ length: n }, () => randInt(lo, hi)));
    }
  }, [min, max, count, unique]);

  useEffect(() => {
    roll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="rn-min" className="mb-2 block text-sm font-semibold text-ink-700">Min</label>
          <input id="rn-min" type="number" value={min} onChange={(e) => setMin(e.target.value)} className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20" />
        </div>
        <div>
          <label htmlFor="rn-max" className="mb-2 block text-sm font-semibold text-ink-700">Max</label>
          <input id="rn-max" type="number" value={max} onChange={(e) => setMax(e.target.value)} className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20" />
        </div>
        <div>
          <label htmlFor="rn-count" className="mb-2 block text-sm font-semibold text-ink-700">How many</label>
          <input id="rn-count" type="number" min={1} max={1000} value={count} onChange={(e) => setCount(Math.max(1, Math.min(1000, Number(e.target.value))))} className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20" />
        </div>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-ink-700">
        <input type="checkbox" checked={unique} onChange={(e) => setUnique(e.target.checked)} className="accent-wa-green" />
        No repeats (unique numbers)
      </label>

      <div className="flex justify-center">
        <button type="button" onClick={roll} className="inline-flex items-center gap-1.5 rounded-xl bg-wa-green px-6 py-3 text-sm font-semibold text-white transition hover:bg-wa-greenDark">
          <Shuffle className="h-4 w-4" /> Generate
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">{error}</div>
      )}

      {results.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-ink-700">Result</span>
            <CopyButton value={results.join(', ')} />
          </div>
          <div
            aria-live="polite"
            className={`rounded-2xl border border-ink-200 bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 px-4 py-6 text-center ${
              results.length === 1 ? '' : 'flex flex-wrap justify-center gap-2'
            }`}
          >
            {results.length === 1 ? (
              <span className="font-display text-5xl font-bold text-ink-900">{results[0]}</span>
            ) : (
              results.map((n, i) => (
                <span key={i} className="rounded-lg bg-white px-3 py-1.5 font-display text-lg font-bold text-ink-900 ring-1 ring-ink-100">{n}</span>
              ))
            )}
          </div>
        </div>
      )}

      {(() => {
        const cta = buildToolPrefill('random-number-generator', {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      <p className="text-xs text-ink-400">
        Tip: numbers use your browser&apos;s secure random generator. Turn on &ldquo;no repeats&rdquo; for raffles
        and draws where each number can only come up once.
      </p>
    </div>
  );
}
