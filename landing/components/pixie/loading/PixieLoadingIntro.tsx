'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './pixieLoadingIntro.css';

const LOCK_CLASS = 'pixie-intro-lock';
const AVATAR_SRC = '/images/pixie/loading-cape-avatar.png'; // desktop (diagonal cape)
const MOBILE_SRC = '/images/pixie/loading-mobile-avatar.png'; // mobile (superhero launch)

// Desktop closed state — a 45° diamond covering the viewport; during flight the
// cover's clip-path is recomputed each frame from the avatar's live position so
// the reveal V cuts the site open exactly at Pixie's wake (see coverClip).
const COVER_CLOSED = 'polygon(-60% 0%, 100% -60%, 160% 100%, 0% 160%)';

type LenisLike = { stop: () => void; start: () => void; scrollTo: (t: number, o?: { immediate?: boolean }) => void };
const getLenis = (): LenisLike | undefined =>
  (window as unknown as { __pixieLenis?: LenisLike }).__pixieLenis;

/**
 * PixieLoadingIntro — cinematic loading overlay that plays on EVERY page load.
 * DESKTOP: the cape Pixie flies top-left → bottom-right and a diagonal V cover
 * cuts the site open at its wake. MOBILE (<768px): the superhero Pixie launches
 * from the bottom straight up and a vertical reveal opens the site behind it.
 * Both progressively reveal during flight, force the page to the top
 * (Lenis/ScrollTrigger reset) before and after, and reduced-motion users get a
 * short fade. Landing page only; unmounts itself when finished.
 */
export function PixieLoadingIntro() {
  const [done, setDone] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLImageElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null); // desktop diagonal trail
  const burstRef = useRef<HTMLDivElement>(null);
  const medgeRef = useRef<HTMLDivElement>(null); // mobile horizontal reveal edge
  const mtrailRef = useRef<HTMLDivElement>(null); // mobile vertical trail

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

    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const cover = coverRef.current!;
    const wrap = wrapRef.current!;
    const avatar = avatarRef.current!;
    const glow = glowRef.current!;
    const burst = burstRef.current!;
    avatar.src = isMobile ? MOBILE_SRC : AVATAR_SRC;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.inOut' }, onComplete: finish });

      if (isMobile) {
        // ===== MOBILE: superhero launch, bottom → top, vertical reveal =======
        const medge = medgeRef.current!;
        const mtrail = mtrailRef.current!;
        const startX = vw * 0.5;
        const startY = vh * 0.92;
        const endY = vh * -0.18;
        const flightDur = 1.55;
        const tf = 0.8; // flight + reveal start

        // V cut (boat parting water), travel pointing straight UP: the bow apex
        // is at Pixie and the wake opens downward behind it. Driven by the
        // avatar's live y so the site opens exactly at its wake — a V, not a
        // flat line. The still-dark cover is the region AHEAD (above) the V.
        const mLen = Math.abs(endY - startY) || 1;
        const wx = 0; // travel direction (up)
        const wy = (endY - startY) / mLen; // ≈ -1
        const ux = -wy; // perpendicular (horizontal) = 1
        const uy = wx;
        const margin = mLen * 0.03;
        const TH = (60 * Math.PI) / 180; // wake half-angle (sharper = clearer V)
        const cosT = Math.cos(TH);
        const sinT = Math.sin(TH);
        const a1x = ux * cosT - wx * sinT;
        const a1y = uy * cosT - wy * sinT;
        const a2x = -ux * cosT - wx * sinT;
        const a2y = -uy * cosT - wy * sinT;
        const BIG = 6000;
        const coverMobile = (cx: number, cy: number) => {
          const px = cx - wx * margin;
          const py = cy - wy * margin;
          const f1x = px + a1x * BIG, f1y = py + a1y * BIG;
          const f2x = px + a2x * BIG, f2y = py + a2y * BIG;
          const g1x = f1x + wx * BIG, g1y = f1y + wy * BIG;
          const g2x = f2x + wx * BIG, g2y = f2y + wy * BIG;
          return `polygon(${px}px ${py}px, ${f1x}px ${f1y}px, ${g1x}px ${g1y}px, ${g2x}px ${g2y}px, ${f2x}px ${f2y}px)`;
        };

        tl.set(overlay, { opacity: 1 });
        tl.set(cover, { clipPath: coverMobile(startX, startY), opacity: 1 });
        tl.set(wrap, { x: startX, y: startY, xPercent: -50, yPercent: -50, scale: 0.72 });
        tl.set(avatar, { opacity: 0, rotate: 0 });
        tl.set(glow, { opacity: 0, scale: 0.85 });
        tl.set(medge, { y: startY, opacity: 0 });
        tl.set(mtrail, { xPercent: -50, y: startY, opacity: 0 });
        tl.set(burst, { x: vw * 0.5, y: vh * 0.06, xPercent: -50, yPercent: -50, opacity: 0, scale: 0.4 });

        // appear + charge at the bottom
        tl.to(avatar, { opacity: 1, duration: 0.4, ease: 'power2.out' }, 0.35);
        tl.to(wrap, { scale: 0.82, duration: 0.4, ease: 'power2.out' }, '<');
        tl.to(glow, { opacity: 0.82, scale: 1.3, duration: 0.35, ease: 'power2.out' }, 0.5);

        // launch up — reveal + edge + trail all start WITH the flight
        tl.to(
          wrap,
          {
            y: endY,
            scale: 0.55,
            duration: flightDur,
            onUpdate: () => {
              const cx = gsap.getProperty(wrap, 'x') as number;
              const cy = gsap.getProperty(wrap, 'y') as number;
              cover.style.clipPath = coverMobile(cx, cy);
              gsap.set(medge, { y: cy });
              gsap.set(mtrail, { y: cy });
            },
          },
          tf,
        );
        tl.to(avatar, { rotate: -4, duration: flightDur }, '<');
        tl.to(medge, { opacity: 0.9, duration: 0.3, ease: 'power2.out' }, '<');
        tl.to(mtrail, { opacity: 0.6, duration: 0.35, ease: 'power2.out' }, '<');
        tl.to(glow, { opacity: 0.4, duration: flightDur * 0.8, ease: 'sine.out' }, '<');

        // reaches top — fade edge/trail/avatar, soft burst, clean up
        const land = tf + flightDur - 0.2;
        tl.to([medge, mtrail], { opacity: 0, duration: 0.35, ease: 'power2.in' }, land);
        tl.to(avatar, { opacity: 0, duration: 0.4, ease: 'power2.in' }, land + 0.05);
        tl.to(glow, { opacity: 0, duration: 0.3 }, '<');
        tl.fromTo(burst, { opacity: 0.5, scale: 0.4 }, { opacity: 0, scale: 1.6, duration: 0.5, ease: 'power2.out' }, land);
        tl.to(cover, { opacity: 0, duration: 0.4, ease: 'power2.out' }, land + 0.15);
        tl.to(overlay, { opacity: 0, duration: 0.3, ease: 'power2.out' }, '>-0.15');
        return;
      }

      // ===== DESKTOP: diagonal V "boat cutting water" (unchanged) ============
      const trail = trailRef.current!;
      const startX = vw * 0.08;
      const startY = vh * 0.11;
      const endX = vw * 0.88;
      const endY = vh * 0.82;
      const angle = (Math.atan2(endY - startY, endX - startX) * 180) / Math.PI;
      const flightDur = 1.6;
      const trailOpacity = 0.95;
      const tf = 0.9;

      const len = Math.hypot(endX - startX, endY - startY) || 1;
      const wx = (endX - startX) / len;
      const wy = (endY - startY) / len;
      const ux = -wy;
      const uy = wx;
      const margin = len * 0.03;
      const TH = (40 * Math.PI) / 180;
      const cosT = Math.cos(TH);
      const sinT = Math.sin(TH);
      const a1x = ux * cosT - wx * sinT;
      const a1y = uy * cosT - wy * sinT;
      const a2x = -ux * cosT - wx * sinT;
      const a2y = -uy * cosT - wy * sinT;
      const BIG = 6000;
      const coverClip = (cx: number, cy: number) => {
        const px = cx - wx * margin;
        const py = cy - wy * margin;
        const f1x = px + a1x * BIG, f1y = py + a1y * BIG;
        const f2x = px + a2x * BIG, f2y = py + a2y * BIG;
        const g1x = f1x + wx * BIG, g1y = f1y + wy * BIG;
        const g2x = f2x + wx * BIG, g2y = f2y + wy * BIG;
        return `polygon(${px}px ${py}px, ${f1x}px ${f1y}px, ${g1x}px ${g1y}px, ${g2x}px ${g2y}px, ${f2x}px ${f2y}px)`;
      };

      tl.set(overlay, { opacity: 1 });
      tl.set(cover, { clipPath: COVER_CLOSED, opacity: 1 });
      tl.set(wrap, { x: startX, y: startY, xPercent: -50, yPercent: -50, scale: 0.8 });
      tl.set(avatar, { opacity: 0, rotate: -12 });
      tl.set(glow, { opacity: 0, scale: 0.8 });
      tl.set(trail, { opacity: 0, rotate: angle, scaleX: 0.5 });
      tl.set(burst, { x: endX, y: endY, xPercent: -50, yPercent: -50, opacity: 0, scale: 0.4 });

      tl.to(avatar, { opacity: 1, rotate: -9, duration: 0.45, ease: 'power2.out' }, 0.1);
      tl.to(wrap, { scale: 0.92, duration: 0.45, ease: 'power2.out' }, '<');
      tl.to(glow, { opacity: 0.82, scale: 1.35, duration: 0.4, ease: 'power2.out' }, 0.6);
      tl.to(wrap, { scale: 0.98, duration: 0.4, ease: 'power2.inOut' }, '<');

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

      const land = tf + flightDur - 0.18;
      tl.fromTo(burst, { opacity: 0.6, scale: 0.4 }, { opacity: 0, scale: 1.7, duration: 0.6, ease: 'power2.out' }, land);
      tl.to(trail, { opacity: 0, duration: 0.35, ease: 'power2.in' }, land);
      tl.to(avatar, { opacity: 0, duration: 0.4, ease: 'power2.in' }, land + 0.12);
      tl.to(glow, { opacity: 0, duration: 0.4 }, '<');
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
      {/* Progressive reveal cover (diagonal on desktop, vertical on mobile) */}
      <div ref={coverRef} className="pli-cover" />
      {/* Mobile-only reveal layers (idle/opacity 0 on desktop) */}
      <div ref={mtrailRef} className="pli-mtrail" />
      <div ref={medgeRef} className="pli-medge" />
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
