'use client';

import { useEffect, useState } from 'react';
import { Activity, Check, X, SkipForward, Sparkles, Rocket, type LucideIcon } from 'lucide-react';

interface Event {
  id: string;
  agent: string;
  type: string;
  title: string;
  created_at: string;
}

const TYPE_ICON: Record<string, LucideIcon> = {
  feed_card_completed: Check,
  feed_card_skipped: SkipForward,
  approval_created: Sparkles,
  approval_completed: Check,
  approval_rejected: X,
  trial_started: Rocket,
  agent_unlocked: Rocket,
};

const TYPE_LABEL: Record<string, string> = {
  feed_card_completed: 'Completed',
  feed_card_skipped: 'Skipped',
  approval_created: 'Sent for approval',
  approval_completed: 'Approved',
  approval_rejected: 'Rejected',
  trial_started: 'Trial started',
  agent_unlocked: 'Agent unlocked',
};

/** ActivityView — the tenant's recent-events trail from the activity log. */
export function ActivityView({ tenant = 'demo' }: { tenant?: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`/api/lab/activity?tenant_id=${encodeURIComponent(tenant)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => alive && setEvents(Array.isArray(d.events) ? d.events : []))
      .catch(() => alive && setEvents([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [tenant]);

  return (
    <main className="mx-auto max-w-3xl px-5 py-9 sm:px-8">
      <div className="flex items-center gap-2.5">
        <Activity size={22} className="text-[#25D366]" />
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Activity</h1>
      </div>
      <p className="mt-1.5 text-[14px] text-white/50">Everything Pixie and you have done recently.</p>

      <div className="mt-7">
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.03]" />)}</div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-16 text-center">
            <p className="font-display text-lg font-bold text-white">No activity yet</p>
            <p className="mt-1 text-sm text-white/50">Approve or skip a card and it’ll show up here.</p>
          </div>
        ) : (
          <ol className="relative space-y-1 border-l border-white/[0.08] pl-5">
            {events.map((e) => {
              const Icon = TYPE_ICON[e.type] ?? Activity;
              return (
                <li key={e.id} className="relative py-2.5">
                  <span className="absolute -left-[27px] grid h-5 w-5 place-items-center rounded-full border border-white/15 bg-[#15211C] text-[#25D366]">
                    <Icon size={11} />
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{TYPE_LABEL[e.type] ?? e.type}</span>
                  </div>
                  <p className="text-[14px] text-white/80">{e.title}</p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </main>
  );
}
