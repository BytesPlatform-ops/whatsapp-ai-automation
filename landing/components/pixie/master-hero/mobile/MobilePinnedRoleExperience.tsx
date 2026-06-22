'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { hexToRgbString, getReadableButtonText, interpolateColor } from '../../mascot-role-hero/colorUtils';
import { MOBILE_ROLES, type MobileRole } from './mobileContent';
import { NORMAL_FORM, INTRO } from '../roleData';
import { INTRO_THEME } from '../themeMap';
import { MobileTopBar } from './MobileTopBar';
import { MobileMenuOverlay } from './MobileMenuOverlay';
import { MobileProgressRail } from './MobileProgressRail';
import { PixieFooter } from '@/components/sections/PixieFooter';

// First/main mobile screen — mirrors the desktop intro: the NORMAL Pixie avatar
// + the headline hero. After it, the role-changing flow begins (greeter → …).
const INTRO_SCENE: MobileRole = {
  id: 'intro',
  label: 'Pixie',
  badge: INTRO.eyebrow,
  headingLines: ['One AI.', 'Every role.'],
  sub: '',
  primaryCta: 'Join Pixie',
  secondaryCta: '',
  href: '/join-pixie',
  chips: ['Builds', 'Markets', 'Answers'],
  image: NORMAL_FORM.image,
  accent: INTRO_THEME.accent,
  soft: INTRO_THEME.soft,
};

// Scenes = intro hero first, then the six roles.
const SCENES: MobileRole[] = [INTRO_SCENE, ...MOBILE_ROLES];

// Avatar entry direction per scene: intro arrives centre (0); roles then
// strictly alternate left/right (greeter left … core right).
const DIRS = [0, -1, 1, -1, 1, -1, 1];
const EASE = [0.65, 0, 0.35, 1] as const;

/**
 * MobilePinnedRoleExperience (<lg) — ONE pinned screen. The user scrolls but the
 * viewport stays fixed (sticky stage); scroll progress drives the active role.
 * On each step the avatar cross-transitions (old exits one way, new flies in
 * from the alternating side), and copy / CTAs / chips / theme / glow update in
 * place. GSAP ScrollTrigger maps progress → index + gentle snap; framer-motion
 * AnimatePresence handles the avatar enter/exit. No 6 stacked sections.
 *
 * Desktop is a separate component and is untouched.
 */
export function MobilePinnedRoleExperience({ reducedMotion }: { reducedMotion: boolean }) {
  const N = SCENES.length;
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const lastIdx = useRef(0);
  const scanKey = useRef(0);

  const [activeIndex, setActiveIndex] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [railVisible, setRailVisible] = useState(true);

  // ── Theme (mirrored to :root so the top bar / menu / rail inherit it) ────
  const proxy = useRef({ p: 0 });
  const tween = useRef<ReturnType<typeof gsap.to> | null>(null);
  const curRef = useRef(SCENES[0]);

  const writeVars = (accent: string, soft: string) => {
    const el = document.documentElement;
    el.style.setProperty('--accent', accent);
    el.style.setProperty('--accent-soft', soft);
    el.style.setProperty('--accent-rgb', hexToRgbString(accent));
    el.style.setProperty('--button-text', getReadableButtonText(accent));
  };

  const applyTheme = (role: MobileRole) => {
    writeVars(role.accent, role.soft);
    curRef.current = role;
  };

  const tweenTheme = (role: MobileRole) => {
    if (reducedMotion) {
      applyTheme(role);
      return;
    }
    const from = curRef.current;
    if (from === role) return;
    curRef.current = role;
    tween.current?.kill();
    proxy.current.p = 0;
    tween.current = gsap.to(proxy.current, {
      p: 1,
      duration: 0.5,
      ease: 'power2.inOut',
      onUpdate: () => {
        const k = proxy.current.p;
        writeVars(interpolateColor(from.accent, role.accent, k), interpolateColor(from.soft, role.soft, k));
      },
    });
  };

  // Preload the normal + all six role avatars.
  useEffect(() => {
    SCENES.forEach((r) => {
      const img = new Image();
      img.src = r.image;
    });
  }, []);

  // Seed theme.
  useEffect(() => {
    applyTheme(SCENES[0]);
    return () => {
      tween.current?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── ScrollTrigger: progress → active index + gentle snap ─────────────────
  useEffect(() => {
    if (!rootRef.current) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: rootRef.current!,
        start: 'top top',
        end: 'bottom bottom',
        snap: reducedMotion
          ? undefined
          : { snapTo: 1 / (N - 1), duration: { min: 0.2, max: 0.5 }, ease: 'power1.inOut', delay: 0.05 },
        onUpdate: (self) => {
          const idx = Math.max(0, Math.min(N - 1, Math.round(self.progress * (N - 1))));
          if (idx === lastIdx.current) return;
          lastIdx.current = idx;
          scanKey.current += 1;
          setActiveIndex(idx);
          tweenTheme(SCENES[idx]);
        },
      });
    }, rootRef);
    ScrollTrigger.refresh();
    const onResize = () => ScrollTrigger.refresh();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N, reducedMotion]);

  // Top-bar frosted state + hide the fixed rail once we scroll past the pinned
  // section into the footer.
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 40);
      const root = rootRef.current;
      if (root) setRailVisible(y < root.offsetTop + root.offsetHeight - window.innerHeight - 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToIndex = (i: number) => {
    const root = rootRef.current;
    if (!root) return;
    const target = root.offsetTop + (i / (N - 1)) * (root.offsetHeight - window.innerHeight);
    window.scrollTo({ top: target, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  const role = SCENES[activeIndex];
  const dir = DIRS[activeIndex];

  // Avatar enter/exit variants (reduced motion → opacity only).
  const avatarV: Variants = reducedMotion
    ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        enter: (d: number) =>
          d === 0
            ? { y: 60, opacity: 0, scale: 0.84, rotate: 0 }
            : { x: d * 120, opacity: 0, scale: 0.9, rotate: d * 6 },
        center: { x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 },
        exit: (d: number) => (d === 0 ? { y: -40, opacity: 0, scale: 0.94 } : { x: -d * 120, opacity: 0, scale: 0.94 }),
      };

  const panelV: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.12 } } };
  const itemV: Variants = reducedMotion
    ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
    : { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } } };

  return (
    <div className="pixie-mobile-exp pixie-master-hero">
      <MobileTopBar scrolled={scrolled} menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} />
      <div id="m-menu-overlay">
        <MobileMenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />
      </div>

      {/* Tall scroll track — drives role progress while the stage stays pinned. */}
      <div ref={rootRef} className="relative" style={{ height: `${N * 100}vh` }}>

      {/* ONE pinned stage */}
      <div ref={stageRef} className="sticky top-0 h-[100svh] overflow-hidden">
        {/* Background glow (accent + dark) — updates as --accent tweens */}
        <div aria-hidden className="m-scene-grad" />

        {/* pt clears the fixed top bar (60px) + the top progress indicators. */}
        <div className="relative z-10 mx-auto flex h-[100svh] w-full max-w-md flex-col items-center px-6 pb-[max(env(safe-area-inset-bottom),22px)] pt-[104px] text-center">
          {/* Badge */}
          <motion.div key={`b-${activeIndex}`} className="flex shrink-0 justify-center pt-1" variants={panelV} initial="hidden" animate="show">
            <motion.span className="m-badge" variants={itemV}>{role.badge}</motion.span>
          </motion.div>

          {/* Avatar stage — the dominant element (~half the screen) */}
          <div className="relative my-1 w-full max-w-[400px] flex-1 min-h-0">
            <div className="m-aura" aria-hidden />
            <span key={`scan-${scanKey.current}-${activeIndex}`} aria-hidden className="mh-mscan" />
            <div className="mh-mobile-bob absolute inset-0">
              <AnimatePresence custom={dir}>
                <motion.img
                  key={role.id}
                  src={role.image}
                  alt={`Pixie AI assistant in ${role.label} form`}
                  custom={dir}
                  variants={avatarV}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.72, ease: EASE }}
                  className="absolute inset-0 m-auto h-full w-full select-none object-contain drop-shadow-[0_26px_50px_rgba(0,0,0,0.5)]"
                  draggable={false}
                />
              </AnimatePresence>
            </div>
          </div>

          {/* Copy + CTA + chips (keyed → re-stagger on role change).
              Mobile is intentionally lean: short 2-line heading, ONE button,
              one row of chips — no subtext — so the avatar dominates. */}
          <motion.div key={`c-${activeIndex}`} variants={panelV} initial="hidden" animate="show" className="flex w-full shrink-0 flex-col items-center gap-3.5">
            <h2 className="m-heading">
              {role.headingLines.map((line) => (
                <motion.span key={line} variants={itemV} style={{ display: 'block' }}>{line}</motion.span>
              ))}
            </h2>

            {/* TEMP: products not live yet — one "Join Pixie" CTA → /join-pixie.
                role.primaryCta / role.href stay in mobileContent.ts for restore. */}
            <motion.div className="m-cta-stack w-full" variants={itemV}>
              <a href="/join-pixie" className="m-primary-cta">Join Pixie</a>
            </motion.div>

            <motion.ul className="m-chips flex-nowrap" variants={itemV}>
              {role.chips.map((c) => (
                <li key={c} className="m-chip whitespace-nowrap">{c}</li>
              ))}
            </motion.ul>
          </motion.div>
        </div>
      </div>
      </div>

      {railVisible && <MobileProgressRail items={SCENES} activeIndex={activeIndex} onSelect={scrollToIndex} />}

      {/* Footer landing — mobile uses the static normal Pixie. */}
      <PixieFooter />
    </div>
  );
}
