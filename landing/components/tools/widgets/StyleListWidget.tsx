'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';
import type { TextStyle } from '@/lib/textStyles';

interface StyleListWidgetProps {
  styles: TextStyle[];
  slug: string;
  defaultInput?: string;
  placeholder?: string;
  tip?: string;
}

// Shared widget for font-style tools (fancy-text, bold-text): one textarea, then
// a scrollable list of styled variants — each with its own copy button.
export function StyleListWidget({
  styles,
  slug,
  defaultInput = 'Type your text here',
  placeholder = 'Type anything…',
  tip,
}: StyleListWidgetProps) {
  const [input, setInput] = useState(defaultInput);

  const variants = useMemo(
    () => styles.map((s) => ({ name: s.name, value: input ? s.transform(input) : '' })),
    [input, styles],
  );

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="style-input" className="mb-2 block text-sm font-semibold text-ink-700">
          Your text
        </label>
        <textarea
          id="style-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full resize-none rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
      </div>

      <div className="space-y-2">
        {variants.map((v) => (
          <div
            key={v.name}
            className="flex items-center gap-3 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                {v.name}
              </div>
              <div className="mt-0.5 break-words text-lg text-ink-900">
                {v.value || <span className="text-ink-400">…</span>}
              </div>
            </div>
            <CopyButton value={v.value} size="xs" className="shrink-0" />
          </div>
        ))}
      </div>

      {input && (() => {
        const cta = buildToolPrefill(slug, {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      {tip && <p className="text-xs text-ink-400">{tip}</p>}
    </div>
  );
}
