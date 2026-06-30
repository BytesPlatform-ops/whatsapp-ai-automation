'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';
import { PairedFeed } from './PairedFeed';
import { UpsellTicker } from './UpsellTicker';
import { TrialBadge } from './TrialBadge';
import { useEntitlements } from '@/lib/pixie-lab/useEntitlements';
import {
  MOCK_FEED,
  type FeedAgent,
  type FeedCard as FeedCardType,
  type FeedCardAction,
} from '@/lib/pixie-lab/feed';

const ASK_EXAMPLES = [
  'Create a 7-day content plan',
  'Build a homepage for my business',
  'Find SEO issues on my website',
  'Draft follow-ups for new leads',
  'Prepare Instagram posts for this week',
];

/**
 * ForYou — the global proactive masonry feed (Slice 1, mock data). Greeting +
 * business-health + Ask Pixie bar + upsell ticker + masonry of FeedCards. Wires
 * to mock data now; swap MOCK_FEED for GET /api/feed/for-you when the engine lands.
 */
export function ForYou({ name, tenant = 'demo', nowMs }: { name: string; tenant?: string; nowMs: number }) {
  const [cards, setCards] = useState<FeedCardType[]>(MOCK_FEED);
  const [toast, setToast] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [backendHealth, setBackendHealth] = useState<number | null>(null);

  const { entitlements, startTrial } = useEntitlements(tenant);
  const trialAgent = entitlements.find((e) => e.state === 'trial');
  const locked = useMemo<FeedAgent[]>(
    () => entitlements.filter((e) => e.state === 'locked').map((e) => e.agent),
    [entitlements],
  );

  // Fetch the REAL feed from the rules engine; fall back to mock cards if down.
  useEffect(() => {
    let alive = true;
    fetch(`/api/lab/feed?tenant_id=${encodeURIComponent(tenant)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d?.backendUp || !Array.isArray(d.cards) || !d.cards.length) return;
        setCards(d.cards as FeedCardType[]);
        setBackendHealth(typeof d.health === 'number' ? d.health : null);
        setLive(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tenant]);

  // backend health when live, else a deterministic estimate from setup cards
  const health = useMemo(() => {
    if (backendHealth !== null) return backendHealth;
    const setupLeft = cards.filter((c) => c.category === 'setup').length;
    return Math.max(35, Math.min(95, 100 - setupLeft * 12));
  }, [backendHealth, cards]);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }

  function persist(card: FeedCardType, action: FeedCardAction) {
    if (!live) return;
    // fire-and-forget: record the action against the rules engine
    fetch('/api/lab/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: tenant, card_id: card.id, action_type: action.type,
        heading: card.heading, agent: card.primary_agent, requires_confirmation: !!action.requires_confirmation,
      }),
    }).catch(() => {});
  }

  function onAction(card: FeedCardType, action: FeedCardAction) {
    persist(card, action);
    if (action.type === 'skip' || action.type === 'not_relevant') {
      setCards((cs) => cs.filter((c) => c.id !== card.id));
      flash('Card dismissed');
      return;
    }
    if (action.type === 'approve' || action.type === 'do_this') {
      // FeedCard plays its own "Done" flash, then we remove it after.
      window.setTimeout(() => setCards((cs) => cs.filter((c) => c.id !== card.id)), 650);
      flash(`${action.label} · ${card.heading}`);
      return;
    }
    flash(`${action.label} → ${card.heading}`);
  }

  return (
    <div className="relative min-h-screen bg-[#02070a] text-white">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[460px]"
        style={{ background: 'radial-gradient(80% 100% at 50% 0%, rgba(37,211,102,0.10), transparent 62%)' }}
      />

      <main className="relative mx-auto max-w-6xl px-5 py-10 sm:px-8">
        {/* greeting + health */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">For you</p>
            <h1 className="mt-2 font-display text-[2.1rem] font-extrabold leading-tight tracking-tight">
              Good day, <span className="bg-gradient-to-r from-[#25D366] to-[#7dd3fc] bg-clip-text text-transparent">{name}</span> —
              <br className="hidden sm:block" /> Pixie found {cards.length} things to move your business forward.
            </h1>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-center">
            <div className="font-display text-2xl font-extrabold text-[#25D366]">{health}%</div>
            <div className="text-[11px] uppercase tracking-wider text-white/40">Business health</div>
            <div className="mt-1.5 h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-[#25D366] to-[#22d3ee]" style={{ width: `${health}%` }} />
            </div>
          </div>
        </div>

        {/* Ask Pixie bar */}
        <div className="mt-7">
          <div className="flex items-center gap-3 rounded-2xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 transition-colors focus-within:border-[#25D366]/40">
            <Sparkles size={18} className="text-[#25D366]" />
            <input
              placeholder="Ask Pixie what you want done…"
              className="flex-1 bg-transparent text-[15px] text-white placeholder-white/35 outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                  flash('Pixie is thinking about that…');
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
            <button className="hidden items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2 text-[13px] font-bold text-[#02070a] sm:inline-flex">
              Ask Pixie <ArrowRight size={14} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {ASK_EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => flash(`Pixie: “${ex}”`)}
                className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1 text-[12px] text-white/45 transition hover:text-white/80"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* upsell ticker */}
        <div className="mt-8">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">See what else Pixie can do</p>
            {trialAgent && <TrialBadge state="trial" trialEndsAt={trialAgent.trialEndsAt} nowMs={nowMs} />}
          </div>
          <UpsellTicker
            lockedAgents={locked}
            onStartTrial={(a) => { startTrial(a); flash(`Started free trial · ${a}`); }}
            onUnlock={(a) => { window.location.href = `/pixie-lab/trial/${a}`; }}
          />
        </div>

        {/* paired-row feed */}
        <div className="mt-9">
          <PairedFeed
            cards={cards}
            onAction={onAction}
            emptyState={
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-16 text-center">
                <p className="font-display text-lg font-bold text-white">You’re all caught up ✨</p>
                <p className="mt-1 text-sm text-white/50">Pixie will surface new actions as your business grows.</p>
              </div>
            }
          />
        </div>
      </main>

      {/* toast */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/12 bg-[#0a0e16] px-4 py-2.5 text-[13px] text-white shadow-2xl"
        >
          {toast}
        </motion.div>
      )}
    </div>
  );
}
