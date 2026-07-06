'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { ServiceGate } from '@/components/pixie-lab/services/ServiceGate';
import { ServiceTabs } from '@/components/pixie-lab/services/ServiceTabs';
import { MetaSetupBar, deriveReadiness, type MetaReadiness } from './MetaSetupBar';
import { InboxPanel } from './InboxPanel';
import { CommentsPanel } from './CommentsPanel';
import { ContentLibraryPanel } from './ContentLibraryPanel';
import { MarketingApprovalsPanel } from './MarketingApprovalsPanel';
import { OfflineState } from '@/components/pixie-lab/services/ServiceStates';
import { metaApi } from '@/lib/pixie-lab/servicesClient';
import type { MetaStatus } from '@/lib/pixie-lab/serviceTypes';

const ACCENT = '#EC4899';

const TABS = [
  { label: 'Overview', href: '/pixie-lab/marketing' },
  { label: 'Inbox', href: '/pixie-lab/marketing/inbox' },
  { label: 'Comments', href: '/pixie-lab/marketing/comments' },
  { label: 'Content', href: '/pixie-lab/marketing/content' },
  { label: 'Approvals', href: '/pixie-lab/marketing/approvals' },
];

type MarketingTab = 'inbox' | 'comments' | 'content' | 'approvals';

const TAB_TITLE: Record<MarketingTab, string> = {
  inbox: 'DM Inbox',
  comments: 'Comments',
  content: 'Content Library',
  approvals: 'Approvals',
};

/**
 * MarketingWorkspace — real Meta/Marketing agent tools inside the Pixie Lab shell.
 * Mirrors SeoWorkspace exactly: ServiceGate + header + ServiceTabs + MetaSetupBar
 * (status/connect controls) + panel switch per tab. All data via metaApi /
 * approvalsApi from servicesClient.
 */
export function MarketingWorkspace({ tab, tenant }: { tab: MarketingTab; tenant: string }) {
  const [statusData, setStatusData] = useState<(MetaStatus & { backendUp?: boolean; inbox_permissions?: unknown }) | null>(null);
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
        {/* Header */}
        <div className="flex items-center gap-3">
          <span
            className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--pl-border)]"
            style={{ background: `${ACCENT}1a`, color: ACCENT }}
          >
            <Megaphone size={20} />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pl-text-muted)]">Marketing Agent</p>
            <h1 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-tight tracking-tight">
              {TAB_TITLE[tab]}
            </h1>
          </div>
        </div>

        <ServiceTabs tabs={TABS} accent={ACCENT} />

        {/* Honest status / connect bar — shown for all readiness states except loading */}
        {statusData !== null && (
          <MetaSetupBar status={statusData} readiness={readiness} onRefresh={fetchStatus} />
        )}

        {/* Offline override (no status yet + readiness is offline) */}
        {readiness === 'offline' && statusData === null && (
          <div className="mt-6">
            <OfflineState service="Marketing" action={<button onClick={fetchStatus} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />
          </div>
        )}

        {/* Data panels — only when Meta is connected */}
        {showPanels && (
          <>
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
