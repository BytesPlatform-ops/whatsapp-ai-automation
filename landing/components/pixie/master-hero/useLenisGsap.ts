'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

/**
 * Lenis smooth scroll synced to GSAP on a SINGLE shared ticker (no second RAF
 * loop). Enabled only when `enabled` (desktop, motion allowed). Returns a ref
 * to the Lenis instance for scrollTo. Fully cleaned up on disable/unmount.
 */
export function useLenisGsap(enabled: boolean) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (!enabled) return;
    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({ smoothWheel: true, lerp: 0.08 });
    lenisRef.current = lenis;
    // Exposed so the loading intro can stop/reset scroll while it plays and
    // start it again afterwards (keeps the page pinned to the top during intro).
    (window as unknown as { __pixieLenis?: Lenis }).__pixieLenis = lenis;

    const onScroll = () => ScrollTrigger.update();
    lenis.on('scroll', onScroll);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.off('scroll', onScroll);
      lenis.destroy();
      lenisRef.current = null;
      delete (window as unknown as { __pixieLenis?: Lenis }).__pixieLenis;
    };
  }, [enabled]);

  return lenisRef;
}
