'use client';

import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';

/**
 * PixieLabEntry — a floating "Enter Pixie Lab" pill on the landing page, so the
 * authenticated Lab is reachable as part of the whole site (the master-hero
 * navbar is disabled). Bottom-right, frosted, themed to the hero's --accent.
 * Self-contained: dropped into app/page.tsx; touches no shared/auth files.
 */
export function PixieLabEntry() {
  return (
    <Link
      href="/pixie-lab/dashboard"
      aria-label="Enter Pixie Lab"
      className="group fixed bottom-5 right-5 z-[80] inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#02070a]/70 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/40 backdrop-blur-md transition-transform hover:-translate-y-0.5 sm:bottom-6 sm:right-6"
      style={{ boxShadow: '0 14px 40px color-mix(in srgb, var(--accent) 26%, transparent)' }}
    >
      <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-[#25D366] to-[#22d3ee] text-[#02070a]">
        <Sparkles size={13} strokeWidth={2.5} />
      </span>
      Enter Pixie Lab
      <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
