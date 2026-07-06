'use client';

import { Search } from 'lucide-react';
import { ServiceGate } from '@/components/pixie-lab/services/ServiceGate';
import { ServiceTabs } from '@/components/pixie-lab/services/ServiceTabs';
import { SeoAuditPanel } from './SeoAuditPanel';
import { SeoHistoryPanel } from './SeoHistoryPanel';
import { SeoConnectionsPanel } from './SeoConnectionsPanel';

const ACCENT = '#14B8A6';
const TABS = [
  { label: 'Overview', href: '/pixie-lab/seo' },
  { label: 'Audit', href: '/pixie-lab/seo/audit' },
  { label: 'History', href: '/pixie-lab/seo/history' },
  { label: 'Connections', href: '/pixie-lab/seo/connections' },
];

type SeoTab = 'audit' | 'history' | 'connections';

/**
 * SeoWorkspace — real SEO agent tools inside the Pixie Lab shell. Header + tab
 * nav (Overview links back to the agent dashboard) + the entitlement gate, then
 * the tool panel for the active tab. All data flows through the workspace-scoped
 * /api/lab/seo/* proxies.
 */
export function SeoWorkspace({ tab, tenant, initialUrl, auditId }: { tab: SeoTab; tenant: string; initialUrl?: string; auditId?: string }) {
  return (
    <ServiceGate agent="seo" tenant={tenant}>
      <main className="mx-auto w-full max-w-4xl px-[clamp(20px,4vw,52px)] py-9 text-[var(--pl-text)]">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--pl-border)]" style={{ background: `${ACCENT}1a`, color: ACCENT }}>
            <Search size={20} />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pl-text-muted)]">SEO Agent</p>
            <h1 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-tight tracking-tight">
              {tab === 'audit' ? 'Site Audit' : tab === 'history' ? 'Audit History' : 'Platform Connections'}
            </h1>
          </div>
        </div>

        <ServiceTabs tabs={TABS} accent={ACCENT} />

        {tab === 'audit' && <SeoAuditPanel initialUrl={initialUrl} auditId={auditId} />}
        {tab === 'history' && <SeoHistoryPanel />}
        {tab === 'connections' && <SeoConnectionsPanel />}
      </main>
    </ServiceGate>
  );
}
