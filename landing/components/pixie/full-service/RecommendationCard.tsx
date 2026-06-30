'use client';

import { ChevronRight, Sparkles } from 'lucide-react';
import type { RecommendationCard as RecommendationCardType } from '@/lib/full-service-data';

/**
 * RecommendationCard — a single Spotify/Pinterest-style business action card for
 * the full-service masonry feed. Collapsed shows title + a 2-line idea; on hover
 * it expands to reveal the full idea, "why Pixie suggested this", prepared
 * outputs, an approval-needed label, and the action buttons. Prop-driven.
 */

const PRIORITY_DOT: Record<string, string> = { urgent: '#ef4444', high: '#f59e0b', medium: '#22d3ee', low: '#64748b' };

export function RecommendationCard({
  card,
  accent,
  onAction,
}: {
  card: RecommendationCardType;
  accent: string;
  onAction: (m: string) => void;
}) {
  return (
    <div className="group rounded-[1.4rem] border border-white/10 bg-white/[0.035] p-[1.6rem] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-white/20">
      <div className="flex items-center gap-2.5">
        <span className="rounded-full px-2.5 py-1 text-[13px] font-semibold" style={{ background: `${accent}1f`, color: accent }}>{card.category}</span>
        {card.routedTo && <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[13px] text-white/55">→ {card.routedTo}</span>}
        <span className="ml-auto flex items-center gap-1.5 text-[12px] uppercase tracking-wider text-white/35"><span className="h-2 w-2 rounded-full" style={{ background: PRIORITY_DOT[card.priority] }} />{card.priority}</span>
      </div>
      <h3 className="mt-3.5 font-display text-[20px] font-bold leading-snug">{card.title}</h3>
      <p className="mt-1.5 text-[17px] leading-relaxed text-white/55 line-clamp-2 group-hover:line-clamp-none">{card.fullIdea}</p>
      <div className="grid grid-rows-[0fr] transition-all duration-300 group-hover:grid-rows-[1fr]">
        <div className="overflow-hidden">
          <div className="mt-3.5 flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
            <Sparkles size={16} className="mt-0.5 flex-none" style={{ color: accent }} />
            <p className="text-[15px] leading-snug text-white/50">{card.whyPixieSuggested}</p>
          </div>
          {card.preparedOutputs.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {card.preparedOutputs.map((o) => <span key={o} className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[13.5px] text-white/60">{o}</span>)}
            </div>
          )}
          {card.approvalRequired && <p className="mt-2.5 text-[14px] font-semibold text-amber-300">Needs permission before execution</p>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2.5">
        <button onClick={() => onAction(`${card.primaryCta} · ${card.title}`)} className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-[15px] font-bold" style={{ background: accent, color: '#02070a' }}>{card.primaryCta} <ChevronRight size={16} /></button>
        {card.approvalRequired && <button onClick={() => onAction(`Approved · ${card.title}`)} className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-[15px] font-semibold text-white/75">Approve</button>}
        <button onClick={() => onAction('Skipped')} className="rounded-full px-4 py-2 text-[15px] font-semibold text-white/40">Skip</button>
      </div>
    </div>
  );
}
