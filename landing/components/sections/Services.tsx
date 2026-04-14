'use client';

import { motion } from 'framer-motion';
import {
  Globe,
  Megaphone,
  Search,
  Bot,
  ArrowUpRight,
} from 'lucide-react';
import { Section, SectionHeading } from '@/components/Section';
import { WhatsAppButton } from '@/components/WhatsAppButton';

type Mock = 'website' | 'ad' | 'seo' | 'chatbot';

const services: {
  icon: typeof Globe;
  tag: string;
  title: string;
  body: string;
  points: string[];
  cta: string;
  prefill: string;
  mock: Mock;
}[] = [
  {
    icon: Globe,
    tag: 'Websites',
    title: 'A live website in 3 minutes.',
    body: 'Tell the bot your business and vibe. Get a production-ready preview link — real domain, mobile-ready, yours to approve.',
    points: ['Custom branding & content', 'Mobile-first layouts', 'Live preview link you can share', 'Connect your own domain'],
    cta: 'Build my site',
    prefill: 'I want to build a website',
    mock: 'website',
  },
  {
    icon: Megaphone,
    tag: 'Marketing Ads',
    title: 'Ad creatives that actually look paid for.',
    body: 'Describe the promo. Our bot generates 3 on-brand ad variations using AI — sized for Meta, Instagram, and WhatsApp Status.',
    points: ['3 AI-generated variations', 'Your colors + product photo', 'Caption + hook included', 'Download-ready in 2 min'],
    cta: 'Design my ad',
    prefill: 'I want to design a marketing ad',
    mock: 'ad',
  },
  {
    icon: Search,
    tag: 'SEO Audit',
    title: 'A free SEO check that reads like English.',
    body: 'Send your URL. Get a plain-English audit of what\'s broken, what to fix first, and what it means for your Google ranking.',
    points: ['Tech + content scan', 'Top 5 fixes, ranked', 'Competitor benchmark', 'Delivered as a PDF report'],
    cta: 'Audit my site',
    prefill: 'Please audit my website',
    mock: 'seo',
  },
  {
    icon: Bot,
    tag: 'Chatbot SaaS',
    title: 'A 24/7 AI chatbot for your own site.',
    body: 'White-label chatbot trained on your business in 5 min. Drop one widget script and it answers leads while you sleep.',
    points: ['Trained on your docs', 'One-line embed script', 'Handoff to your WhatsApp', 'Free trial, no card'],
    cta: 'Get my chatbot',
    prefill: 'I want the AI chatbot for my site',
    mock: 'chatbot',
  },
];

function MockVisual({ type }: { type: Mock }) {
  if (type === 'website') {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-ink-100 to-white p-4 ring-1 ring-ink-100">
        {/* Browser chrome */}
        <div className="mb-3 flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 truncate rounded-md bg-white px-2 py-1 text-[11px] text-ink-400 ring-1 ring-ink-100">
            sunrise-bakery.bytesplatform.site
          </span>
        </div>
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-ink-100">
          <div className="relative h-40 bg-gradient-to-br from-amber-50 via-white to-wa-bubble">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-2 h-8 w-8 rounded-full bg-wa-green" />
                <p className="font-display text-lg font-bold text-ink-900">Sunrise Bakery</p>
                <p className="text-[11px] text-ink-500">Fresh sourdough. Baked daily.</p>
                <span className="mt-2 inline-block rounded-full bg-ink-900 px-3 py-1 text-[11px] font-semibold text-white">
                  Order on WhatsApp
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1 p-1">
            <div className="h-10 rounded bg-ink-100" />
            <div className="h-10 rounded bg-ink-100" />
            <div className="h-10 rounded bg-ink-100" />
          </div>
        </div>
      </div>
    );
  }
  if (type === 'ad') {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[
          { bg: 'from-rose-400 to-amber-400', title: '30% OFF', sub: 'Weekend Brunch' },
          { bg: 'from-wa-teal to-wa-green', title: 'Summer', sub: 'Up to 40% off' },
          { bg: 'from-ink-900 to-indigo-700', title: 'Tonight', sub: 'Chef\u2019s special' },
          { bg: 'from-amber-500 to-rose-500', title: 'Daily', sub: 'Happy hour 5\u20137' },
        ].map((v, i) => (
          <div
            key={i}
            className={`relative aspect-square overflow-hidden rounded-xl bg-gradient-to-br ${v.bg} p-3 text-white shadow-soft`}
          >
            <div className="absolute right-2 top-2 rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
              Layla Cafe
            </div>
            <div className="absolute bottom-3 left-3">
              <p className="font-display text-2xl font-extrabold leading-none">{v.title}</p>
              <p className="text-xs opacity-90">{v.sub}</p>
            </div>
            <div className="absolute -bottom-4 -right-4 h-16 w-16 rounded-full bg-white/10" />
          </div>
        ))}
      </div>
    );
  }
  if (type === 'seo') {
    return (
      <div className="rounded-2xl bg-white p-4 ring-1 ring-ink-100">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Site Score</p>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">GOOD</span>
        </div>
        <div className="mt-2 flex items-end gap-2">
          <span className="font-display text-5xl font-extrabold text-ink-900">78</span>
          <span className="mb-1 text-sm text-ink-400">/ 100</span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink-100">
          <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-wa-green to-emerald-500" />
        </div>
        <div className="mt-5 space-y-2.5">
          {[
            { label: 'Page speed', val: 92, color: 'bg-emerald-500' },
            { label: 'Meta tags', val: 65, color: 'bg-amber-500' },
            { label: 'Mobile UX', val: 88, color: 'bg-emerald-500' },
            { label: 'Internal links', val: 42, color: 'bg-rose-500' },
          ].map((m) => (
            <div key={m.label}>
              <div className="mb-1 flex items-center justify-between text-xs text-ink-500">
                <span>{m.label}</span>
                <span className="font-semibold text-ink-900">{m.val}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                <div className={`h-full ${m.color}`} style={{ width: `${m.val}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  // chatbot
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white p-4 ring-1 ring-ink-100">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 truncate rounded-md bg-ink-50 px-2 py-1 text-[11px] text-ink-400">
          your-site.com
        </span>
      </div>
      <div className="relative h-44 rounded-lg bg-gradient-to-br from-ink-50 to-white p-3">
        <div className="h-2 w-24 rounded bg-ink-100" />
        <div className="mt-2 h-2 w-40 rounded bg-ink-100" />
        <div className="mt-2 h-2 w-32 rounded bg-ink-100" />
        {/* Widget */}
        <div className="absolute bottom-3 right-3 w-56 rounded-xl bg-white shadow-card ring-1 ring-ink-100">
          <div className="flex items-center gap-2 rounded-t-xl bg-wa-teal px-3 py-2 text-white">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">AI</span>
            <p className="text-[12px] font-semibold">Chat assistant</p>
            <span className="ml-auto h-2 w-2 rounded-full bg-wa-green" />
          </div>
          <div className="space-y-1.5 p-2.5">
            <div className="max-w-[80%] rounded-lg bg-ink-50 px-2 py-1.5 text-[11px] text-ink-700">
              Hi 👋 need help finding something?
            </div>
            <div className="ml-auto max-w-[80%] rounded-lg bg-wa-bubble px-2 py-1.5 text-[11px] text-ink-900">
              Pricing for the pro plan?
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Services() {
  return (
    <Section id="services">
      <SectionHeading
        eyebrow="What the bot can build"
        title={
          <>
            Four services. <span className="text-wa-teal">One message</span> away.
          </>
        }
        subtitle="Every service is delivered entirely inside WhatsApp — no logins, no separate tools."
      />

      <div className="space-y-20 sm:space-y-28">
        {services.map((svc, i) => {
          const Icon = svc.icon;
          const isEven = i % 2 === 0;
          return (
            <motion.div
              key={svc.tag}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6 }}
              className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
            >
              <div className={isEven ? 'lg:order-1' : 'lg:order-2'}>
                <div className="inline-flex items-center gap-2 rounded-full bg-wa-bubble/60 px-3 py-1 text-xs font-bold uppercase tracking-wider text-wa-teal">
                  <Icon className="h-3.5 w-3.5" />
                  {svc.tag}
                </div>
                <h3 className="mt-4 font-display text-display-md text-balance text-ink-900">
                  {svc.title}
                </h3>
                <p className="mt-4 text-lg leading-relaxed text-ink-500">{svc.body}</p>
                <ul className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {svc.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-ink-700">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-wa-green" />
                      {p}
                    </li>
                  ))}
                </ul>
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <WhatsAppButton size="lg" label={svc.cta} prefill={svc.prefill} />
                  <a
                    href="#faq"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-wa-teal hover:text-wa-green"
                  >
                    How does this work? <ArrowUpRight className="h-4 w-4" />
                  </a>
                </div>
              </div>

              <div className={isEven ? 'lg:order-2' : 'lg:order-1'}>
                <div className="relative">
                  <div
                    aria-hidden
                    className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-wa-bubble/40 to-transparent blur-2xl"
                  />
                  <MockVisual type={svc.mock} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </Section>
  );
}
