'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

interface Duration {
  totalDays: number;
  years: number;
  months: number;
  days: number;
  weeks: number;
  remDays: number;
}

function diff(fromStr: string, toStr: string): Duration | null {
  if (!fromStr || !toStr) return null;
  let from = new Date(fromStr);
  let to = new Date(toStr);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (from > to) [from, to] = [to, from];

  const totalDays = Math.round((to.getTime() - from.getTime()) / 86400000);

  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(to.getFullYear(), to.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { totalDays, years, months, days, weeks: Math.floor(totalDays / 7), remDays: totalDays % 7 };
}

export function DateDurationWidget() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const r = useMemo(() => diff(from, to), [from, to]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="dd-from" className="mb-2 block text-sm font-semibold text-ink-700">Start date</label>
          <input id="dd-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20" />
        </div>
        <div>
          <label htmlFor="dd-to" className="mb-2 block text-sm font-semibold text-ink-700">End date</label>
          <input id="dd-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20" />
        </div>
      </div>

      {r && (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/15">
          <div className="text-center">
            <div className="font-display text-3xl font-bold text-ink-900">
              {r.years > 0 && <>{r.years}<span className="text-base font-semibold text-ink-500"> yr </span></>}
              {(r.years > 0 || r.months > 0) && <>{r.months}<span className="text-base font-semibold text-ink-500"> mo </span></>}
              {r.days}<span className="text-base font-semibold text-ink-500"> days</span>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white px-4 py-3 text-center ring-1 ring-ink-100">
              <div className="font-display text-xl font-bold text-ink-900">{r.totalDays.toLocaleString()}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Total days</div>
            </div>
            <div className="rounded-xl bg-white px-4 py-3 text-center ring-1 ring-ink-100">
              <div className="font-display text-xl font-bold text-ink-900">{r.weeks}<span className="text-sm text-ink-500"> w </span>{r.remDays}<span className="text-sm text-ink-500"> d</span></div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Weeks</div>
            </div>
          </div>
          {(() => {
            const cta = buildToolPrefill('date-duration-calculator', {});
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      )}

      <p className="text-xs text-ink-400">
        Tip: order doesn&apos;t matter — the calculator always shows the gap between the two dates.
        Handy for deadlines, anniversaries, leases, and project timelines.
      </p>
    </div>
  );
}
