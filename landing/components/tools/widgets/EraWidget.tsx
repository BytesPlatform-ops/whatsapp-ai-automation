'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

// Taylor Swift albums and their peak year
const TS_ERAS = [
  { name: 'Taylor Swift', year: 2006, emoji: '🤠', vibe: 'Country girl-next-door — storytelling and teenage dreams', color: 'text-amber-700' },
  { name: 'Fearless', year: 2008, emoji: '✨', vibe: 'Romantic idealist — you believe in fairytales and first loves', color: 'text-yellow-500' },
  { name: 'Speak Now', year: 2010, emoji: '🟣', vibe: 'Bold and theatrical — you write your own story and speak your mind', color: 'text-purple-600' },
  { name: 'Red', year: 2012, emoji: '❤️', vibe: 'Emotional intensity — you feel everything deeply and love recklessly', color: 'text-red-600' },
  { name: '1989', year: 2014, emoji: '🎸', vibe: 'Pop reinvention — bold, stylish, and unapologetically yourself', color: 'text-sky-500' },
  { name: 'Reputation', year: 2017, emoji: '🐍', vibe: 'Dark and defiant — you\'ve been underestimated and you\'re done with it', color: 'text-gray-900' },
  { name: 'Lover', year: 2019, emoji: '💗', vibe: 'Colorful and soft — you lead with love and wear your heart openly', color: 'text-pink-500' },
  { name: 'Folklore', year: 2020, emoji: '🌲', vibe: 'Introspective indie — you love quiet, deep conversations and rainy days', color: 'text-gray-600' },
  { name: 'Evermore', year: 2020, emoji: '🍂', vibe: 'Melancholy poet — you find beauty in endings and bittersweet things', color: 'text-amber-800' },
  { name: 'Midnights', year: 2022, emoji: '🌙', vibe: 'Late-night dreamer — introspective, mysterious, and full of layered thoughts', color: 'text-indigo-600' },
  { name: 'TTPD', year: 2024, emoji: '📜', vibe: 'Literary and raw — you process everything through writing and metaphor', color: 'text-slate-700' },
];

const GENERATIONS = [
  { name: 'Silent Generation', born: [1928, 1945], desc: 'Pre-television era, post-WWII values' },
  { name: 'Baby Boomer', born: [1946, 1964], desc: 'Rock \'n\' roll, moon landing, counterculture' },
  { name: 'Generation X', born: [1965, 1980], desc: 'MTV, personal computers, latchkey kids' },
  { name: 'Millennial', born: [1981, 1996], desc: 'Internet natives, 9/11 shaped, hustle culture' },
  { name: 'Generation Z', born: [1997, 2012], desc: 'Smartphone-first, social media natives, climate aware' },
  { name: 'Generation Alpha', born: [2013, 2025], desc: 'AI-native, iPad childhood, TikTok shaped' },
];

const TECH_ERAS = [
  { name: 'Pre-internet', teens: [1975, 1990], desc: 'Encyclopedias, dial phones, cassette tapes' },
  { name: 'Dial-up era', teens: [1991, 1999], desc: 'AOL, ICQ, Napster, 56K modems' },
  { name: 'Broadband era', teens: [2000, 2006], desc: 'MySpace, iPod, YouTube launch, early social' },
  { name: 'Smartphone era', teens: [2007, 2015], desc: 'iPhone, Instagram, Twitter, streaming' },
  { name: 'Social media era', teens: [2016, 2021], desc: 'TikTok, Discord, Snapchat streaks, cancel culture' },
  { name: 'AI era', teens: [2022, 2030], desc: 'ChatGPT, AI tools, deepfakes, co-created content' },
];

function getFormativeYear(birthYear: number): number {
  return birthYear + 14; // Age 14 = peak formative year
}

function getTsEra(birthYear: number) {
  const formativeYear = getFormativeYear(birthYear);
  if (formativeYear < 2006) {
    return { era: null, note: `Born in ${birthYear} — your teen years predated Taylor's debut. Your pop era was shaped by different artists.` };
  }
  // Find the album that was most prominent during formative year
  let closest = TS_ERAS[0];
  for (const era of TS_ERAS) {
    if (era.year <= formativeYear && era.year > closest.year) {
      closest = era;
    }
  }
  return { era: closest, note: null };
}

function getGeneration(birthYear: number) {
  return GENERATIONS.find((g) => birthYear >= g.born[0] && birthYear <= g.born[1]) ?? null;
}

function getTechEra(birthYear: number) {
  const teen = getFormativeYear(birthYear);
  return TECH_ERAS.find((t) => teen >= t.teens[0] && teen <= t.teens[1]) ?? TECH_ERAS[TECH_ERAS.length - 1];
}

export function EraWidget() {
  const [birthYear, setBirthYear] = useState('1998');

  const result = useMemo(() => {
    const y = Number(birthYear);
    if (!Number.isFinite(y) || y < 1920 || y > 2020) return null;
    const tsResult = getTsEra(y);
    const gen = getGeneration(y);
    const tech = getTechEra(y);
    return { birthYear: y, ts: tsResult, gen, tech, formativeYear: getFormativeYear(y) };
  }, [birthYear]);

  return (
    <div className="space-y-6">
      <div>
        <label className="mb-1 block text-sm font-semibold text-ink-700">Your birth year</label>
        <input
          type="number"
          min="1920"
          max="2020"
          value={birthYear}
          onChange={(e) => setBirthYear(e.target.value)}
          className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
        <div className="mt-1 text-xs text-ink-400">Enter any year from 1920 to 2020</div>
      </div>

      {result ? (
        <div className="space-y-4">
          {/* Taylor Swift Era */}
          <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/20">
            <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-wa-teal">Your Taylor Swift Era</div>
            {result.ts.era ? (
              <>
                <div className="flex items-baseline gap-3">
                  <span className="text-5xl">{result.ts.era.emoji}</span>
                  <div>
                    <div className={`font-display text-3xl font-bold ${result.ts.era.color}`}>{result.ts.era.name}</div>
                    <div className="text-sm text-ink-500 mt-1">Peaked when you were ~{result.formativeYear - result.birthYear} · {result.ts.era.year}</div>
                  </div>
                </div>
                <div className="mt-4 rounded-lg bg-white px-4 py-3 text-sm text-ink-600 shadow-soft">
                  {result.ts.era.vibe}
                </div>
              </>
            ) : (
              <div className="text-sm text-ink-600">{result.ts.note}</div>
            )}
          </div>

          {/* Generation + Tech Era */}
          <div className="grid gap-4 sm:grid-cols-2">
            {result.gen && (
              <div className="rounded-2xl border border-ink-200 bg-white p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-2">Your Generation</div>
                <div className="font-display text-xl font-bold text-ink-900">{result.gen.name}</div>
                <div className="text-sm text-ink-500 mt-1">{result.gen.desc}</div>
              </div>
            )}
            {result.tech && (
              <div className="rounded-2xl border border-ink-200 bg-white p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-2">Your Teen Tech Era</div>
                <div className="font-display text-xl font-bold text-ink-900">{result.tech.name}</div>
                <div className="text-sm text-ink-500 mt-1">{result.tech.desc}</div>
              </div>
            )}
          </div>

          {(() => {
            const cta = buildToolPrefill('era-calculator', { birthYear: result.birthYear });
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-8 text-center text-sm text-ink-500">
          Enter your birth year (1920–2020) to find your Taylor Swift era and generational identity.
        </div>
      )}
    </div>
  );
}
