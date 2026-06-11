'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

function stats(text: string) {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const characters = text.length;
  const charactersNoSpaces = text.replace(/\s/g, '').length;
  const sentences = trimmed ? (trimmed.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)?.length ?? 0) : 0;
  const paragraphs = trimmed ? trimmed.split(/\n+/).filter((p) => p.trim()).length : 0;
  const readingMins = words / 200; // ~200 wpm
  const readingTime =
    words === 0 ? '0 sec' : readingMins < 1 ? `${Math.ceil(readingMins * 60)} sec` : `${Math.ceil(readingMins)} min`;
  return { words, characters, charactersNoSpaces, sentences, paragraphs, readingTime };
}

export function WordCounterWidget() {
  const [text, setText] = useState('');
  const s = useMemo(() => stats(text), [text]);

  const cards: { label: string; value: string | number }[] = [
    { label: 'Words', value: s.words },
    { label: 'Characters', value: s.characters },
    { label: 'Characters (no spaces)', value: s.charactersNoSpaces },
    { label: 'Sentences', value: s.sentences },
    { label: 'Paragraphs', value: s.paragraphs },
    { label: 'Reading time', value: s.readingTime },
  ];

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="wc-input" className="mb-2 block text-sm font-semibold text-ink-700">
          Your text
        </label>
        <textarea
          id="wc-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type or paste your text — counts update live…"
          rows={9}
          className="w-full resize-y rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-center">
            <div className="font-display text-2xl font-bold text-ink-900">{c.value}</div>
            <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{c.label}</div>
          </div>
        ))}
      </div>

      {text && (() => {
        const cta = buildToolPrefill('word-counter', {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      <p className="text-xs text-ink-400">
        Tip: counts update as you type and everything stays in your browser. Reading time assumes an
        average pace of about 200 words per minute.
      </p>
    </div>
  );
}
