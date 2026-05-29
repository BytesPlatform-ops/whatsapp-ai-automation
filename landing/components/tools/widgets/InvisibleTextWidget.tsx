'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';

// Hangul Filler (U+3164) survives more apps than a zero-width space and reads as
// a real (but blank) character — ideal for "empty" usernames, bios and messages.
const FILLER = 'ㅤ';

export function InvisibleTextWidget() {
  const [count, setCount] = useState(1);

  const output = useMemo(() => FILLER.repeat(Math.max(0, count)), [count]);

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="invisible-count" className="text-sm font-semibold text-ink-700">
            How many blank characters?
          </label>
          <span className="text-xs font-semibold text-ink-500">{count}</span>
        </div>
        <input
          id="invisible-count"
          type="range"
          min={1}
          max={50}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-full accent-wa-green"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-700">Invisible text</span>
          <CopyButton value={output} label="Copy blank text" />
        </div>
        <div
          aria-live="polite"
          className="flex min-h-[4rem] w-full items-center justify-center rounded-xl border border-dashed border-ink-300 bg-ink-50 px-4 py-3 text-sm text-ink-400"
        >
          {/* The box is intentionally empty — it holds {count} invisible character(s). */}
          Looks empty, but you just copied {count} invisible character{count === 1 ? '' : 's'}.
        </div>

        {(() => {
          const cta = buildToolPrefill('invisible-text-generator', {});
          return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
        })()}
      </div>

      <p className="text-xs text-ink-400">
        Tip: paste it into a username, bio, status, or message to send a “blank” entry. Some
        platforms strip blank characters — if it doesn’t stick, try a few more.
      </p>
    </div>
  );
}
