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
            className="relative w-full max-w-md rounded-3xl border border-white/12 bg-[#0a0e16] p-7"
            style={{ ['--accent' as string]: accent }}
          >
            <button onClick={onClose} className="absolute right-4 top-4 text-white/40 hover:text-white"><X size={18} /></button>
            <div className="h-1.5 w-12 rounded-full" style={{ background: accent }} />
            <h2 className="mt-4 font-display text-xl font-extrabold text-white">Want to add {name}?</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-white/60">{blurb}</p>
            <p className="mt-2 text-[12.5px] text-white/40">No payment required — it’s added in free setup mode.</p>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <button onClick={onClose} className="flex-1 rounded-xl border border-white/12 bg-white/[0.04] py-3 text-[14px] font-semibold text-white/70 transition hover:text-white">
                Maybe later
              </button>
              <button onClick={add} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold disabled:opacity-60" style={{ background: accent, color: '#02070a' }}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : 'Add to my dashboard'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
