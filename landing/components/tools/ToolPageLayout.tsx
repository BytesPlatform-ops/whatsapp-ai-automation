import Link from 'next/link';
import { ChevronRight, Sparkles } from 'lucide-react';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { ToolJsonLd } from '@/components/tools/ToolJsonLd';
import { type ToolDefinition } from '@/lib/tools';
import type { ReactNode } from 'react';

interface ToolPageLayoutProps {
  tool: ToolDefinition;
  children: ReactNode;
}

export function ToolPageLayout({ tool, children }: ToolPageLayoutProps) {
  return (
    <>
      <ToolJsonLd tool={tool} />

      {/* Hero with breadcrumb + H1 + tool */}
      <section className="relative overflow-hidden bg-navy-900 pt-28 pb-16 text-white sm:pt-32 sm:pb-20">
        <div aria-hidden className="absolute inset-0 bg-hero-radial" />
        <div aria-hidden className="absolute inset-0 grid-noise opacity-[0.12]" />

        <div className="container-page relative">
          <nav
            aria-label="Breadcrumb"
            className="mb-6 flex items-center gap-1.5 text-sm text-white/60"
          >
            <Link href="/" className="hover:text-white">
              Home
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href="/tools" className="hover:text-white">
              Tools
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-white/90">{tool.shortName}</span>
          </nav>

          <div className="flex items-center gap-3 mb-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-2xl backdrop-blur" aria-hidden>
              {tool.emoji}
            </span>
            <span className="rounded-full border border-wa-green/30 bg-wa-green/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-wa-green">
              {tool.category}
            </span>
          </div>

          <h1 className="font-display text-display-xl text-balance text-white max-w-3xl">
            {tool.h1}
          </h1>

          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/75">
            {tool.intro}
          </p>
        </div>
      </section>

      {/* Tool slot — the actual interactive tool lives here */}
      <section className="relative bg-ink-50 py-12 sm:py-16">
        <div className="container-page">
          <div className="mx-auto max-w-4xl rounded-3xl bg-white p-6 shadow-card ring-1 ring-ink-100 sm:p-10">
            {children}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white py-20 sm:py-24">
        <div className="container-page">
          <div className="mx-auto max-w-3xl text-center mb-12">
            <h2 className="font-display text-display-lg text-balance text-ink-900">
              How the {tool.shortName} works
            </h2>
            <p className="mt-4 text-lg text-ink-500">
              Three simple steps. No signup. No installation.
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-3">
            {tool.howItWorks.map((step, i) => (
              <div
                key={step.title}
                className="relative rounded-2xl border border-ink-100 bg-white p-6 shadow-soft"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-wa-green text-base font-bold text-white">
                  {i + 1}
                </div>
                <h3 className="font-display text-lg font-bold text-ink-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About / long-form SEO content */}
      <section className="bg-ink-50 py-20 sm:py-24">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-display-lg text-balance text-ink-900">
              {tool.aboutHeading}
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-ink-500">{tool.about}</p>
          </div>
        </div>
      </section>

      {/* Soft CTA to WhatsApp */}
      <section className="relative overflow-hidden bg-navy-900 py-20 text-white sm:py-24">
        <div aria-hidden className="absolute inset-0 bg-hero-radial" />
        <div className="container-page relative">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-wa-green/30 bg-wa-green/10 px-3 py-1 text-[12.5px] font-semibold uppercase tracking-wider text-wa-green">
              <Sparkles className="h-3.5 w-3.5" />
              Need more than a tool?
            </span>
            <h2 className="mt-5 font-display text-display-lg text-balance text-white">
              Your full website, built by a WhatsApp chat.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-white/75">
              {tool.ctaHook}
            </p>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <WhatsAppButton
                size="xl"
                label="Start on WhatsApp"
                prefill={`Hi! I just used the ${tool.shortName} on pixiebot.co — interested in your other services.`}
              />
              <Link
                href="/tools"
                className="inline-flex h-14 items-center justify-center gap-2 rounded-full border-2 border-wa-green/40 bg-wa-green/5 px-7 text-base font-semibold text-white transition-all hover:border-wa-green hover:bg-wa-green/10"
              >
                Browse all tools
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
