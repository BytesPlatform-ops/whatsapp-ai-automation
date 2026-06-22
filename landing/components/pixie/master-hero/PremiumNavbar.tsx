'use client';

import { useEffect, useState } from 'react';
import { waLink } from '@/lib/config';
import { MobileMenu } from './MobileMenu';

const LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#services', label: 'Services' },
  { href: '/examples', label: 'Examples' },
  { href: '/#results', label: 'Results' },
  { href: '/#faq', label: 'FAQ' },
];

/**
 * PremiumNavbar — transparent at the top, frosted glass after ~60px. A thin
 * accent scroll-progress hairline sits at the bottom. CTA + link underline +
 * hairline all use the active role's --accent (inherited from :root, which the
 * hero tweens). Entrance animation staggers logo → links → CTA on mount.
 */
export function PremiumNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 60);
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, y / max) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-[60] transition-all duration-300 ${
          scrolled ? 'border-b border-white/10 bg-[#02070a]/70 backdrop-blur-[14px]' : 'bg-transparent'
        }`}
        style={scrolled ? { borderBottomColor: 'color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.08))' } : undefined}
      >
        <div className="container-page flex h-20 items-center justify-between">
          {/* Logo */}
          <a href="/" className="mh-nav-enter flex items-center" style={{ animationDelay: '0ms' }} aria-label="Pixie home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pixie-logo-white.png" alt="Pixie" className="h-7 w-auto" />
          </a>

          {/* Links */}
          <nav className="hidden items-center gap-7 lg:flex">
            {LINKS.map((l, i) => (
              <a
                key={l.href}
                href={l.href}
                className="mh-nav-enter mh-nav-link relative text-sm font-medium tracking-[0.02em] text-white/70 transition-colors hover:text-white"
                style={{ animationDelay: `${60 + i * 55}ms` }}
              >
                {l.label}
              </a>
            ))}
          </nav>

          {/* CTA (desktop) + hamburger (mobile) */}
          <div className="flex items-center gap-3">
            <a
              href={waLink('Hi! I found Pixie and want to know more.')}
              className="mh-nav-enter hidden h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition-transform hover:-translate-y-0.5 lg:inline-flex"
              style={{
                animationDelay: '380ms',
                background: 'var(--accent)',
                color: 'var(--button-text)',
                boxShadow: '0 12px 36px color-mix(in srgb, var(--accent) 26%, transparent)',
              }}
            >
              Chat now
            </a>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="pixie-mobile-menu"
              className="mh-nav-enter flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white lg:hidden"
              style={{ animationDelay: '120ms' }}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scroll-progress hairline */}
        <div
          aria-hidden
          className="absolute bottom-0 left-0 h-px origin-left"
          style={{ width: '100%', transform: `scaleX(${progress})`, background: 'var(--accent)', opacity: scrolled ? 0.9 : 0.4 }}
        />
      </header>

      <div id="pixie-mobile-menu">
        <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      </div>
    </>
  );
}
