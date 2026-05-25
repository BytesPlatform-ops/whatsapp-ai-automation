'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

type StatType = 'speed' | 'stamina' | 'power' | 'guts' | 'wisdom' | 'friend';

interface CardSlot {
  type: StatType;
  bond: string;
}

const STAT_LABELS: Record<StatType, string> = {
  speed: 'Speed ⚡',
  stamina: 'Stamina 💚',
  power: 'Power 🔥',
  guts: 'Guts 💪',
  wisdom: 'Wisdom 💙',
  friend: 'Friend 🌟',
};

const STAT_COLORS: Record<StatType, string> = {
  speed: 'text-yellow-600',
  stamina: 'text-green-600',
  power: 'text-red-600',
  guts: 'text-orange-600',
  wisdom: 'text-blue-600',
  friend: 'text-purple-600',
};

const DEFAULT_SLOTS: CardSlot[] = [
  { type: 'speed', bond: '80' },
  { type: 'speed', bond: '60' },
  { type: 'stamina', bond: '80' },
  { type: 'wisdom', bond: '100' },
  { type: 'wisdom', bond: '60' },
  { type: 'friend', bond: '80' },
];

function bondBonus(bond: number): number {
  // Base bonus progression: each 10 pts of bond ≈ +2% training bonus, max +20% at 100
  if (bond >= 100) return 10;
  if (bond >= 80) return 8; // unique skill unlocked at 80
  if (bond >= 60) return 6;
  if (bond >= 40) return 4;
  if (bond >= 20) return 2;
  return 0;
}

function trainingBonus(slots: CardSlot[], type: StatType): number {
  let bonus = 0;
  for (const slot of slots) {
    const b = Math.min(100, Math.max(0, Number(slot.bond) || 0));
    if (slot.type === type) {
      // Same-type card: base 5 pts + bond bonus
      bonus += 5 + bondBonus(b);
    } else if (slot.type === 'friend') {
      // Friend card adds small bonus to all training
      bonus += 1 + Math.floor(bondBonus(b) / 5);
    }
  }
  return bonus;
}

function deckScore(slots: CardSlot[]): number {
  const totalBond = slots.reduce((s, c) => s + Math.min(100, Math.max(0, Number(c.bond) || 0)), 0);
  const maxBond = slots.length * 100;
  return Math.round((totalBond / maxBond) * 100);
}

export function UmaAffinityWidget() {
  const [slots, setSlots] = useState<CardSlot[]>(DEFAULT_SLOTS);

  const updateSlot = (idx: number, field: keyof CardSlot, value: string) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const result = useMemo(() => {
    const statTypes: StatType[] = ['speed', 'stamina', 'power', 'guts', 'wisdom'];
    const bonuses: Record<StatType, number> = {} as Record<StatType, number>;
    for (const t of statTypes) {
      bonuses[t] = trainingBonus(slots, t);
    }
    const score = deckScore(slots);
    const unlockedSkills = slots.filter((s) => Number(s.bond) >= 80).length;
    const maxBondCards = slots.filter((s) => Number(s.bond) >= 100).length;
    return { bonuses, score, unlockedSkills, maxBondCards };
  }, [slots]);

  const STAT_TYPES: StatType[] = ['speed', 'stamina', 'power', 'guts', 'wisdom', 'friend'];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="text-sm font-semibold text-ink-700">Your 6 support cards</div>
        {slots.map((slot, idx) => (
          <div key={idx} className="grid grid-cols-[auto_1fr_1fr] items-center gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3">
            <div className="text-sm font-semibold text-ink-400 w-5">{idx + 1}</div>
            <select
              value={slot.type}
              onChange={(e) => updateSlot(idx, 'type', e.target.value)}
              className="rounded-lg border border-ink-200 bg-ink-50 px-2 py-2 text-sm text-ink-900 outline-none focus:border-wa-green"
            >
              {STAT_TYPES.map((t) => (
                <option key={t} value={t}>{STAT_LABELS[t]}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={slot.bond}
                onChange={(e) => updateSlot(idx, 'bond', e.target.value)}
                placeholder="Bond"
                className="w-full rounded-lg border border-ink-200 bg-ink-50 px-2 py-2 text-sm text-ink-900 outline-none focus:border-wa-green"
              />
              <span className="text-xs text-ink-400 whitespace-nowrap">/ 100</span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/20">
        <div className="mb-4 text-sm font-semibold uppercase tracking-wider text-wa-teal">
          Training bonus per stat
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(['speed', 'stamina', 'power', 'guts', 'wisdom'] as StatType[]).map((t) => (
            <div key={t} className="rounded-xl bg-white px-4 py-3 shadow-soft text-center">
              <div className={`text-xs font-semibold uppercase tracking-wider ${STAT_COLORS[t]}`}>{STAT_LABELS[t]}</div>
              <div className="font-display text-3xl font-bold text-ink-900 mt-1">+{result.bonuses[t]}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 border-t border-wa-green/20 pt-4 sm:grid-cols-3">
          <StatBlock label="Deck bond score" value={`${result.score}%`} />
          <StatBlock label="Skills unlocked" value={`${result.unlockedSkills} / 6`} />
          <StatBlock label="Max bond (100)" value={`${result.maxBondCards} card${result.maxBondCards !== 1 ? 's' : ''}`} />
        </div>

        <div className="mt-4 rounded-lg bg-white px-4 py-3 text-sm text-ink-500 shadow-soft">
          <strong className="text-ink-900">Tip:</strong> Reach bond 80 on all 6 cards before worrying about 100 —
          the unique skill unlock at 80 is the biggest power spike.{' '}
          {result.score < 60 && 'Your deck bond is low — prioritize training sessions where your cards appear.'}
          {result.score >= 80 && 'Great bond levels! Focus on using inherited skills to boost your Uma\'s stats.'}
        </div>

        {(() => {
          const cta = buildToolPrefill('uma-affinity-calculator', { deckScore: result.score });
          return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
        })()}
      </div>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</div>
      <div className="mt-1 font-display text-xl font-bold text-ink-900">{value}</div>
    </div>
  );
}
