'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';

type CaseId = 'upper' | 'lower' | 'title' | 'sentence' | 'capitalize' | 'alternating';

const CASES: { id: CaseId; label: string }[] = [
  { id: 'upper', label: 'UPPERCASE' },
  { id: 'lower', label: 'lowercase' },
  { id: 'title', label: 'Title Case' },
  { id: 'sentence', label: 'Sentence case' },
  { id: 'capitalize', label: 'Capitalize Each Word' },
  { id: 'alternating', label: 'aLtErNaTiNg' },
];

function convert(text: string, mode: CaseId): string {
  switch (mode) {
    case 'upper':
      return text.toUpperCase();
    case 'lower':
      return text.toLowerCase();
    case 'title':
    case 'capitalize':
      return text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    case 'sentence':
      return text.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, (c) => c.toUpperCase());
    case 'alternating':
      return Array.from(text)
        .map((c, i) => (i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()))
        .join('');
    default:
      return text;
  }
}

export function CaseConverterWidget() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<CaseId>('title');
  const output = useMemo(() => convert(text, mode), [text, mode]);

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="case-input" className="mb-2 block text-sm font-semibold text-ink-700">
          Your text
        </label>
        <textarea
          id="case-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type or paste text to convert…"
          rows={5}
          className="w-full resize-y rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {CASES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setMode(c.id)}
            aria-pressed={mode === c.id}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              mode === c.id ? 'border-wa-green bg-wa-green/10 text-ink-900' : 'border-ink-200 bg-white text-ink-500 hover:border-wa-green/40'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-700">Result</span>
          <CopyButton value={output} />
        </div>
        <div className="min-h-[5rem] w-full whitespace-pre-wrap break-words rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-base text-ink-900">
          {output || <span className="text-ink-400">Converted text appears here</span>}
        </div>
      </div>

      {text && (() => {
        const cta = buildToolPrefill('case-converter', {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      <p className="text-xs text-ink-400">
        Tip: Title Case capitalizes every word; Sentence case only capitalizes the first word of each
        sentence. Everything runs in your browser.
      </p>
    </div>
  );
}
