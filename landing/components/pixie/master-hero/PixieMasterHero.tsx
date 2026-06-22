'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { BackgroundLayer } from '../mascot-role-hero/BackgroundLayer';
import { FlyingRobot } from './FlyingRobot';
import { IntroServiceChips } from './IntroServiceChips';
import { RolePanel } from './RolePanel';
import { RoleProgress } from './RoleProgress';
import { PremiumNavbar } from './PremiumNavbar';
import { PixieMobileRoleExperience } from './mobile/PixieMobileRoleExperience';
import { JoinPixie } from '@/pixie/JoinPixie';
import { PixieFooter } from '@/components/sections/PixieFooter';
import { FLYING_ROLES, INTRO, STUDIO_BG_SRC, NORMAL_FORM, preloadImage } from './roleData';
import { ANCHORS, anchorPoint, oppositeSide } from './flightPath';
import { themeFor, INTRO_THEME } from './themeMap';
import { useAdaptiveTheme } from './useAdaptiveTheme';
import { useLenisGsap } from './useLenisGsap';

// Temporarily hide the navbar while tuning the scroll-flight (code preserved).
const SHOW_PIXIE_NAVBAR = false;

/**
 * PixieMasterHero — the persistent Pixie robot FLIES DOWN the page.
 *
 * Desktop (≥1024, motion allowed): the hero is a tall scroll container with 7
 * real full-screen sections (intro + 6 roles) in normal flow — so the page
 * genuinely scrolls downward. ONE robot is absolutely positioned in document
 * space; a scrubbed GSAP timeline animates its transform between document
 * anchors (`sectionTop + h*yRatio`, Y increasing) via curved, banked midpoints,
 * so it visibly travels DOWN and side-to-side through the sections. The studio
 * background is a confined sticky layer; per-section ScrollTriggers fire the
 * morph + theme together on landing. Lenis smooth-scrolls on one shared ticker.
 *
 * Below lg / reduced-motion: no flight — stacked sections, IntersectionObserver
 * activation, instant theme.
 */
export function PixieMasterHero() {
  const lastIndex = ANCHORS.length - 1;

  const rootRef = useRef<HTMLDivElement>(null);
  const robotTrackRef = useRef<HTMLDivElement>(null);
  const robotBobRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);
  const lastIdxRef = useRef(0);

  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState('intro');
  const [scanKey, setScanKey] = useState(0);

  const enableFlight = mounted && isDesktop && !reducedMotion && ready;
  const { tweenTheme } = useAdaptiveTheme(INTRO_THEME, reducedMotion);
  const lenisRef = useLenisGsap(enableFlight);

  // Environment
  useEffect(() => {
    setMounted(true);
    const dMq = window.matchMedia('(min-width: 1024px)');
    const mMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setIsDesktop(dMq.matches);
      setReducedMotion(mMq.matches);
    };
    sync();
    dMq.addEventListener('change', sync);
    mMq.addEventListener('change', sync);
    return () => {
      dMq.removeEventListener('change', sync);
      mMq.removeEventListener('change', sync);
    };
  }, []);

  // Preload forms + bg
  useEffect(() => {
    let cancelled = false;
    Promise.all([...FLYING_ROLES.map((r) => r.image), NORMAL_FORM.image, STUDIO_BG_SRC].map(preloadImage)).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Landing beat — morph + theme + scan fire together. Deduped by index.
  const activate = (idx: number) => {
    if (idx === lastIdxRef.current) return;
    lastIdxRef.current = idx;
    const a = ANCHORS[idx];
    setActiveId(a.roleId);
    tweenTheme(themeFor(a.roleId), !reducedMotion);
    if (a.roleId !== 'intro') setScanKey((k) => k + 1);
  };

  // ── Desktop document-space flight ────────────────────────────────────────
  useEffect(() => {
    if (!enableFlight || !rootRef.current || !robotTrackRef.current) return;
    const track = robotTrackRef.current;

    const anchor = (i: number) => anchorPoint(sectionRefs.current[i], ANCHORS[i], i);
    const mid = (i: number) => {
      const f = anchor(i - 1);
      const t = anchor(i);
      const dir = t.x >= f.x ? 1 : -1;
      return {
        x: (f.x + t.x) / 2 + dir * window.innerWidth * 0.08, // bow the curve sideways
        y: f.y + (t.y - f.y) * 0.42, // ...and downward through the arc
        scale: Math.max(f.scale, t.scale) + 0.04,
        rot: dir > 0 ? 9 : -9, // bank toward travel
      };
    };

    const ctx = gsap.context(() => {
      gsap.set(track, { xPercent: -50, yPercent: -50 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: rootRef.current!,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 1, // softer ease-behind-scroll for premium, non-jittery flight
          invalidateOnRefresh: true,
          onRefreshInit: () => {
            const a0 = anchor(0);
            gsap.set(track, { x: a0.x, y: a0.y, scale: a0.scale, rotate: a0.rot });
          },
          onUpdate: (self) => {
            const v = Math.min(1, Math.abs(self.getVelocity()) / 2400);
            rootRef.current?.style.setProperty('--flight', v.toFixed(3));
            const introV = Math.max(0, Math.min(1, 1 - self.progress / (1 / lastIndex)));
            rootRef.current?.style.setProperty('--intro', introV.toFixed(3));
          },
        },
      });

      for (let i = 1; i <= lastIndex; i++) {
        tl.to(track, { x: () => mid(i).x, y: () => mid(i).y, scale: () => mid(i).scale, rotate: () => mid(i).rot, duration: 0.45, ease: 'power2.inOut' });
        tl.to(track, { x: () => anchor(i).x, y: () => anchor(i).y, scale: () => anchor(i).scale, rotate: () => anchor(i).rot, duration: 0.55, ease: 'power2.inOut' });
      }

      // Per-section activation (morph + theme + scan together on landing).
      ANCHORS.forEach((_a, i) => {
        ScrollTrigger.create({
          trigger: sectionRefs.current[i]!,
          start: 'top center',
          end: 'bottom center',
          onEnter: () => activate(i),
          onEnterBack: () => activate(i),
        });
      });
    }, rootRef);

    const onResize = () => ScrollTrigger.refresh();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableFlight, lastIndex]);

  // ── Mobile / reduced-motion: IntersectionObserver activation ─────────────
  useEffect(() => {
    if (!mounted || enableFlight) return;
    const io = new IntersectionObserver(
      (entries) => {
        const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!best) return;
        activate(Number((best.target as HTMLElement).dataset.idx));
      },
      { threshold: [0.4, 0.6] },
    );
    sectionRefs.current.forEach((s) => s && io.observe(s));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, enableFlight]);

  const scrollToIndex = (roleIndex: number) => {
    const sec = sectionRefs.current[roleIndex + 1];
    if (!sec) return;
    if (lenisRef.current) lenisRef.current.scrollTo(sec.offsetTop);
    else window.scrollTo({ top: sec.offsetTop, behavior: 'smooth' });
  };

  // ── Mobile / tablet / reduced-motion: premium mobile-native experience ───
  if (mounted && (!isDesktop || reducedMotion)) {
    return <PixieMobileRoleExperience reducedMotion={reducedMotion} />;
  }

  // ── Desktop document-flight layout (also SSR / pre-mount default) ─────────
  return (
    <div ref={rootRef} className="pixie-master-hero relative bg-[#02070a] text-white">
      {SHOW_PIXIE_NAVBAR && <PremiumNavbar />}

      {/* Confined sticky studio background (pins within the hero only). */}
      <div aria-hidden className="pointer-events-none sticky top-0 z-0 -mb-[100vh] h-screen overflow-hidden">
        <BackgroundLayer />
      </div>

      {/* Confined sticky progress rail (pins within the hero only). */}
      <div aria-hidden className="pointer-events-none sticky top-0 z-40 -mb-[100vh] hidden h-screen lg:block">
        <div
          className="pointer-events-auto absolute right-6 top-1/2 -translate-y-1/2 transition-opacity duration-500 xl:right-10"
          style={{ opacity: activeId === 'normal' ? '0' : 'calc(1 - var(--intro, 1) * 0.7)' }}
        >
          <RoleProgress activeId={activeId} onSelect={scrollToIndex} />
        </div>
      </div>

      {/* The ONE persistent robot — absolute in document space, flies DOWN. */}
      <FlyingRobot
        positionRef={robotTrackRef}
        bobRef={robotBobRef}
        activeId={activeId === 'intro' ? 'greeter' : activeId}
        scanKey={scanKey}
        idle={!reducedMotion}
        className="pointer-events-none absolute left-0 top-0 z-30 will-change-transform"
      />

      {/* Intro section — copy sits in a clear zone BELOW the robot (robot flies
          to upper-center at y≈33%), so the headline is never behind it. */}
      <section ref={(el) => { sectionRefs.current[0] = el; }} className="relative z-[35] flex h-screen flex-col items-center justify-end overflow-hidden pb-[8vh]">
        <IntroServiceChips />
        <div className="container-page relative z-30 flex flex-col items-center text-center" style={{ opacity: 'var(--intro, 1)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">{INTRO.eyebrow}</p>
          <h1 className="mt-3 max-w-2xl font-display text-[clamp(2.1rem,4vw,3.25rem)] font-extrabold leading-[1.05] tracking-tight text-[#F4FFF9] text-balance">{INTRO.heading}</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg">{INTRO.sub}</p>
          <div className="mt-7 flex items-center gap-3">
            <JoinPixie label={INTRO.primaryCta} size="md" />
            <a href="#pixie-greeter" className="inline-flex h-[52px] items-center justify-center rounded-full border bg-white/[0.04] px-6 text-sm font-semibold text-white/85 backdrop-blur-md" style={{ borderColor: 'color-mix(in srgb, var(--accent) 28%, transparent)' }}>{INTRO.secondaryCta}</a>
          </div>
        </div>
      </section>

      {/* Role sections — text/CTA live in the section, opposite the robot.
          Center (core) panel sits BELOW the robot so it's never hidden behind it. */}
      {FLYING_ROLES.map((role, i) => {
        const panelSide = oppositeSide(ANCHORS[i + 1].side);
        return (
          <section
            key={role.id}
            id={`pixie-${role.id}`}
            ref={(el) => { sectionRefs.current[i + 1] = el; }}
            className={`relative flex h-screen overflow-hidden ${panelSide === 'center' ? 'z-[35] items-end pb-[8vh]' : 'z-10 items-center'}`}
          >
            <div className="container-page w-full">
              <div className={panelSide === 'left' ? 'mr-auto max-w-[44%]' : panelSide === 'right' ? 'ml-auto max-w-[44%]' : 'mx-auto max-w-[560px]'}>
                <RolePanel role={role} side={panelSide} active={activeId === role.id} reducedMotion={reducedMotion} compact={panelSide === 'center'} />
              </div>
            </div>
          </section>
        );
      })}

      {/* Final flight stop — the robot flies into the footer and morphs back to
          the normal Pixie. The footer centre is a landing zone (no static
          avatar); the persistent FlyingRobot lands here. */}
      <div ref={(el) => { sectionRefs.current[FLYING_ROLES.length + 1] = el; }} className="relative z-10">
        <PixieFooter landingZone />
      </div>
    </div>
  );
}
