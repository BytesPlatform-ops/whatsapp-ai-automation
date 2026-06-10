'use client';

import { useMemo, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';
import { zalgo, type ZalgoOptions } from '@/lib/zalgo';

export function ZalgoTextWidget() {
  const [input, setInput] = useState('zalgo');
  const [intensity, setIntensity] = useState(8);
  const [opts, setOpts] = useState<Required<Pick<ZalgoOptions, 'up' | 'mid' | 'down'>>>({
    up: true,
    mid: true,
    down: true,
  });
  const [seed, setSeed] = useState(0);

  // seed in the dep list so "Re-roll" produces fresh randomness on demand.
  const output = useMemo(
    () => zalgo(input, intensity, opts),
    [input, intensity, opts, seed],
  );

  const toggle = (key: 'up' | 'mid' | 'down') =>
    setOpts((o) => ({ ...o, [key]: !o[key] }));

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="zalgo-input" className="mb-2 block text-sm font-semibold text-ink-700">
          Your text
        </label>
        <textarea
          id="zalgo-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type text to zalgo-ify…"
          rows={3}
          className="w-full resize-none rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="zalgo-intensity" className="text-sm font-semibold text-ink-700">
            Corruption intensity
          </label>
          <span className="text-xs font-semibold text-ink-500">{intensity}</span>
        </div>
        <input
          id="zalgo-intensity"
          type="range"
          min={1}
          max={25}
          value={intensity}
          onChange={(e) => setIntensity(Number(e.target.value))}
          className="w-full accent-wa-green"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {([
            ['up', 'Above'],
            ['mid', 'Middle'],
            ['down', 'Below'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              aria-pressed={opts[key]}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                opts[key]
                  ? 'border-wa-green bg-wa-green/10 text-ink-900'
                  : 'border-ink-200 bg-white text-ink-500 hover:border-wa-green/40'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="zalgo-output" className="text-sm font-semibold text-ink-700">
            Zalgo text
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
          id="zalgo-output"
          aria-live="polite"
          className="min-h-[6rem] w-full break-words rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-lg leading-loose text-ink-900"
        >
          {output || <span className="text-ink-400">Your zalgo text will appear here</span>}
        </div>

        {input && (() => {
          const cta = buildToolPrefill('zalgo-text-generator', {});
          return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
        })()}
      </div>

      <p className="text-xs text-ink-400">
        Tip: zalgo is built from real Unicode combining marks, so it survives copy-paste. Some apps
        cap how many marks they render, so very high intensity may look tamer once pasted into
        Instagram, Discord, or TikTok.
      </p>
    </div>
  );
}
