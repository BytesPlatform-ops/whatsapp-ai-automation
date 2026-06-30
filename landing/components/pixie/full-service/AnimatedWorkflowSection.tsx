'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/**
 * AnimatedWorkflowSection — "How Pixie runs this service" as an auto-playing
 * operating loop: each step enters from the right, swipes left, the next enters.
 * Hover pauses; step pills allow manual selection; reduced-motion disables the
 * auto-advance. Themed per unit via `accent`. Carries id="workflow".
 */

const STEPS = [
  { id: 'detect', label: '01', title: 'Detect', short: 'Pixie finds the signal', description: 'Pixie watches calls, messages, leads, website activity, content gaps, reviews, and business patterns.', pixieRole: 'Pixie finds what needs attention.', userRole: 'No action needed.' },
  { id: 'decide', label: '02', title: 'Decide', short: 'Pixie chooses what matters', description: 'Pixie ranks opportunities by urgency, impact, and relevance to the current agent.', pixieRole: 'Pixie decides the best next workflow.', userRole: 'No action needed.' },
  { id: 'prepare', label: '03', title: 'Prepare', short: 'Pixie prepares the work', description: 'Pixie drafts messages, campaigns, content, website fixes, SEO updates, or follow-up actions.', pixieRole: 'Pixie creates the ready-to-review output.', userRole: 'Review when ready.' },
  { id: 'permission', label: '04', title: 'Ask Permission', short: 'Pixie pauses for approval', description: 'Before anything public, risky, or customer-facing happens, Pixie asks for your permission.', pixieRole: 'Pixie explains what will happen.', userRole: 'Approve, edit, or skip.' },
  { id: 'execute', label: '05', title: 'Execute', short: 'Pixie runs the workflow', description: 'After approval, Pixie sends, schedules, applies, publishes, or logs the action.', pixieRole: 'Pixie executes the approved work.', userRole: 'Stay in control.' },
  { id: 'learn', label: '06', title: 'Learn', short: 'Pixie improves next time', description: 'Pixie tracks what happened, saves context, and recommends the next best action.', pixieRole: 'Pixie learns from the result.', userRole: 'Review the next suggestion.' },
];

export function AnimatedWorkflowSection({ agentName = 'Pixie', accent = '#EC4899' }: { agentName?: string; accent?: string }) {
  const reduce = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setActiveIndex((c) => (c + 1) % STEPS.length), 2800);
    return () => clearInterval(t);
  }, [reduce]);

  const step = STEPS[activeIndex];

  return (
    <section
      id="workflow"
      className="relative mt-12 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:p-8"
      style={{ ['--accent' as string]: accent }}
    >
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[12px] uppercase tracking-[0.25em]" style={{ color: accent }}>AI workflow</p>
          <h2 className="mt-2 font-display text-2xl font-extrabold text-white md:text-3xl">How Pixie runs this service</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/55 md:text-[15px]">Pixie moves from signal to execution automatically. Your job is just to approve what matters.</p>
        </div>
        <div className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: `${accent}33`, background: `${accent}14`, color: accent }}>{agentName} operating mode</div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* stage */}
        <div className="relative min-h-[330px] overflow-hidden rounded-3xl border border-white/10 bg-[#04090b]/80 p-6">
          <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 28% 20%, ${accent}22, transparent 38%), radial-gradient(circle at 82% 75%, rgba(34,211,238,0.12), transparent 32%)` }} />
          <AnimatePresence mode="wait">
            <motion.div
              key={step.id}
              initial={reduce ? false : { x: 120, opacity: 0, scale: 0.96 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={reduce ? undefined : { x: -120, opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="relative z-10"
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ background: `${accent}26`, color: accent }}>Step {step.label}</span>
                <span className="text-[10px] uppercase tracking-[0.25em] text-white/35">Auto-running</span>
              </div>
              <h3 className="font-display text-4xl font-black text-white md:text-5xl">{step.title}</h3>
              <p className="mt-3 text-lg font-medium" style={{ color: accent }}>{step.short}</p>
              <p className="mt-5 max-w-2xl text-[15px] leading-7 text-white/65">{step.description}</p>
              <div className="mt-7 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Pixie role</p>
                  <p className="mt-1.5 text-sm text-white/75">{step.pixieRole}</p>
                </div>
                <div className="rounded-2xl border p-4" style={{ borderColor: `${accent}33`, background: `${accent}10` }}>
                  <p className="text-[10px] uppercase tracking-[0.2em]" style={{ color: accent }}>Your role</p>
                  <p className="mt-1.5 text-sm text-white/75">{step.userRole}</p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* progress dots */}
          <div className="absolute bottom-4 left-6 z-10 flex gap-1.5">
            {STEPS.map((s2, i) => (
              <button key={s2.id} onClick={() => setActiveIndex(i)} aria-label={s2.title}
                className="h-1.5 rounded-full transition-all" style={{ width: i === activeIndex ? 22 : 8, background: i === activeIndex ? accent : 'rgba(255,255,255,0.25)' }} />
            ))}
          </div>
        </div>

        {/* step list */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
          <p className="mb-3 px-1 text-[10px] uppercase tracking-[0.25em] text-white/40">Workflow steps</p>
          <div className="space-y-1.5">
            {STEPS.map((s2, i) => {
              const on = i === activeIndex;
              return (
                <button key={s2.id} onClick={() => setActiveIndex(i)}
                  className="flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition"
                  style={{ borderColor: on ? `${accent}80` : 'rgba(255,255,255,0.1)', background: on ? `${accent}1a` : 'rgba(255,255,255,0.02)' }}>
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[11px] font-bold" style={{ background: on ? accent : 'rgba(255,255,255,0.1)', color: on ? '#02070a' : 'rgba(255,255,255,0.5)' }}>{s2.label}</span>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${on ? 'text-white' : 'text-white/60'}`}>{s2.title}</p>
                    <p className="truncate text-[11px] text-white/40">{s2.short}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
