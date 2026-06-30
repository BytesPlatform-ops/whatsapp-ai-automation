'use client';

import { Headset, Globe, Megaphone, Clapperboard, Search, Lock, type LucideIcon } from 'lucide-react';
import { type FeedAgent, AGENT_META, UPSELL_COPY } from '@/lib/pixie-lab/feed';

/**
 * UpsellTicker — horizontal auto-scrolling marquee of agents the user does NOT
 * own. Pauses on hover; each item expands to a small card with what the agent
 * does, an example outcome, and [Start free trial] + [Unlock] CTAs. Hidden when
 * the user owns everything (parent passes an empty lockedAgents list).
 *
 * Marquee = two duplicated tracks scrolling left via the `pl-marquee` keyframes
 * (see globals additions); `group-hover` pauses it. Prop-driven + reusable.
 */

const ICONS: Record<FeedAgent, LucideIcon> = {
  website: Globe,
  receptionist: Headset,
  seo: Search,
  marketing: Megaphone,
  content: Clapperboard,
  pixie: Lock,
};

const ACCENT: Record<FeedAgent, string> = {
  website: '#3B82F6',
  receptionist: '#E6B45A',
  seo: '#14B8A6',
  marketing: '#EC4899',
  content: '#D4AF37',
  pixie: '#94A3B8',
};

function TickerItem({
  agent,
  onStartTrial,
  onUnlock,
}: {
  agent: FeedAgent;
  onStartTrial?: (a: FeedAgent) => void;
  onUnlock?: (a: FeedAgent) => void;
}) {
  const Icon = ICONS[agent];
  const accent = ACCENT[agent];
  const meta = AGENT_META[agent];
  const copy = UPSELL_COPY[agent];

  // A self-contained mini-card (the ticker scrolls a row of these).
  return (
    <div
      className="group/card relative w-[290px] flex-none overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 backdrop-blur-md transition-colors hover:border-white/20"
      style={{ ['--a' as string]: accent }}
    >
      <div className="absolute left-0 top-0 h-full w-1" style={{ background: accent }} />
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover/card:opacity-25" style={{ background: accent }} />

      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${accent}1f`, color: accent }}>
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-[14px] font-bold text-white">{meta.label} Builder</p>
          <p className="truncate text-[11.5px] text-white/45">Locked · try it free</p>
        </div>
      </div>

      <p className="mt-2.5 line-clamp-2 text-[12px] leading-relaxed text-white/60">{copy.does}</p>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onStartTrial?.(agent)}
          className="flex-1 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[11.5px] font-semibold text-white/80 transition hover:text-white"
        >
          Free trial
        </button>
        <button
          onClick={() => onUnlock?.(agent)}
          className="flex-1 rounded-full px-3 py-1.5 text-[11.5px] font-bold"
          style={{ background: accent, color: '#02070a' }}
        >
          Unlock
        </button>
      </div>
    </div>
  );
}

export function UpsellTicker({
  lockedAgents,
  onStartTrial,
  onUnlock,
}: {
  lockedAgents: FeedAgent[];
  onStartTrial?: (a: FeedAgent) => void;
  onUnlock?: (a: FeedAgent) => void;
}) {
  if (!lockedAgents.length) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-[#25D366]/25 bg-[#25D366]/10 px-3.5 py-1.5 text-[12.5px] font-medium text-[#7ef0a8]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#25D366]" /> All Pixie agents active
      </div>
    );
  }

  // Duplicate the track so the marquee loops seamlessly. Pause on hover via group.
  const track = [...lockedAgents, ...lockedAgents];

  return (
    <div className="group relative overflow-hidden">
      <style>{`
        @keyframes pl-marquee-kf { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .pl-marquee { animation: pl-marquee-kf 28s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .pl-marquee { animation: none; } }
      `}</style>
      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[#02070a] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[#02070a] to-transparent" />
      <div className="flex w-max gap-3 pl-marquee group-hover:[animation-play-state:paused]">
        {track.map((a, i) => (
          <TickerItem key={`${a}-${i}`} agent={a} onStartTrial={onStartTrial} onUnlock={onUnlock} />
        ))}
      </div>
    </div>
  );
}
