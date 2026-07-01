'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Headset, Globe, Megaphone, Clapperboard, Search, Lock, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { type FeedAgent, AGENT_META, UPSELL_COPY } from '@/lib/pixie-lab/feed';

/**
 * UpsellTicker — a horizontal carousel of agents the user does NOT own. It is a
 * real scroll container (not a transform marquee), so it is fully usable:
 *   • mouse drag  • trackpad horizontal scroll  • touch swipe (native)
 *   • left/right arrow buttons  • CSS scroll-snap
 * Hover no longer freezes it (there is no auto-scroll to fight). Card clicks
 * still work — a drag past a small threshold cancels the click. Prop-driven.
 */

const ICONS: Record<FeedAgent, LucideIcon> = {
  website: Globe, receptionist: Headset, seo: Search, marketing: Megaphone, content: Clapperboard, pixie: Lock,
};
const ACCENT: Record<FeedAgent, string> = {
  website: '#3B82F6', receptionist: '#E6B45A', seo: '#14B8A6', marketing: '#EC4899', content: '#D4AF37', pixie: '#94A3B8',
};

const CARD_STEP = 306; // card width (290) + gap (16)

function TickerItem({
  agent, onStartTrial, onUnlock,
}: {
  agent: FeedAgent;
  onStartTrial?: (a: FeedAgent) => void;
  onUnlock?: (a: FeedAgent) => void;
}) {
  const Icon = ICONS[agent];
  const accent = ACCENT[agent];
  const meta = AGENT_META[agent];
  const copy = UPSELL_COPY[agent];

  return (
    <div
      className="group/card relative w-[290px] flex-none snap-start overflow-hidden rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4 shadow-[var(--pl-shadow-sm)] transition-colors hover:border-[var(--pl-border-strong)]"
      style={{ ['--a' as string]: accent }}
    >
      <div className="absolute left-0 top-0 h-full w-1" style={{ background: accent }} />
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover/card:opacity-25" style={{ background: accent }} />

      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${accent}1f`, color: accent }}>
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-[14px] font-bold text-[var(--pl-text)]">{meta.label} Builder</p>
          <p className="truncate text-[11.5px] text-[var(--pl-text-muted)]">Locked · try it free</p>
        </div>
      </div>

      <p className="mt-2.5 line-clamp-2 text-[12px] leading-relaxed text-[var(--pl-text-soft)]">{copy.does}</p>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onStartTrial?.(agent)}
          className="flex-1 rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]"
        >
          Free trial
        </button>
        <button
          onClick={() => onUnlock?.(agent)}
          className="flex-1 rounded-full px-3 py-1.5 text-[11.5px] font-bold text-white"
          style={{ background: accent }}
        >
          Unlock
        </button>
      </div>
    </div>
  );
}

export function UpsellTicker({
  lockedAgents, onStartTrial, onUnlock,
}: {
  lockedAgents: FeedAgent[];
  onStartTrial?: (a: FeedAgent) => void;
  onUnlock?: (a: FeedAgent) => void;
}) {
  const viewport = useRef<HTMLDivElement | null>(null);
  const drag = useRef({ down: false, startX: 0, startScroll: 0, moved: false });
  const [dragging, setDragging] = useState(false);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = viewport.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = viewport.current;
    if (!el) return;
    el.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [updateArrows, lockedAgents.length]);

  function step(dir: 1 | -1) {
    viewport.current?.scrollBy({ left: dir * CARD_STEP, behavior: 'smooth' });
  }

  // Mouse/pointer drag-to-scroll (touch uses native scrolling).
  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'touch') return; // let native touch scroll handle it
    const el = viewport.current;
    if (!el) return;
    drag.current = { down: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent) {
    const el = viewport.current;
    if (!el || !drag.current.down) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    el.scrollLeft = drag.current.startScroll - dx;
  }
  function endDrag() {
    if (!drag.current.down) return;
    drag.current.down = false;
    setDragging(false);
  }
  // If the pointer moved (a drag), swallow the click so cards don't fire mid-drag.
  function onClickCapture(e: React.MouseEvent) {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  }

  if (!lockedAgents.length) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--pl-green)_30%,var(--pl-border))] bg-[var(--pl-green-soft)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--pl-green-dark)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--pl-green)]" /> All Pixie agents active
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Arrow controls (hidden on touch-first small screens where swipe is natural) */}
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={!canLeft}
        aria-label="Scroll left"
        className="absolute -left-3 top-1/2 z-20 hidden -translate-y-1/2 place-items-center rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface)] p-2 text-[var(--pl-text-soft)] shadow-[var(--pl-shadow-sm)] transition hover:text-[var(--pl-text)] disabled:pointer-events-none disabled:opacity-0 sm:grid"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={!canRight}
        aria-label="Scroll right"
        className="absolute -right-3 top-1/2 z-20 hidden -translate-y-1/2 place-items-center rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface)] p-2 text-[var(--pl-text-soft)] shadow-[var(--pl-shadow-sm)] transition hover:text-[var(--pl-text)] disabled:pointer-events-none disabled:opacity-0 sm:grid"
      >
        <ChevronRight size={16} />
      </button>

      <div
        ref={viewport}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
        className={`flex gap-4 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${dragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
        style={{ scrollSnapType: 'x proximity' }}
      >
        {lockedAgents.map((a) => (
          <TickerItem key={a} agent={a} onStartTrial={onStartTrial} onUnlock={onUnlock} />
        ))}
      </div>
    </div>
  );
}
