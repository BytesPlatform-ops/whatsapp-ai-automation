'use client';

import { NavAuth } from '@/components/auth/NavAuth';

/**
 * Floating auth entry for the homepage. The Pixie master-hero currently ships
 * with its full navbar disabled (SHOW_PIXIE_NAVBAR=false while the scroll-flight
 * is tuned), so this gives signed-out visitors a reliable Log in / Sign up — and
 * signed-in users a Dashboard shortcut — without touching that hero. Themed to
 * the hero's live --accent, frosted, top-right, above the hero canvas.
 */
export function HomeAuthCorner() {
  return (
    <div className="fixed right-3 top-3 z-[80] flex items-center gap-1.5 rounded-full border border-white/10 bg-[#02070a]/55 px-2.5 py-1.5 shadow-lg shadow-black/30 backdrop-blur-md sm:right-6 sm:top-5">
      <NavAuth variant="desktop" themed />
    </div>
  );
}
