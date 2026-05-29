'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';

const GROUPS: { label: string; symbols: string[] }[] = [
  {
    label: 'Hearts',
    symbols: ['♥', '♡', '❤', '🖤', '🤍', '💙', '💚', '💛', '🧡', '💜', '🤎', '💗', '💓', '💕', '💖', '💘', '💝', '💞', '💟', '❣', '❥', '꒰৭˃ᵕ˂৭꒱'],
  },
  {
    label: 'Stars & sparkles',
    symbols: ['★', '☆', '✦', '✧', '✩', '✪', '✫', '✬', '✭', '✮', '✯', '❂', '✡', '⭐', '🌟', '✨', '💫', '⚡'],
  },
  {
    label: 'Flowers & nature',
    symbols: ['✿', '❀', '❁', '✾', '❃', '❋', '⚘', '☘', '🌸', '🌹', '🌺', '🌻', '🌷', '💐', '🍀', '☀', '☾', '☽'],
  },
  {
    label: 'Arrows & misc',
    symbols: ['➳', '➤', '➢', '➣', '↳', '↪', '☂', '☃', '☮', '☯', '✓', '✔', '✗', '✘', '☑', '♛', '♕', '♔', '✞', '☪'],
  },
];

export function HeartSymbolWidget() {
  const [text, setText] = useState('');
  const [heart, setHeart] = useState('♥');

  const wrapped = useMemo(() => {
    const t = text.trim();
    if (!t) return '';
    return `${heart} ${t} ${heart}`;
  }, [text, heart]);

  return (
    <div className="space-y-6">
      {/* Symbol palette — click any symbol to copy it */}
      <div className="space-y-4">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              {group.label}
            </div>
            <div className="flex flex-wrap gap-2">
              {group.symbols.map((s, i) => (
                <CopyButton
                  key={`${group.label}-${i}`}
                  value={s}
                  label={s}
                  size="sm"
                  className="!bg-white !text-lg !text-ink-900 ring-1 ring-ink-200 hover:!bg-wa-bubble/50"
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Wrap-my-text builder */}
      <div className="rounded-2xl border border-wa-green/20 bg-wa-bubble/30 p-5">
        <h3 className="mb-3 text-sm font-bold text-ink-900">Wrap your text in hearts</h3>
        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <select
            value={heart}
            onChange={(e) => setHeart(e.target.value)}
            className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-lg text-ink-900 outline-none focus:border-wa-green"
            aria-label="Choose a symbol"
          >
            {GROUPS[0].symbols.slice(0, 12).map((s, i) => (
              <option key={i} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. your name"
            maxLength={60}
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
        </div>

        {wrapped && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3">
            <div className="min-w-0 flex-1 break-words text-lg text-ink-900">{wrapped}</div>
            <CopyButton value={wrapped} size="xs" className="shrink-0" />
          </div>
        )}

        {(() => {
          const cta = buildToolPrefill('heart-symbol-generator', {});
          return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
        })()}
      </div>

      <p className="text-xs text-ink-400">
        Tip: every symbol here is standard Unicode — tap to copy, then paste into Instagram, TikTok,
        WhatsApp, Discord, or anywhere else.
      </p>
    </div>
  );
}
