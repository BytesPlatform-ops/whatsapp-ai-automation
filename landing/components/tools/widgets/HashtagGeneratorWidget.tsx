'use client';

import { useState } from 'react';
import { Hash } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';

const SUFFIXES = ['', 'lover', 'life', 'gram', 'daily', 'addict', 'time', 'lovers', 'community', 'tips', 'ideas', 'inspo', 'oftheday', 'world'];
const PREFIXES = ['insta', 'best', 'my', 'the', 'love'];
const POPULAR = ['love', 'instagood', 'photooftheday', 'viral', 'trending', 'explore', 'fyp', 'instadaily', 'follow', 'reels'];

function clean(w: string) {
  return w.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function generate(keywords: string): string[] {
  const words = keywords.split(/[\s,]+/).map(clean).filter(Boolean);
  if (!words.length) return [];
  const out = new Set<string>();
  for (const w of words) {
    out.add(`#${w}`);
    for (const sfx of SUFFIXES) if (sfx) out.add(`#${w}${sfx}`);
    for (const pfx of PREFIXES) out.add(`#${pfx}${w}`);
  }
  if (words.length >= 2) out.add(`#${words.join('')}`);
  for (const p of POPULAR) out.add(`#${p}`);
  return Array.from(out).slice(0, 30);
}

export function HashtagGeneratorWidget() {
  const [keywords, setKeywords] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    const t = generate(keywords);
    if (!t.length) {
      setError('Enter a keyword or two (e.g. coffee, fitness, travel).');
      setTags([]);
      return;
    }
    setError(null);
    setTags(t);
  };

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="ht-kw" className="mb-2 block text-sm font-semibold text-ink-700">Topic / keywords</label>
        <div className="flex flex-wrap gap-2">
          <input
            id="ht-kw"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="e.g. coffee, latte art"
            className="min-w-[200px] flex-1 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
          <button type="button" onClick={run} className="inline-flex items-center gap-1.5 rounded-xl bg-wa-green px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-greenDark">
            <Hash className="h-4 w-4" /> Generate
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">{error}</div>
      )}

      {tags.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-ink-700">{tags.length} hashtags</span>
            <CopyButton value={tags.join(' ')} label="Copy all" />
          </div>
          <div className="flex flex-wrap gap-2 rounded-xl border border-ink-200 bg-ink-50 px-4 py-4">
            {tags.map((t) => (
              <span key={t} className="rounded-full bg-white px-3 py-1 text-sm font-medium text-wa-teal ring-1 ring-ink-100">{t}</span>
            ))}
          </div>
        </div>
      )}

      {tags.length > 0 && (() => {
        const cta = buildToolPrefill('hashtag-generator', {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      <p className="text-xs text-ink-400">
        Tip: mix a few niche, specific tags with broader popular ones, and keep them relevant to the
        post. Instagram allows up to 30 hashtags per post — quality beats stuffing.
      </p>
    </div>
  );
}
