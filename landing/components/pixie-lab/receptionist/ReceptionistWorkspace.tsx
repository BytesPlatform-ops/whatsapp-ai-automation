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
import BookingsPanel from './BookingsPanel';
import FollowUpsPanel from './FollowUpsPanel';
import CalendarConfigPanel from './CalendarConfigPanel';
import GmailDraftsPanel from './GmailDraftsPanel';
import WhatsAppPanel from './WhatsAppPanel';
import MetaMessagingPanel from './MetaMessagingPanel';
import SmsPanel from './SmsPanel';
import TelegramPanel from './TelegramPanel';
import VoicePanel from './VoicePanel';
import CampaignsPanel from './CampaignsPanel';

export type RcpTab = 'dashboard' | 'console' | 'conversations' | 'crm' | 'operations' | 'integrations' | 'knowledge' | 'approvals' | 'providers' | 'analytics' | 'widget' | 'bookings' | 'followups' | 'calendar' | 'gmail' | 'whatsapp' | 'meta-messaging' | 'sms' | 'telegram' | 'voice' | 'campaigns';

const TABS = [
  { label: 'Overview', href: '/pixie-lab/receptionist' },
  { label: 'Dashboard', href: '/pixie-lab/receptionist/dashboard' },
  { label: 'Console', href: '/pixie-lab/receptionist/console' },
  { label: 'Inbox', href: '/pixie-lab/receptionist/conversations' },
  { label: 'CRM', href: '/pixie-lab/receptionist/crm' },
  { label: 'Approvals', href: '/pixie-lab/receptionist/approvals' },
  { label: 'Gmail', href: '/pixie-lab/receptionist/gmail' },
  { label: 'WhatsApp', href: '/pixie-lab/receptionist/whatsapp' },
  { label: 'Instagram & Messenger', href: '/pixie-lab/receptionist/meta-messaging' },
  { label: 'SMS', href: '/pixie-lab/receptionist/sms' },
  { label: 'Telegram', href: '/pixie-lab/receptionist/telegram' },
  { label: 'Voice', href: '/pixie-lab/receptionist/voice' },
  { label: 'Providers', href: '/pixie-lab/receptionist/providers' },
  { label: 'Calendar', href: '/pixie-lab/receptionist/calendar' },
  { label: 'Bookings', href: '/pixie-lab/receptionist/bookings' },
  { label: 'Follow-Ups', href: '/pixie-lab/receptionist/followups' },
  { label: 'Campaigns', href: '/pixie-lab/receptionist/campaigns' },
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
  gmail: 'Gmail Drafts',
  whatsapp: 'WhatsApp',
  'meta-messaging': 'Instagram & Messenger',
  sms: 'SMS',
  telegram: 'Telegram',
  voice: 'Voice & Telephony',
  campaigns: 'Outbound Campaigns',
  calendar: 'Calendar Setup',
  bookings: 'Bookings',
  followups: 'Follow-Ups & Reminders',
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
          {tab === 'gmail' && <GmailDraftsPanel />}
          {tab === 'whatsapp' && <WhatsAppPanel />}
          {tab === 'meta-messaging' && <MetaMessagingPanel />}
          {tab === 'sms' && <SmsPanel />}
          {tab === 'telegram' && <TelegramPanel />}
          {tab === 'voice' && <VoicePanel />}
          {tab === 'campaigns' && <CampaignsPanel />}
          {tab === 'calendar' && <CalendarConfigPanel />}
          {tab === 'bookings' && <BookingsPanel />}
          {tab === 'followups' && <FollowUpsPanel />}
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
