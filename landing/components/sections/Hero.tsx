'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, CheckCircle2, Sparkles } from 'lucide-react';
import { PhoneMockup } from '@/components/PhoneMockup';
import { ChatBubble, TypingBubble, LinkPreview } from '@/components/ChatBubble';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { Eyebrow } from '@/components/Section';

type Step =
  | { kind: 'user'; text: string; time?: string }
  | { kind: 'typing' }
  | { kind: 'bot'; text: string; time?: string }
  | { kind: 'link'; title: string; description: string; url: string; time?: string };

const scripts: Step[][] = [
  [
    { kind: 'user', text: 'Hey, I need a website for my bakery 🧁', time: '10:24' },
    { kind: 'typing' },
    { kind: 'bot', text: "Awesome! What's the bakery called and your vibe — cozy, modern, or playful?", time: '10:24' },
    { kind: 'user', text: 'Sunrise Bakery — warm & cozy 🤎', time: '10:25' },
    { kind: 'typing' },
    { kind: 'bot', text: 'Perfect. Generating your preview now...', time: '10:25' },
    {
      kind: 'link',
      title: 'Sunrise Bakery — Fresh Bakes Daily',
      description: 'Your live preview is ready. Tap to view.',
      url: 'sunrise-bakery.pixiebot.co',
      time: '10:26',
    },
  ],
  [
    { kind: 'user', text: 'Can you make me a Black Friday ad for my cafe?', time: '15:02' },
    { kind: 'typing' },
    { kind: 'bot', text: 'Yes! Share the cafe name + 1 offer and I\'ll design 3 options.', time: '15:02' },
    { kind: 'user', text: 'Layla Cafe — 30% off seasonal lattes', time: '15:03' },
    { kind: 'typing' },
    { kind: 'bot', text: 'Creating your ad creatives 🎨', time: '15:03' },
    {
      kind: 'link',
      title: 'Layla Cafe · Black Friday Offer',
      description: '3 ad variations ready. Tap to download.',
      url: 'pixiebot.co/ad/layla-cafe',
      time: '15:04',
    },
  ],
];

function useScript(script: Step[], reveal: number) {
  return script.slice(0, reveal);
}

export function Hero() {
  const [scriptIndex, setScriptIndex] = useState(0);
  const [reveal, setReveal] = useState(1);

  useEffect(() => {
    const script = scripts[scriptIndex];
    if (reveal < script.length) {
      const current = script[reveal];
      const delay = current?.kind === 'typing' ? 900 : current?.kind === 'user' ? 1400 : 1600;
      const t = setTimeout(() => setReveal((r) => r + 1), delay);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setScriptIndex((i) => (i + 1) % scripts.length);
      setReveal(1);
    }, 3200);
    return () => clearTimeout(t);
  }, [reveal, scriptIndex]);

  const visible = useScript(scripts[scriptIndex], reveal);

  return (
    <section className="relative overflow-hidden bg-navy-900 pt-24 text-white sm:pt-28">
      {/* Background treatments */}
      <div aria-hidden className="absolute inset-0 bg-hero-radial" />
      <div aria-hidden className="absolute inset-0 grid-noise opacity-[0.15]" />
      <div
        aria-hidden
        className="absolute -top-32 left-1/2 h-96 w-[90%] -translate-x-1/2 rounded-full bg-wa-teal/20 blur-3xl"
      />

      <div className="container-page relative">
        <div className="grid items-center gap-10 pb-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10 lg:pb-20">
          {/* Left column */}
          <div className="max-w-2xl text-center mx-auto lg:text-left lg:mx-0">
            <Eyebrow dark icon={<Bot className="h-3.5 w-3.5" />}>
              Built on WhatsApp · No app. No login.
            </Eyebrow>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="mt-5 font-display text-display-xl text-balance text-white"
            >
              Your website & marketing ads,{' '}
              <span className="relative inline-block">
                <span className="relative z-10 text-wa-green">built by a WhatsApp chat.</span>
                <span aria-hidden className="absolute bottom-1 left-0 right-0 -z-0 h-3 rounded-full bg-wa-green/20 blur-md" />
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mt-6 max-w-xl text-lg leading-relaxed text-white/75 mx-auto lg:mx-0"
            >
              Text our AI bot. Get a live website, a marketing ad creative, or a free SEO audit
              in under 3 minutes. No coding, no designer, no meetings.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start"
            >
              <WhatsAppButton
                size="xl"
                label="Start on WhatsApp"
                prefill="Hi! I saw your landing page and want to try the bot."
              />
              <a
                href="#how"
                className="inline-flex h-14 items-center justify-center rounded-full border border-white/15 px-6 text-base font-semibold text-white/90 transition hover:bg-white/5"
              >
                See it in action
              </a>
            </motion.div>

            <motion.ul
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-white/60 lg:justify-start"
            >
              {['Free to start', 'No signup', 'Reply in 10 sec'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-wa-green" />
                  {t}
                </li>
              ))}
            </motion.ul>
          </div>

          {/* Right column: phone mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: 'easeOut' }}
            className="relative flex justify-center lg:justify-end"
          >
            {/* Floating badges — positioned outside the phone frame so they never overlap the chat UI */}
            <div className="pointer-events-none absolute left-0 top-1/3 z-10 hidden -translate-x-4 rounded-2xl bg-white/95 px-3 py-2 shadow-card backdrop-blur lg:block">
              <div className="flex items-center gap-2 text-xs font-semibold text-ink-900">
                <Sparkles className="h-4 w-4 text-wa-green" />
                Live preview in 3 min
              </div>
            </div>
            <div className="pointer-events-none absolute bottom-10 right-0 z-10 hidden translate-x-4 rounded-2xl bg-white/95 px-3 py-2 shadow-card backdrop-blur lg:block">
              <div className="flex items-center gap-2 text-xs font-semibold text-ink-900">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-wa-green" />
                Bot online · avg 8s reply
              </div>
            </div>

            <PhoneMockup size="sm">
              <div className="flex h-full flex-col justify-end">
                <AnimatePresence mode="popLayout">
                  {visible.map((step, i) => (
                    <motion.div
                      key={`${scriptIndex}-${i}`}
                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
                    >
                      {step.kind === 'user' && (
                        <ChatBubble from="user" time={step.time}>
                          {step.text}
                        </ChatBubble>
                      )}
                      {step.kind === 'bot' && (
                        <ChatBubble from="bot" time={step.time}>
                          {step.text}
                        </ChatBubble>
                      )}
                      {step.kind === 'typing' && <TypingBubble />}
                      {step.kind === 'link' && (
                        <LinkPreview
                          title={step.title}
                          description={step.description}
                          url={step.url}
                        />
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </PhoneMockup>
          </motion.div>
        </div>
      </div>

      {/* Fade to trust strip */}
      <div aria-hidden className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </section>
  );
}
