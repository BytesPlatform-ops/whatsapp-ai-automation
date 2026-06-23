'use client';

import { Plus, Check } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ServiceAddOn } from '@/lib/pixieServices';

/**
 * AddOnSelector — 2–3 "plus card" upsells. Selecting a card flips the plus to a
 * check, lights the accent border, and slides open its follow-up question (a
 * pair of choice chips) when one exists. Controlled by SetupRequestForm so the
 * selections submit with the request. Cards are real toggle buttons (keyboard +
 * aria-pressed) for accessibility.
 */
export function AddOnSelector({
  addOns,
  selected,
  followUps,
  onToggle,
  onFollowUp,
}: {
  addOns: ServiceAddOn[];
  selected: string[];
  followUps: Record<string, string>;
  onToggle: (id: string) => void;
  onFollowUp: (id: string, value: string) => void;
}) {
  const reduce = useReducedMotion();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-white">Add a helpful extra</h3>
        <span className="text-xs text-white/45">Optional</span>
      </div>

      {addOns.map((addOn) => {
        const isOn = selected.includes(addOn.id);
        return (
          <motion.div
            key={addOn.id}
            initial={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              type="button"
              onClick={() => onToggle(addOn.id)}
              aria-pressed={isOn}
              className="flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-all"
              style={{
                borderColor: isOn
                  ? 'color-mix(in srgb, var(--accent) 60%, transparent)'
                  : 'rgba(255,255,255,0.12)',
                background: isOn
                  ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                  : 'rgba(255,255,255,0.03)',
                boxShadow: isOn ? '0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent)' : 'none',
              }}
            >
              <span
                className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full transition-colors"
                style={{
                  background: isOn ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                  color: isOn ? '#06110c' : '#ffffff',
                }}
              >
                {isOn ? <Check className="h-4 w-4" strokeWidth={3} /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
              </span>

              <span className="flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-white">{addOn.title}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{ background: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--soft)' }}
                  >
                    {addOn.badge}
                  </span>
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-white/60">{addOn.blurb}</span>
              </span>
            </button>

            {/* Follow-up upsell — slides open when selected. */}
            <AnimatePresence initial={false}>
              {isOn && addOn.followUp && (
                <motion.div
                  key="followup"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.3, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="ml-10 mt-2 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                    <p className="text-[13px] font-medium text-white/80">{addOn.followUp.question}</p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {addOn.followUp.options.map((opt) => {
                        const active = followUps[addOn.id] === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => onFollowUp(addOn.id, opt)}
                            aria-pressed={active}
                            className="rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors"
                            style={{
                              borderColor: active
                                ? 'color-mix(in srgb, var(--accent) 60%, transparent)'
                                : 'rgba(255,255,255,0.16)',
                              background: active ? 'var(--accent)' : 'transparent',
                              color: active ? '#06110c' : 'rgba(255,255,255,0.8)',
                            }}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
