'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { Check, Copy, Globe, Mail, MessageCircle, Package, Sparkles } from 'lucide-react';

import { WhatsAppButton } from '@/components/WhatsAppButton';
import { siteConfig } from '@/lib/config';
import { AnimatedCheck } from '@/components/thankYou/AnimatedCheck';
import { ConfettiBurst } from '@/components/thankYou/ConfettiBurst';
import { TimelineSteps } from '@/components/thankYou/TimelineSteps';

const SERVICE_COPY: Record<string, { headline: string; sub: string; liveLabel: string }> = {
  website: {
    headline: 'Your new website is on its way.',
    sub: "Pixie is deploying it to our global network.",
    liveLabel: 'Deploying to Pixie\'s network',
  },
  ads: {
    headline: 'Your ad creatives are being prepared.',
    sub: 'Pixie is designing variations you can launch today.',
    liveLabel: 'Generating ad variations',
  },
  seo: {
    headline: 'Your SEO audit is being prepared.',
    sub: 'A detailed breakdown is heading to your inbox and WhatsApp.',
    liveLabel: 'Running SEO audit',
  },
  domain: {
    headline: 'Your domain is being connected.',
    sub: 'Pixie is wiring up DNS and SSL.',
    liveLabel: 'Configuring domain',
  },
  chatbot: {
    headline: 'Your AI chatbot is being deployed.',
    sub: 'Pixie is training it on the FAQs and services you shared.',
    liveLabel: 'Training chatbot',
  },
  logo: {
    headline: 'Your new logo is being designed.',
    sub: 'A few options will land in WhatsApp shortly.',
    liveLabel: 'Designing logo concepts',
  },
};

const TIER_LABEL: Record<string, string> = {
  discount: 'Starter package',
  standard: 'Standard package',
  mid: 'Pro package',
};

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'When will I get my site?',
    a: "Most sites deploy within 2–3 minutes. If you selected a custom domain, DNS propagation can add another 15–30 minutes — Pixie will message you the moment it's live.",
  },
  {
    q: 'Can I still make changes?',
    a: "Yes — just tell Pixie what you want changed in WhatsApp. Text, sections, colors, photos — ask for anything and we'll revise.",
  },
  {
    q: 'How do I reach support?',
    a: "Just reply on WhatsApp. Pixie handles most requests instantly, and a human is always a message away if you need one.",
  },
  {
    q: "Where's my receipt?",
    a: 'Stripe is emailing an itemized receipt to the address you used at checkout. It usually arrives within a minute.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${
        open
          ? 'border-wa-green/40 bg-wa-green/[0.04]'
          : 'border-white/8 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
      }`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
        aria-expanded={open}
      >
        <span className={`font-display font-semibold transition ${open ? 'text-white' : 'text-white/90'}`}>
          {q}
        </span>
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-base transition-all duration-200 ${
            open
              ? 'rotate-45 border-wa-green/60 bg-wa-green/10 text-wa-green'
              : 'border-white/20 text-white/70'
          }`}
          aria-hidden
        >
          +
        </span>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="overflow-hidden"
      >
        <p className="px-5 pb-5 text-[15px] leading-relaxed text-white/70 sm:px-6">{a}</p>
      </motion.div>
    </div>
  );
}

function LivePulse({ label }: { label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.85 }}
      className="mx-auto mt-4 flex w-fit items-center gap-2.5 rounded-full border border-wa-green/25 bg-wa-green/[0.06] px-3.5 py-1.5 backdrop-blur-sm"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inset-0 animate-ping rounded-full bg-wa-green/70" />
        <span className="relative h-2 w-2 rounded-full bg-wa-green" />
      </span>
      <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-wa-green">
        Live · {label}
      </span>
    </motion.div>
  );
}

function ThankYouContent() {
  const params = useSearchParams();
  const session = params.get('session') || '';
  const svc = (params.get('svc') || '').toLowerCase();
  const tier = (params.get('tier') || '').toLowerCase();

  const copy = SERVICE_COPY[svc] || {
    headline: 'Your order is being processed.',
    sub: 'Pixie is on it — watch your WhatsApp for the next step.',
    liveLabel: 'Processing your order',
  };
  const tierLabel = TIER_LABEL[tier] || '';

  const prefill = useMemo(
    () => `Hi! I just completed my payment — session ${session || '(from the thank-you page)'}.`,
    [session]
  );

  const [copied, setCopied] = useState(false);
  const copySession = async () => {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable — silent fail
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const sessionShort = session ? `${session.slice(0, 10)}…${session.slice(-4)}` : '';

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-navy-900 text-white">
      {/* ─── Background layers (depth) ──────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 50% 22%, rgba(37,211,102,0.22), transparent 60%), radial-gradient(ellipse 60% 40% at 50% 8%, rgba(18,140,126,0.3), transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.06) 1px, transparent 1px), radial-gradient(circle at 70% 40%, rgba(18,140,126,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px, 80px 80px',
        }}
      />
      {/* Subtle grid dots */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      {/* Top teal glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-52 left-1/2 h-[620px] w-[130%] -translate-x-1/2 rounded-full bg-wa-teal/25 blur-3xl"
      />
      {/* Bottom fade to solid navy */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-navy-900 via-navy-900/80 to-transparent"
      />

      {/* ─── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative pt-6 pb-12 sm:pt-8 sm:pb-16">
        <div className="container-page relative max-w-3xl">
          {/* Payment received pill */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="mx-auto mb-3 flex w-fit items-center gap-2 rounded-full border border-wa-green/30 bg-wa-green/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-wa-green sm:mb-4"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Payment received
          </motion.div>

          {/* Checkmark + confetti */}
          <AnimatedCheck />
          <ConfettiBurst />

          {/* Headline — bigger, more dramatic */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="mt-8 text-center font-display text-display-xl text-balance text-white sm:mt-10"
          >
            You&apos;re on{' '}
            <span className="relative inline-block">
              <span className="relative z-10 bg-gradient-to-br from-wa-green to-wa-teal bg-clip-text text-transparent">
                Pixie.
              </span>
              <span
                aria-hidden
                className="absolute bottom-2 left-0 right-0 -z-0 h-4 rounded-full bg-wa-green/25 blur-lg"
              />
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            className="mt-4 text-center text-lg leading-relaxed text-white/80 sm:text-xl"
          >
            {copy.headline}
            <br />
            <span className="text-white/55">{copy.sub}</span>
          </motion.p>

          {/* Live pulsing indicator — real-time feel */}
          <LivePulse label={copy.liveLabel} />

          {/* Primary CTA — moved up, above the order pill */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.95 }}
            className="mt-6 flex flex-col items-center gap-3"
          >
            <WhatsAppButton
              size="xl"
              label="Continue in WhatsApp"
              prefill={prefill}
              className="w-full max-w-sm sm:w-auto"
            />
            <p className="flex items-center gap-1.5 text-sm text-white/55">
              <MessageCircle className="h-4 w-4 text-wa-green" />
              Pixie just sent you a confirmation.
            </p>
          </motion.div>

          {/* Order summary pill — icons + dot separators */}
          {(tierLabel || svc) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 1.1 }}
              className="mx-auto mt-7 flex w-fit flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm backdrop-blur-sm"
            >
              {tierLabel && (
                <>
                  <span className="flex items-center gap-1.5 font-semibold text-white">
                    <Package className="h-4 w-4 text-wa-green" />
                    {tierLabel}
                  </span>
                  <span className="hidden text-white/30 sm:inline">·</span>
                </>
              )}
              {svc && (
                <>
                  <span className="flex items-center gap-1.5 capitalize text-white/75">
                    <Globe className="h-4 w-4 text-wa-green/80" />
                    {svc}
                  </span>
                  <span className="hidden text-white/30 sm:inline">·</span>
                </>
              )}
              <span className="flex items-center gap-1.5 text-white/65">
                <Mail className="h-4 w-4 text-wa-green/80" />
                Receipt on its way
              </span>
            </motion.div>
          )}
        </div>
      </section>

      {/* ─── What happens next ─────────────────────────────────────────── */}
      <section className="relative border-t border-white/5 py-20 sm:py-24">
        <div className="container-page max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-12 text-center sm:mb-14"
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-wa-green">
              What happens next
            </p>
            <h2 className="font-display text-display-md text-white">Three quick steps.</h2>
            <div className="mx-auto mt-3 h-0.5 w-10 rounded-full bg-wa-green/60" />
            <p className="mt-4 text-white/65">
              <em>No paperwork. No dashboard.</em> Just WhatsApp.
            </p>
          </motion.div>

          <TimelineSteps />
        </div>
      </section>

      {/* ─── FAQ ────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-white/5 py-20 sm:py-24">
        <div className="container-page max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-10 text-center"
          >
            <h2 className="font-display text-display-md text-white">Got questions?</h2>
            <div className="mx-auto mt-3 h-0.5 w-10 rounded-full bg-wa-green/60" />
          </motion.div>

          <div className="space-y-3">
            {FAQS.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>

          {/* Session reference — intentional mini-card, not an afterthought */}
          {session && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="mt-10 rounded-2xl border border-white/8 bg-white/[0.02] p-5 sm:p-6"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
                    Order Reference
                  </p>
                  <code className="mt-1.5 inline-block rounded-md bg-navy-900/60 px-2.5 py-1 font-mono text-[13px] text-white/85 ring-1 ring-white/10">
                    {sessionShort}
                  </code>
                </div>
                <button
                  onClick={copySession}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm font-semibold text-white/80 transition hover:border-wa-green/40 hover:bg-wa-green/[0.08] hover:text-wa-green"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-wa-green" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <p className="mt-3 text-xs text-white/45">
                Keep this handy if you ever need to reach support about this order.
              </p>
            </motion.div>
          )}
        </div>
      </section>

      {/* ─── Minimal footer ─────────────────────────────────────────────── */}
      <footer className="relative border-t border-white/5 py-10">
        <div className="container-page flex flex-col items-center justify-between gap-4 text-sm text-white/40 sm:flex-row">
          <div className="flex items-center gap-2">
            <img src="/pixie-logo-white.png" alt={siteConfig.brand} className="h-8 w-auto" />
          </div>
          <div className="flex items-center gap-5">
            <a
              href={`mailto:${siteConfig.supportEmail}`}
              className="transition hover:text-white"
            >
              {siteConfig.supportEmail}
            </a>
            <a href="/" className="transition hover:text-white">
              Home
            </a>
          </div>
          <p>© {new Date().getFullYear()} {siteConfig.brand}</p>
        </div>
      </footer>
    </div>
  );
}

export default function ThankYouPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-navy-900" />}>
      <ThankYouContent />
    </Suspense>
  );
}
