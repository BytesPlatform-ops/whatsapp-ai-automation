'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { usePrimaryCta } from './usePrimaryCta';

/**
 * Shared, resolver-driven primary CTA for the landing page (desktop). Same
 * single source of truth as the mobile hero/menu CTA (usePrimaryCta):
 *   signed out → "Join Pixie" → /login
 *   signed in  → "Enter Pixie Lab" → /pixie-lab/for-you
 * Themed to the hero's live --accent (with a green fallback for first paint /
 * pages that don't set the var), with an arrow that nudges on hover.
 */
export function PrimaryCtaButton({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md';
  className?: string;
}) {
  const cta = usePrimaryCta();
  const sizeCls = size === 'sm' ? 'h-11 gap-1.5 px-5 text-sm' : 'h-[52px] gap-2 px-7 text-[15px]';
  return (
    <Link
      href={cta.href}
      data-testid="desktop-primary-cta"
      aria-label={cta.label}
      className={`group inline-flex items-center justify-center rounded-full font-bold transition-transform hover:-translate-y-0.5 ${sizeCls} ${className}`}
      style={{
        background: 'var(--accent, #25D366)',
        color: 'var(--button-text, #05140c)',
        boxShadow: '0 14px 40px color-mix(in srgb, var(--accent, #25D366) 30%, transparent)',
      }}
    >
      {cta.label}
      {cta.showArrow && (
        <ArrowRight className={`${size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]'} transition-transform group-hover:translate-x-0.5`} />
      )}
    </Link>
  );
}
