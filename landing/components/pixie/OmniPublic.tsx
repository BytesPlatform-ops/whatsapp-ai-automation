'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { AgentStartButton } from '@/components/agents/AgentStartButton';
import { OMNI } from '@/lib/agents';

/**
 * OmniPublic — the public /omni page. Starting Omni routes through the same
 * auth flow but always lands on /app/omni (never a single agent dashboard).
 */
export function OmniPublic() {
  return (
    <div className="relative grid min-h-screen place-items-center bg-[#02070a] px-5 text-white" style={{ ['--accent' as string]: OMNI.accent }}>
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[480px]" style={{ background: 'radial-gradient(80% 100% at 50% 0%, rgba(34,211,238,0.16), transparent 62%)' }} />
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="relative max-w-2xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/10 px-3 py-1 text-[12px] font-semibold text-[#a5f3fc]">
          <Sparkles size={13} /> Pixie Omni
        </span>
        <h1 className="mt-5 font-display text-[clamp(2.2rem,5vw,3.4rem)] font-extrabold leading-[1.05] tracking-tight">
          One brain that runs your whole business.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-white/60">
          Omni listens across your business, routes work to the right agent, asks for your approval,
          executes, and learns — all from one command center.
        </p>
        <div className="mt-8 flex justify-center">
          <AgentStartButton agentSlug="omni" label="Start Pixie Omni" />
        </div>
        <p className="mt-3 text-[12px] text-white/35">No payment required — this only starts your setup.</p>
      </motion.div>
    </div>
  );
}
