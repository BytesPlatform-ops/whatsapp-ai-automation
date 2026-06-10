'use client';

import { useCallback, useEffect, useState } from 'react';
import { Shuffle, UtensilsCrossed } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { FOOD_CATEGORIES, randomFood } from '@/lib/generators';

const CATEGORIES = ['Any', ...Object.keys(FOOD_CATEGORIES)];

export function RandomFoodWidget() {
  const [category, setCategory] = useState('Any');
  const [food, setFood] = useState('');

  const roll = useCallback(() => setFood(randomFood(category)), [category]);

  useEffect(() => {
    roll();
  }, [roll]);

  return (
    <div className="space-y-5">
      <div>
        <span className="mb-2 block text-sm font-semibold text-ink-700">Meal</span>
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

      <div
        aria-live="polite"
        className="flex min-h-[7rem] flex-col items-center justify-center rounded-2xl border border-ink-200 bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 px-4 py-8 text-center"
      >
        <UtensilsCrossed className="mb-2 h-6 w-6 text-wa-teal" />
        <span className="font-display text-2xl font-bold text-ink-900">{food || '…'}</span>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={roll}
          className="inline-flex items-center gap-1.5 rounded-xl bg-wa-green px-6 py-3 text-sm font-semibold text-white transition hover:bg-wa-greenDark"
        >
          <Shuffle className="h-4 w-4" />
          Pick something else
        </button>
      </div>

      {(() => {
        const cta = buildToolPrefill('random-food-generator', {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      <p className="text-xs text-ink-400">
        Tip: stuck on what to cook or order? Pick a meal type and let the generator decide. Keep
        tapping until something sounds good.
      </p>
    </div>
  );
}
