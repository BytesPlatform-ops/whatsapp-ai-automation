'use client';

import { useCallback, useEffect, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';
import { EMOJI_CATEGORIES, randomEmoji } from '@/lib/generators';

const CATEGORIES = ['All', ...Object.keys(EMOJI_CATEGORIES)];
const COUNTS = [1, 3, 5, 10];

export function RandomEmojiWidget() {
  const [category, setCategory] = useState('All');
  const [count, setCount] = useState(5);
  const [emojis, setEmojis] = useState<string[]>([]);

  const roll = useCallback(() => {
    setEmojis(Array.from({ length: count }, () => randomEmoji(category)));
  }, [category, count]);

  useEffect(() => {
    roll();
  }, [roll]);

  const joined = emojis.join(' ');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <span className="mb-2 block text-sm font-semibold text-ink-700">Category</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  category === c ? 'border-wa-green bg-wa-green/10 text-ink-900' : 'border-ink-200 bg-white text-ink-500 hover:border-wa-green/40'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-2 block text-sm font-semibold text-ink-700">How many</span>
          <div className="inline-flex rounded-full bg-ink-100 p-1">
            {COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  count === n ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-700">Your emojis</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={roll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 transition hover:border-wa-green/40 hover:text-ink-900"
            >
              <Shuffle className="h-3.5 w-3.5" />
              Shuffle
            </button>
            <CopyButton value={joined} />
          </div>
        </div>
        <div
          aria-live="polite"
          className="flex min-h-[6rem] items-center justify-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-4 py-6 text-5xl"
        >
          {joined || <span className="text-base text-ink-400">Tap shuffle for emojis</span>}
        </div>
      </div>

      {(() => {
        const cta = buildToolPrefill('random-emoji-generator', {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      <p className="text-xs text-ink-400">
        Tip: tap an emoji set to copy, then paste into captions, bios, or messages. Great for
        beating writer&apos;s block on social posts or spicing up a username.
      </p>
    </div>
  );
}
