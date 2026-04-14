'use client';

import { motion } from 'framer-motion';
import { MessageCircle, ShieldCheck, Layers } from 'lucide-react';
import { Section, SectionHeading } from '@/components/Section';

const reasons = [
  {
    icon: MessageCircle,
    title: 'WhatsApp, not another app',
    body: 'Your customers already have it. No app download, no password reset, no 6-step signup. You open WhatsApp — you\'re in.',
    accent: 'from-wa-green/15 to-wa-teal/5',
  },
  {
    icon: ShieldCheck,
    title: 'See it first, pay when you\'re happy',
    body: 'Preview your website live before you spend a rupee. If it\'s not right, the bot iterates. No contracts, no "revisions used up".',
    accent: 'from-amber-200/20 to-amber-50',
  },
  {
    icon: Layers,
    title: 'One bot, every channel',
    body: 'Same AI works on WhatsApp, Instagram DMs, and Messenger. Start on any — your history follows you.',
    accent: 'from-indigo-200/25 to-indigo-50',
  },
];

export function WhyUs() {
  return (
    <Section soft>
      <SectionHeading
        eyebrow="Why teams pick us"
        title={
          <>
            We&apos;re not a SaaS dashboard. <br className="hidden sm:block" />
            <span className="text-wa-teal">We&apos;re a chat that ships.</span>
          </>
        }
      />

      <div className="grid gap-6 md:grid-cols-3">
        {reasons.map((r, i) => {
          const Icon = r.icon;
          return (
            <motion.div
              key={r.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="group relative overflow-hidden rounded-2xl bg-white p-7 ring-1 ring-ink-100 transition hover:shadow-card"
            >
              <div
                aria-hidden
                className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-b ${r.accent} opacity-70`}
              />
              <div className="relative">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-soft ring-1 ring-ink-100">
                  <Icon className="h-5 w-5 text-wa-teal" />
                </div>
                <h3 className="mt-5 font-display text-xl font-bold text-ink-900">{r.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-500">{r.body}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </Section>
  );
}
