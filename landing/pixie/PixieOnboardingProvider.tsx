'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

// Lazy-load the swipe deck so the onboarding bundle is only fetched when a
// "Join Pixie" CTA is actually clicked.
const SwipeDeck = dynamic(() => import('./SwipeDeck').then((m) => m.SwipeDeck), { ssr: false });

interface OnboardingCtx {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const Ctx = createContext<OnboardingCtx>({ open: () => {}, close: () => {}, isOpen: false });

/** Central handler — wire every Join Pixie CTA to `open()`. */
export function useJoinPixie() {
  return useContext(Ctx);
}

/**
 * PixieOnboardingProvider — renders ONE shared onboarding modal (the six
 * problem cards → waitlist) and exposes open/close via context. Wrap the app
 * (or homepage) with it so any CTA can start onboarding without duplicating the
 * modal. Portaled to <body>, scroll-locked, ESC-closable, role="dialog".
 */
export function PixieOnboardingProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <Ctx.Provider value={{ open: () => setOpen(true), close: () => setOpen(false), isOpen: open }}>
      {children}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="fixed inset-0 z-[100] flex items-stretch justify-center overflow-y-auto overflow-x-hidden bg-[#070710]/90 p-0 backdrop-blur-md sm:items-center sm:p-4"
                onClick={(e) => {
                  if (e.target === e.currentTarget) setOpen(false);
                }}
                role="dialog"
                aria-modal="true"
                aria-label="Join the Pixie waitlist"
              >
                <div aria-hidden className="pointer-events-none fixed -left-24 top-10 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-3xl" />
                <div aria-hidden className="pointer-events-none fixed -right-24 bottom-10 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="fixed right-4 top-4 z-[110] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/20 hover:text-white"
                >
                  <X className="h-5 w-5" strokeWidth={2.5} />
                </button>

                <motion.div
                  initial={{ opacity: 0, scale: 0.97, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 12 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="relative flex h-[100dvh] w-full flex-col px-4 pb-5 pt-16 sm:block sm:h-auto sm:max-w-md sm:p-0"
                >
                  <div className="mb-4 shrink-0 pr-12 sm:mb-5">
                    <h2 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-[28px]">
                      Which problems sound like yours?
                    </h2>
                  </div>
                  <SwipeDeck />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </Ctx.Provider>
  );
}
