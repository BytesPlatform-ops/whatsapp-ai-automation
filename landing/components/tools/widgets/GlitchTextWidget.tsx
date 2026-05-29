'use client';

import { useMemo, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';

// Combining diacritical marks (U+0300–U+036F) split by where they render.
const UP = Array.from({ length: 0x315 - 0x300 + 1 }, (_, i) => String.fromCharCode(0x300 + i));
const DOWN = Array.from({ length: 0x36f - 0x316 + 1 }, (_, i) => String.fromCharCode(0x316 + i));
const MID = ['̕', '̛', '̀', '́', '̧', '̨', '̃', '̌'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function zalgo(input: string, intensity: number): string {
  return Array.from(input)
    .map((ch) => {
      if (ch === ' ' || ch === '\n') return ch;
      let out = ch;
      const up = Math.floor(Math.random() * intensity);
      const mid = Math.floor(Math.random() * Math.max(1, intensity / 3));
      const down = Math.floor(Math.random() * intensity);
      for (let i = 0; i < up; i++) out += pick(UP);
      for (let i = 0; i < mid; i++) out += pick(MID);
      for (let i = 0; i < down; i++) out += pick(DOWN);
      return out;
    })
    .join('');
}

export function GlitchTextWidget() {
  const [input, setInput] = useState('glitch');
  const [intensity, setIntensity] = useState(6);
  const [seed, setSeed] = useState(0);

  // seed is in the dep list so "Re-roll" produces fresh randomness.
  const output = useMemo(() => zalgo(input, intensity), [input, intensity, seed]);

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="glitch-input" className="mb-2 block text-sm font-semibold text-ink-700">
          Your text
        </label>
        <textarea
          id="glitch-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type text to corrupt…"
          rows={3}
          className="w-full resize-none rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="glitch-intensity" className="text-sm font-semibold text-ink-700">
            Glitch intensity
          </label>
          <span className="text-xs font-semibold text-ink-500">{intensity}</span>
        </div>
        <input
          id="glitch-intensity"
          type="range"
          min={1}
          max={20}
          value={intensity}
          onChange={(e) => setIntensity(Number(e.target.value))}
          className="w-full accent-wa-green"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="glitch-output" className="text-sm font-semibold text-ink-700">
            Glitch text
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSeed((s) => s + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 transition hover:border-wa-green/40 hover:text-ink-900"
            >
              <Shuffle className="h-3.5 w-3.5" />
              Re-roll
            </button>
            <CopyButton value={output} />
          </div>
        </div>
        <div
          id="glitch-output"
          aria-live="polite"
          className="min-h-[6rem] w-full break-words rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-lg leading-loose text-ink-900"
        >
          {output || <span className="text-ink-400">Your glitch text will appear here</span>}
        </div>

        {input && (() => {
          const cta = buildToolPrefill('glitch-text-generator', {});
          return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
        })()}
      </div>

      <p className="text-xs text-ink-400">
        Tip: also known as zalgo or cursed text. Some apps limit how many combining marks they
        render, so very high intensity may look tamer once pasted.
      </p>
    </div>
  );
}
