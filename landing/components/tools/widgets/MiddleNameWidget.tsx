'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

type Style = 'all' | 'classic' | 'modern' | 'nature' | 'short';

interface NameEntry {
  name: string;
  origin: string;
  meaning: string;
  style: Style[];
  syllables: number;
}

const NAME_POOL: NameEntry[] = [
  { name: 'James', origin: 'Hebrew', meaning: 'Supplanter', style: ['classic', 'short'], syllables: 1 },
  { name: 'Rose', origin: 'Latin', meaning: 'The flower', style: ['classic', 'nature', 'short'], syllables: 1 },
  { name: 'Mae', origin: 'English', meaning: 'Pearl', style: ['classic', 'short'], syllables: 1 },
  { name: 'Grace', origin: 'Latin', meaning: 'Elegance', style: ['classic', 'short'], syllables: 1 },
  { name: 'Lee', origin: 'Old English', meaning: 'Meadow', style: ['classic', 'nature', 'short'], syllables: 1 },
  { name: 'Joy', origin: 'Latin', meaning: 'Happiness', style: ['classic', 'short'], syllables: 1 },
  { name: 'Claire', origin: 'French', meaning: 'Clear, bright', style: ['classic', 'short'], syllables: 1 },
  { name: 'Jane', origin: 'Hebrew', meaning: 'God is gracious', style: ['classic', 'short'], syllables: 1 },
  { name: 'Kate', origin: 'Greek', meaning: 'Pure', style: ['classic', 'short'], syllables: 1 },
  { name: 'Anne', origin: 'Hebrew', meaning: 'Grace', style: ['classic', 'short'], syllables: 1 },
  { name: 'Elise', origin: 'French', meaning: 'Pledged to God', style: ['classic'], syllables: 2 },
  { name: 'Marie', origin: 'French', meaning: 'Beloved', style: ['classic'], syllables: 2 },
  { name: 'Louise', origin: 'French', meaning: 'Famous warrior', style: ['classic'], syllables: 2 },
  { name: 'Arthur', origin: 'Celtic', meaning: 'Bear king', style: ['classic'], syllables: 2 },
  { name: 'Henry', origin: 'Germanic', meaning: 'Ruler of the home', style: ['classic'], syllables: 2 },
  { name: 'William', origin: 'Germanic', meaning: 'Determined protector', style: ['classic'], syllables: 3 },
  { name: 'Eleanor', origin: 'Greek', meaning: 'Bright, shining one', style: ['classic'], syllables: 3 },
  { name: 'Alexander', origin: 'Greek', meaning: 'Defender of the people', style: ['classic'], syllables: 4 },
  { name: 'Nova', origin: 'Latin', meaning: 'New', style: ['modern', 'nature'], syllables: 2 },
  { name: 'Aria', origin: 'Italian', meaning: 'Air, song', style: ['modern'], syllables: 3 },
  { name: 'River', origin: 'English', meaning: 'Flowing water', style: ['modern', 'nature'], syllables: 2 },
  { name: 'Quinn', origin: 'Irish', meaning: 'Wisdom', style: ['modern', 'short'], syllables: 1 },
  { name: 'Sage', origin: 'Latin', meaning: 'Wise one', style: ['modern', 'nature', 'short'], syllables: 1 },
  { name: 'Blake', origin: 'Old English', meaning: 'Dark or fair', style: ['modern', 'short'], syllables: 1 },
  { name: 'Avery', origin: 'Germanic', meaning: 'Ruler of elves', style: ['modern'], syllables: 3 },
  { name: 'Rowan', origin: 'Irish', meaning: 'Little red one', style: ['modern', 'nature'], syllables: 2 },
  { name: 'Ember', origin: 'English', meaning: 'Spark', style: ['modern', 'nature'], syllables: 2 },
  { name: 'Eden', origin: 'Hebrew', meaning: 'Delight', style: ['modern', 'nature'], syllables: 2 },
  { name: 'Finn', origin: 'Irish', meaning: 'Fair', style: ['modern', 'short'], syllables: 1 },
  { name: 'Ash', origin: 'English', meaning: 'Ash tree', style: ['modern', 'nature', 'short'], syllables: 1 },
  { name: 'Willow', origin: 'English', meaning: 'Willow tree', style: ['nature'], syllables: 2 },
  { name: 'Ivy', origin: 'English', meaning: 'Ivy plant', style: ['nature'], syllables: 2 },
  { name: 'Lily', origin: 'English', meaning: 'The flower', style: ['nature'], syllables: 2 },
  { name: 'Dawn', origin: 'Old English', meaning: 'Sunrise', style: ['nature', 'short'], syllables: 1 },
  { name: 'Skye', origin: 'Scottish', meaning: 'Isle of Skye', style: ['nature', 'short'], syllables: 1 },
  { name: 'Brook', origin: 'English', meaning: 'Small stream', style: ['nature', 'short'], syllables: 1 },
  { name: 'Fern', origin: 'English', meaning: 'Fern plant', style: ['nature', 'short'], syllables: 1 },
  { name: 'Wren', origin: 'English', meaning: 'Small bird', style: ['nature', 'short'], syllables: 1 },
  { name: 'Hazel', origin: 'English', meaning: 'Hazel tree', style: ['nature'], syllables: 2 },
  { name: 'Violet', origin: 'Latin', meaning: 'Purple flower', style: ['nature'], syllables: 3 },
];

function syllableCount(name: string): number {
  return name.toLowerCase().replace(/[^aeiouy]/g, '').length || 1;
}

function scoreFlow(first: string, middle: NameEntry, last: string): number {
  let score = 0;
  const firstSyl = syllableCount(first);
  const midSyl = middle.syllables;
  const lastSyl = syllableCount(last);
  // Prefer alternating syllable counts
  if (firstSyl !== midSyl) score += 2;
  if (midSyl !== lastSyl) score += 2;
  if (firstSyl === midSyl && midSyl === lastSyl) score -= 3;
  // Prefer different ending/starting sounds
  const firstEnd = first.toLowerCase().slice(-1);
  const midStart = middle.name.toLowerCase()[0];
  if (firstEnd !== midStart) score += 1;
  return score;
}

export function MiddleNameWidget() {
  const [firstName, setFirstName] = useState('Emma');
  const [lastName, setLastName] = useState('Johnson');
  const [style, setStyle] = useState<Style>('all');

  const suggestions = useMemo(() => {
    if (!firstName.trim()) return [];
    const pool = style === 'all' ? NAME_POOL : NAME_POOL.filter((n) => n.style.includes(style));
    // Exclude names that match first or last name
    const filtered = pool.filter(
      (n) => n.name.toLowerCase() !== firstName.toLowerCase() && n.name.toLowerCase() !== lastName.toLowerCase(),
    );
    const scored = filtered.map((n) => ({ ...n, score: scoreFlow(firstName, n, lastName) }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 10);
  }, [firstName, lastName, style]);

  const STYLES: { value: Style; label: string }[] = [
    { value: 'all', label: 'All styles' },
    { value: 'classic', label: 'Classic' },
    { value: 'modern', label: 'Modern' },
    { value: 'nature', label: 'Nature' },
    { value: 'short', label: 'Short (1–2 syl)' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">First name</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="e.g. Emma"
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">Last name</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="e.g. Johnson"
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold text-ink-700">Style preference</div>
        <div className="flex flex-wrap gap-2">
          {STYLES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStyle(s.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${style === s.value ? 'bg-wa-green text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {firstName.trim() && suggestions.length > 0 ? (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/20">
          <div className="mb-4 text-sm font-semibold uppercase tracking-wider text-wa-teal">
            Middle name suggestions for {firstName} __ {lastName}
          </div>
          <div className="space-y-3">
            {suggestions.map((n, i) => (
              <div key={n.name} className="flex items-center gap-4 rounded-xl bg-white px-4 py-3 shadow-soft">
                <div className="text-lg font-bold text-ink-400 w-6 text-center">{i + 1}</div>
                <div className="flex-1">
                  <div className="font-display text-lg font-bold text-ink-900">
                    {firstName} <span className="text-wa-teal">{n.name}</span> {lastName}
                  </div>
                  <div className="text-xs text-ink-400 mt-0.5">{n.origin} · {n.meaning}</div>
                </div>
                <div className="text-xs text-ink-300">{n.syllables} syl</div>
              </div>
            ))}
          </div>

          {(() => {
            const cta = buildToolPrefill('middle-name-generator', { firstName, lastName });
            return <div className="mt-4"><ToolResultCta {...cta} prefill={cta.whatsappPrefill} /></div>;
          })()}
        </div>
      ) : firstName.trim() ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-8 text-center text-sm text-ink-500">
          No suggestions match this style filter. Try &quot;All styles&quot; for more options.
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-8 text-center text-sm text-ink-500">
          Enter a first name to generate middle name suggestions.
        </div>
      )}
    </div>
  );
}
