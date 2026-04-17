'use client';

import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';

type StepState = 'done' | 'active' | 'upcoming';

interface Step {
  title: string;
  desc: string;
  time: string;
  state: StepState;
}

const STEPS: Step[] = [
  {
    title: 'Check your WhatsApp',
    desc: "Pixie confirmed your payment and sent the next steps. It's the fastest way to stay in the loop.",
    time: '< 30 sec',
    state: 'done',
  },
  {
    title: 'Your site goes live',
    desc: "We're deploying your site to Pixie's global network right now. The preview link lands in WhatsApp the moment it's ready.",
    time: '2–3 min',
    state: 'active',
  },
  {
    title: 'Custom domain connected',
    desc: "If you picked a custom domain, we're wiring up DNS and SSL. You'll get a 'live on yourdomain.com' message once propagation finishes.",
    time: '15–30 min',
    state: 'upcoming',
  },
];

// ─── State-specific styles ────────────────────────────────────────────────
// Each state gets its own circle, card, and badge treatment so the timeline
// reads as progression at a glance rather than three identical cards.

const circleStyles: Record<StepState, string> = {
  done:
    'bg-gradient-to-br from-wa-green to-wa-teal text-white shadow-[0_0_28px_-4px_rgba(37,211,102,0.8)] ring-2 ring-wa-green/30',
  active:
    'bg-navy-900 text-wa-green border-2 border-wa-green/80 shadow-[0_0_22px_-6px_rgba(37,211,102,0.7)]',
  upcoming:
    'bg-navy-900 text-white/40 border border-white/15',
};

const cardStyles: Record<StepState, string> = {
  done: 'border-wa-green/25 bg-wa-green/[0.04]',
  active: 'border-white/15 bg-white/[0.04]',
  upcoming: 'border-white/5 bg-white/[0.02] opacity-75',
};

const badgeStyles: Record<StepState, string> = {
  done: 'bg-wa-green text-navy-900 ring-0',
  active: 'bg-wa-green/10 text-wa-green ring-1 ring-wa-green/30',
  upcoming: 'bg-white/5 text-white/40 ring-1 ring-white/10',
};

const badgeLabel: Record<StepState, string> = {
  done: 'DONE',
  active: 'IN PROGRESS',
  upcoming: 'UPCOMING',
};

function StepCircle({ state, index }: { state: StepState; index: number }) {
  const content =
    state === 'done' ? (
      <Check className="h-5 w-5" strokeWidth={3} />
    ) : state === 'active' ? (
      <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.5} />
    ) : (
      <span className="font-display text-sm font-bold">{index + 1}</span>
    );

  return (
    <div className="relative z-10">
      {/* Pulse ring for the active step */}
      {state === 'active' && (
        <motion.span
          aria-hidden
          initial={{ scale: 1, opacity: 0.5 }}
          animate={{ scale: [1, 1.6, 1.6], opacity: [0.6, 0, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
          className="absolute inset-0 rounded-full border-2 border-wa-green"
        />
      )}
      <div
        className={`relative flex h-11 w-11 items-center justify-center rounded-full transition-all ${circleStyles[state]}`}
      >
        {content}
      </div>
    </div>
  );
}

export function TimelineSteps() {
  return (
    <div className="relative">
      {/* Vertical connector line — gradient top (green, done) to bottom (muted, upcoming).
          Positioned behind the circles; spans from first to last circle center. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-[22px] top-5 bottom-5 w-px bg-gradient-to-b from-wa-green via-wa-green/40 to-white/10 sm:left-[22px]"
      />

      <ol className="relative space-y-5">
        {STEPS.map((step, i) => (
          <motion.li
            key={step.title}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5, delay: i * 0.1, ease: 'easeOut' }}
            className="relative flex gap-5"
          >
            <StepCircle state={step.state} index={i} />

            <div
              className={`flex-1 rounded-2xl border p-5 transition-all sm:p-6 ${cardStyles[step.state]}`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h3
                  className={`font-display text-lg font-semibold ${
                    step.state === 'upcoming' ? 'text-white/70' : 'text-white'
                  }`}
                >
                  {step.title}
                </h3>
                <motion.span
                  animate={
                    step.state === 'active'
                      ? { opacity: [0.7, 1, 0.7] }
                      : { opacity: 1 }
                  }
                  transition={
                    step.state === 'active'
                      ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                      : undefined
                  }
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeStyles[step.state]}`}
                >
                  {badgeLabel[step.state]}
                </motion.span>
                <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-white/40">
                  {step.time}
                </span>
              </div>
              <p
                className={`mt-2 text-[15px] leading-relaxed ${
                  step.state === 'upcoming' ? 'text-white/45' : 'text-white/70'
                }`}
              >
                {step.desc}
              </p>
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
