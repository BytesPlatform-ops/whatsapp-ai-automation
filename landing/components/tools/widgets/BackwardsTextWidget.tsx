'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';

type Mode = 'chars' | 'words' | 'lines';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'chars', label: 'Reverse letters', hint: 'hello → olleh' },
  { id: 'words', label: 'Reverse word order', hint: 'hello world → world hello' },
  { id: 'lines', label: 'Reverse line order', hint: 'flips top-to-bottom' },
];

// Uses Array.from so multi-code-unit characters (emoji, accents) don't break.
function reverseText(input: string, mode: Mode): string {
  if (mode === 'chars') {
    return input
      .split('\n')
      .map((line) => Array.from(line).reverse().join(''))
      .join('\n');
  }
  if (mode === 'words') {
    return input
      .split('\n')
      .map((line) => line.split(/(\s+)/).reverse().join(''))
      .join('\n');
  }
  return input.split('\n').reverse().join('\n');
}

export function BackwardsTextWidget() {
  const [input, setInput] = useState('Hello world');
  const [mode, setMode] = useState<Mode>('chars');

  const output = useMemo(() => reverseText(input, mode), [input, mode]);

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="backwards-input" className="mb-2 block text-sm font-semibold text-ink-700">
          Your text
        </label>
        <textarea
          id="backwards-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type or paste text to reverse…"
          rows={4}
          className="w-full resize-none rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
      </div>

      <div>
        <span className="mb-2 block text-sm font-semibold text-ink-700">Reverse mode</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              className={`rounded-xl border px-3 py-2 text-left transition ${
                mode === m.id
                  ? 'border-wa-green bg-wa-green/10'
                  : 'border-ink-200 bg-white hover:border-wa-green/40'
              }`}
            >
              <div className="text-sm font-semibold text-ink-900">{m.label}</div>
              <div className="mt-0.5 text-[11px] text-ink-400">{m.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="backwards-output" className="text-sm font-semibold text-ink-700">
            Backwards text
          </label>
          <CopyButton value={output} />
        </div>
        <div
          id="backwards-output"
          aria-live="polite"
          className="min-h-[5rem] w-full whitespace-pre-wrap break-words rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-lg text-ink-900"
        >
          {output || <span className="text-ink-400">Your reversed text will appear here</span>}
        </div>

        {input && (() => {
          const cta = buildToolPrefill('backwards-text-generator', {});
          return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
        })()}
      </div>

      <p className="text-xs text-ink-400">
        Tip: this reverses the actual character order. To make text that reads the same flipped
        180°, use the Upside Down Text Generator instead.
      </p>
    </div>
  );
}
