'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Section, SectionHeading } from '@/components/Section';

const faqs = [
  {
    q: 'Is it really free to try?',
    a: 'Yes. Sending a message and getting a website preview, a sample ad, or an SEO audit is completely free. You only pay if you want to publish on your own domain or go beyond the free tier.',
  },
  {
    q: 'How long does it take?',
    a: 'A website preview takes about 3 minutes. Ad creatives take under 2 minutes. SEO audits take 4–6 minutes depending on your site size. All delivered directly in WhatsApp.',
  },
  {
    q: 'Can I chat with the bot in my own language?',
    a: 'Yes. The bot understands and replies in over 50 languages — English, Spanish, French, German, Portuguese, Italian, Arabic, Japanese, Chinese, and more. Just type in whichever feels natural and it adapts automatically.',
  },
  {
    q: 'Can I edit the website later?',
    a: 'Yes. Reply to the same thread with changes like "make the header green" or "swap the hero image" — the bot updates and sends a new preview link. No dashboard needed.',
  },
  {
    q: 'Do I need tech or design skills?',
    a: 'Zero. If you can send a WhatsApp message, you can ship a website, an ad, or a chatbot. The bot does the heavy lifting.',
  },
  {
    q: 'What happens if I stop replying?',
    a: 'Nothing bad. Your draft stays. Come back days later and type "continue" — the bot picks up right where you left off.',
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Section id="faq" soft>
      <SectionHeading
        eyebrow="Common questions"
        title="Still have doubts? Totally fair."
        subtitle="The short answers are below. For anything else, just ask the bot — it\'ll answer in 10 seconds."
      />

      <div className="mx-auto max-w-3xl divide-y divide-ink-100 rounded-2xl bg-white ring-1 ring-ink-100">
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={f.q}>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-6 px-6 py-5 text-left transition hover:bg-ink-50"
                aria-expanded={isOpen}
              >
                <span className="font-display text-base font-bold text-ink-900 sm:text-lg">{f.q}</span>
                <motion.span
                  animate={{ rotate: isOpen ? 45 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-50 text-ink-500"
                >
                  <Plus className="h-4 w-4" />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <p className="px-6 pb-5 text-ink-500 leading-relaxed">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
