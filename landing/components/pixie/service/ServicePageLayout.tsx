'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * ServicePageLayout — dark themed shell for every Pixie product page. Sets the
 * per-role --accent / --soft CSS vars on a wrapper so all children recolour
 * from one place, renders a minimal top bar (logo home + secondary WhatsApp
 * contact), and an optional mobile sticky "Start My Setup" CTA that only
 * appears after the user scrolls past the hero so it never blocks content.
 */
export function ServicePageLayout({
  accent,
  soft,
  serviceLabel,
  stickyCtaLabel,
  onStickyCta,
  children,
}: {
  accent: string;
  soft: string;
  serviceLabel: string;
  stickyCtaLabel: string;
  onStickyCta: () => void;
  children: ReactNode;
}) {
  const [showSticky, setShowSticky] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowSticky(window.scrollY > 700);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className="pixie-service relative min-h-screen overflow-x-clip"
      style={{ ['--accent' as string]: accent, ['--soft' as string]: soft }}
    >
      {/* Top bar */}
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
          <a href="/" className="flex items-center gap-2" aria-label="Pixie home">
            <img src="/pixie-logo-white.png" alt="Pixie" className="h-7 w-auto" />
          </a>
          <a
            href="/"
            className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/80 backdrop-blur-md transition-colors hover:text-white"
          >
            ← All Pixie modes
          </a>
        </div>
      </header>

      {children}

      {/* Mobile sticky CTA */}
      <div
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 transition-transform duration-300 lg:hidden ${
          showSticky ? 'translate-y-0' : 'translate-y-[140%]'
        }`}
        style={{
          background: 'linear-gradient(to top, #070b14 60%, transparent)',
        }}
      >
        <button
          type="button"
          onClick={onStickyCta}
          className="pointer-events-auto flex h-[52px] w-full items-center justify-center rounded-full text-sm font-bold tracking-wide active:scale-[0.98]"
          style={{ background: 'var(--accent)', color: '#06110c', boxShadow: '0 12px 36px color-mix(in srgb, var(--accent) 36%, transparent)' }}
          aria-label={`${stickyCtaLabel} for ${serviceLabel}`}
        >
          {stickyCtaLabel}
        </button>
      </div>
    </div>
  );
}
