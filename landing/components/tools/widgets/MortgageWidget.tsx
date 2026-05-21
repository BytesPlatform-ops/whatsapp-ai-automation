'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function fmtMoneyDecimal(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface AmortizationRow {
  month: number;
  principal: number;
  interest: number;
  balance: number;
}

function calculateMortgage(
  loanAmount: number,
  annualRate: number,
  years: number,
): { monthly: number; totalInterest: number; totalPaid: number; schedule: AmortizationRow[] } {
  const n = years * 12;
  const r = annualRate / 100 / 12;

  let monthly: number;
  if (r === 0) {
    monthly = loanAmount / n;
  } else {
    monthly = (loanAmount * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);
  }

  const schedule: AmortizationRow[] = [];
  let balance = loanAmount;
  for (let m = 1; m <= n; m++) {
    const interest = balance * r;
    const principal = monthly - interest;
    balance -= principal;
    schedule.push({
      month: m,
      principal,
      interest,
      balance: Math.max(0, balance),
    });
  }

  const totalPaid = monthly * n;
  const totalInterest = totalPaid - loanAmount;

  return { monthly, totalInterest, totalPaid, schedule };
}

export function MortgageWidget() {
  const [homePrice, setHomePrice] = useState('400000');
  const [downPayment, setDownPayment] = useState('80000');
  const [rate, setRate] = useState('6.5');
  const [years, setYears] = useState('30');
  const [showSchedule, setShowSchedule] = useState(false);

  const result = useMemo(() => {
    const price = Number(homePrice);
    const down = Number(downPayment);
    const r = Number(rate);
    const y = Number(years);

    if (!Number.isFinite(price) || !Number.isFinite(down) || !Number.isFinite(r) || !Number.isFinite(y)) {
      return null;
    }
    const loan = price - down;
    if (loan <= 0 || y <= 0 || r < 0) return null;

    return { loan, ...calculateMortgage(loan, r, y) };
  }, [homePrice, downPayment, rate, years]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyInput label="Home price" value={homePrice} onChange={setHomePrice} />
        <MoneyInput label="Down payment" value={downPayment} onChange={setDownPayment} />
        <NumberInput label="Interest rate (%)" value={rate} onChange={setRate} step="0.01" />
        <NumberInput label="Loan term (years)" value={years} onChange={setYears} step="1" />
      </div>

      {result ? (
        <>
          <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/20">
            <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-wa-teal">
              Monthly payment
            </div>
            <div className="font-display text-4xl font-bold text-ink-900 sm:text-5xl">
              {fmtMoneyDecimal(result.monthly)}
            </div>

            <div className="mt-6 grid gap-4 border-t border-wa-green/20 pt-4 sm:grid-cols-3">
              <StatBlock label="Loan amount" value={fmtMoney(result.loan)} />
              <StatBlock label="Total interest" value={fmtMoney(result.totalInterest)} />
              <StatBlock label="Total paid" value={fmtMoney(result.totalPaid)} />
            </div>

            {(() => {
              const cta = buildToolPrefill('mortgage-calculator', {
                monthly: result.monthly,
                homePrice: Number(homePrice),
                rate: Number(rate),
                years: Number(years),
              });
              return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
            })()}
          </div>

          <button
            type="button"
            onClick={() => setShowSchedule((s) => !s)}
            className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm font-semibold text-ink-700 transition hover:border-wa-green/40 hover:bg-ink-50"
          >
            {showSchedule ? 'Hide' : 'Show'} amortization schedule (year-by-year)
          </button>

          {showSchedule && (
            <div className="overflow-hidden rounded-xl border border-ink-100">
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-ink-50 text-left">
                    <tr>
                      <th className="px-4 py-2 font-semibold text-ink-700">Year</th>
                      <th className="px-4 py-2 font-semibold text-ink-700">Principal paid</th>
                      <th className="px-4 py-2 font-semibold text-ink-700">Interest paid</th>
                      <th className="px-4 py-2 font-semibold text-ink-700">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearlySummary(result.schedule).map((row) => (
                      <tr key={row.year} className="border-t border-ink-100">
                        <td className="px-4 py-2 font-mono">{row.year}</td>
                        <td className="px-4 py-2">{fmtMoney(row.principal)}</td>
                        <td className="px-4 py-2">{fmtMoney(row.interest)}</td>
                        <td className="px-4 py-2 font-semibold">{fmtMoney(row.endBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-8 text-center text-sm text-ink-500">
          Enter valid loan details to see your monthly payment.
        </div>
      )}
    </div>
  );
}

function yearlySummary(schedule: AmortizationRow[]) {
  const out: { year: number; principal: number; interest: number; endBalance: number }[] = [];
  for (let y = 0; y * 12 < schedule.length; y++) {
    const slice = schedule.slice(y * 12, (y + 1) * 12);
    out.push({
      year: y + 1,
      principal: slice.reduce((s, r) => s + r.principal, 0),
      interest: slice.reduce((s, r) => s + r.interest, 0),
      endBalance: slice[slice.length - 1].balance,
    });
  }
  return out;
}

function MoneyInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-ink-700">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">$</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-ink-200 bg-white py-3 pl-7 pr-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
      </div>
    </div>
  );
}

function NumberInput({
  label, value, onChange, step,
}: { label: string; value: string; onChange: (v: string) => void; step?: string }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-ink-700">{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
      />
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
