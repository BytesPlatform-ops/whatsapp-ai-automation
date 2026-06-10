'use client';

import { useCallback, useState } from 'react';
import { BatchGeneratorWidget } from '@/components/tools/widgets/BatchGeneratorWidget';
import { gamertag } from '@/lib/generators';

export function XboxGamertagWidget() {
  const [numbers, setNumbers] = useState(true);
  const [leet, setLeet] = useState(false);
  const [decorate, setDecorate] = useState(false);

  // Recreated when options change → BatchGeneratorWidget re-rolls automatically.
  const generate = useCallback(() => gamertag({ numbers, leet, decorate }), [numbers, leet, decorate]);

  const controls = (
    <div className="flex flex-wrap gap-2">
      {([
        ['Add numbers', numbers, setNumbers],
        ['Leetspeak (3, 0, 7…)', leet, setLeet],
        ['xX_ wrap _Xx', decorate, setDecorate],
      ] as const).map(([label, val, set]) => (
        <button
          key={label}
          type="button"
          onClick={() => set((v) => !v)}
          aria-pressed={val}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
            val ? 'border-wa-green bg-wa-green/10 text-ink-900' : 'border-ink-200 bg-white text-ink-500 hover:border-wa-green/40'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <BatchGeneratorWidget
      slug="xbox-gamertag-generator"
      generate={generate}
      buttonLabel="Generate tags"
      controls={controls}
      tip="Tip: works for Xbox, PSN, Steam, Twitch, and Discord. Gamertags must be unique, so generate a few and check availability on the platform."
    />
  );
}
