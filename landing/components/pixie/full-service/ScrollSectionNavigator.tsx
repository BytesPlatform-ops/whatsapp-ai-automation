'use client';

import { useEffect, useState } from 'react';

/**
 * ScrollSectionNavigator — right-side Pixie "page map" that appears after the
 * user scrolls, highlights the current section via IntersectionObserver, and
 * smooth-scrolls on click. Desktop only (xl+); hidden on smaller screens so it
 * never overlaps content. Themed via `accent`.
 */

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'workflow', label: 'How Pixie Works' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'automations', label: 'AI Workflows' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'activity', label: 'Activity' },
  { id: 'next-actions', label: 'Next Actions' },
];

export function ScrollSectionNavigator({ accent = '#EC4899' }: { accent?: string }) {
  const [active, setActive] = useState(SECTIONS[0].id);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 250);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { root: null, rootMargin: '-25% 0px -55% 0px', threshold: [0.1, 0.25, 0.5, 0.75] },
    );
    SECTIONS.forEach((s) => { const el = document.getElementById(s.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  function go(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <aside className={`fixed right-5 top-1/2 z-40 hidden -translate-y-1/2 transition-all duration-300 xl:block ${visible ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-6 opacity-0'}`}>
      <div className="w-56 rounded-3xl border border-white/10 bg-[#04090b]/90 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="mb-3 border-b border-white/10 px-3 pb-3">
          <p className="text-[10px] uppercase tracking-[0.25em]" style={{ color: accent }}>Pixie page map</p>
        </div>
        <nav className="space-y-1">
          {SECTIONS.map((s) => {
            const on = active === s.id;
            return (
              <button key={s.id} onClick={() => go(s.id)}
                className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition"
                style={{ background: on ? `${accent}1f` : 'transparent', color: on ? '#fff' : 'rgba(255,255,255,0.45)' }}>
                <span className="h-2 w-2 flex-none rounded-full transition" style={{ background: on ? accent : 'rgba(255,255,255,0.2)', boxShadow: on ? `0 0 12px ${accent}` : 'none' }} />
                <span>{s.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
