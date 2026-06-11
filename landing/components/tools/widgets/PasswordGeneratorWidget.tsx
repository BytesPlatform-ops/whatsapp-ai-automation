'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  numbers: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/',
};
const AMBIGUOUS = /[Il1O0o]/g;

function secureRandom(max: number): number {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const a = new Uint32Array(1);
    window.crypto.getRandomValues(a);
    return a[0] % max;
  }
  return Math.floor(Math.random() * max);
}

interface Opts {
  length: number;
  lower: boolean;
  upper: boolean;
  numbers: boolean;
  symbols: boolean;
  noAmbiguous: boolean;
}

function generate(o: Opts): string {
  let pool = '';
  if (o.lower) pool += SETS.lower;
  if (o.upper) pool += SETS.upper;
  if (o.numbers) pool += SETS.numbers;
  if (o.symbols) pool += SETS.symbols;
  if (o.noAmbiguous) pool = pool.replace(AMBIGUOUS, '');
  if (!pool) return '';
  let out = '';
  for (let i = 0; i < o.length; i++) out += pool[secureRandom(pool.length)];
  return out;
}

function strength(pw: string, poolVariety: number): { label: string; pct: number; color: string } {
  const bits = pw.length * Math.log2(Math.max(2, poolVariety));
  if (bits < 40) return { label: 'Weak', pct: 33, color: 'bg-red-500' };
  if (bits < 70) return { label: 'Good', pct: 66, color: 'bg-amber-500' };
  return { label: 'Strong', pct: 100, color: 'bg-wa-green' };
}

export function PasswordGeneratorWidget() {
  const [opts, setOpts] = useState<Opts>({
    length: 16,
    lower: true,
    upper: true,
    numbers: true,
    symbols: true,
    noAmbiguous: false,
  });
  const [password, setPassword] = useState('');

  const roll = useCallback(() => setPassword(generate(opts)), [opts]);

  useEffect(() => {
    roll();
  }, [roll]);

  const poolVariety =
    (opts.lower ? 26 : 0) + (opts.upper ? 26 : 0) + (opts.numbers ? 10 : 0) + (opts.symbols ? 24 : 0);
  const str = strength(password, poolVariety);

  const toggles: { key: keyof Opts; label: string }[] = [
    { key: 'lower', label: 'Lowercase (a-z)' },
    { key: 'upper', label: 'Uppercase (A-Z)' },
    { key: 'numbers', label: 'Numbers (0-9)' },
    { key: 'symbols', label: 'Symbols (!@#)' },
    { key: 'noAmbiguous', label: 'No look-alikes (Il1O0)' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-700">Your password</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={roll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 transition hover:border-wa-green/40 hover:text-ink-900"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerate
            </button>
            <CopyButton value={password} />
          </div>
        </div>
        <div className="break-all rounded-xl border border-ink-200 bg-ink-50 px-4 py-4 font-mono text-lg text-ink-900">
          {password || <span className="text-ink-400">Pick at least one character set</span>}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
            <div className={`h-full ${str.color} transition-all`} style={{ width: `${password ? str.pct : 0}%` }} />
          </div>
          <span className="text-xs font-semibold text-ink-500">{password ? str.label : '—'}</span>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="pw-length" className="text-sm font-semibold text-ink-700">Length</label>
          <span className="text-xs font-semibold text-ink-500">{opts.length}</span>
        </div>
        <input
          id="pw-length"
          type="range"
          min={4}
          max={64}
          value={opts.length}
          onChange={(e) => setOpts((o) => ({ ...o, length: Number(e.target.value) }))}
          className="w-full accent-wa-green"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {toggles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setOpts((o) => ({ ...o, [t.key]: !o[t.key] }))}
            aria-pressed={Boolean(opts[t.key])}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              opts[t.key] ? 'border-wa-green bg-wa-green/10 text-ink-900' : 'border-ink-200 bg-white text-ink-500 hover:border-wa-green/40'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(() => {
        const cta = buildToolPrefill('password-generator', {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      <p className="text-xs text-ink-400">
        Tip: passwords are generated locally using your browser&apos;s secure random generator and
        are never sent anywhere. Aim for 16+ characters with mixed sets, and use a unique password
        per site.
      </p>
    </div>
  );
}
