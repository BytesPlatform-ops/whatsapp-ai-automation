'use client';

import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { Section, SectionHeading } from '@/components/Section';

const testimonials = [
  {
    quote:
      "I built my salon's website in 3 minutes over WhatsApp. We now get 5 bookings a day directly through chat. What two designers couldn't deliver, the bot did in one afternoon.",
    name: 'Sarah Mitchell',
    role: 'Owner · Glow Studio Salon',
    avatar: 'SM',
    color: 'from-rose-400 to-amber-400',
    metric: '+5 bookings/day',
  },
  {
    quote:
      'We ran a holiday campaign using the ad generator and saw 3× our usual click-through rate. Posting took 10 minutes instead of a whole afternoon.',
    name: 'James Carter',
    role: 'Marketing Lead · Layla Cafe',
    avatar: 'JC',
    color: 'from-wa-teal to-wa-green',
    metric: '3× CTR on Meta ads',
  },
  {
    quote:
      'The SEO audit was refreshingly blunt — zero jargon. I fixed the five things it flagged, and my home page is now ranking on page one for my city.',
    name: 'Emma Rodriguez',
    role: 'Founder · Crumb & Co. Bakery',
    avatar: 'ER',
    color: 'from-indigo-400 to-purple-500',
    metric: 'Ranked page 1',
  },
];

export function Testimonials() {
  return (
    <Section id="results">
      <SectionHeading
        eyebrow="Results"
        title={
          <>
            Real businesses. <span className="text-wa-teal">Real messages. Real wins.</span>
          </>
        }
        subtitle="Some of the people who opened WhatsApp, typed hi, and shipped something the same day."
      />

      <div className="grid gap-6 md:grid-cols-3">
        {testimonials.map((t, i) => (
          <motion.figure
            key={t.name}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="group relative flex flex-col rounded-2xl bg-white p-7 ring-1 ring-ink-100 transition hover:shadow-card"
          >
            <div className="mb-4 flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, k) => (
                <Star key={k} className="h-4 w-4 fill-amber-400 text-amber-400" />
              ))}
            </div>

            <blockquote className="flex-1 text-ink-700 leading-relaxed">“{t.quote}”</blockquote>

            <div className="mt-5 inline-flex items-center gap-1.5 self-start rounded-full bg-wa-bubble/60 px-3 py-1 text-xs font-bold text-wa-teal">
              {t.metric}
            </div>

            <figcaption className="mt-5 flex items-center gap-3 border-t border-ink-100 pt-5">
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${t.color} text-sm font-bold text-white`}
              >
                {t.avatar}
              </span>
              <div>
                <p className="text-sm font-semibold text-ink-900">{t.name}</p>
                <p className="text-xs text-ink-400">{t.role}</p>
              </div>
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </Section>
  );
}
