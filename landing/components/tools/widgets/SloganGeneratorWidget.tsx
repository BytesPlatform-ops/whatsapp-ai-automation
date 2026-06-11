'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';

// Templates take the brand and a topic keyword. Template-based (no AI) → instant + free.
const TEMPLATES: ((brand: string, kw: string) => string)[] = [
  (b, k) => `${b}: ${k} done right.`,
  (b, k) => `Think ${k}. Think ${b}.`,
  (b, k) => `${b} — where ${k} meets quality.`,
  (b) => `Your goals, our mission. ${b}.`,
  (b, k) => `${k} you can trust.`,
  (b, k) => `Powering ${k}, every day.`,
  (b) => `${b}. Built different.`,
  (b, k) => `Simply better ${k}.`,
  (b, k) => `The smarter way to ${k}.`,
  (b) => `${b} — beyond expectations.`,
];

export function SloganGeneratorWidget() {
  const [brand, setBrand] = useState('');
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const generate = () => {
    const b = brand.trim() || 'Your Brand';
    const k = keyword.trim() || 'what you do';
    if (!brand.trim() && !keyword.trim()) {
      setError('Enter your brand name and/or a keyword to generate slogans.');
      setResults([]);
      return;
    }
    setError(null);
    setResults(TEMPLATES.map((t) => t(b, k)));
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="slogan-brand" className="mb-2 block text-sm font-semibold text-ink-700">Brand name</label>
          <input
            id="slogan-brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="e.g. Brightline"
            className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
        </div>
        <div>
          <label htmlFor="slogan-kw" className="mb-2 block text-sm font-semibold text-ink-700">
            What you do <span className="font-normal text-ink-400">(keyword)</span>
          </label>
          <input
            id="slogan-kw"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="e.g. coffee, web design, fitness"
            className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={generate}
        className="inline-flex items-center gap-1.5 rounded-xl bg-wa-green px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-greenDark"
      >
        <Sparkles className="h-4 w-4" />
        Generate slogans
      </button>

      {error && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">{error}</div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3">
              <span className="min-w-0 flex-1 text-base font-semibold text-ink-900">{r}</span>
              <CopyButton value={r} size="xs" className="shrink-0" />
            </div>
          ))}
        </div>
      )}

      {results.length > 0 && (() => {
        const cta = buildToolPrefill('slogan-generator', {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      <p className="text-xs text-ink-400">
        Tip: a great slogan is short, memorable, and says what makes you different. Use these as
        starting points and trim to the punchiest few words.
      </p>
    </div>
  );
}
