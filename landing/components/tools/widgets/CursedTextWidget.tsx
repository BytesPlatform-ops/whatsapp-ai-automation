'use client';

import { useMemo, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';
import { zalgo } from '@/lib/zalgo';

// Cursed presets lean on overlay/strike marks for an "eerie but readable" look,
// scaling up to fully shredded — distinct from the classic Zalgo slider.
const PRESETS = [
  { id: 'mild', label: 'Mild', intensity: 3, opts: { up: true, mid: true, down: true, overlay: true } },
  { id: 'cursed', label: 'Cursed', intensity: 7, opts: { up: true, mid: true, down: true, overlay: true } },
  { id: 'haunted', label: 'Haunted', intensity: 12, opts: { up: true, mid: true, down: true, overlay: true } },
  { id: 'possessed', label: 'Possessed', intensity: 20, opts: { up: true, mid: true, down: true, overlay: true } },
] as const;

export function CursedTextWidget() {
  const [input, setInput] = useState('cursed');
  const [presetId, setPresetId] = useState<(typeof PRESETS)[number]['id']>('cursed');
  const [seed, setSeed] = useState(0);

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[1];

  const output = useMemo(
    () => zalgo(input, preset.intensity, preset.opts),
    [input, preset, seed],
  );

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="cursed-input" className="mb-2 block text-sm font-semibold text-ink-700">
          Your text
        </label>
        <textarea
          id="cursed-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type text to curse…"
          rows={3}
          className="w-full resize-none rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
      </div>

      <div>
        <span className="mb-2 block text-sm font-semibold text-ink-700">Curse level</span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPresetId(p.id)}
              aria-pressed={presetId === p.id}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                presetId === p.id
                  ? 'border-wa-green bg-wa-green/10 text-ink-900'
                  : 'border-ink-200 bg-white text-ink-500 hover:border-wa-green/40'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="cursed-output" className="text-sm font-semibold text-ink-700">
            Cursed text
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
          id="cursed-output"
          aria-live="polite"
          className="min-h-[6rem] w-full break-words rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-lg leading-loose text-ink-900"
        >
          {output || <span className="text-ink-400">Your cursed text will appear here</span>}
        </div>

        {input && (() => {
          const cta = buildToolPrefill('cursed-text-generator', {});
          return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
        })()}
      </div>

      <p className="text-xs text-ink-400">
        Tip: cursed text uses real Unicode combining marks, so it copies into Discord, Instagram,
        and TikTok intact. Higher curse levels may render tamer in apps that limit stacked marks.
      </p>
    </div>
  );
}
