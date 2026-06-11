'use client';

import { useCallback, useState } from 'react';
import { BatchGeneratorWidget } from '@/components/tools/widgets/BatchGeneratorWidget';
import { businessName } from '@/lib/generators';

export function BusinessNameWidget() {
  const [keyword, setKeyword] = useState('');

  // Recreated when the keyword changes → BatchGeneratorWidget re-rolls.
  const generate = useCallback(() => businessName(keyword), [keyword]);

  const controls = (
    <div>
      <label htmlFor="biz-kw" className="mb-2 block text-sm font-semibold text-ink-700">
        Keyword <span className="font-normal text-ink-400">(optional — e.g. coffee, fitness, design)</span>
      </label>
      <input
        id="biz-kw"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="Type a word your business is about…"
        className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
      />
    </div>
  );

  return (
    <BatchGeneratorWidget
      slug="business-name-generator"
      generate={generate}
      buttonLabel="Generate names"
      controls={controls}
      tip="Tip: enter a keyword for on-topic ideas, or leave it blank for brandable invented names. Check domain and trademark availability before you commit."
    />
  );
}
