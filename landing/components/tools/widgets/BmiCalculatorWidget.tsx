'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

type Unit = 'metric' | 'imperial';

function category(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: 'Underweight', color: 'text-amber-600' };
  if (bmi < 25) return { label: 'Healthy weight', color: 'text-wa-green' };
  if (bmi < 30) return { label: 'Overweight', color: 'text-amber-600' };
  return { label: 'Obese', color: 'text-red-600' };
}

export function BmiCalculatorWidget() {
  const [unit, setUnit] = useState<Unit>('metric');
  const [cm, setCm] = useState('');
  const [kg, setKg] = useState('');
  const [ft, setFt] = useState('');
  const [inch, setInch] = useState('');
  const [lb, setLb] = useState('');

  const bmi = useMemo(() => {
    if (unit === 'metric') {
      const h = parseFloat(cm) / 100;
      const w = parseFloat(kg);
      if (!h || !w || h <= 0 || w <= 0) return null;
      return w / (h * h);
    }
    const totalIn = (parseFloat(ft) || 0) * 12 + (parseFloat(inch) || 0);
    const w = parseFloat(lb);
    if (!totalIn || !w || totalIn <= 0 || w <= 0) return null;
    return (703 * w) / (totalIn * totalIn);
  }, [unit, cm, kg, ft, inch, lb]);

  const inputClass =
    'w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20';

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-full bg-ink-100 p-1">
        {(['metric', 'imperial'] as Unit[]).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setUnit(u)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${
              unit === u ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {u === 'metric' ? 'Metric (cm / kg)' : 'Imperial (ft / lb)'}
          </button>
        ))}
      </div>

      {unit === 'metric' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="bmi-cm" className="mb-2 block text-sm font-semibold text-ink-700">Height (cm)</label>
            <input id="bmi-cm" type="number" inputMode="decimal" value={cm} onChange={(e) => setCm(e.target.value)} placeholder="175" className={inputClass} />
          </div>
          <div>
            <label htmlFor="bmi-kg" className="mb-2 block text-sm font-semibold text-ink-700">Weight (kg)</label>
            <input id="bmi-kg" type="number" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="70" className={inputClass} />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="bmi-ft" className="mb-2 block text-sm font-semibold text-ink-700">Height (ft)</label>
            <input id="bmi-ft" type="number" inputMode="decimal" value={ft} onChange={(e) => setFt(e.target.value)} placeholder="5" className={inputClass} />
          </div>
          <div>
            <label htmlFor="bmi-in" className="mb-2 block text-sm font-semibold text-ink-700">Height (in)</label>
            <input id="bmi-in" type="number" inputMode="decimal" value={inch} onChange={(e) => setInch(e.target.value)} placeholder="9" className={inputClass} />
          </div>
          <div>
            <label htmlFor="bmi-lb" className="mb-2 block text-sm font-semibold text-ink-700">Weight (lb)</label>
            <input id="bmi-lb" type="number" inputMode="decimal" value={lb} onChange={(e) => setLb(e.target.value)} placeholder="154" className={inputClass} />
          </div>
        </div>
      )}

      {bmi && (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 text-center ring-1 ring-wa-green/15">
          <div className="font-display text-4xl font-bold text-ink-900">{bmi.toFixed(1)}</div>
          <div className={`mt-1 text-sm font-bold ${category(bmi).color}`}>{category(bmi).label}</div>
          <div className="mt-2 text-xs text-ink-500">Healthy BMI range is 18.5 – 24.9</div>
          {(() => {
            const cta = buildToolPrefill('bmi-calculator', {});
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      )}

      <p className="text-xs text-ink-400">
        Tip: BMI is a quick screening measure, not a diagnosis. It does not account for muscle mass,
        age, or body composition — talk to a doctor for a full picture.
      </p>
    </div>
  );
}
