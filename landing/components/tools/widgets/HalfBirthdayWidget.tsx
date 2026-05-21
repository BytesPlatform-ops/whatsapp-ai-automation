'use client';

import { useMemo, useState } from 'react';
import { Cake, CalendarDays } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function calculateHalfBirthday(birthDate: Date): Date {
  const year = birthDate.getFullYear();
  const month = birthDate.getMonth();
  const day = birthDate.getDate();

  const newMonth = (month + 6) % 12;
  const newYear = year + (month + 6 >= 12 ? 1 : 0);

  const lastDayOfNewMonth = new Date(newYear, newMonth + 1, 0).getDate();
  const clampedDay = Math.min(day, lastDayOfNewMonth);

  return new Date(newYear, newMonth, clampedDay);
}

function formatDateLong(d: Date): string {
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11 ? 'st' :
    day % 10 === 2 && day !== 12 ? 'nd' :
    day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  return `${MONTHS[d.getMonth()]} ${day}${suffix}`;
}

function getDayOfWeek(d: Date): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
}

function daysUntil(target: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(target);
  next.setFullYear(today.getFullYear());
  next.setHours(0, 0, 0, 0);
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function HalfBirthdayWidget() {
  const [birthday, setBirthday] = useState('');

  const result = useMemo(() => {
    if (!birthday) return null;
    const parts = birthday.split('-');
    if (parts.length !== 3) return null;
    const [y, m, d] = parts.map(Number);
    if (!y || !m || !d) return null;
    const birthDate = new Date(y, m - 1, d);
    if (Number.isNaN(birthDate.getTime())) return null;
    const halfBday = calculateHalfBirthday(birthDate);
    return {
      formatted: formatDateLong(halfBday),
      dayOfWeek: getDayOfWeek(halfBday),
      daysAway: daysUntil(halfBday),
    };
  }, [birthday]);

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="birthday-input" className="mb-2 block text-sm font-semibold text-ink-700">
          Your birthday
        </label>
        <input
          id="birthday-input"
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
      </div>

      {result ? (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-8 text-center ring-1 ring-wa-green/20">
          <div className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold uppercase tracking-wider text-wa-teal">
            <Cake className="h-4 w-4" />
            Your half birthday
          </div>
          <div className="font-display text-3xl font-bold text-ink-900 sm:text-4xl">
            {result.formatted}
          </div>
          <div className="mt-2 text-base text-ink-500">
            Falls on a <span className="font-semibold text-ink-700">{result.dayOfWeek}</span>
          </div>
          <div className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink-700 shadow-soft">
            <CalendarDays className="h-4 w-4 text-wa-green" />
            {result.daysAway === 0
              ? 'It’s today! 🎉'
              : `${result.daysAway} ${result.daysAway === 1 ? 'day' : 'days'} away`}
          </div>

          <div className="mt-2 text-left">
            {(() => {
              const cta = buildToolPrefill('half-birthday-calculator', {
                formatted: result.formatted,
                dayOfWeek: result.dayOfWeek,
                daysAway: result.daysAway,
              });
              return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
            })()}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-10 text-center">
          <Cake className="mx-auto mb-3 h-10 w-10 text-ink-300" />
          <p className="text-sm text-ink-500">
            Enter your birthday above to see your half birthday.
          </p>
        </div>
      )}
    </div>
  );
}
