'use client';

import { useRouter } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { getPixieUnitBySlug } from '@/lib/agents';

/**
 * OpenFullServiceButton — routes to a unit's full-service pipeline via the
 * registry (never a hand-built path). Works for every agent and Omni.
 */
export function OpenFullServiceButton({
  slug,
  accent,
  children = 'Open full service',
}: {
  slug: string;
  accent?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const unit = getPixieUnitBySlug(slug);

  return (
    <button
      type="button"
      onClick={() => router.push(unit?.fullServicePath ?? '/app/dashboard')}
      className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-transform hover:-translate-y-0.5"
      style={{ background: accent ?? unit?.accent ?? '#25D366', color: '#02070a' }}
    >
      {children} <ArrowUpRight size={15} />
    </button>
  );
}
