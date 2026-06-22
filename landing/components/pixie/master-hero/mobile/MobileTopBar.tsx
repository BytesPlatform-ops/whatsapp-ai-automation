'use client';

/**
 * MobileTopBar — fixed, safe-area-aware top bar. Transparent at the top,
 * frosted after scroll. Logo left, hamburger right. The hamburger opens the
 * full-screen overlay menu.
 */
export function MobileTopBar({ scrolled, onOpenMenu, menuOpen }: { scrolled: boolean; onOpenMenu: () => void; menuOpen: boolean }) {
  return (
    <header className={`m-topbar${scrolled ? ' is-scrolled' : ''}`}>
      <a href="/" aria-label="Pixie home" className="flex items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pixie-logo-white.png" alt="Pixie" className="h-7 w-auto" />
      </a>
      <button type="button" onClick={onOpenMenu} aria-label="Open menu" aria-expanded={menuOpen} aria-controls="m-menu-overlay" className="m-icon-btn">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
    </header>
  );
}
