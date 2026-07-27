'use client';

import { Search } from 'lucide-react';
import { ServiceGate } from '@/components/pixie-lab/services/ServiceGate';
import { ServiceTabs } from '@/components/pixie-lab/services/ServiceTabs';
import { SeoAuditPanel } from './SeoAuditPanel';
import { SeoHistoryPanel } from './SeoHistoryPanel';
import { SeoConnectionsPanel } from './SeoConnectionsPanel';
import { SeoOverviewPanel } from './SeoOverviewPanel';
import { SeoSitesPanel } from './SeoSitesPanel';
import { SeoCrawlsPanel } from './SeoCrawlsPanel';
import { SeoIssuesPanel } from './SeoIssuesPanel';
import { SeoPagesPanel } from './SeoPagesPanel';
import { SeoReportsPanel } from './SeoReportsPanel';
import { SEO_NAV } from '@/lib/pixie-lab/seoRoutes';

const ACCENT = '#14B8A6';

export type SeoTab =
  | 'overview'
  | 'sites'
  | 'audit'
  | 'crawls'
  | 'issues'
  | 'pages'
  | 'history'
  | 'connections'
  | 'reports';

const TAB_TITLE: Record<SeoTab, string> = {
  overview: 'SEO Overview',
  sites: 'Sites',
  audit: 'New Audit',
  crawls: 'Crawl Jobs',
  issues: 'Technical Issues',
  pages: 'Pages',
  history: 'Audit History',
  connections: 'Platform Connections',
  reports: 'Reports',
};

interface WorkspaceProps {
  tab: SeoTab;
  tenant: string;
  // Audit params
  initialUrl?: string;
  auditId?: string;
  // Crawls / issues / pages / reports params
  siteId?: string;
  crawlJobId?: string;
  severity?: string;
}

/**
 * SeoWorkspace — the unified SEO agent workspace inside Pixie Lab. All 9 SEO
 * sub-pages share this shell: header + horizontally-scrollable ServiceTabs +
 * entitlement gate + the active panel. Deep-links work via the page.tsx server
 * components passing the correct `tab` and optional filter props.
 */
export function SeoWorkspace({
  tab,
  tenant,
  initialUrl,
  auditId,
  siteId,
  crawlJobId,
  severity,
}: WorkspaceProps) {
  return (
    <ServiceGate agent="seo" tenant={tenant}>
      <main className="mx-auto w-full max-w-4xl px-[clamp(20px,4vw,52px)] py-9 text-[var(--pl-text)]">
        <div className="flex items-center gap-3">
          <span
            className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--pl-border)]"
            style={{ background: `${ACCENT}1a`, color: ACCENT }}
          >
            <Search size={20} />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pl-text-muted)]">SEO Agent</p>
            <h1 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-tight tracking-tight">
              {TAB_TITLE[tab]}
            </h1>
          </div>
        </div>

        <ServiceTabs tabs={SEO_NAV} accent={ACCENT} />

        {tab === 'overview' && <SeoOverviewPanel tenant={tenant} />}
        {tab === 'sites' && <SeoSitesPanel />}
        {tab === 'audit' && <SeoAuditPanel initialUrl={initialUrl} auditId={auditId} siteId={siteId} />}
        {tab === 'crawls' && <SeoCrawlsPanel initialSiteId={siteId} />}
        {tab === 'issues' && <SeoIssuesPanel initialCrawlJobId={crawlJobId} initialSiteId={siteId} initialSeverity={severity} />}
        {tab === 'pages' && <SeoPagesPanel initialCrawlJobId={crawlJobId} />}
        {tab === 'history' && <SeoHistoryPanel />}
        {tab === 'connections' && <SeoConnectionsPanel />}
        {tab === 'reports' && <SeoReportsPanel initialSiteId={siteId} initialCrawlJobId={crawlJobId} />}
      </main>
    </ServiceGate>
  );
}
