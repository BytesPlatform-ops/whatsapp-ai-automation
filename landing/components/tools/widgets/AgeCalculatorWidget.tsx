'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

interface AgeResult {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  nextBirthdayDays: number;
}

function calcAge(birthStr: string, asOfStr: string): AgeResult | null {
  if (!birthStr) return null;
  const birth = new Date(birthStr);
  const target = asOfStr ? new Date(asOfStr) : new Date();
  if (Number.isNaN(birth.getTime()) || Number.isNaN(target.getTime())) return null;
  if (birth > target) return null;

  let years = target.getFullYear() - birth.getFullYear();
  let months = target.getMonth() - birth.getMonth();
  let days = target.getDate() - birth.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(target.getFullYear(), target.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const totalDays = Math.floor((target.getTime() - birth.getTime()) / 86400000);

  let next = new Date(target.getFullYear(), birth.getMonth(), birth.getDate());
  if (next < target) next = new Date(target.getFullYear() + 1, birth.getMonth(), birth.getDate());
  const nextBirthdayDays = Math.ceil((next.getTime() - target.getTime()) / 86400000);

  return { years, months, days, totalDays, nextBirthdayDays };
}

export function AgeCalculatorWidget() {
  const [birth, setBirth] = useState('');
  const [asOf, setAsOf] = useState('');
  const result = useMemo(() => calcAge(birth, asOf), [birth, asOf]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="age-birth" className="mb-2 block text-sm font-semibold text-ink-700">
            Date of birth
          </label>
          <input
            id="age-birth"
            type="date"
            value={birth}
            onChange={(e) => setBirth(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
        </div>
        <div>
          <label htmlFor="age-asof" className="mb-2 block text-sm font-semibold text-ink-700">
            Age at date <span className="font-normal text-ink-400">(optional, defaults to today)</span>
          </label>
          <input
            id="age-asof"
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
        </div>
      </div>

      {birth && !result && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          Please check the dates — the birth date can&apos;t be after the target date.
        </div>
      )}

      {result && (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/15">
          <div className="text-center">
            <div className="font-display text-3xl font-bold text-ink-900">
              {result.years} <span className="text-lg font-semibold text-ink-500">yrs</span> {result.months}{' '}
              <span className="text-lg font-semibold text-ink-500">mo</span> {result.days}{' '}
              <span className="text-lg font-semibold text-ink-500">days</span>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white px-4 py-3 text-center ring-1 ring-ink-100">
              <div className="font-display text-xl font-bold text-ink-900">{result.totalDays.toLocaleString()}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Total days</div>
            </div>
            <div className="rounded-xl bg-white px-4 py-3 text-center ring-1 ring-ink-100">
              <div className="font-display text-xl font-bold text-ink-900">{result.nextBirthdayDays}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Days to next birthday</div>
            </div>
          </div>
          {(() => {
            const cta = buildToolPrefill('age-calculator', {});
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      )}

      <p className="text-xs text-ink-400">
        Tip: leave the second date blank to get your age today, or set it to find your age on any past
        or future date. Everything is calculated in your browser.
      </p>
    </div>
  );
}
