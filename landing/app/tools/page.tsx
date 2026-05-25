import type { Metadata } from 'next';
import Link from 'next/link';
import { Sparkles, Zap, Shield } from 'lucide-react';
import { ToolCard } from '@/components/tools/ToolCard';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { TOOLS } from '@/lib/tools';
import { siteConfig } from '@/lib/config';

const indexOgImage = {
  url: `https://${siteConfig.domain}/tools/trust-badge-generator.jpg`,
  width: 1200,
  height: 675,
  alt: 'Free online tools from Pixie',
};

export const metadata: Metadata = {
  title: 'Free Online Tools for Your Business | Pixie',
  description:
    'Browse Pixie\'s free online tools — generators and calculators for your business. No signup, no login, instant results in seconds.',
  keywords: [
    'free online tools',
    'free calculators',
    'free generators',
    'ai tools',
    'pixie tools',
  ],
  alternates: {
    canonical: `https://${siteConfig.domain}/tools`,
  },
  openGraph: {
    title: 'Free AI Tools by Pixie',
    description:
      'A growing library of free calculators, generators, and converters — no signup, instant results, AI-powered where it helps.',
    type: 'website',
    url: `https://${siteConfig.domain}/tools`,
    siteName: siteConfig.brand,
    images: [indexOgImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free AI Tools by Pixie',
    description:
      'A growing library of free calculators, generators, and converters — no signup, instant results.',
    images: [indexOgImage.url],
  },
};

const categories = ['Generator', 'Calculator', 'Converter'] as const;

const collectionJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Free AI Tools by Pixie',
  url: `https://${siteConfig.domain}/tools`,
  description:
    'Free online tools — calculators, generators, and converters. No signup, instant results.',
  hasPart: TOOLS.map((t) => ({
    '@type': 'SoftwareApplication',
    name: t.shortName,
    url: `https://${siteConfig.domain}/tools/${t.slug}`,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  })),
};

export default function ToolsIndexPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />

      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-900 pt-28 pb-16 text-white sm:pt-32 sm:pb-20">
        <div aria-hidden className="absolute inset-0 bg-hero-radial" />
        <div aria-hidden className="absolute inset-0 grid-noise opacity-[0.12]" />

        <div className="container-page relative">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-wa-green/30 bg-wa-green/10 px-3 py-1 text-[12.5px] font-semibold uppercase tracking-wider text-wa-green">
              <Sparkles className="h-3.5 w-3.5" />
              Free forever · No signup
            </span>

            <h1 className="mt-5 font-display text-display-xl text-balance text-white">
              Free tools that{' '}
              <span className="relative block sm:inline-block">
                <span className="relative z-10 text-wa-green">actually save you time.</span>
                <span
                  aria-hidden
                  className="absolute bottom-1 left-0 right-0 -z-0 h-3 rounded-full bg-wa-green/20 blur-md hidden sm:block"
                />
              </span>
            </h1>

            <p className="mt-6 text-lg leading-relaxed text-white/75">
              Calculators, generators, and converters built by the team behind Pixie. AI-powered where it helps — no fluff, no popups, no signup. Just useful tools you can run in seconds.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-white/65">
              <span className="flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-wa-green" />
                Instant results
              </span>
              <span className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-wa-green" />
                Privacy-first
              </span>
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-wa-green" />
                {TOOLS.length} tools and growing
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Tools grid */}
      <section className="bg-ink-50 py-20 sm:py-24">
        <div className="container-page">
          {categories.map((cat) => {
            const inCategory = TOOLS.filter((t) => t.category === cat);
            if (inCategory.length === 0) return null;
            return (
              <div key={cat} className="mb-16 last:mb-0">
                <div className="mb-6 flex items-baseline justify-between">
                  <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
                    {cat}s
                  </h2>
                  <span className="text-sm text-ink-400">
                    {inCategory.length} {inCategory.length === 1 ? 'tool' : 'tools'}
                  </span>
                </div>
                <div className="grid gap-6 sm:grid-cols-2">
                  {inCategory.map((tool) => (
                    <ToolCard key={tool.slug} tool={tool} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Soft CTA */}
      <section className="relative overflow-hidden bg-navy-900 py-20 text-white sm:py-24">
        <div aria-hidden className="absolute inset-0 bg-hero-radial" />
        <div className="container-page relative">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-display text-display-lg text-balance text-white">
              Need more than a tool? Text Pixie.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-white/75">
              Live websites in 60 seconds, ad creatives in 2 minutes, free SEO audits in under 6. All from a single WhatsApp message.
            </p>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <WhatsAppButton
                size="xl"
                label="Start on WhatsApp"
                prefill="Hi! I found your free tools page — interested in building a website."
              />
              <Link
                href="/"
                className="inline-flex h-14 items-center justify-center gap-2 rounded-full border-2 border-wa-green/40 bg-wa-green/5 px-7 text-base font-semibold text-white transition-all hover:border-wa-green hover:bg-wa-green/10"
              >
                See what Pixie does
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
