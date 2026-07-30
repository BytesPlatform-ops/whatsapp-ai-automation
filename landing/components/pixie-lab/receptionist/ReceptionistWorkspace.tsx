'use client';

import { Headset } from 'lucide-react';
import { ServiceGate } from '@/components/pixie-lab/services/ServiceGate';
import { ServiceTabs } from '@/components/pixie-lab/services/ServiceTabs';
import { RCP_ACCENT } from './widgets';
import { DashboardPanel } from './DashboardPanel';
import { ConsolePanel } from './ConsolePanel';
import { InboxPanel } from './InboxPanel';
import { CrmPanel } from './CrmPanel';
import { OperationsPanel } from './OperationsPanel';
import { IntegrationsPanel } from './IntegrationsPanel';
import { KnowledgePanel } from './KnowledgePanel';
import KnowledgeSourcesPanel from './KnowledgeSourcesPanel';
import ApprovalsPanel from './ApprovalsPanel';
import ProvidersPanel from './ProvidersPanel';
import AnalyticsRangePanel from './AnalyticsRangePanel';
import WidgetSetupPanel from './WidgetSetupPanel';

export type RcpTab = 'dashboard' | 'console' | 'conversations' | 'crm' | 'operations' | 'integrations' | 'knowledge' | 'approvals' | 'providers' | 'analytics' | 'widget';

const TABS = [
  { label: 'Overview', href: '/pixie-lab/receptionist' },
  { label: 'Dashboard', href: '/pixie-lab/receptionist/dashboard' },
  { label: 'Console', href: '/pixie-lab/receptionist/console' },
  { label: 'Inbox', href: '/pixie-lab/receptionist/conversations' },
  { label: 'CRM', href: '/pixie-lab/receptionist/crm' },
  { label: 'Approvals', href: '/pixie-lab/receptionist/approvals' },
  { label: 'Providers', href: '/pixie-lab/receptionist/providers' },
  { label: 'Analytics', href: '/pixie-lab/receptionist/analytics' },
  { label: 'Widget', href: '/pixie-lab/receptionist/widget' },
  { label: 'Operations', href: '/pixie-lab/receptionist/operations' },
  { label: 'Integrations', href: '/pixie-lab/receptionist/integrations' },
  { label: 'Knowledge', href: '/pixie-lab/receptionist/knowledge' },
];

const TITLES: Record<RcpTab, string> = {
  dashboard: 'Overview Dashboard',
  console: 'Live Console',
  conversations: 'Conversations',
  crm: 'CRM & Leads',
  approvals: 'Approvals',
  providers: 'Gmail & Calendar',
  analytics: 'Analytics',
  widget: 'Website Widget',
  operations: 'Operations',
  integrations: 'Integrations',
  knowledge: 'Business Profile & Knowledge',
};

/**
 * ReceptionistWorkspace — the AI Receptionist tools inside the Pixie Lab shell.
 * Header + sub-tabs + entitlement gate, then the active tool panel. All data
 * flows through the workspace-scoped /api/lab/receptionist/* proxies.
 */
export function ReceptionistWorkspace({ tab, tenant }: { tab: RcpTab; tenant: string }) {
  return (
    <ServiceGate agent="receptionist" tenant={tenant}>
      <main className="mx-auto w-full max-w-5xl px-[clamp(20px,4vw,52px)] py-9 text-[var(--pl-text)]">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--pl-border)]" style={{ background: `${RCP_ACCENT}1a`, color: RCP_ACCENT }}>
            <Headset size={20} />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pl-text-muted)]">AI Receptionist</p>
            <h1 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-tight tracking-tight">{TITLES[tab]}</h1>
          </div>
        </div>

        <ServiceTabs tabs={TABS} accent={RCP_ACCENT} />

        <div className="mt-2">
          {tab === 'dashboard' && <DashboardPanel />}
          {tab === 'console' && <ConsolePanel />}
          {tab === 'conversations' && <InboxPanel />}
          {tab === 'crm' && <CrmPanel />}
          {tab === 'approvals' && <ApprovalsPanel />}
          {tab === 'providers' && <ProvidersPanel />}
          {tab === 'analytics' && <AnalyticsRangePanel />}
          {tab === 'widget' && <WidgetSetupPanel />}
          {tab === 'operations' && <OperationsPanel />}
          {tab === 'integrations' && <IntegrationsPanel />}
          {tab === 'knowledge' && (
            <div className="space-y-8">
              <KnowledgePanel />
              <KnowledgeSourcesPanel />
            </div>
          )}
        </div>
      </main>
    </ServiceGate>
  );
}
