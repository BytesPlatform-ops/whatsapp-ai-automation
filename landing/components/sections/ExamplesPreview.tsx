'use client';

import { motion } from 'framer-motion';
import { ArrowUpRight, MapPin } from 'lucide-react';
import { DEMO_SITES } from '@/lib/demoSites';

// "Proof strip" — lands right after HowItWorks so users seeing the
// "3-minute on WhatsApp" pitch immediately get tangible evidence it
// actually works. 4 real Netlify sites, clickable thumbnails via the
// same Microlink screenshot pipeline as the /examples page.

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

function MiniSiteCard({ site, index }: { site: (typeof DEMO_SITES)[number]; index: number }) {
  const accent = INDUSTRY_ACCENT[site.id] || 'from-wa-teal to-wa-green';
  return (
    <motion.a
      href={site.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay: index * 0.07, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
      className="group relative overflow-hidden rounded-2xl border border-ink-100 bg-white transition-all hover:border-wa-green/40 hover:shadow-card"
    >
      {/* Accent stripe */}
      <div className={`h-0.5 w-full bg-gradient-to-r ${accent}`} />

      {/* Browser chrome + screenshot */}
      <div className="relative border-b border-ink-100 bg-navy-900">
        <div className="flex items-center gap-1.5 px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-red-400/70" />
          <span className="h-2 w-2 rounded-full bg-amber-400/70" />
          <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
          <div className="ml-2 flex-1 truncate rounded bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/50 ring-1 ring-white/5">
            {site.url.replace(/^https?:\/\//, '').slice(0, 32)}
          </div>
        </div>
        <div className="relative aspect-[16/10] overflow-hidden bg-navy-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshotUrl(site.url)}
            alt={`${site.businessName} preview`}
            className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        </div>
      </div>

      {/* Meta */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p
              className={`text-[11px] font-bold uppercase tracking-[0.14em] bg-gradient-to-r ${accent} bg-clip-text text-transparent`}
            >
              {site.label}
            </p>
            <h3 className="mt-1 truncate font-display text-lg font-bold text-ink-900">
              {site.businessName}
            </h3>
            <p className="mt-1 flex items-center gap-1 text-xs text-ink-400">
              <MapPin className="h-3 w-3" />
              {site.city}
            </p>
          </div>
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink-100 text-ink-400 transition-all group-hover:border-wa-green group-hover:bg-wa-green/5 group-hover:text-wa-green">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </motion.a>
  );
}

export function ExamplesPreview() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white via-ink-50/40 to-white py-20 sm:py-24">
      {/* Subtle background accents to separate from HowItWorks above */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(rgba(18,140,126,0.8) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />

      <div className="container-page relative">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-wa-teal">
            Already built
          </p>
          <h2 className="font-display text-display-lg text-balance text-ink-900">
            Real sites. <span className="text-wa-teal">Real businesses.</span> All from WhatsApp.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-ink-500">
            Each of these was built in under 3 minutes from one chat. Tap any to open the live site.
          </p>
        </motion.div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:gap-6 md:grid-cols-2">
          {DEMO_SITES.map((site, i) => (
            <MiniSiteCard key={site.id} site={site} index={i} />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-10 flex justify-center"
        >
          <a
            href="/examples"
            className="group inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-900 transition hover:border-wa-green hover:bg-wa-green/5 hover:text-wa-teal"
          >
            Explore all {DEMO_SITES.length} examples
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
