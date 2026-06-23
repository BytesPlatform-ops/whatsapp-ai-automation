'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './pixieLoadingIntro.css';

const LOCK_CLASS = 'pixie-intro-lock';
const AVATAR_SRC = '/images/pixie/loading-cape-avatar.png';

type LenisLike = { stop: () => void; start: () => void; scrollTo: (t: number, o?: { immediate?: boolean }) => void };
const getLenis = (): LenisLike | undefined =>
  (window as unknown as { __pixieLenis?: LenisLike }).__pixieLenis;

/**
 * PixieLoadingIntro — cinematic loading overlay that plays on EVERY page load.
 * The cape Pixie appears top-left, charges with a mint glow, flies slowly and
 * visibly down to the bottom-right, then two dark "gate" panels slide apart to
 * reveal the site. The page is forced to the top (and Lenis/ScrollTrigger reset)
 * before and after so neither desktop nor mobile lands mid-page. Reduced-motion
 * users get a short fade. Landing page only; unmounts itself when finished.
 */
export function PixieLoadingIntro() {
  const [done, setDone] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const curtainLRef = useRef<HTMLDivElement>(null);
  const curtainRRef = useRef<HTMLDivElement>(null);
  const ambientRef = useRef<HTMLDivElement>(null);
  const wipeRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLImageElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const burstRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    const overlay = overlayRef.current;
    if (!overlay) return;

    // ── Pin to the top for the whole intro ───────────────────────────────────
    // Manual restoration stops the browser jumping to a remembered scroll
    // position on refresh (this is what made mobile land on the ~5th role).
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    root.classList.add(LOCK_CLASS);
    gsap.registerPlugin(ScrollTrigger);
    getLenis()?.stop();
    getLenis()?.scrollTo(0, { immediate: true });

    const finish = () => {
      // Land at the very top, then refresh ScrollTrigger now the overlay is gone.
      window.scrollTo(0, 0);
      const lenis = getLenis();
      lenis?.scrollTo(0, { immediate: true });
      lenis?.start();
      root.classList.remove(LOCK_CLASS);
      setDone(true);
      requestAnimationFrame(() => {
        ScrollTrigger.refresh();
        window.scrollTo(0, 0);
        getLenis()?.scrollTo(0, { immediate: true });
      });
    };

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── Reduced motion: short fade of the gate panels, no flight ─────────────
    if (reduceMotion) {
      const tl = gsap.timeline({ onComplete: finish });
      tl.set(overlay, { opacity: 1 });
      tl.to([curtainLRef.current, curtainRRef.current, ambientRef.current], {
        opacity: 0,
        duration: 0.32,
        ease: 'power2.out',
        delay: 0.06,
      });
      return () => {
        tl.kill();
        root.classList.remove(LOCK_CLASS);
        getLenis()?.start();
      };
    }

    // ── Full cinematic flight (~3.5s) ────────────────────────────────────────
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const startX = vw * 0.08;
    const startY = vh * (isMobile ? 0.13 : 0.11);
    const endX = vw * (isMobile ? 0.86 : 0.88);
    const endY = vh * (isMobile ? 0.78 : 0.82);
    const angle = (Math.atan2(endY - startY, endX - startX) * 180) / Math.PI;
    const flightDur = isMobile ? 1.4 : 1.6;
    const trailOpacity = isMobile ? 0.6 : 0.9;

    const curtainL = curtainLRef.current!;
    const curtainR = curtainRRef.current!;
    const ambient = ambientRef.current!;
    const wrap = wrapRef.current!;
    const avatar = avatarRef.current!;
    const glow = glowRef.current!;
    const trail = trailRef.current!;
    const wipe = wipeRef.current!;
    const burst = burstRef.current!;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.inOut' }, onComplete: finish });

      // Initial states
      tl.set(overlay, { opacity: 1 });
      tl.set([curtainL, curtainR], { xPercent: 0 });
      tl.set(ambient, { opacity: 1 });
      tl.set(wrap, { x: startX, y: startY, xPercent: -50, yPercent: -50, scale: 0.8 });
      tl.set(avatar, { opacity: 0, rotate: -12 });
      tl.set(glow, { opacity: 0, scale: 0.8 });
      tl.set(trail, { opacity: 0, rotate: angle, scaleX: 0.55 });
      tl.set(wipe, { rotation: -28, xPercent: -130, opacity: 1 });
      tl.set(burst, { x: endX, y: endY, xPercent: -50, yPercent: -50, opacity: 0, scale: 0.4 });

      // 0.10–0.55s — appear top-left and hold so the user can see Pixie
      tl.to(avatar, { opacity: 1, rotate: -9, duration: 0.45, ease: 'power2.out' }, 0.1);
      tl.to(wrap, { scale: 0.92, duration: 0.45, ease: 'power2.out' }, '<');

      // 0.65–1.05s — charge: mint glow swells + a subtle scale pulse
      tl.to(glow, { opacity: 0.82, scale: 1.35, duration: 0.4, ease: 'power2.out' }, 0.65);
      tl.to(wrap, { scale: 0.98, duration: 0.4, ease: 'power2.inOut' }, '<');

      // 1.10s → slow, visible diagonal flight top-left → bottom-right
      tl.to(wrap, { x: endX, y: endY, scale: 0.66, duration: flightDur }, 1.1);
      tl.to(avatar, { rotate: 10, duration: flightDur }, '<');
      tl.to(trail, { opacity: trailOpacity, scaleX: 1, duration: 0.35, ease: 'power2.out' }, '<');
      tl.to(glow, { opacity: 0.42, scale: 1.0, duration: flightDur * 0.85, ease: 'sine.out' }, '<');
      tl.to(wipe, { xPercent: 210, duration: flightDur * 0.95, ease: 'power3.inOut' }, '<+=0.1');

      // ~landing — mint burst + fade the avatar/trail/glow as Pixie "unlocks" it
      const land = `>-0.18`;
      tl.fromTo(burst, { opacity: 0.6, scale: 0.4 }, { opacity: 0, scale: 1.7, duration: 0.6, ease: 'power2.out' }, land);
      tl.to(trail, { opacity: 0, duration: 0.35, ease: 'power2.in' }, '<');
      tl.to(avatar, { opacity: 0, duration: 0.4, ease: 'power2.in' }, '<+=0.12');
      tl.to(glow, { opacity: 0, duration: 0.4 }, '<');

      // Gate reveal — two dark panels slide apart, opening the website
      tl.to(ambient, { opacity: 0, duration: 0.45, ease: 'power2.out' }, '<-=0.05');
      tl.to(curtainL, { xPercent: -103, duration: 0.95, ease: 'power3.inOut' }, '<');
      tl.to(curtainR, { xPercent: 103, duration: 0.95, ease: 'power3.inOut' }, '<');

      // Safety fade of the (now transparent) overlay container, then onComplete
      tl.to(overlay, { opacity: 0, duration: 0.28, ease: 'power2.out' }, '-=0.22');
    }, overlay);

    return () => {
      ctx.revert();
      root.classList.remove(LOCK_CLASS);
      getLenis()?.start();
    };
  }, []);

  if (done) return null;

  return (
    <div ref={overlayRef} className="pixie-loading-intro" aria-hidden role="presentation">
      {/* Gate panels (the dark cover that slides apart to reveal the site) */}
      <div ref={curtainLRef} className="pli-curtain pli-curtain-left" />
      <div ref={curtainRRef} className="pli-curtain pli-curtain-right" />
      {/* Mint ambience over the gates */}
      <div ref={ambientRef} className="pli-ambient" />
      {/* Flight layers */}
      <div ref={wipeRef} className="pli-wipe" />
      <div ref={burstRef} className="pli-burst" />
      <div ref={wrapRef} className="pli-avatar-wrap">
        <div ref={trailRef} className="pli-trail" />
        <div ref={glowRef} className="pli-glow" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={avatarRef} src={AVATAR_SRC} alt="" className="pixie-loading-avatar" decoding="async" />
      </div>
    </div>
  );
}
