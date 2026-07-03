'use client';

import { PrimaryCtaButton } from '@/components/auth/PrimaryCtaButton';

/**
 * Floating auth entry for the homepage (desktop only — the hero navbar is
 * disabled while the scroll-flight is tuned). One resolver-driven CTA: signed
 * out → "Join Pixie" → /login, signed in → "Enter Pixie Lab" → /pixie-lab/for-you.
 * Same single source of truth as the mobile hero/menu CTA, so there's exactly
 * one primary CTA per auth state. Hidden below lg (mobile uses the hero CTA).
 */
export function HomeAuthCorner() {
  return (
    <div className="fixed right-6 top-5 z-[80] hidden lg:block">
      <PrimaryCtaButton size="sm" />
    </div>
  );
}
