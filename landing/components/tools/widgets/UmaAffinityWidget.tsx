'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

type Relationship = 'none' | 'minor' | 'strong';

const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  none: 'No special relationship',
  minor: 'Minor (same group / partial rival line)',
  strong: 'Strong (same character line or rival pair)',
};

const RELATIONSHIP_PTS: Record<Relationship, number> = {
  none: 0,
  minor: 25,
  strong: 50,
};

// Maps the estimated compatibility score to the in-game affinity symbols.
function affinityRating(score: number): { symbol: string; label: string; color: string } {
  if (score >= 80) return { symbol: '◎', label: 'Best — ideal inherit pair', color: 'text-wa-teal' };
  if (score >= 60) return { symbol: '○', label: 'Good — strong pairing', color: 'text-green-600' };
  if (score >= 40) return { symbol: '△', label: 'Fair — workable', color: 'text-amber-600' };
  return { symbol: '✕', label: 'Poor — look for a better pair', color: 'text-red-600' };
}

export function UmaAffinityWidget() {
  const [sharedWins, setSharedWins] = useState('5');
  const [relationship, setRelationship] = useState<Relationship>('minor');
  const [sameDistance, setSameDistance] = useState(true);
  const [sameStyle, setSameStyle] = useState(false);

  const result = useMemo(() => {
    const wins = Math.max(0, Math.min(20, Number(sharedWins) || 0));
    const winPts = wins * 5; // shared G1 wins are the biggest race-affinity driver
    const relPts = RELATIONSHIP_PTS[relationship];
    const distPts = sameDistance ? 12 : 0;
    const stylePts = sameStyle ? 8 : 0;
    const score = Math.min(100, winPts + relPts + distPts + stylePts);
    return { score, rating: affinityRating(score), winPts, relPts, distPts, stylePts };
  }, [sharedWins, relationship, sameDistance, sameStyle]);

  const inputClass =
    'w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20';

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">Shared G1 race wins between the two parents</label>
          <input type="number" min="0" max="20" step="1" value={sharedWins} onChange={(e) => setSharedWins(e.target.value)} className={inputClass} />
          <div className="mt-1 text-xs text-ink-400">Count the major races BOTH parents have won — the single biggest affinity driver.</div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">Relationship between the parents</label>
          <select
            value={relationship}
            onChange={(e) => setRelationship(e.target.value as Relationship)}
            className={inputClass}
          >
            {(['none', 'minor', 'strong'] as Relationship[]).map((r) => (
              <option key={r} value={r}>{RELATIONSHIP_LABEL[r]}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={sameDistance} onChange={(e) => setSameDistance(e.target.checked)} className="h-4 w-4 accent-wa-green" />
            Same distance aptitude
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={sameStyle} onChange={(e) => setSameStyle(e.target.checked)} className="h-4 w-4 accent-wa-green" />
            Same running style
          </label>
        </div>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/20">
        <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-wa-teal">Estimated breeding affinity</div>
        <div className="flex items-baseline gap-4">
          <div className={`font-display text-7xl font-bold sm:text-8xl ${result.rating.color}`}>{result.rating.symbol}</div>
          <div className="text-base text-ink-500">
            <div className="font-display text-3xl font-bold text-ink-900">{result.score}<span className="text-lg text-ink-400">/100</span></div>
            <div className={`font-semibold ${result.rating.color}`}>{result.rating.label}</div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 border-t border-wa-green/20 pt-4 sm:grid-cols-4">
          <StatBlock label="Shared wins" value={`+${result.winPts}`} />
          <StatBlock label="Relationship" value={`+${result.relPts}`} />
          <StatBlock label="Distance" value={`+${result.distPts}`} />
          <StatBlock label="Style" value={`+${result.stylePts}`} />
        </div>

        <div className="mt-4 rounded-lg bg-white px-4 py-3 text-sm text-ink-500 shadow-soft">
          <strong className="text-ink-900">Note:</strong> this estimates in-game affinity (相性) from its main drivers —
          shared race wins and parent relationships. The exact ◎/○/△/✕ symbol in-game also factors fixed
          per-character relationship values, so treat this as a strong guide for picking inherit pairs, not an exact table lookup.
        </div>

        {(() => {
          const cta = buildToolPrefill('uma-affinity-calculator', { score: result.score });
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
