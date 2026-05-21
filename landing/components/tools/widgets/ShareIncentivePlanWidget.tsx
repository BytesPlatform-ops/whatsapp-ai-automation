'use client';

import { useMemo, useState } from 'react';

// UK 2025/26 tax year (rUK — not Scotland).
const PERSONAL_ALLOWANCE = 12570;
const BASIC_RATE_LIMIT = 50270;
const HIGHER_RATE_LIMIT = 125140;
const NI_PRIMARY_THRESHOLD = 12570;
const NI_UPPER_EARNINGS_LIMIT = 50270;

// HMRC SIP limit on partnership shares: £1,800/year or 10% of salary, whichever lower.
const SIP_ANNUAL_LIMIT = 1800;
const SIP_SALARY_CAP_PCT = 0.10;

function marginalIncomeTaxRate(salary: number): number {
  if (salary <= PERSONAL_ALLOWANCE) return 0;
  if (salary <= BASIC_RATE_LIMIT) return 0.20;
  if (salary <= HIGHER_RATE_LIMIT) return 0.40;
  return 0.45;
}

function marginalNiRate(salary: number): number {
  if (salary <= NI_PRIMARY_THRESHOLD) return 0;
  if (salary <= NI_UPPER_EARNINGS_LIMIT) return 0.08;
  return 0.02;
}

function fmtGBP(n: number): string {
  return n.toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  });
}

export function ShareIncentivePlanWidget() {
  const [salary, setSalary] = useState('45000');
  const [monthlyContribution, setMonthlyContribution] = useState('150');
  const [matchRatio, setMatchRatio] = useState('1');
  const [growthPct, setGrowthPct] = useState('5');

  const result = useMemo(() => {
    const s = Number(salary);
    const monthly = Number(monthlyContribution);
    const match = Number(matchRatio);
    const growth = Number(growthPct);

    if (!Number.isFinite(s) || !Number.isFinite(monthly) || !Number.isFinite(match) || !Number.isFinite(growth)) {
      return null;
    }
    if (s <= 0 || monthly < 0 || match < 0 || growth < 0) return null;

    const annualContribution = monthly * 12;
    const salaryCap = s * SIP_SALARY_CAP_PCT;
    const allowedAnnual = Math.min(annualContribution, SIP_ANNUAL_LIMIT, salaryCap);
    const cappedMonthly = allowedAnnual / 12;

    const itRate = marginalIncomeTaxRate(s);
    const niRate = marginalNiRate(s);
    const combinedRate = itRate + niRate;

    const grossCostToYou = allowedAnnual;
    const netCostToYou = allowedAnnual * (1 - combinedRate);
    const taxSaved = grossCostToYou - netCostToYou;

    const matchValue = allowedAnnual * match;
    const totalSharesAtPurchase = allowedAnnual + matchValue;
    const totalValueAfter5y = totalSharesAtPurchase * Math.pow(1 + growth / 100, 5);

    const benefitVsCash = totalValueAfter5y - netCostToYou;

    return {
      allowedAnnual,
      cappedMonthly,
      hitCap: annualContribution > allowedAnnual,
      itRate,
      niRate,
      combinedRate,
      grossCostToYou,
      netCostToYou,
      taxSaved,
      matchValue,
      totalSharesAtPurchase,
      totalValueAfter5y,
      benefitVsCash,
    };
  }, [salary, monthlyContribution, matchRatio, growthPct]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <PoundInput label="Annual gross salary" value={salary} onChange={setSalary} />
        <PoundInput
          label="Monthly contribution (max £150)"
          value={monthlyContribution}
          onChange={setMonthlyContribution}
        />
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">
            Employer match (shares per partnership share)
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={matchRatio}
            onChange={(e) => setMatchRatio(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
          <div className="mt-1 text-xs text-ink-400">0 = no match, 1 = matching, 2 = HMRC maximum</div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">
            Expected annual share growth (%)
          </label>
          <input
            type="number"
            step="0.5"
            value={growthPct}
            onChange={(e) => setGrowthPct(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
        </div>
      </div>

      {result ? (
        <div className="space-y-4">
          {result.hitCap && (
            <div className="rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-800 ring-1 ring-orange-200">
              Your contribution was capped to <strong>{fmtGBP(result.allowedAnnual)}</strong>/year
              (HMRC SIP limit: £1,800/year or 10% of salary, whichever is lower). Effective monthly:{' '}
              <strong>{fmtGBP(result.cappedMonthly)}</strong>.
            </div>
          )}

          <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/20">
            <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-wa-teal">
              Value after 5-year hold
            </div>
            <div className="font-display text-4xl font-bold text-ink-900 sm:text-5xl">
              {fmtGBP(result.totalValueAfter5y)}
            </div>
            <div className="mt-1 text-sm text-ink-500">
              vs. {fmtGBP(result.netCostToYou)} net out-of-pocket cost
            </div>

            <div className="mt-6 grid gap-4 border-t border-wa-green/20 pt-4 sm:grid-cols-3">
              <StatBlock label="Annual contribution" value={fmtGBP(result.allowedAnnual)} />
              <StatBlock label="Tax + NI saved" value={fmtGBP(result.taxSaved)} />
              <StatBlock label="Employer match value" value={fmtGBP(result.matchValue)} />
            </div>
          </div>

          <div className="rounded-xl border border-ink-100 bg-white p-5 text-sm">
            <div className="font-semibold text-ink-900">How this works</div>
            <ul className="mt-2 space-y-1.5 text-ink-500">
              <li>
                Your marginal tax rate: <strong>{(result.itRate * 100).toFixed(0)}% income tax</strong>{' '}
                + <strong>{(result.niRate * 100).toFixed(0)}% NI</strong> ={' '}
                <strong>{(result.combinedRate * 100).toFixed(0)}% effective discount</strong> at purchase.
              </li>
              <li>
                Partnership shares come from gross salary — saving {fmtGBP(result.taxSaved)} you&apos;d
                otherwise pay to HMRC.
              </li>
              <li>
                Hold for 5+ years: zero income tax + zero NI on withdrawal (CGT may still apply on gains).
              </li>
            </ul>
          </div>

          <p className="text-xs text-ink-400">
            Estimates use UK 2025/26 rUK tax bands. Not advice — confirm with an accountant before acting,
            especially around CGT planning and Scottish tax rates.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-8 text-center text-sm text-ink-500">
          Enter your salary and contribution to see your SIP benefit.
        </div>
      )}
    </div>
  );
}

function PoundInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-ink-700">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">£</span>
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

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</div>
      <div className="mt-1 font-display text-xl font-bold text-ink-900">{value}</div>
    </div>
  );
}
