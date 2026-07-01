'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Globe, Headset, Search, Megaphone, Clapperboard, ArrowUpRight, Send, Activity, type LucideIcon } from 'lucide-react';
import { PairedFeed } from './PairedFeed';
import { TrialBadge } from './TrialBadge';
import { useEntitlements } from '@/lib/pixie-lab/useEntitlements';
import { OpenFullServiceButton } from '@/components/pixie/OpenFullServiceButton';
import { getAgentByBackendKey } from '@/lib/agents';
import {
  feedForAgent, AGENT_META,
  type FeedAgent, type FeedCard as FeedCardType, type FeedCardAction,
} from '@/lib/pixie-lab/feed';

/**
 * AgentDashboard — reusable per-agent workspace: header (agent + status + open),
 * the agent-scoped masonry feed (same FeedCard mechanics as For You), a "talk to
 * this agent" bar, and recent activity. website + receptionist render this now;
 * Anas's seo/marketing/content can reuse it with their own feed data.
 */

const ICON: Record<FeedAgent, LucideIcon> = {
  website: Globe, receptionist: Headset, seo: Search, marketing: Megaphone, content: Clapperboard, pixie: Globe,
};
const ACCENT: Record<FeedAgent, string> = {
  website: '#3B82F6', receptionist: '#E6B45A', seo: '#14B8A6', marketing: '#EC4899', content: '#D4AF37', pixie: '#25D366',
};

const MOCK_ACTIVITY: Record<string, string[]> = {
  website: ['Generated homepage draft', 'Wrote hero + services copy', 'Prepared mobile layout'],
  receptionist: ['Answered 4 chats today', 'Captured 2 new leads', 'Drafted 3 follow-ups'],
};

export function AgentDashboard({ agent, tenant = 'demo', nowMs }: { agent: FeedAgent; tenant?: string; nowMs: number }) {
  const meta = AGENT_META[agent];
  const accent = ACCENT[agent];
  const Icon = ICON[agent];

  const { entitlements } = useEntitlements(tenant);
  const ent = entitlements.find((e) => e.agent === agent);
  const state = ent?.state ?? 'active';
  const trialEndsAt = ent?.trialEndsAt;

  const [cards, setCards] = useState<FeedCardType[]>(() => feedForAgent(agent));
  const [toast, setToast] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  // Fetch the agent-scoped feed from the rules engine; fall back to mock.
  useEffect(() => {
    let alive = true;
    fetch(`/api/lab/feed?agent=${agent}&tenant_id=${encodeURIComponent(tenant)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (alive && d?.backendUp && Array.isArray(d.cards) && d.cards.length) {
          setCards(d.cards as FeedCardType[]);
          setLive(true);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [agent, tenant]);

  function flash(m: string) { setToast(m); window.setTimeout(() => setToast(null), 1600); }

  function persist(card: FeedCardType, action: FeedCardAction) {
    if (!live) return;
    fetch('/api/lab/feed', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: tenant, card_id: card.id, action_type: action.type,
        heading: card.heading, agent: card.primary_agent, requires_confirmation: !!action.requires_confirmation,
      }),
    }).catch(() => {});
  }

  function onAction(card: FeedCardType, action: FeedCardAction) {
    persist(card, action);
    if (action.type === 'skip' || action.type === 'not_relevant') {
      setCards((cs) => cs.filter((c) => c.id !== card.id)); flash('Dismissed'); return;
    }
    if (action.type === 'approve' || action.type === 'do_this') {
      window.setTimeout(() => setCards((cs) => cs.filter((c) => c.id !== card.id)), 650);
      flash(`${action.label} · ${card.heading}`); return;
    }
    flash(`${action.label} → ${card.heading}`);
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64" style={{ background: `radial-gradient(70% 100% at 30% 0%, ${accent}1f, transparent 60%)` }} />

      <main className="relative mx-auto max-w-6xl px-5 py-8 sm:px-8">
        {/* header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-[var(--pl-border)]" style={{ background: `${accent}1a`, color: accent }}>
              <Icon size={22} />
            </span>
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">{meta.label}</h1>
              <p className="text-[13px] text-[var(--pl-text-muted)]">{cards.length} recommendation{cards.length === 1 ? '' : 's'} for you</p>
            </div>
            <div className="ml-1"><TrialBadge state={state} trialEndsAt={trialEndsAt} nowMs={nowMs} /></div>
          </div>
          {getAgentByBackendKey(agent) && (
            <OpenFullServiceButton slug={getAgentByBackendKey(agent)!.slug} accent={accent} />
          )}
        </div>

        {/* talk-to-agent bar */}
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-4 py-3 focus-within:border-[var(--pl-border-strong)]">
          <input
            placeholder={`Ask ${meta.label} to do something…`}
            className="flex-1 bg-transparent text-[15px] text-[var(--pl-text)] placeholder-[var(--pl-text-muted)] outline-none"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) { flash(`${meta.label} is on it…`); (e.target as HTMLInputElement).value = ''; } }}
          />
          <Send size={17} style={{ color: accent }} />
        </div>

        <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_260px]">
          {/* agent-scoped feed */}
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--pl-text-muted)]">What {meta.label} suggests</p>
            <PairedFeed
              cards={cards}
              onAction={onAction}
              emptyState={
                <div className="rounded-2xl border border-dashed border-[var(--pl-border)] bg-[var(--pl-surface)] py-14 text-center">
                  <p className="font-display font-bold text-[var(--pl-text)]">All caught up ✨</p>
                  <p className="mt-1 text-sm text-[var(--pl-text-muted)]">No pending actions for this agent.</p>
                </div>
              }
            />
          </div>

          {/* recent activity */}
          <aside className="space-y-3">
            <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
              <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--pl-text-muted)]">
                <Activity size={13} /> Recent activity
              </p>
              <ul className="space-y-2.5">
                {(MOCK_ACTIVITY[agent] ?? ['No activity yet']).map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--pl-text-soft)]">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full" style={{ background: accent }} />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </main>

      {toast && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[var(--pl-border)] bg-[#0a0e16] px-4 py-2.5 text-[13px] text-[var(--pl-text)] shadow-2xl">
          {toast}
        </motion.div>
      )}
    </div>
  );
}
