'use client';

import { useState } from 'react';
import { Gauge, Loader2 } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

interface Result {
  domain: string;
  found: boolean;
  authority: number;
  pageRank: number;
  globalRank: number | null;
}

function tier(authority: number): { label: string; bar: string; text: string } {
  if (authority >= 60) return { label: 'Strong', bar: 'bg-wa-green', text: 'text-wa-greenDark' };
  if (authority >= 30) return { label: 'Moderate', bar: 'bg-amber-500', text: 'text-amber-600' };
  return { label: 'Low', bar: 'bg-red-400', text: 'text-red-600' };
}

export function DapaCheckerWidget() {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const handleCheck = async () => {
    if (!domain.trim()) {
      setError('Enter a domain to check, e.g. example.com');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/tools/da-pa-checker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as Result;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const t = result ? tier(result.authority) : null;

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="dapa-input" className="mb-2 block text-sm font-semibold text-ink-700">
          Website domain
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="dapa-input"
            type="text"
            inputMode="url"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCheck();
            }}
            placeholder="example.com"
            maxLength={253}
            className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
          <button
            type="button"
            onClick={handleCheck}
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-wa-teal px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking
              </>
            ) : (
              <>
                <Gauge className="h-4 w-4" />
                Check authority
              </>
            )}
          </button>
        </div>
        <p className="mt-1 text-xs text-ink-400">
          Paste a domain or full URL — we use just the domain.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {result && t && (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/15">
          <div className="mb-1 text-sm font-semibold text-ink-500">
            Authority for <span className="font-bold text-ink-900">{result.domain}</span>
          </div>

          {result.found ? (
            <>
              <div className="flex items-end gap-2">
                <span className="font-display text-5xl font-extrabold leading-none text-ink-900">
                  {result.authority}
                </span>
                <span className="mb-1 text-lg font-semibold text-ink-400">/ 100</span>
                <span className={`mb-1.5 ml-auto text-sm font-bold ${t.text}`}>{t.label}</span>
              </div>

              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-ink-100">
                <div
                  className={`h-full rounded-full ${t.bar} transition-all`}
                  style={{ width: `${result.authority}%` }}
                />
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/70 p-3 ring-1 ring-ink-100">
                  <dt className="text-xs font-semibold text-ink-400">Open PageRank</dt>
                  <dd className="mt-0.5 text-lg font-bold text-ink-900">
                    {result.pageRank.toFixed(2)}
                    <span className="text-sm font-medium text-ink-400"> / 10</span>
                  </dd>
                </div>
                <div className="rounded-xl bg-white/70 p-3 ring-1 ring-ink-100">
                  <dt className="text-xs font-semibold text-ink-400">Global rank</dt>
                  <dd className="mt-0.5 text-lg font-bold text-ink-900">
                    {result.globalRank ? `#${result.globalRank.toLocaleString('en-US')}` : '—'}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="mt-1 text-sm text-ink-700">
              No authority data found for this domain yet. That usually means it has very few known
              backlinks — common for new or small sites — not that it is offline.
            </p>
          )}

          <p className="mt-4 text-xs leading-relaxed text-ink-400">
            Authority is a 0–100 estimate from the free Open PageRank dataset — it behaves like
            Domain Authority but is independent of Moz, so it won&apos;t match Moz&apos;s number exactly.
            Page-level PA and full backlink data need a paid audit.
          </p>

          {(() => {
            const cta = buildToolPrefill('da-pa-checker', {});
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      )}
    </div>
  );
}
