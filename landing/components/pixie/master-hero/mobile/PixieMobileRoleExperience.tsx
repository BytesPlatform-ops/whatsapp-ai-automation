'use client';

import { useEffect, useRef, useState } from 'react';
import { hexToRgbString, getReadableButtonText } from '../../mascot-role-hero/colorUtils';
import { preloadImage } from '../roleData';
import { MOBILE_ROLES, type MobileRole } from './mobileContent';
import { MobileRoleScene } from './MobileRoleScene';
import { MobileProgressRail } from './MobileProgressRail';
import { MobileTopBar } from './MobileTopBar';
import { MobileMenuOverlay } from './MobileMenuOverlay';
import { PixieFooter } from '@/components/sections/PixieFooter';

/**
 * PixieMobileRoleExperience — mobile-native (<lg) replacement for the desktop
 * flying hero. Six full-screen, role-coloured scenes with large avatars,
 * editorial copy, themed CTAs and glass chips. Activation + first-time entrance
 * run on a single IntersectionObserver (no GSAP/Lenis on mobile → no conflict
 * with the desktop flight). The active scene's theme is mirrored to :root so
 * the fixed top bar, rail and menu recolour with it.
 *
 * Per-section avatars (Option A) — simpler + stable on mobile; the desktop
 * "one persistent robot" rule is unaffected.
 */
export function PixieMobileRoleExperience({ reducedMotion }: { reducedMotion: boolean }) {
  const sceneRefs = useRef<Array<HTMLElement | null>>([]);
  const lastActive = useRef(-1);
  const inViewRef = useRef<Set<number>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [railVisible, setRailVisible] = useState(true);

  // Preload all six form images up front (avoid flicker).
  useEffect(() => {
    MOBILE_ROLES.forEach((r) => preloadImage(r.image));
  }, []);

  // Mirror a role's theme to :root (drives the fixed chrome).
  const applyTheme = (role: MobileRole) => {
    const el = document.documentElement;
    el.style.setProperty('--accent', role.accent);
    el.style.setProperty('--accent-soft', role.soft);
    el.style.setProperty('--accent-rgb', hexToRgbString(role.accent));
    el.style.setProperty('--button-text', getReadableButtonText(role.accent));
  };

  // Activation + first-time entrance. Also tracks whether any scene is on
  // screen so the fixed progress rail hides once we scroll into the footer.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const idx = Number((e.target as HTMLElement).dataset.idx);
          if (e.isIntersecting) {
            e.target.classList.add('in-view'); // entrance (once)
            inViewRef.current.add(idx);
          } else {
            inViewRef.current.delete(idx);
          }
        }
        setRailVisible(inViewRef.current.size > 0);
        const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!best) return;
        const idx = Number((best.target as HTMLElement).dataset.idx);
        if (idx === lastActive.current) return;
        lastActive.current = idx;
        setActiveIndex(idx);
        applyTheme(MOBILE_ROLES[idx]);
      },
      { threshold: [0.18, 0.45, 0.7] },
    );
    sceneRefs.current.forEach((s) => s && io.observe(s));
    // Seed the first scene immediately.
    sceneRefs.current[0]?.classList.add('in-view');
    applyTheme(MOBILE_ROLES[0]);
    return () => io.disconnect();
  }, []);

  // Top-bar frosted state on scroll.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Subtle avatar parallax — each visible avatar stage shifts a few px slower
  // than the page (max ±18px). One passive listener, rAF-throttled. Off for
  // reduced motion. Only on-screen scenes are touched (2-3 at a time).
  useEffect(() => {
    if (reducedMotion) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      sceneRefs.current.forEach((s) => {
        if (!s) return;
        const r = s.getBoundingClientRect();
        const stage = s.querySelector<HTMLElement>('.m-avatar-stage');
        if (!stage) return;
        if (r.bottom < -40 || r.top > vh + 40) return;
        const offset = (vh / 2 - (r.top + r.height / 2)) / vh; // -0.5..0.5
        const y = Math.max(-18, Math.min(18, offset * 36));
        stage.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reducedMotion]);

  const scrollToIndex = (i: number) => {
    sceneRefs.current[i]?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="pixie-mobile-exp pixie-master-hero relative">
      <MobileTopBar scrolled={scrolled} menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} />
      <div id="m-menu-overlay">
        <MobileMenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />
      </div>

      {MOBILE_ROLES.map((role, i) => (
        <MobileRoleScene
          key={role.id}
          role={role}
          index={i}
          ref={(el) => { sceneRefs.current[i] = el; }}
        />
      ))}

      {railVisible && <MobileProgressRail items={MOBILE_ROLES} activeIndex={activeIndex} onSelect={scrollToIndex} />}

      {/* Footer landing — mobile uses the static normal Pixie (no flight). */}
      <PixieFooter />
    </div>
  );
}
