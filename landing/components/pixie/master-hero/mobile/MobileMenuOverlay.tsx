'use client';

import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { usePrimaryCta } from '@/components/auth/usePrimaryCta';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/ai-receptionist', label: 'AI Receptionist' },
  { href: '/website-builder', label: 'Website Builder' },
  { href: '/social-media-marketing', label: 'Social Media' },
  { href: '/ai-influencer', label: 'AI Influencer' },
  { href: '/seo-audit', label: 'SEO Audit' },
  { href: '/omnichannel-ai', label: 'Omnichannel AI' },
];

/**
 * MobileMenuOverlay — premium full-screen menu. Locks body scroll, closes on
 * ESC / link tap, focuses + traps within the panel, and uses the active role
 * accent (inherited from :root) for the CTA + accents.
 */
export function MobileMenuOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const primaryCta = usePrimaryCta();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  return (
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Menu" className={`m-menu${open ? ' is-open' : ''}`}>
      <div className="m-menu-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pixie-logo-white.png" alt="Pixie" className="h-7 w-auto" />
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close menu" className="m-icon-btn">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <nav className="m-menu-links">
        {LINKS.map((l, i) => (
          <a key={l.href} href={l.href} onClick={onClose} className="m-menu-link" style={{ animationDelay: open ? `${80 + i * 45}ms` : '0ms' }}>
            {l.label}
          </a>
        ))}
      </nav>
      <div className="m-menu-cta-wrap">
        {/* One auth-aware CTA — the exact same source of truth as the hero.
            Signed in → "Enter Pixie Lab" → /pixie-lab/for-you; signed out →
            "Join Pixie" → /login (NO waitlist). */}
        <a
          href={primaryCta.href}
          onClick={onClose}
          data-testid="mobile-menu-primary-cta"
          className="m-primary-cta group w-full"
        >
          <span>{primaryCta.label}</span>
          {primaryCta.showArrow && <ArrowRight className="m-cta-arrow h-4 w-4" />}
        </a>
      </div>
    </div>
  );
}
