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
import { SeoKeywordsPanel } from './SeoKeywordsPanel';
import { SeoRankingsPanel } from './SeoRankingsPanel';
import { SeoCompetitorsPanel } from './SeoCompetitorsPanel';
import { SeoOpportunitiesPanel } from './SeoOpportunitiesPanel';
import { SeoOptimisePanel } from './SeoOptimisePanel';
import { SeoBriefsPanel } from './SeoBriefsPanel';
import { SeoAlertsPanel } from './SeoAlertsPanel';
import { SeoBacklinksPanel } from './SeoBacklinksPanel';
import { SeoOutreachPanel } from './SeoOutreachPanel';
import { SeoLocalPanel } from './SeoLocalPanel';
import { SeoLocationsPanel } from './SeoLocationsPanel';
import { SeoReviewsPanel } from './SeoReviewsPanel';
import { SeoCitationsPanel } from './SeoCitationsPanel';
import { SeoSchedulerPanel } from './SeoSchedulerPanel';
import { SeoBillingUsagePanel } from './SeoBillingUsagePanel';
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
  | 'reports'
  // ── Search Intelligence ──────────────────────────────────────────────────
  | 'keywords'
  | 'rankings'
  | 'competitors'
  | 'opportunities'
  | 'optimise'
  | 'briefs'
  | 'alerts'
  // ── Off-site ────────────────────────────────────────────────────────────
  | 'backlinks'
  | 'outreach'
  // ── Local SEO ────────────────────────────────────────────────────────────
  | 'local'
  | 'locations'
  | 'reviews'
  | 'citations'
  // ── Monitor (admin/internal) ──────────────────────────────────────────────
  | 'scheduler'
  | 'billing-usage';

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
  // ── Search Intelligence ──────────────────────────────────────────────────
  keywords: 'Keywords',
  rankings: 'Rankings',
  competitors: 'Competitors',
  opportunities: 'Opportunities',
  optimise: 'Optimise',
  briefs: 'Content Briefs',
  alerts: 'Alerts',
  // ── Off-site ────────────────────────────────────────────────────────────
  backlinks: 'Backlinks',
  outreach: 'Outreach',
  // ── Local SEO ────────────────────────────────────────────────────────────
  local: 'Local SEO',
  locations: 'Locations',
  reviews: 'Reviews',
  citations: 'Citations',
  // ── Monitor ──────────────────────────────────────────────────────────────
  scheduler: 'Scheduler Status',
  'billing-usage': 'SEO Usage',
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
  // Search intelligence params
  initialSiteId?: string;
  initialProjectId?: string;
  initialKeyword?: string;
  initialPageId?: string;
  // Local params
  locationId?: string;
}

/**
 * SeoWorkspace — the unified SEO agent workspace inside Pixie Lab. All SEO
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
  initialSiteId,
  initialProjectId,
  initialKeyword,
  initialPageId,
  locationId,
}: WorkspaceProps) {
  // Resolve siteId — accept both the legacy `siteId` prop (used by crawls/issues/pages)
  // and the newer `initialSiteId` (used by the search-intelligence panels).
  const resolvedSiteId = initialSiteId ?? siteId;

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

        {/* ── Existing tabs ──────────────────────────────────────────────── */}
        {tab === 'overview' && <SeoOverviewPanel tenant={tenant} />}
        {tab === 'sites' && <SeoSitesPanel />}
        {tab === 'audit' && <SeoAuditPanel initialUrl={initialUrl} auditId={auditId} siteId={resolvedSiteId} />}
        {tab === 'crawls' && <SeoCrawlsPanel initialSiteId={resolvedSiteId} />}
        {tab === 'issues' && <SeoIssuesPanel initialCrawlJobId={crawlJobId} initialSiteId={resolvedSiteId} initialSeverity={severity} />}
        {tab === 'pages' && <SeoPagesPanel initialCrawlJobId={crawlJobId} />}
        {tab === 'history' && <SeoHistoryPanel />}
        {tab === 'connections' && <SeoConnectionsPanel />}
        {tab === 'reports' && <SeoReportsPanel initialSiteId={resolvedSiteId} initialCrawlJobId={crawlJobId} />}

        {/* ── Search Intelligence tabs ────────────────────────────────────── */}
        {tab === 'keywords' && <SeoKeywordsPanel initialSiteId={resolvedSiteId} initialProjectId={initialProjectId} />}
        {tab === 'rankings' && <SeoRankingsPanel initialProjectId={initialProjectId} />}
        {tab === 'competitors' && <SeoCompetitorsPanel initialSiteId={resolvedSiteId} />}
        {tab === 'opportunities' && <SeoOpportunitiesPanel initialSiteId={resolvedSiteId} />}
        {tab === 'optimise' && <SeoOptimisePanel initialSiteId={resolvedSiteId} initialPageId={initialPageId} initialKeyword={initialKeyword} />}
        {tab === 'briefs' && <SeoBriefsPanel initialSiteId={resolvedSiteId} initialProjectId={initialProjectId} />}
        {tab === 'alerts' && <SeoAlertsPanel initialSiteId={resolvedSiteId} />}

        {/* ── Off-site tabs ───────────────────────────────────────────────── */}
        {tab === 'backlinks' && <SeoBacklinksPanel initialSiteId={resolvedSiteId} />}
        {tab === 'outreach' && <SeoOutreachPanel />}

        {/* ── Local SEO tabs ──────────────────────────────────────────────── */}
        {tab === 'local' && <SeoLocalPanel />}
        {tab === 'locations' && <SeoLocationsPanel />}
        {tab === 'reviews' && <SeoReviewsPanel initialLocationId={locationId} />}
        {tab === 'citations' && <SeoCitationsPanel initialLocationId={locationId} />}

        {/* ── Monitor / admin tabs ────────────────────────────────────────── */}
        {tab === 'scheduler' && <SeoSchedulerPanel />}
        {tab === 'billing-usage' && <SeoBillingUsagePanel />}
      </main>
    </ServiceGate>
  );
}
