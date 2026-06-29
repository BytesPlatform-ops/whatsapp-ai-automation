'use client';

import { useEffect, useRef } from 'react';
import { waLink } from '@/lib/config';

const LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#services', label: 'Services' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/examples', label: 'Examples' },
  { href: '/#results', label: 'Results' },
  { href: '/#faq', label: 'FAQ' },
];

/**
 * MobileMenu — full-screen frosted overlay. Locks body scroll, closes on ESC /
 * link click, focuses the close button on open, and keeps focus inside while
 * open. CTA + accents use the active role's --accent.
 */
export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
      className="fixed inset-0 z-[70] flex flex-col bg-[#02070a]/95 backdrop-blur-xl transition-opacity duration-300 lg:hidden"
      style={{ opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
    >
      <div className="container-page flex h-20 items-center justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pixie-logo-white.png" alt="Pixie" className="h-7 w-auto" />
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <nav className="flex flex-1 flex-col items-center justify-center gap-2">
        {LINKS.map((l, i) => (
          <a
            key={l.href}
            href={l.href}
            onClick={onClose}
            className="mh-menu-link py-3 text-2xl font-semibold text-white/90 transition-colors hover:text-white"
            style={{ animationDelay: open ? `${i * 55}ms` : '0ms' }}
          >
            {l.label}
          </a>
        ))}
      </nav>

      <div className="container-page pb-12">
        <a
          href={waLink('Hi! I found Pixie and want to know more.')}
          onClick={onClose}
          className="flex h-14 items-center justify-center rounded-full text-base font-semibold"
          style={{ background: 'var(--accent)', color: 'var(--button-text)', boxShadow: '0 18px 50px color-mix(in srgb, var(--accent) 26%, transparent)' }}
        >
          Chat now
        </a>
      </div>
    </div>
  );
}
