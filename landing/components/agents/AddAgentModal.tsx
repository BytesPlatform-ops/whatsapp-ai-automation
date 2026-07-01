'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import type { FeedAgent } from '@/lib/pixie-lab/feed';

/**
 * AddAgentModal — opens from a recommended/locked agent card. NO payment: "Add
 * to my dashboard" activates the agent in free/setup mode via onAdd().
 */
export function AddAgentModal({
  agent,
  name,
  blurb,
  accent,
  onAdd,
  onClose,
}: {
  agent: FeedAgent | null;
  name: string;
  blurb: string;
  accent: string;
  onAdd: (a: FeedAgent) => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!agent) return;
    setBusy(true);
    await onAdd(agent);
    setBusy(false);
    onClose();
  }

  return (
    <AnimatePresence>
      {agent && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-5 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
            className="pl-themed relative w-full max-w-md rounded-3xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-7 shadow-[var(--pl-shadow)]"
            style={{ ['--accent' as string]: accent }}
          >
            <button onClick={onClose} className="absolute right-4 top-4 text-[var(--pl-text-muted)] hover:text-[var(--pl-text)]"><X size={18} /></button>
            <div className="h-1.5 w-12 rounded-full" style={{ background: accent }} />
            <h2 className="mt-4 font-display text-xl font-extrabold text-[var(--pl-text)]">Want to add {name}?</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--pl-text-soft)]">{blurb}</p>
            <p className="mt-2 text-[12.5px] text-[var(--pl-text-muted)]">No payment required — it’s added in free setup mode.</p>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <button onClick={onClose} className="flex-1 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] py-3 text-[14px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]">
                Maybe later
              </button>
              <button onClick={add} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold text-white disabled:opacity-60" style={{ background: accent }}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : 'Add to my dashboard'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
