import type { Metadata } from 'next';
import Link from 'next/link';
import { SwipeDeck } from '@/pixie/SwipeDeck';

export const metadata: Metadata = {
  title: 'Join Pixie — Which problems sound like yours?',
  description: 'Tell Pixie about your business and join the waitlist in under a minute.',
  robots: { index: false, follow: true },
};

/**
 * Dedicated onboarding page. Renders the existing SwipeDeck flow (intro →
 * six problem cards → waitlist) as a clean full page — no modal/overlay, no
 * landing UI behind it. The page wrapper mirrors the old modal container so the
 * deck's flex layout (fills on mobile, centred 360px card on desktop) is intact.
 */
export default function JoinPixiePage() {
  return (
    <main className="join-pixie-page flex min-h-[100svh] flex-col">
      <header className="flex items-center justify-between px-5 py-4 sm:px-7">
        <Link href="/" aria-label="Back to Pixie home" className="inline-flex items-center gap-2 text-sm font-semibold text-white/70 transition-colors hover:text-white">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </Link>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pixie-logo-white.png" alt="Pixie" className="h-6 w-auto opacity-90" />
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8 pt-2 sm:justify-center sm:pb-12">
        <h1 className="mb-4 font-display text-2xl font-extrabold tracking-tight text-white sm:mb-5 sm:text-[28px]">
          Which problems sound like yours?
        </h1>
        <SwipeDeck />
      </div>
    </main>
  );
}
