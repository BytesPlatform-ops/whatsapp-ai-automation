'use client';

import { motion } from 'framer-motion';
import { ArrowUpRight, MapPin } from 'lucide-react';
import type { DemoSite } from '@/lib/demoSites';

// Screenshot via Microlink's free embed API. Generates a fresh capture
// server-side so the card always reflects the live site's current state.
function screenshotUrl(url: string) {
  const params = new URLSearchParams({
    url,
    screenshot: 'true',
    embed: 'screenshot.url',
    waitUntil: 'networkidle0',
    viewport: JSON.stringify({ width: 1280, height: 800, deviceScaleFactor: 1 }),
    meta: 'false',
  });
  return `https://api.microlink.io?${params.toString()}`;
}

const INDUSTRY_ACCENT: Record<string, string> = {
  hvac: 'from-[#1E3A5F] to-[#F97316]',
  'real-estate': 'from-[#1A2B45] to-[#C9A96E]',
  salon: 'from-[#1F2937] to-[#EC4899]',
  generic: 'from-[#1C1917] to-[#D97706]',
};

interface SiteCardProps {
  site: DemoSite;
  index: number;
}

export function SiteCard({ site, index }: SiteCardProps) {
  const accent = INDUSTRY_ACCENT[site.id] || 'from-wa-teal to-wa-green';

  return (
    <motion.a
      href={site.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: 'easeOut' }}
      whileHover={{ y: -4 }}
      className="group relative overflow-hidden rounded-3xl border border-white/8 bg-white/[0.02] transition-all hover:border-wa-green/30 hover:shadow-[0_20px_60px_-20px_rgba(37,211,102,0.35)]"
    >
      {/* Accent bar — a colored stripe at the top matching the template's palette */}
      <div className={`h-1 w-full bg-gradient-to-r ${accent}`} />

      {/* Browser mockup */}
      <div className="relative border-b border-white/5 bg-navy-900">
        {/* Chrome bar */}
        <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          </div>
          <div className="ml-3 flex flex-1 items-center justify-center">
            <div className="flex max-w-full items-center gap-1.5 truncate rounded-md bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/60 ring-1 ring-white/5">
              <svg className="h-3 w-3 shrink-0 opacity-60" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 016 0v2a1 1 0 102 0V7a5 5 0 00-5-5z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="truncate">{site.url.replace(/^https?:\/\//, '')}</span>
            </div>
          </div>
        </div>

        {/* Screenshot */}
        <div className="relative aspect-[16/10] overflow-hidden bg-navy-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshotUrl(site.url)}
            alt={`${site.businessName} website preview`}
            className="h-full w-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
            loading="lazy"
          />
          {/* Subtle gradient overlay on hover for readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-navy-900/30 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>

      {/* Card body */}
      <div className="p-6 sm:p-7">
        {/* Industry badge */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${accent} bg-clip-text text-[11px] font-bold uppercase tracking-[0.14em] text-transparent`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-r ${accent}`}
            />
            {site.label}
          </span>
          <span className="flex items-center gap-1 text-[11px] font-medium text-white/40">
            <MapPin className="h-3 w-3" />
            {site.city}
          </span>
        </div>

        {/* Business name */}
        <h3 className="font-display text-xl font-bold text-white sm:text-2xl">
          {site.businessName}
        </h3>

        {/* The prompt — quoted, this sells the workflow */}
        <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-white/65">
            <span className="mt-0.5 select-none font-serif text-xl leading-none text-wa-green/60">
              &ldquo;
            </span>
            <span>{site.prompt}</span>
          </p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">
            — What the user typed on WhatsApp
          </p>
        </div>

        {/* Visit CTA */}
        <div className="mt-5 flex items-center justify-between">
          <span className="text-sm text-white/50">Built in under 3 minutes</span>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-wa-green transition group-hover:gap-2.5">
            Visit live site
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </motion.a>
  );
}
