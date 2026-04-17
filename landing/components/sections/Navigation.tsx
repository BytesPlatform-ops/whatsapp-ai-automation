'use client';

import { useEffect, useState } from 'react';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { siteConfig } from '@/lib/config';

const links = [
  { href: '/#how', label: 'How it works' },
  { href: '/#services', label: 'Services' },
  { href: '/examples', label: 'Examples' },
  { href: '/#results', label: 'Results' },
  { href: '/#faq', label: 'FAQ' },
];

export function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-white/10 bg-navy-900/80 backdrop-blur-lg'
          : 'bg-transparent'
      }`}
    >
      <div className="container-page flex h-20 items-center justify-between">
        <a href="#" className="flex items-center text-white" aria-label={siteConfig.brand}>
          <img
            src="/pixie-logo-white.png"
            alt={siteConfig.brand}
            className="h-16 w-auto object-contain"
          />
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-white/75 transition hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <WhatsAppButton size="md" label="Chat now" prefill="Hi! Coming from your site." />
          </div>
          <button
            aria-label="Toggle menu"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 md:hidden"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {open ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-white/10 bg-navy-900/95 backdrop-blur-lg md:hidden">
          <div className="container-page flex flex-col gap-1 py-3">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/5"
              >
                {l.label}
              </a>
            ))}
            <div className="pt-2">
              <WhatsAppButton size="md" label="Chat on WhatsApp" className="w-full" />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
