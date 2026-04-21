import type { Metadata } from 'next';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { Navigation } from '@/components/sections/Navigation';
import { Footer } from '@/components/sections/Footer';
import { SiteCard } from '@/components/examples/SiteCard';
import { AuditCard } from '@/components/examples/AuditCard';
import { DEMO_SITES } from '@/lib/demoSites';
import { AUDIT_EXAMPLES } from '@/lib/auditExamples';
import { siteConfig } from '@/lib/config';

export const metadata: Metadata = {
  title: `Examples — Built by ${siteConfig.brand}`,
  description:
    'Real sites, real businesses. Every one built from a single WhatsApp conversation with our AI bot. Tap any example to explore the live site.',
  openGraph: {
    title: `Built by ${siteConfig.brand}`,
    description:
      'Real sites for real businesses — each one built from a WhatsApp chat in under 3 minutes.',
  },
};

export default function ExamplesPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-navy-900 text-white">
      <Navigation />

      {/* Background — same language as landing hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(37,211,102,0.18), transparent 60%), radial-gradient(ellipse 50% 35% at 50% 5%, rgba(18,140,126,0.25), transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />

      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-12 sm:pt-36 sm:pb-16">
        <div className="container-page max-w-4xl text-center">
          <div className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-full border border-wa-green/30 bg-wa-green/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-wa-green">
            <span className="flex h-2 w-2">
              <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-wa-green/70" />
              <span className="relative h-2 w-2 rounded-full bg-wa-green" />
            </span>
            Live examples
          </div>

          <h1 className="font-display text-display-xl text-balance text-white">
            Built by{' '}
            <span className="relative inline-block">
              <span className="relative z-10 bg-gradient-to-br from-wa-green to-wa-teal bg-clip-text text-transparent">
                Pixie.
              </span>
              <span
                aria-hidden
                className="absolute bottom-2 left-0 right-0 -z-0 h-4 rounded-full bg-wa-green/25 blur-lg"
              />
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/75 sm:text-xl">
            Real sites, real businesses. Each one built from{' '}
            <span className="text-white">a single WhatsApp conversation</span> — in under three
            minutes. Tap any example to open the live site.
          </p>

          <div className="mx-auto mt-4 h-0.5 w-12 rounded-full bg-wa-green/60" />
        </div>
      </section>

      {/* ─── Grid ────────────────────────────────────────────────────── */}
      <section className="relative pb-20 sm:pb-28">
        <div className="container-page max-w-6xl">
          <div className="grid gap-6 sm:gap-8 lg:grid-cols-2">
            {DEMO_SITES.map((site, i) => (
              <SiteCard key={site.id} site={site} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ─── SEO Audits section ──────────────────────────────────────── */}
      <section id="seo-audits" className="relative border-t border-white/5 py-20 sm:py-28 scroll-mt-20">
        <div className="container-page max-w-6xl">
          <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-14">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-wa-green">
              Also built by Pixie
            </p>
            <h2 className="font-display text-display-lg text-balance text-white">
              Free SEO audits, straight in WhatsApp.
            </h2>
            <div className="mx-auto mt-3 h-0.5 w-10 rounded-full bg-wa-green/60" />
            <p className="mt-5 text-lg leading-relaxed text-white/75">
              Send a URL — get a full PDF audit in under a minute: Lighthouse scores, Core Web
              Vitals, indexability gaps, security headers, and a top 3 action list.
            </p>
          </div>

          <div className="grid gap-6 sm:gap-7 lg:grid-cols-2">
            {AUDIT_EXAMPLES.map((audit, i) => (
              <AuditCard key={audit.id} audit={audit} index={i} />
            ))}
          </div>

          <div className="mx-auto mt-12 flex justify-center">
            <WhatsAppButton
              size="lg"
              label="Audit my site"
              prefill="Hi! I'd like a free SEO audit for my site — here's the URL:"
            />
          </div>
        </div>
      </section>

      {/* ─── CTA strip ────────────────────────────────────────────────── */}
      <section className="relative border-t border-white/5 py-20 sm:py-24">
        <div className="container-page max-w-3xl text-center">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-wa-green">
            Your turn
          </p>
          <h2 className="font-display text-display-lg text-balance text-white">
            Want one of these for your business?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-white/70">
            Message Pixie on WhatsApp. Tell it what you do. Get a live preview in minutes — no
            login, no code, no meetings.
          </p>

          <div className="mt-9 flex flex-col items-center gap-3">
            <WhatsAppButton
              size="xl"
              label="Start yours on WhatsApp"
              prefill="Hi! I saw the examples — I'd like one for my business."
              className="w-full max-w-sm sm:w-auto"
            />
            <p className="text-sm text-white/45">Free to start · No signup · Reply in 10 sec</p>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
