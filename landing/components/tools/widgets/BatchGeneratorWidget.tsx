'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';
import { batch } from '@/lib/generators';

interface BatchGeneratorWidgetProps {
  slug: string;
  /** Returns a single result; called `count` times per roll (deduped). */
  generate: () => string;
  count?: number;
  buttonLabel?: string;
  /** Optional controls (selectors, toggles) rendered above the results. */
  controls?: ReactNode;
  tip?: string;
}

// Shared UI for "generator" tools: a button that produces a deduped batch of
// results, each with its own copy button, plus a re-roll. Results are generated
// on the client (after mount) to avoid hydration mismatches from Math.random.
export function BatchGeneratorWidget({
  slug,
  generate,
  count = 8,
  buttonLabel = 'Generate',
  controls,
  tip,
}: BatchGeneratorWidgetProps) {
  const [items, setItems] = useState<string[]>([]);

  const roll = useCallback(() => setItems(batch(generate, count)), [generate, count]);

  // Initial batch on mount, and whenever the generate fn changes (e.g. options).
  useEffect(() => {
    roll();
  }, [roll]);

  return (
    <div className="space-y-5">
      {controls}

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink-700">Results</span>
        <button
          type="button"
          onClick={roll}
          className="inline-flex items-center gap-1.5 rounded-lg bg-wa-green px-4 py-2 text-sm font-semibold text-white transition hover:bg-wa-greenDark"
        >
          <Shuffle className="h-4 w-4" />
          {buttonLabel}
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((v, i) => (
          <div
            key={`${v}-${i}`}
            className="flex items-center gap-3 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3"
          >
            <span className="min-w-0 flex-1 break-words text-base font-semibold text-ink-900">{v}</span>
            <CopyButton value={v} size="xs" className="shrink-0" />
          </div>
        ))}
      </div>

      {(() => {
        const cta = buildToolPrefill(slug, {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      {tip && <p className="text-xs text-ink-400">{tip}</p>}
    </div>
  );
}
