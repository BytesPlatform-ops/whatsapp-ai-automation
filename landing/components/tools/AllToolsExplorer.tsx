'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TOOLS, type ToolDefinition } from '@/lib/tools';

const CATEGORIES = ['Generator', 'Calculator', 'Converter'] as const;

interface AllToolsExplorerProps {
  /** Slug of the current tool, excluded so a page never links to itself. */
  currentSlug: string;
}

export function AllToolsExplorer({ currentSlug }: AllToolsExplorerProps) {
  const pool = TOOLS.filter((t) => t.slug !== currentSlug);

  return (
    <section className="relative overflow-hidden bg-navy-900 py-20 text-white sm:py-24">
      <div aria-hidden className="absolute inset-0 bg-hero-radial" />
      <div aria-hidden className="absolute inset-0 grid-noise opacity-[0.12]" />

      <div className="container-page relative">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-display-lg text-balance text-white">
            Explore all free tools
          </h2>
          <p className="mt-4 text-lg text-white/70">
            {pool.length} no-signup tools — scroll a shelf and open any of them.
          </p>
        </div>

        <div className="mt-14 space-y-14">
          {CATEGORIES.map((category) => {
            const list = pool.filter((t) => t.category === category);
            if (list.length === 0) return null;
            return <ToolRail key={category} category={category} tools={list} />;
          })}
        </div>
      </div>
    </section>
  );
}

function ToolRail({ category, tools }: { category: string; tools: ToolDefinition[] }) {
  const railRef = useRef<HTMLDivElement>(null);

  const scrollByDir = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <h3 className="font-display text-lg font-bold text-white">{category}s</h3>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-white/60">
          {tools.length}
        </span>
        <span aria-hidden className="h-px flex-1 bg-white/10" />
        <div className="hidden gap-2 sm:flex">
          <RailButton dir={-1} onClick={() => scrollByDir(-1)} />
          <RailButton dir={1} onClick={() => scrollByDir(1)} />
        </div>
      </div>

      <div
        ref={railRef}
        className="rail-scroll flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-5 pt-3"
      >
        {tools.map((t) => (
          <Link
            key={t.slug}
            href={`/tools/${t.slug}`}
            className="group flex w-[260px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur transition-all hover:-translate-y-1 hover:border-wa-green/40 hover:bg-white/[0.07] hover:shadow-glow"
          >
            <div className="relative aspect-[16/10] overflow-hidden bg-white/5">
              <img
                src={t.image}
                alt={t.imageAlt}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-navy-900/70 via-transparent to-transparent"
              />
              <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-700">
                {t.category}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-base leading-none">
                  {t.emoji}
                </span>
                <h4 className="font-display text-[15px] font-bold text-white transition-colors group-hover:text-wa-green">
                  {t.shortName}
                </h4>
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-white/55">
                {t.tagline}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function RailButton({ dir, onClick }: { dir: 1 | -1; onClick: () => void }) {
  const Icon = dir === 1 ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 1 ? 'Scroll right' : 'Scroll left'}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition-all hover:border-wa-green/50 hover:bg-white/10 hover:text-white"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
