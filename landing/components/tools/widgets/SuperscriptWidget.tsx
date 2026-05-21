'use client';

import { useMemo, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

type Mode = 'smart' | 'all';

// Superscriptable digits + math operators. Used in both modes.
const DIGIT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
};

// Letters with Unicode superscript versions. Used in 'all' mode only.
const LETTER_MAP: Record<string, string> = {
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ',
  g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ',
  m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ',
  t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
  A: 'ᴬ', B: 'ᴮ', D: 'ᴰ', E: 'ᴱ', G: 'ᴳ', H: 'ᴴ',
  I: 'ᴵ', J: 'ᴶ', K: 'ᴷ', L: 'ᴸ', M: 'ᴹ', N: 'ᴺ',
  O: 'ᴼ', P: 'ᴾ', R: 'ᴿ', T: 'ᵀ', U: 'ᵁ', V: 'ⱽ', W: 'ᵂ',
};

function toSuperscript(input: string, mode: Mode): string {
  return Array.from(input)
    .map((ch) => {
      if (DIGIT_MAP[ch]) return DIGIT_MAP[ch];
      if (mode === 'all') {
        return LETTER_MAP[ch] ?? ch;
      }
      return ch;
    })
    .join('');
}

export function SuperscriptWidget() {
  const [input, setInput] = useState('Hello World 2026');
  const [mode, setMode] = useState<Mode>('all');
  const [copied, setCopied] = useState(false);

  const output = useMemo(() => toSuperscript(input, mode), [input, mode]);

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
        <label htmlFor="superscript-input" className="mb-2 block text-sm font-semibold text-ink-700">
          Your text
        </label>
        <textarea
          id="superscript-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type anything…"
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
            onClick={() => setMode('all')}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              mode === 'all'
                ? 'bg-white text-ink-900 shadow-soft'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            Convert all
          </button>
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
        </div>
        <p className="mt-1.5 text-xs text-ink-400">
          {mode === 'all'
            ? 'Letters and digits both become superscript where Unicode supports it — best for stylized captions and bios.'
            : 'Letters stay normal, only digits become superscript — perfect for math like x² + y² = z².'}
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="superscript-output" className="text-sm font-semibold text-ink-700">
            Superscript
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
          id="superscript-output"
          aria-live="polite"
          className="min-h-[6rem] w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-base text-ink-900"
        >
          {output || <span className="text-ink-400">Your superscript will appear here</span>}
        </div>

        {output && (() => {
          const cta = buildToolPrefill('superscript-generator', {});
          return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
        })()}
      </div>

      <p className="text-xs text-ink-400">
        Tip: works in Instagram bios, TikTok captions, Twitter, YouTube comments — anywhere that accepts plain text.
      </p>
    </div>
  );
}
