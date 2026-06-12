'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

const PRESETS = [10, 15, 18, 20, 25];

export function TipCalculatorWidget() {
  const [bill, setBill] = useState('');
  const [tipPct, setTipPct] = useState(18);
  const [people, setPeople] = useState(1);

  const r = useMemo(() => {
    const b = parseFloat(bill);
    if (Number.isNaN(b) || b < 0) return null;
    const tip = (b * tipPct) / 100;
    const total = b + tip;
    const n = Math.max(1, people);
    return { tip, total, perPerson: total / n, tipPerPerson: tip / n };
  }, [bill, tipPct, people]);

  const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tip-bill" className="mb-2 block text-sm font-semibold text-ink-700">Bill amount</label>
          <input
            id="tip-bill"
            type="number"
            inputMode="decimal"
            value={bill}
            onChange={(e) => setBill(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
        </div>
        <div>
          <label htmlFor="tip-people" className="mb-2 block text-sm font-semibold text-ink-700">Split between</label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPeople((p) => Math.max(1, p - 1))} className="h-10 w-10 shrink-0 rounded-xl border border-ink-200 bg-white text-lg font-bold text-ink-700 transition hover:border-wa-green/40">−</button>
            <input id="tip-people" type="number" min={1} value={people} onChange={(e) => setPeople(Math.max(1, Number(e.target.value)))} className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-center text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20" />
            <button type="button" onClick={() => setPeople((p) => p + 1)} className="h-10 w-10 shrink-0 rounded-xl border border-ink-200 bg-white text-lg font-bold text-ink-700 transition hover:border-wa-green/40">+</button>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-700">Tip</span>
          <span className="text-xs font-semibold text-ink-500">{tipPct}%</span>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setTipPct(p)}
              aria-pressed={tipPct === p}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                tipPct === p ? 'border-wa-green bg-wa-green/10 text-ink-900' : 'border-ink-200 bg-white text-ink-500 hover:border-wa-green/40'
              }`}
            >
              {p}%
            </button>
          ))}
        </div>
        <input type="range" min={0} max={30} value={tipPct} onChange={(e) => setTipPct(Number(e.target.value))} className="w-full accent-wa-green" />
      </div>

      {r && (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/15">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-ink-100">
              <div className="font-display text-xl font-bold text-ink-900">{money(r.tip)}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Tip</div>
            </div>
            <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-ink-100">
              <div className="font-display text-xl font-bold text-ink-900">{money(r.total)}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Total</div>
            </div>
          </div>
          {people > 1 && (
            <div className="mt-3 rounded-xl bg-white px-4 py-3 text-center ring-1 ring-ink-100">
              <div className="font-display text-2xl font-bold text-wa-teal">{money(r.perPerson)}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Per person ({people})</div>
            </div>
          )}
          {(() => {
            const cta = buildToolPrefill('tip-calculator', {});
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      )}

      <p className="text-xs text-ink-400">
        Tip: in the US, 15–20% is customary for sit-down service. Use the presets or drag the slider,
        then split the total evenly across the table.
      </p>
    </div>
  );
}
