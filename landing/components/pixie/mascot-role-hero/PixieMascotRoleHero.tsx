'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { ROLES, STUDIO_BG_SRC, preloadImage } from './roleData';
import { themeForId, type RoleTheme } from './roleThemes';
import { hexToRgbString, getReadableButtonText, interpolateColor } from './colorUtils';
import { BackgroundLayer } from './BackgroundLayer';
import { MascotLayer } from './MascotLayer';
import { PixieHalo } from './PixieHalo';
import { PropsLayer } from './PropsLayer';
import { ScanRing } from './ScanRing';
import { RoleCopy } from './RoleCopy';
import { RoleCards } from './RoleCards';
import { RoleProgress } from './RoleProgress';
import { MobileRoleTabs } from './MobileRoleTabs';

/**
 * PixieMascotRoleHero — "One AI. Every role your business needs."
 *
 * ONE fixed Pixie robot mascot at centre + a fixed studio background. The role
 * is expressed by the holographic PROPS, copy and cards that morph around the
 * mascot — the mascot itself never changes (it only pulses 1→1.03 on a swap).
 *
 * Desktop (≥768px, motion allowed): roles×100vh scroll wrapper, GSAP-pinned
 * viewport, Lenis smooth scroll on a SINGLE shared ticker, progress→index with
 * gentle snap. Each index change runs the 3-phase timeline (charge → sweep →
 * settle): mascot pulses + accent ScanRing sweeps while copy/cards/props swap
 * behind it (React state + pure-CSS stagger — no Framer Motion in the scroll
 * path). The memoised BackgroundLayer never re-renders.
 *
 * Mobile / reduced-motion: no pin, no sweep — tappable tabs cross-fade.
 */
export function PixieMascotRoleHero() {
  const roles = ROLES;
  const lastIndex = roles.length - 1;

  // GSAP-controlled DOM + transition bookkeeping
  const rootRef = useRef<HTMLElement | null>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const mascotScaleRef = useRef<HTMLDivElement>(null);
  const scanRingRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);

  const currentIndexRef = useRef(0);
  const isTransitioningRef = useRef(false);
  const queuedIndexRef = useRef<number | null>(null);
  const transitionRef = useRef<(next: number) => void>(() => {});

  const [mounted, setMounted] = useState(false);
  const [pinned, setPinned] = useState(true); // SSR/default = desktop pinned
  const [reducedMotion, setReducedMotion] = useState(false);
  const [ready, setReady] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // ── Adaptive per-role theming ────────────────────────────────────────────
  // The hero root (whichever section is rendered) receives the accent CSS vars.
  const themeRootRef = useRef<HTMLElement | null>(null);
  const currentThemeRef = useRef<RoleTheme>(themeForId(roles[0].id));
  const themeProxyRef = useRef({ p: 0 });
  const themeTweenRef = useRef<ReturnType<typeof gsap.to> | null>(null);

  // Write a theme to the root instantly (initial paint + reduced motion).
  const applyTheme = useCallback((t: RoleTheme) => {
    const el = themeRootRef.current;
    if (!el) return;
    el.style.setProperty('--accent', t.accent);
    el.style.setProperty('--accent-soft', t.soft);
    el.style.setProperty('--accent-rgb', hexToRgbString(t.accent));
    el.style.setProperty('--button-text', getReadableButtonText(t.accent));
    el.style.setProperty('--core-glow-opacity', t.iridescent ? '1' : '0');
    currentThemeRef.current = t;
  }, []);

  // Tween the accent vars to a role's theme over ~600ms (premium ease).
  // Reads the live values as the start so rapid changes chain smoothly.
  const tweenTheme = useCallback(
    (toId: string, animate: boolean) => {
      const el = themeRootRef.current;
      const to = themeForId(toId);
      if (!el || currentThemeRef.current === to) return;
      if (!animate) {
        applyTheme(to);
        return;
      }
      const fromAccent = el.style.getPropertyValue('--accent') || currentThemeRef.current.accent;
      const fromSoft = el.style.getPropertyValue('--accent-soft') || currentThemeRef.current.soft;
      const fromCore = parseFloat(el.style.getPropertyValue('--core-glow-opacity') || '0') || 0;
      const toCore = to.iridescent ? 1 : 0;
      currentThemeRef.current = to;

      themeTweenRef.current?.kill();
      const proxy = themeProxyRef.current;
      proxy.p = 0;
      themeTweenRef.current = gsap.to(proxy, {
        p: 1,
        duration: 0.6,
        ease: 'power2.inOut',
        onUpdate: () => {
          const t = proxy.p;
          const accent = interpolateColor(fromAccent, to.accent, t);
          const soft = interpolateColor(fromSoft, to.soft, t);
          el.style.setProperty('--accent', accent);
          el.style.setProperty('--accent-soft', soft);
          el.style.setProperty('--accent-rgb', hexToRgbString(accent));
          el.style.setProperty('--button-text', getReadableButtonText(accent));
          el.style.setProperty('--core-glow-opacity', String(fromCore + (toCore - fromCore) * t));
        },
      });
    },
    [applyTheme],
  );

  // Callback ref shared by both section layouts — applies the current theme
  // instantly when the root mounts (no flash, survives pinned↔static swaps).
  const setStageRoot = useCallback(
    (el: HTMLElement | null) => {
      rootRef.current = el;
      themeRootRef.current = el;
      if (el) applyTheme(currentThemeRef.current);
    },
    [applyTheme],
  );

  // Unified role selector for tap/click paths (mobile tabs).
  const selectRole = useCallback(
    (i: number) => {
      setActiveIndex(i);
      currentIndexRef.current = i;
      tweenTheme(roles[i].id, !reducedMotion);
    },
    [roles, reducedMotion, tweenTheme],
  );

  // ── Environment detection ────────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
    // Use the tabbed/static layout below lg (1024px). The pinned desktop hero's
    // cards/props/progress rail are lg-only, so pinning a tablet would leave it
    // sparse; the tabbed layout is the better experience there.
    const compactMq = window.matchMedia('(max-width: 1023px)');
    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setReducedMotion(motionMq.matches);
      setPinned(!compactMq.matches && !motionMq.matches);
    };
    sync();
    compactMq.addEventListener('change', sync);
    motionMq.addEventListener('change', sync);
    return () => {
      compactMq.removeEventListener('change', sync);
      motionMq.removeEventListener('change', sync);
    };
  }, []);

  // Kill any in-flight theme tween on unmount.
  useEffect(() => () => {
    themeTweenRef.current?.kill();
  }, []);

  // ── Preload all role forms + bg before enabling scroll animation ─────────
  useEffect(() => {
    let cancelled = false;
    const assets = [...roles.map((r) => r.image), STUDIO_BG_SRC];
    Promise.all(assets.map(preloadImage)).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [roles]);

  // ── The morph timeline (charge → sweep → settle) ─────────────────────────
  transitionRef.current = (next: number) => {
    const cur = currentIndexRef.current;
    if (next === cur) return;
    if (isTransitioningRef.current) {
      queuedIndexRef.current = next; // queue only the latest intent
      return;
    }

    const mascot = mascotScaleRef.current;
    const ring = scanRingRef.current;

    // No DOM yet, or reduced motion → swap content + theme instantly.
    if (!mascot || !ring || reducedMotion) {
      currentIndexRef.current = next;
      setActiveIndex(next);
      applyTheme(themeForId(roles[next].id));
      return;
    }

    isTransitioningRef.current = true;
    gsap.set([mascot, ring], { willChange: 'transform, opacity' });

    // Fire the accent theme morph at the SAME instant as the avatar/ring (0ms),
    // so colour + form shift together over the transition.
    tweenTheme(roles[next].id, true);

    const h = ring.offsetHeight || 200;
    const ringFrom = -h * 0.55;
    const ringTo = h * 0.55;

    const tl = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
      onComplete: () => {
        gsap.set([mascot, ring], { willChange: 'auto' });
        currentIndexRef.current = next;
        isTransitioningRef.current = false;
        const queued = queuedIndexRef.current;
        queuedIndexRef.current = null;
        if (queued != null && queued !== next) transitionRef.current(queued);
      },
    });

    // Phase 1 — Charge (0–150ms): mascot swells, ring appears.
    tl.to(mascot, { scale: 1.03, duration: 0.15 }, 0);
    tl.fromTo(ring, { opacity: 0, y: ringFrom, scale: 0.95 }, { opacity: 1, scale: 1.04, duration: 0.15 }, 0);

    // Phase 2 — Sweep (150–500ms): ring passes through; swap content mid-sweep.
    tl.to(ring, { y: ringTo, duration: 0.35 }, 0.15);
    tl.add(() => setActiveIndex(next), 0.32);

    // Phase 3 — Settle (500–700ms): ring fades, mascot returns.
    tl.to(ring, { opacity: 0, scale: 1.08, duration: 0.25 }, 0.5);
    tl.to(mascot, { scale: 1, duration: 0.25 }, 0.5);
  };

  // ── Lenis + GSAP ScrollTrigger (desktop, after preload) ──────────────────
  useEffect(() => {
    if (!mounted || !pinned || !ready || !rootRef.current || !pinRef.current) return;

    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({ smoothWheel: true, lerp: 0.08 });
    lenisRef.current = lenis;

    const onLenisScroll = () => ScrollTrigger.update();
    lenis.on('scroll', onLenisScroll);
    const tick = (time: number) => lenis.raf(time * 1000); // single shared ticker
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: rootRef.current!,
        start: 'top top',
        end: 'bottom bottom',
        pin: pinRef.current!,
        pinSpacing: false,
        anticipatePin: 1,
        snap: {
          snapTo: 1 / lastIndex,
          duration: { min: 0.2, max: 0.5 },
          ease: 'power1.inOut',
          delay: 0.06,
        },
        onUpdate: (self) => {
          const idx = Math.round(self.progress * lastIndex);
          transitionRef.current(idx);
        },
      });
    }, rootRef);

    ScrollTrigger.refresh();

    return () => {
      gsap.ticker.remove(tick);
      lenis.off('scroll', onLenisScroll);
      lenis.destroy();
      lenisRef.current = null;
      ctx.revert();
    };
  }, [mounted, pinned, ready, lastIndex]);

  const scrollToIndex = useCallback(
    (i: number) => {
      const root = rootRef.current;
      if (!pinned || !root) {
        currentIndexRef.current = i;
        setActiveIndex(i);
        return;
      }
      const dist = root.offsetHeight - window.innerHeight;
      const target = root.offsetTop + (dist * i) / lastIndex;
      if (lenisRef.current) lenisRef.current.scrollTo(target);
      else window.scrollTo({ top: target, behavior: 'smooth' });
    },
    [pinned, lastIndex],
  );

  const active = roles[activeIndex];

  // ── Static layout: mobile / tablet / reduced-motion ──────────────────────
  if (mounted && !pinned) {
    return (
      <section
        ref={setStageRoot}
        aria-label="Pixie — one AI, every role your business needs"
        className="pixie-stage relative overflow-hidden bg-[#02070a] text-white"
      >
        <BackgroundLayer />
        <div className="container-page relative z-10 mx-auto flex min-h-[100svh] w-full max-w-2xl flex-col items-center gap-5 pb-16 pt-24 sm:gap-6">
          {/* Role chips */}
          <MobileRoleTabs roles={roles} activeIndex={activeIndex} onSelect={selectRole} />
          {/* Mascot + halo */}
          <div className="relative flex h-[34svh] w-full max-w-[280px] items-center justify-center sm:h-[40svh] sm:max-w-sm">
            <PixieHalo />
            <MascotLayer role={active} idle={!reducedMotion} fill />
          </div>
          <RoleCopy role={active} align="center" />
          <div className="w-full max-w-sm sm:max-w-md">
            <RoleCards role={active} align="center" />
          </div>
          <div className="hidden w-full sm:block">
            <PropsLayer role={active} compact />
          </div>
        </div>
      </section>
    );
  }

  // ── Desktop pinned layout (also pre-mount / SSR default) ──────────────────
  return (
    <section
      ref={setStageRoot}
      aria-label="Pixie — one AI, every role your business needs"
      className="pixie-stage relative bg-[#02070a] text-white"
      style={{ height: pinned ? `${roles.length * 100}vh` : '100vh' }}
    >
      <div ref={pinRef} className="relative h-screen w-full overflow-hidden">
        {/* Layer 1 — fixed background (memoised) */}
        <BackgroundLayer />

        {/* Layer 2 — premium dual halo: back aura + floor ring (behind mascot) */}
        <div className="absolute inset-0 z-[5]">
          <PixieHalo />
        </div>

        {/* Layer 3 — mascot (current role form, centre) */}
        <div className="absolute inset-0 z-10">
          <MascotLayer ref={mascotScaleRef} role={active} idle />
        </div>

        {/* Layer 4 — faint front rim light over the mascot */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[15]"
          style={{
            background:
              'radial-gradient(ellipse 30% 40% at 50% 44%, color-mix(in srgb, var(--accent-soft) 12%, transparent), transparent 70%)',
          }}
        />

        {/* Layer 5 — role-specific holographic props (morph) */}
        <div className="absolute inset-0 z-20 hidden lg:block">
          <PropsLayer role={active} />
        </div>

        {/* Layer 4 — scan ring, centred on mascot torso */}
        <div className="absolute left-1/2 top-[52%] z-30 -translate-x-1/2 -translate-y-1/2">
          <ScanRing ref={scanRingRef} />
        </div>

        {/* Layers 5 + 6 — copy (left) and cards (right) */}
        <div className="container-page relative z-40 grid h-full grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="pointer-events-auto">
            <RoleCopy role={active} />
          </div>
          <div className="pointer-events-auto hidden justify-end lg:flex">
            <RoleCards role={active} />
          </div>
        </div>

        {/* Layer 7 — role progress rail */}
        <div className="absolute right-6 top-1/2 z-50 hidden -translate-y-1/2 lg:block xl:right-10">
          <RoleProgress roles={roles} activeIndex={activeIndex} onSelect={scrollToIndex} />
        </div>

        {/* Scroll affordance */}
        <div className="absolute bottom-6 left-1/2 z-50 hidden -translate-x-1/2 flex-col items-center gap-2 text-white/40 lg:flex">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em]">Scroll to activate</span>
          <span className="flex h-8 w-5 items-start justify-center rounded-full border border-white/20 p-1">
            <span className="h-2 w-1 animate-bounce rounded-full bg-[color:color-mix(in_srgb,var(--accent-soft)_60%,transparent)]" />
          </span>
        </div>
      </div>
    </section>
  );
}
