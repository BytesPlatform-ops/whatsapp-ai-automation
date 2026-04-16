'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Check, Copy, Mail, MessageCircle, Sparkles } from 'lucide-react';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { siteConfig } from '@/lib/config';
import { AnimatedCheck } from '@/components/thankYou/AnimatedCheck';
import { ConfettiBurst } from '@/components/thankYou/ConfettiBurst';

// Service copy lookup. Adds the "what happens next" headline + a hero
// sub-copy that matches exactly what the user just bought. Everything
// falls back gracefully to a generic line if the svc param is missing.
const SERVICE_COPY: Record<string, { headline: string; sub: string }> = {
  website: {
    headline: 'Your new website is on its way.',
    sub: 'Pixie is deploying it to our global network right now.',
  },
  ads: {
    headline: 'Your ad creatives are being prepared.',
    sub: 'Pixie is designing variations you can launch today.',
  },
  seo: {
    headline: 'Your SEO audit is being prepared.',
    sub: 'A detailed breakdown is heading to your inbox and WhatsApp.',
  },
  domain: {
    headline: 'Your domain is being connected.',
    sub: 'Pixie is wiring up DNS and SSL — this takes a few minutes.',
  },
  chatbot: {
    headline: 'Your AI chatbot is being deployed.',
    sub: 'Pixie is training it on the FAQs and services you shared.',
  },
  logo: {
    headline: 'Your new logo is being designed.',
    sub: 'A few options will land in WhatsApp shortly.',
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
    a: 'Most sites deploy within 2–3 minutes. If you selected a custom domain, DNS propagation can add another 15–30 minutes — Pixie will message you the moment it\'s live.',
  },
  {
    q: 'Can I still make changes?',
    a: 'Yes — just tell Pixie what you want changed in WhatsApp. Text, sections, colors, photos — ask for anything and we\'ll revise.',
  },
  {
    q: 'How do I reach support?',
    a: 'Just reply on WhatsApp. Pixie handles most requests instantly, and a human is always a message away if you need one.',
  },
  {
    q: 'Where\'s my receipt?',
    a: 'Stripe is emailing an itemized receipt to the address you used at checkout. It usually arrives within a minute.',
  },
];

function TimelineStep({
  index,
  title,
  desc,
  time,
  delay,
  done,
}: {
  index: number;
  title: string;
  desc: string;
  time: string;
  delay: number;
  done?: boolean;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      className="relative flex gap-5 rounded-2xl border border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6"
    >
      {/* Number chip */}
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display font-bold text-sm ${
          done
            ? 'bg-gradient-to-br from-wa-green to-wa-teal text-white shadow-[0_0_20px_-4px_rgba(37,211,102,0.6)]'
            : 'bg-white/10 text-white/90 ring-1 ring-white/15'
        }`}
      >
        {done ? <Check className="h-5 w-5" /> : index}
      </div>

      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
          <span className="inline-flex items-center rounded-full bg-wa-green/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-wa-green ring-1 ring-wa-green/25">
            {time}
          </span>
        </div>
        <p className="mt-1.5 text-[15px] leading-relaxed text-white/70">{desc}</p>
      </div>
    </motion.li>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] transition hover:border-white/15">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
      >
        <span className="font-display font-semibold text-white">{q}</span>
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 text-white/70 transition-transform duration-200 ${
            open ? 'rotate-45' : ''
          }`}
          aria-hidden
        >
          +
        </span>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="overflow-hidden"
      >
        <p className="px-5 pb-5 text-[15px] leading-relaxed text-white/70 sm:px-6">{a}</p>
      </motion.div>
    </div>
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
      // Clipboard API unavailable — silent fail, UI stays unchanged
    }
  };

  // On mount, scroll to top so animation starts from a clean viewport.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const sessionShort = session ? `${session.slice(0, 8)}…${session.slice(-4)}` : '';

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-navy-900 text-white">
      {/* Background treatments — same language as landing hero */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-hero-radial" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.05) 1px, transparent 1px), radial-gradient(circle at 70% 40%, rgba(18,140,126,0.08) 1px, transparent 1px)',
          backgroundSize: '60px 60px, 80px 80px',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[110%] -translate-x-1/2 rounded-full bg-wa-teal/20 blur-3xl"
      />

      {/* ─── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative pt-16 pb-16 sm:pt-24 sm:pb-20">
        <div className="container-page relative max-w-3xl">
          {/* Payment received pill */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="mx-auto mb-8 flex w-fit items-center gap-2 rounded-full border border-wa-green/30 bg-wa-green/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-wa-green sm:mb-10"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Payment received
          </motion.div>

          {/* Animated check */}
          <AnimatedCheck />
          <ConfettiBurst />

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.5 }}
            className="mt-10 text-center font-display text-display-lg text-balance text-white"
          >
            You&apos;re on{' '}
            <span className="relative inline-block">
              <span className="relative z-10 text-wa-green">Pixie.</span>
              <span
                aria-hidden
                className="absolute bottom-1 left-0 right-0 -z-0 h-3 rounded-full bg-wa-green/25 blur-md"
              />
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.65 }}
            className="mt-4 text-center text-lg leading-relaxed text-white/75 sm:text-xl"
          >
            {copy.headline}
            <br />
            <span className="text-white/55">{copy.sub}</span>
          </motion.p>

          {/* Order pill */}
          {(tierLabel || svc) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.8 }}
              className="mx-auto mt-7 flex w-fit items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/80 backdrop-blur-sm"
            >
              {tierLabel && (
                <>
                  <span className="font-semibold text-white">{tierLabel}</span>
                  <span className="h-4 w-px bg-white/15" />
                </>
              )}
              {svc && <span className="capitalize text-white/65">{svc}</span>}
              <span className="h-4 w-px bg-white/15" />
              <span className="flex items-center gap-1.5 text-white/65">
                <Mail className="h-3.5 w-3.5" />
                Receipt on its way
              </span>
            </motion.div>
          )}

          {/* Primary CTA */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 1 }}
            className="mt-10 flex flex-col items-center gap-3"
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
        </div>
      </section>

      {/* ─── What happens next ─────────────────────────────────────────── */}
      <section className="relative border-t border-white/5 bg-navy-900/40 py-16 sm:py-20">
        <div className="container-page max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-10 text-center sm:mb-12"
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-wa-green">
              What happens next
            </p>
            <h2 className="font-display text-display-md text-white">Three quick steps.</h2>
            <p className="mt-2 text-white/65">No paperwork, no dashboard. Just WhatsApp.</p>
          </motion.div>

          <ol className="space-y-4">
            <TimelineStep
              index={1}
              done
              title="Check your WhatsApp"
              desc="Pixie confirmed your payment and sent the next steps. It's the fastest way to stay in the loop."
              time="< 30 sec"
              delay={0.05}
            />
            <TimelineStep
              index={2}
              title="Your site goes live"
              desc="We're deploying your site to Pixie's global network right now. The preview link lands in WhatsApp the moment it's ready."
              time="2–3 min"
              delay={0.15}
            />
            <TimelineStep
              index={3}
              title="Custom domain connected"
              desc="If you picked a custom domain, we're wiring up DNS and SSL. You'll get a 'live on yourdomain.com' message once propagation finishes."
              time="15–30 min"
              delay={0.25}
            />
          </ol>
        </div>
      </section>

      {/* ─── FAQ + session ref ─────────────────────────────────────────── */}
      <section className="relative border-t border-white/5 py-16 sm:py-20">
        <div className="container-page max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-8 text-center sm:mb-10"
          >
            <h2 className="font-display text-display-md text-white">Questions?</h2>
          </motion.div>

          <div className="space-y-3">
            {FAQS.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>

          {/* Session reference */}
          {session && (
            <div className="mt-10 flex flex-col items-center gap-2 text-center text-xs text-white/40">
              <div className="flex items-center gap-2">
                <span>Session reference:</span>
                <code className="rounded-md bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-white/70 ring-1 ring-white/8">
                  {sessionShort}
                </code>
                <button
                  onClick={copySession}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-white/50 transition hover:bg-white/5 hover:text-white"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-wa-green" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <p className="text-white/30">Useful if you ever need to reach support about this order.</p>
            </div>
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

      {/* Final floating CTA — accessible even if user scrolls around */}
      <div className="fixed bottom-6 right-6 z-30 hidden sm:block">
        <WhatsAppButton
          size="md"
          label="WhatsApp"
          prefill={prefill}
          className="shadow-[0_20px_60px_-15px_rgba(37,211,102,0.6)]"
        />
      </div>
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
