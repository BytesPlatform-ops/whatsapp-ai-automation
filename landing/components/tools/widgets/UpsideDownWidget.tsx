'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';
import { toUpsideDown } from '@/lib/textStyles';

export function UpsideDownWidget() {
  const [input, setInput] = useState('Hello World');

  const output = useMemo(() => toUpsideDown(input), [input]);

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="flip-input" className="mb-2 block text-sm font-semibold text-ink-700">
          Your text
        </label>
        <textarea
          id="flip-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type anything to flip it upside down…"
          rows={3}
          className="w-full resize-none rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="flip-output" className="text-sm font-semibold text-ink-700">
            Upside down
          </label>
          <CopyButton value={output} />
        </div>
        <div
          id="flip-output"
          aria-live="polite"
          className="min-h-[6rem] w-full break-words rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-lg text-ink-900"
        >
          {output || <span className="text-ink-400">ʇxǝʇ uʍop ǝpᴉsdn</span>}
        </div>

        {input && (() => {
          const cta = buildToolPrefill('upside-down-text-generator', {});
          return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
        })()}
      </div>

      <p className="text-xs text-ink-400">
        Tip: works in Instagram, TikTok, Twitter/X, Discord, and texts — the flipped characters are
        standard Unicode, so they paste anywhere.
      </p>
    </div>
  );
}
