'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Megaphone } from 'lucide-react';
import { ServiceGate } from '@/components/pixie-lab/services/ServiceGate';
import { OfflineState } from '@/components/pixie-lab/services/ServiceStates';
import { MetaSetupBar, deriveReadiness, type MetaReadiness } from './MetaSetupBar';
import { MarketingRecommendations } from './MarketingRecommendations';
import { AdsPanel } from './AdsPanel';
import { BrandBrainPanel } from './BrandBrainPanel';
import { IdeaCuratorPanel } from './IdeaCuratorPanel';
import { ContentCalendarPanel } from './ContentCalendarPanel';
import { InboxPanel } from './InboxPanel';
import { CommentsPanel } from './CommentsPanel';
import { ContentLibraryPanel } from './ContentLibraryPanel';
import { MarketingApprovalsPanel } from './MarketingApprovalsPanel';
import { metaApi } from '@/lib/pixie-lab/servicesClient';
import type { MetaStatus } from '@/lib/pixie-lab/serviceTypes';

const ACCENT = '#EC4899';
const BASE = '/pixie-lab/marketing/full-service';

const TABS: { key: string; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'ads', label: 'Meta Ads' },
  { key: 'brand-brain', label: 'Brand Brain' },
  { key: 'ideas', label: 'Ideas' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'comments', label: 'Comments' },
  { key: 'content', label: 'Content' },
  { key: 'approvals', label: 'Approvals' },
];
const TAB_TITLE: Record<string, string> = {
  overview: 'Overview', ads: 'Meta Ads', 'brand-brain': 'Brand Brain', ideas: 'Idea Curator',
  calendar: 'Content Calendar', inbox: 'DM Inbox', comments: 'Comments', content: 'Content Library',
  approvals: 'Approvals',
};

function Tabs({ active }: { active: string }) {
  return (
    <nav className="mt-6 flex gap-1.5 overflow-x-auto border-b border-[var(--pl-border)] pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map((t) => {
        const on = active === t.key;
        return (
          <Link key={t.key} href={`${BASE}?tab=${t.key}`} scroll={false}
            className="relative whitespace-nowrap rounded-t-lg px-3.5 py-2 text-[13.5px] font-semibold transition"
            style={on ? { color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 12%, transparent)` } : { color: 'var(--pl-text-muted)' }}>
            {t.label}
            {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full" style={{ background: ACCENT }} />}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * MarketingFullService — the single, unified Meta marketing workspace. Tab is
 * driven by ?tab= (Overview / Meta Ads / Brand Brain / Ideas / Calendar / Inbox /
 * Comments / Content / Approvals) and a ?draft= id deep-links a recommendation
 * draft into the matching tab (e.g. pre-filling the PAUSED campaign form). All
 * data flows through the shared Marketing Brain + Meta APIs, so the main Command
 * Center and this workspace never diverge. Nothing publishes; campaigns stay PAUSED.
 */
export function MarketingFullService({ tenant }: { tenant: string }) {
  const sp = useSearchParams();
  const tab = sp.get('tab') || 'overview';
  const draftId = sp.get('draft') || '';

  const [statusData, setStatusData] = useState<(MetaStatus & { backendUp?: boolean }) | null>(null);
  const [readiness, setReadiness] = useState<MetaReadiness>('loading');

  const fetchStatus = useCallback(() => {
    setReadiness('loading');
    metaApi.status().then((d) => {
      setStatusData(d as MetaStatus & { backendUp?: boolean });
      setReadiness(deriveReadiness(d as MetaStatus & { backendUp?: boolean }));
    });
  }, []);
  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const showPanels = readiness === 'ready';

  return (
    <ServiceGate agent="marketing" tenant={tenant}>
      <main className="mx-auto w-full max-w-4xl px-[clamp(20px,4vw,52px)] py-9 text-[var(--pl-text)]">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--pl-border)]" style={{ background: `${ACCENT}1a`, color: ACCENT }}>
            <Megaphone size={20} />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pl-text-muted)]">Marketing Workspace</p>
            <h1 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-tight tracking-tight">{TAB_TITLE[tab] || 'Overview'}</h1>
          </div>
        </div>

        <Tabs active={tab} />

        {statusData !== null && <MetaSetupBar status={statusData} readiness={readiness} onRefresh={fetchStatus} />}

        {readiness === 'offline' && statusData === null && (
          <div className="mt-6"><OfflineState service="Marketing" action={<button onClick={fetchStatus} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} /></div>
        )}

        {showPanels && (
          <>
            {tab === 'overview' && <MarketingRecommendations />}
            {tab === 'ads' && <AdsPanel onConnectionChange={fetchStatus} draftId={draftId} />}
            {tab === 'brand-brain' && <BrandBrainPanel />}
            {tab === 'ideas' && <IdeaCuratorPanel />}
            {tab === 'calendar' && <ContentCalendarPanel />}
            {tab === 'inbox' && <InboxPanel type="dm" />}
            {tab === 'comments' && <CommentsPanel />}
            {tab === 'content' && <ContentLibraryPanel />}
            {tab === 'approvals' && <MarketingApprovalsPanel />}
          </>
        )}
      </main>
    </ServiceGate>
  );
}
