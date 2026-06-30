'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Globe, Headset, Search, Megaphone, Clapperboard, Check, Lock, Loader2, type LucideIcon } from 'lucide-react';
import { AGENT_META, UPSELL_COPY, type FeedAgent } from '@/lib/pixie-lab/feed';

/**
 * TrialUnlock — locked-agent page (Parts D + E). Shows what the agent does, the
 * included features, the price, and two explicit CTAs: Start free trial /
 * Unlock with Stripe. No silent charges — both require a click. Stripe checkout
 * is stubbed until the entitlements backend lands (POST /api/entitlements/...).
 */

const ICON: Record<string, LucideIcon> = {
  website: Globe, receptionist: Headset, seo: Search, marketing: Megaphone, content: Clapperboard,
};
const ACCENT: Record<string, string> = {
  website: '#3B82F6', receptionist: '#E6B45A', seo: '#14B8A6', marketing: '#EC4899', content: '#D4AF37',
};
const FEATURES: Record<string, string[]> = {
  website: ['AI homepage + service pages', 'Brand-matched copy & layout', 'Custom domain + publish', 'Unlimited edits via chat'],
  receptionist: ['24/7 replies across channels', 'Lead capture + CRM', 'Calendar bookings', 'Human escalation'],
  seo: ['Full technical audit', 'Meta + schema fixes', 'Keyword opportunities', 'Monthly re-audits'],
  marketing: ['7-day content calendars', 'Captions, ads & hooks', 'Scheduled posting', 'Performance insights'],
  content: ['Reel scripts & hooks', 'AI-influencer videos', 'Trend-to-content', 'Brand identity lock'],
};
const PRICE: Record<string, string> = {
  website: '$29/mo', receptionist: '$39/mo', seo: '$25/mo', marketing: '$35/mo', content: '$45/mo',
};

export function TrialUnlock({ agent, tenant = 'demo' }: { agent: FeedAgent; tenant?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'trial' | 'unlock' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const meta = AGENT_META[agent];
  const accent = ACCENT[agent] ?? '#25D366';
  const Icon = ICON[agent] ?? Globe;
  const copy = UPSELL_COPY[agent];

  async function startTrial() {
    setBusy('trial');
    // Real: POST → entitlements engine flips this agent to `trial`.
    try {
      await fetch('/api/lab/entitlements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_trial', tenant_id: tenant, agent }),
      });
    } catch { /* ignore */ }
    setBusy(null);
    setNote('Free trial started — opening your workspace…');
    setTimeout(() => router.push(`/pixie-lab/agents/${agent}`), 700);
  }

  async function unlock() {
    setBusy('unlock');
    // Real call → checkout (Stripe keys not wired yet, so the engine returns a stub; no charge).
    let msg = 'Stripe checkout will open here once keys are wired. No charge made.';
    try {
      const r = await fetch('/api/lab/entitlements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkout', tenant_id: tenant, agent }),
      });
      const d = await r.json();
      if (d?.checkout_url) { window.location.href = d.checkout_url; return; }
      if (d?.message) msg = d.message;
    } catch { /* ignore */ }
    setBusy(null);
    setNote(msg);
  }

  return (
    <main className="relative mx-auto max-w-2xl px-5 py-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64" style={{ background: `radial-gradient(70% 100% at 50% 0%, ${accent}22, transparent 60%)` }} />

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="relative">
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10" style={{ background: `${accent}1a`, color: accent }}>
            <Icon size={26} />
          </span>
          <div>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[11px] font-semibold text-white/55">
              <Lock size={11} /> Locked
            </span>
            <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight">{meta.label} Builder</h1>
          </div>
        </div>

        <p className="mt-4 text-[15px] leading-relaxed text-white/65">{copy.does}</p>
        <p className="mt-1.5 text-[14px] font-medium" style={{ color: accent }}>→ {copy.outcome}</p>

        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">What’s included</p>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {(FEATURES[agent] ?? []).map((f) => (
              <li key={f} className="flex items-center gap-2 text-[14px] text-white/80">
                <Check size={15} style={{ color: accent }} /> {f}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4">
            <div>
              <span className="font-display text-2xl font-extrabold">{PRICE[agent] ?? '$29/mo'}</span>
              <span className="ml-1.5 text-[13px] text-white/40">· cancel anytime</span>
            </div>
            <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 text-[11px] font-semibold text-violet-200">7-day free trial</span>
          </div>

          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
            <button onClick={startTrial} disabled={!!busy} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-4 py-3 text-[14px] font-semibold text-white transition hover:bg-white/[0.08] disabled:opacity-60">
              {busy === 'trial' ? <Loader2 size={16} className="animate-spin" /> : 'Start free trial'}
            </button>
            <button onClick={unlock} disabled={!!busy} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14px] font-bold disabled:opacity-60" style={{ background: accent, color: '#02070a' }}>
              {busy === 'unlock' ? <Loader2 size={16} className="animate-spin" /> : `Unlock ${meta.label}`}
            </button>
          </div>
          <p className="mt-3 text-center text-[11.5px] text-white/35">No charge until you confirm checkout. Trials are clearly marked and never auto-bill.</p>
        </div>

        {note && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-[13px] text-white/70">
            {note}
          </motion.p>
        )}
      </motion.div>
    </main>
  );
}
