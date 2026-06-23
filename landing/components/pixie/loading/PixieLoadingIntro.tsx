'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './pixieLoadingIntro.css';

const LOCK_CLASS = 'pixie-intro-lock';
const AVATAR_SRC = '/images/pixie/loading-cape-avatar.png';

// Diagonal reveal: a 45° "diamond" cover that fully blankets the viewport, then
// slides off toward the bottom-right so the site appears from the top-left as
// the avatar flies (the leading edge is the diagonal reveal front).
// Closed = a 45° diamond covering the whole viewport. During flight the cover's
// clip-path is recomputed each frame from the avatar's live position so the
// reveal edge cuts the site open exactly at Pixie's wake (see coverClip below).
const COVER_CLOSED = 'polygon(-60% 0%, 100% -60%, 160% 100%, 0% 160%)';

type LenisLike = { stop: () => void; start: () => void; scrollTo: (t: number, o?: { immediate?: boolean }) => void };
const getLenis = (): LenisLike | undefined =>
  (window as unknown as { __pixieLenis?: LenisLike }).__pixieLenis;

/**
 * PixieLoadingIntro — cinematic loading overlay that plays on EVERY page load.
 * The cape Pixie appears top-left, charges, then flies slowly to the
 * bottom-right while a diagonal cover progressively opens BEHIND it in real
 * time (clip-path synced to the same flight timeline) — Pixie cuts the website
 * open as it travels. A soft fade cleans up the last sliver. The page is forced
 * to the top (Lenis/ScrollTrigger reset) before and after so neither desktop
 * nor mobile lands mid-page. Reduced-motion users get a short fade. Landing
 * page only; unmounts itself when finished.
 */
export function PixieLoadingIntro() {
  const [done, setDone] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
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
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    root.classList.add(LOCK_CLASS);
    gsap.registerPlugin(ScrollTrigger);
    getLenis()?.stop();
    getLenis()?.scrollTo(0, { immediate: true });

    const finish = () => {
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

    // ── Reduced motion: short fade of the cover, no flight ───────────────────
    if (reduceMotion) {
      const tl = gsap.timeline({ onComplete: finish });
      tl.set(overlay, { opacity: 1 });
      tl.to([coverRef.current, overlay], { opacity: 0, duration: 0.34, ease: 'power2.out', delay: 0.06 });
      return () => {
        tl.kill();
        root.classList.remove(LOCK_CLASS);
        getLenis()?.start();
      };
    }

    // ── Full cinematic flight + progressive reveal (~3.4s) ───────────────────
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const startX = vw * 0.08;
    const startY = vh * (isMobile ? 0.13 : 0.11);
    const endX = vw * (isMobile ? 0.86 : 0.88);
    const endY = vh * (isMobile ? 0.78 : 0.82);
    const angle = (Math.atan2(endY - startY, endX - startX) * 180) / Math.PI;
    const flightDur = isMobile ? 1.5 : 1.6;
    const trailOpacity = isMobile ? 0.65 : 0.95;
    const tf = 0.9; // flight (and reveal) start time

    // "Boat cutting water": the reveal edge is a line perpendicular to the
    // travel direction that passes just BEHIND the avatar. Driven by the avatar's
    // live position every frame, so the website opens exactly at Pixie's wake —
    // never faster than it travels.
    const len = Math.hypot(endX - startX, endY - startY) || 1;
    const wx = (endX - startX) / len; // unit vector along travel
    const wy = (endY - startY) / len;
    const ux = -wy; // perpendicular (the cut edge direction)
    const uy = wx;
    const margin = len * 0.1; // how far behind the avatar the cut sits
    const BIG = 6000;
    const coverClip = (cx: number, cy: number) => {
      const lx = cx - wx * margin; // a point on the cut line, behind the avatar
      const ly = cy - wy * margin;
      const ax = lx + ux * BIG, ay = ly + uy * BIG;
      const bx = lx - ux * BIG, by = ly - uy * BIG;
      const cX = bx + wx * BIG, cY = by + wy * BIG;
      const dX = ax + wx * BIG, dY = ay + wy * BIG;
      // Quad = the still-covered half-plane AHEAD of the cut (toward bottom-right).
      return `polygon(${ax}px ${ay}px, ${dX}px ${dY}px, ${cX}px ${cY}px, ${bx}px ${by}px)`;
    };

    const cover = coverRef.current!;
    const wrap = wrapRef.current!;
    const avatar = avatarRef.current!;
    const glow = glowRef.current!;
    const trail = trailRef.current!;
    const burst = burstRef.current!;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.inOut' }, onComplete: finish });

      // Initial states
      tl.set(overlay, { opacity: 1 });
      tl.set(cover, { clipPath: COVER_CLOSED, opacity: 1 });
      tl.set(wrap, { x: startX, y: startY, xPercent: -50, yPercent: -50, scale: 0.8 });
      tl.set(avatar, { opacity: 0, rotate: -12 });
      tl.set(glow, { opacity: 0, scale: 0.8 });
      tl.set(trail, { opacity: 0, rotate: angle, scaleX: 0.5 });
      tl.set(burst, { x: endX, y: endY, xPercent: -50, yPercent: -50, opacity: 0, scale: 0.4 });

      // 0.10–0.55s — appear top-left and hold
      tl.to(avatar, { opacity: 1, rotate: -9, duration: 0.45, ease: 'power2.out' }, 0.1);
      tl.to(wrap, { scale: 0.92, duration: 0.45, ease: 'power2.out' }, '<');

      // 0.60–1.00s — charge
      tl.to(glow, { opacity: 0.82, scale: 1.35, duration: 0.4, ease: 'power2.out' }, 0.6);
      tl.to(wrap, { scale: 0.98, duration: 0.4, ease: 'power2.inOut' }, '<');

      // tf → slow diagonal flight, top-left → bottom-right. The cover's
      // clip-path is recomputed from the avatar's LIVE position every frame, so
      // the reveal edge is locked just behind Pixie — the site opens exactly at
      // its wake (boat cutting water), never ahead of the travel.
      tl.to(
        wrap,
        {
          x: endX,
          y: endY,
          scale: 0.66,
          duration: flightDur,
          onUpdate: () => {
            const cx = gsap.getProperty(wrap, 'x') as number;
            const cy = gsap.getProperty(wrap, 'y') as number;
            cover.style.clipPath = coverClip(cx, cy);
          },
        },
        tf,
      );
      tl.to(avatar, { rotate: 10, duration: flightDur }, '<');
      tl.to(trail, { opacity: trailOpacity, scaleX: 1, duration: 0.35, ease: 'power2.out' }, '<');
      tl.to(glow, { opacity: 0.42, scale: 1.0, duration: flightDur * 0.85, ease: 'sine.out' }, '<');

      // ~landing — soft mint burst, fade avatar / trail / glow
      const land = tf + flightDur - 0.18;
      tl.fromTo(burst, { opacity: 0.6, scale: 0.4 }, { opacity: 0, scale: 1.7, duration: 0.6, ease: 'power2.out' }, land);
      tl.to(trail, { opacity: 0, duration: 0.35, ease: 'power2.in' }, land);
      tl.to(avatar, { opacity: 0, duration: 0.4, ease: 'power2.in' }, land + 0.12);
      tl.to(glow, { opacity: 0, duration: 0.4 }, '<');

      // Final cleanup — fade the last sliver of cover + overlay (no white flash)
      tl.to(cover, { opacity: 0, duration: 0.4, ease: 'power2.out' }, land + 0.2);
      tl.to(overlay, { opacity: 0, duration: 0.3, ease: 'power2.out' }, '>-0.15');
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
      {/* Progressive diagonal reveal cover (opens behind the avatar) */}
      <div ref={coverRef} className="pli-cover" />
      {/* Flight layers */}
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
