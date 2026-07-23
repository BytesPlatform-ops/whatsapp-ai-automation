'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * ServiceTabs — in-shell sub-navigation for a service (e.g. Content → Overview /
 * Content Agent / … / AI Influencer). Horizontally scrollable so the last tab is
 * always reachable at any width: trackpad/wheel + touch swipe scroll, the active
 * (and keyboard-focused) tab auto-scrolls into view, edge fades + desktop arrows
 * appear only when content overflows, and reduced-motion is respected. Active state
 * uses longest-prefix match so nested detail routes still highlight their tab.
 */
export interface ServiceTab { label: string; href: string }

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The tab whose href is the longest prefix of the current path (or exact match). */
function activeHref(tabs: ServiceTab[], pathname: string): string {
  let best = '';
  for (const t of tabs) {
    if (pathname === t.href || pathname.startsWith(t.href + '/')) {
      if (t.href.length > best.length) best = t.href;
    }
  }
  return best;
}

export function ServiceTabs({ tabs, accent }: { tabs: ServiceTab[]; accent: string }) {
  const pathname = usePathname() || '';
  const active = activeHref(tabs, pathname);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setOverflow({ left: el.scrollLeft > 1, right: el.scrollLeft < maxScroll - 1 });
  }, []);

  // Track overflow on mount, resize and scroll.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    measure();
    const onScroll = () => measure();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, tabs.length]);

  // Bring the active tab into view whenever the route changes.
  useEffect(() => {
    const node = activeRef.current;
    if (!node) return;
    node.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
  }, [active]);

  const scrollBy = useCallback((dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.6), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);

  // Vertical trackpad/mouse-wheel → horizontal scroll (only when it would move).
  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // already horizontal
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) return;
    const next = el.scrollLeft + e.deltaY;
    if (next >= 0 && next <= maxScroll) {
      e.preventDefault();
      el.scrollLeft = next;
    }
  }, []);

  // Keep a keyboard-focused (possibly off-screen) tab visible.
  const onFocusTab = useCallback((e: React.FocusEvent<HTMLAnchorElement>) => {
    e.currentTarget.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
  }, []);

  return (
    <div className="relative mt-6">
      {/* Left fade + arrow */}
      <div aria-hidden className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-[var(--pl-bg,var(--pl-surface))] to-transparent transition-opacity ${overflow.left ? 'opacity-100' : 'opacity-0'}`} />
      {overflow.left && (
        <button type="button" aria-label="Scroll tabs left" onClick={() => scrollBy(-1)}
          className="absolute -left-1 top-1/2 z-20 hidden -translate-y-1/2 rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface)] p-1 text-[var(--pl-text-muted)] shadow-sm hover:text-[var(--pl-text)] sm:block">
          <ChevronLeft size={16} aria-hidden />
        </button>
      )}

      <nav
        ref={scrollerRef}
        onWheel={onWheel}
        aria-label="Content sections"
        className="flex gap-1.5 overflow-x-auto scroll-px-4 border-b border-[var(--pl-border)] px-1 pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => {
          const isActive = t.href === active;
          return (
            <Link
              key={t.href}
              ref={isActive ? activeRef : undefined}
              href={t.href}
              aria-current={isActive ? 'page' : undefined}
              onFocus={onFocusTab}
              className="relative whitespace-nowrap rounded-t-lg px-3.5 py-2 text-[13.5px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--pl-green)] focus-visible:ring-offset-0"
              style={isActive
                ? { color: accent, background: `color-mix(in srgb, ${accent} 12%, transparent)` }
                : { color: 'var(--pl-text-muted)' }}
            >
              {t.label}
              {isActive && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full" style={{ background: accent }} />}
            </Link>
          );
        })}
      </nav>

      {/* Right fade + arrow */}
      <div aria-hidden className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-[var(--pl-bg,var(--pl-surface))] to-transparent transition-opacity ${overflow.right ? 'opacity-100' : 'opacity-0'}`} />
      {overflow.right && (
        <button type="button" aria-label="Scroll tabs right" onClick={() => scrollBy(1)}
          className="absolute -right-1 top-1/2 z-20 hidden -translate-y-1/2 rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface)] p-1 text-[var(--pl-text-muted)] shadow-sm hover:text-[var(--pl-text)] sm:block">
          <ChevronRight size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}
