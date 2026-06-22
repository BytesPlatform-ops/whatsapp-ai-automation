'use client';

import { useCallback, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { hexToRgbString, getReadableButtonText, interpolateColor } from '../mascot-role-hero/colorUtils';
import { type RoleTheme } from './themeMap';

/**
 * Adaptive theming for the master hero. Writes the accent CSS vars to
 * `document.documentElement` so BOTH the hero AND the fixed navbar inherit
 * them. Tweens accent/soft/rgb/button-text over ~600ms (reads live values so
 * rapid changes chain smoothly); applies instantly under reduced motion.
 */
export function useAdaptiveTheme(initial: RoleTheme, reducedMotion: boolean) {
  const currentRef = useRef<RoleTheme>(initial);
  const proxyRef = useRef({ p: 0 });
  const tweenRef = useRef<ReturnType<typeof gsap.to> | null>(null);

  const root = () => (typeof document !== 'undefined' ? document.documentElement : null);

  const writeVars = useCallback((accent: string, soft: string, buttonText: string, core: number) => {
    const el = root();
    if (!el) return;
    el.style.setProperty('--accent', accent);
    el.style.setProperty('--accent-soft', soft);
    el.style.setProperty('--accent-rgb', hexToRgbString(accent));
    el.style.setProperty('--button-text', buttonText);
    el.style.setProperty('--core-glow-opacity', String(core));
  }, []);

  const applyTheme = useCallback(
    (t: RoleTheme) => {
      writeVars(t.accent, t.soft, getReadableButtonText(t.accent), t.iridescent ? 1 : 0);
      currentRef.current = t;
    },
    [writeVars],
  );

  const tweenTheme = useCallback(
    (t: RoleTheme, animate: boolean) => {
      const el = root();
      if (!el || currentRef.current === t) return;
      if (!animate) {
        applyTheme(t);
        return;
      }
      const fromAccent = el.style.getPropertyValue('--accent') || currentRef.current.accent;
      const fromSoft = el.style.getPropertyValue('--accent-soft') || currentRef.current.soft;
      const fromCore = parseFloat(el.style.getPropertyValue('--core-glow-opacity') || '0') || 0;
      const toCore = t.iridescent ? 1 : 0;
      currentRef.current = t;

      tweenRef.current?.kill();
      const proxy = proxyRef.current;
      proxy.p = 0;
      tweenRef.current = gsap.to(proxy, {
        p: 1,
        duration: 0.6,
        ease: 'power2.inOut',
        onUpdate: () => {
          const k = proxy.p;
          const accent = interpolateColor(fromAccent, t.accent, k);
          const soft = interpolateColor(fromSoft, t.soft, k);
          writeVars(accent, soft, getReadableButtonText(accent), fromCore + (toCore - fromCore) * k);
        },
      });
    },
    [applyTheme, writeVars],
  );

  // Apply the initial theme on mount; clean up tween on unmount.
  useEffect(() => {
    applyTheme(initial);
    return () => {
      tweenRef.current?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { applyTheme, tweenTheme, currentRef };
}
