'use client';

import { useMemo, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

type Mode = 'smart' | 'all';

// Subscriptable digits + math operators. Used in 'smart' mode (default).
const DIGIT_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
};

// Letters that have Unicode subscript versions. Used in 'all' mode.
const LETTER_MAP: Record<string, string> = {
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ',
  l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ',
  s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
};

function toSubscript(input: string, mode: Mode): string {
  return Array.from(input)
    .map((ch) => {
      if (DIGIT_MAP[ch]) return DIGIT_MAP[ch];
      if (mode === 'all') {
        return LETTER_MAP[ch] ?? LETTER_MAP[ch.toLowerCase()] ?? ch;
      }
      return ch;
    })
    .join('');
}

export function SubscriptWidget() {
  const [input, setInput] = useState('H2O  CO2  C6H12O6');
  const [mode, setMode] = useState<Mode>('smart');
  const [copied, setCopied] = useState(false);

  const output = useMemo(() => toSubscript(input, mode), [input, mode]);

  const handleCopy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="subscript-input" className="mb-2 block text-sm font-semibold text-ink-700">
          Your text
        </label>
        <textarea
          id="subscript-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type chemical formulas, math expressions, anything…"
          rows={3}
          className="w-full resize-none rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
      </div>

      {/* Mode toggle */}
      <div>
        <div className="mb-2 text-sm font-semibold text-ink-700">Mode</div>
        <div className="inline-flex rounded-full bg-ink-100 p-1">
          <button
            type="button"
            onClick={() => setMode('smart')}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              mode === 'smart'
                ? 'bg-white text-ink-900 shadow-soft'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            Smart (digits only)
          </button>
          <button
            type="button"
            onClick={() => setMode('all')}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              mode === 'all'
                ? 'bg-white text-ink-900 shadow-soft'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            Convert all
          </button>
        </div>
        <p className="mt-1.5 text-xs text-ink-400">
          {mode === 'smart'
            ? 'Letters stay normal, only digits become subscript — perfect for H₂O, x₁, CO₂.'
            : 'Letters and digits both become subscript where Unicode supports it — stylized look for captions.'}
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="subscript-output" className="text-sm font-semibold text-ink-700">
            Subscript
          </label>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!output}
            className="inline-flex items-center gap-1.5 rounded-lg bg-wa-green px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-wa-greenDark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </>
            )}
          </button>
        </div>
        <div
          id="subscript-output"
          aria-live="polite"
          className="min-h-[6rem] w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-base text-ink-900"
        >
          {output || <span className="text-ink-400">Your subscript will appear here</span>}
        </div>

        {output && (() => {
          const cta = buildToolPrefill('subscript-generator', {});
          return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
        })()}
      </div>

      <p className="text-xs text-ink-400">
        Tip: perfect for chemistry formulas like H₂O, math indices like x₁ x₂, and physics notation.
      </p>
    </div>
  );
}
