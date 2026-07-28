'use client';

/**
 * Typed browser client for the Pixie service proxies under /api/lab/*. Components
 * call these instead of hand-rolling fetches, so error/offline handling and the
 * response shapes stay consistent. Every proxy resolves the workspace tenant
 * server-side, so nothing here takes or sends a tenant id.
 */
import type {
  SeoAuditResult, SeoConnectionPlatform, SeoHistoryAudit,
  SeoDurableSite, SeoCrawlJob, SeoCrawledPageSummary, SeoCrawlIssue, SeoCrawlReport,
  SeoKeywordProject, SeoKeyword, SeoKeywordCluster, SeoResearchKeyword,
  SeoRankJob, SeoRankHistoryPoint, SeoRankOverview,
  SeoCompetitor, SeoCompetitorGapItem,
  SeoOpportunity, SeoOptimiseResult, SeoBrief, SeoAlert,
  SeoGoogleConnection, SeoGoogleProperty, SeoIntegrationStatus,
  SeoBacklink, SeoBacklinkOverview, SeoReferringDomain, SeoAnchorText, SeoLinkGapItem,
  SeoLocalOverview, SeoLocation, SeoReview, SeoReviewSummary, SeoCitation,
  SeoOutreachContact, SeoOutreachCampaign, SeoOutreachDraft, SeoLinkPlacement,
  SeoSchedulerHealth,
  PageSpeedData,
  MetaStatus, MetaInboxItem, MetaContentItem,
  MetaAdAccount, MetaCampaign, MetaAdInsights, MetaDiagnostics, MetaAdsAnalysis, BrandBrain,
  ContentIdea, IdeaGenerateResult, CalendarItem, CalendarResult,
  ContentAsset, StorageStatus, ApprovalItem, Envelope,
  RcpRunResult, RcpOverview, RcpIntegrationStatus, RcpConversation, RcpConversationDetail,
  RcpContact, RcpBooking, RcpQuote, RcpTask, RcpTicket, RcpEscalation, RcpPayment,
  RcpCampaign, RcpCampaignReply, RcpBusinessProfile, RcpKnowledgeItem, RcpHealth,
} from './serviceTypes';

async function req<T>(url: string, init?: RequestInit): Promise<Envelope<T>> {
  try {
    const r = await fetch(url, { cache: 'no-store', ...init });
    const d = (await r.json().catch(() => ({}))) as Envelope<T>;
    if (!r.ok && d.backendUp === undefined) return { backendUp: false, error: d.error || `Request failed (${r.status})` } as Envelope<T>;
    return d;
  } catch {
    return { backendUp: false, error: 'Network error' } as Envelope<T>;
  }
}
function post<T>(url: string, body: Record<string, unknown>) {
  return req<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

/* ------------------------------ SEO ------------------------------ */
export const seoApi = {
  // ── Existing audit-mode endpoints ──────────────────────────────────────────
  runAudit: (website_url: string, opts?: { crawl_limit?: number; include_pagespeed?: boolean }) =>
    post<SeoAuditResult>('/api/lab/seo/audit', { website_url, ...opts }),
  getAudit: (audit_id: string) =>
    req<{ audit: SeoAuditResult['audit']; issues: SeoAuditResult['issues'] }>(`/api/lab/seo/audit?audit_id=${encodeURIComponent(audit_id)}`),
  history: () => req<{ audits: SeoHistoryAudit[] }>('/api/lab/seo/history'),
  connections: () => req<{ platforms: SeoConnectionPlatform[] }>('/api/lab/seo/connections'),
  connectWordpress: (site_url: string, username: string, application_password: string) =>
    post<{ status: string; message?: string; connected_as?: string }>('/api/lab/seo/connections', { kind: 'wordpress', site_url, username, application_password }),
  connectToken: (platform: string, token: string, site_id?: string) =>
    post<{ status: string; message?: string }>('/api/lab/seo/connections', { kind: 'token', platform, token, site_id }),
  disconnect: (platform: string) =>
    post<{ status: string }>('/api/lab/seo/connections', { kind: 'disconnect', platform }),
  prepareFix: (audit_id: string, issue_id: string, new_value?: string) =>
    post<{ status: string; approval_id?: string; copy_text?: string; message?: string }>('/api/lab/seo/optimize', { mode: 'prepare', audit_id, issue_id, new_value }),

  // ── Durable pipeline: Sites ────────────────────────────────────────────────
  /** List all registered sites for the workspace. */
  listSites: () =>
    req<{ sites: SeoDurableSite[] }>('/api/lab/seo/sites'),

  /** Create a new site. */
  createSite: (p: {
    domain: string;
    canonical_base_url?: string;
    display_name?: string;
    country?: string;
    language?: string;
    crawl_limit?: number;
    crawl_frequency?: string;
    robots_policy?: string;
    sitemap_urls?: string[];
    included_paths?: string[];
    excluded_paths?: string[];
  }) => post<{ site: SeoDurableSite }>('/api/lab/seo/sites', p),

  /** Get a single site by ID. */
  getSite: (site_id: string) =>
    req<{ site: SeoDurableSite }>(`/api/lab/seo/sites/${encodeURIComponent(site_id)}`),

  /** Edit crawl settings for a site. */
  patchSite: (site_id: string, patch: Partial<Pick<SeoDurableSite,
    'crawl_limit' | 'crawl_frequency' | 'country' | 'language' | 'target_location' |
    'included_paths' | 'excluded_paths' | 'sitemap_urls' | 'robots_policy' |
    'display_name' | 'canonical_base_url'
  >>) =>
    req<{ site: SeoDurableSite }>(`/api/lab/seo/sites/${encodeURIComponent(site_id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),

  /** Delete / archive a site. */
  deleteSite: (site_id: string) =>
    req<{ deleted: string }>(`/api/lab/seo/sites/${encodeURIComponent(site_id)}`, { method: 'DELETE' }),

  // ── Durable pipeline: Crawls ───────────────────────────────────────────────
  /** List crawl jobs, optionally filtered by site. */
  listCrawls: (site_id?: string) =>
    req<{ jobs: SeoCrawlJob[] }>(`/api/lab/seo/crawl${site_id ? `?site_id=${encodeURIComponent(site_id)}` : ''}`),

  /** Start a new crawl. The server clamps requested_limit server-side. */
  startCrawl: (p: { site_id: string; url?: string; crawl_type?: 'site' | 'single'; requested_limit?: number }) =>
    post<{ job_id: string; status: string; requested_limit: number; crawl_type: string; site_id: string }>(
      '/api/lab/seo/crawl',
      p,
    ),

  /** Poll the status of a crawl job. */
  getCrawlJob: (job_id: string) =>
    req<{ job: SeoCrawlJob }>(`/api/lab/seo/crawl/${encodeURIComponent(job_id)}`),

  /** Cancel a running or queued crawl job. */
  cancelCrawl: (job_id: string) =>
    post<{ cancelled: string }>(`/api/lab/seo/crawl/${encodeURIComponent(job_id)}?action=cancel`, {}),

  /** Retry a failed or cancelled crawl job. */
  retryCrawl: (job_id: string) =>
    post<{ retried: string }>(`/api/lab/seo/crawl/${encodeURIComponent(job_id)}?action=retry`, {}),

  // ── Durable pipeline: Pages ────────────────────────────────────────────────
  /** List crawled pages for a job with pagination. */
  listPages: (crawl_job_id: string, opts?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams({ crawl_job_id });
    if (opts?.limit != null) params.set('limit', String(opts.limit));
    if (opts?.offset != null) params.set('offset', String(opts.offset));
    return req<{ total: number; limit: number; offset: number; pages: SeoCrawledPageSummary[] }>(
      `/api/lab/seo/pages?${params}`,
    );
  },

  // ── Durable pipeline: Issues ───────────────────────────────────────────────
  /** List SEO issues with optional filters. */
  listIssues: (filters?: {
    crawl_job_id?: string;
    site_id?: string;
    severity?: string;
    status?: string;
    category?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.crawl_job_id) params.set('crawl_job_id', filters.crawl_job_id);
    if (filters?.site_id) params.set('site_id', filters.site_id);
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.category) params.set('category', filters.category);
    const qs = params.toString();
    return req<{ issues: SeoCrawlIssue[] }>(`/api/lab/seo/issues${qs ? `?${qs}` : ''}`);
  },

  /** Mark an issue as resolved. */
  resolveIssue: (issue_id: string) =>
    post<{ issue: SeoCrawlIssue }>(`/api/lab/seo/issues/${encodeURIComponent(issue_id)}`, {}),

  // ── Durable pipeline: Reports ──────────────────────────────────────────────
  /** Latest report for a site (pass site_id) or report for a crawl job (pass crawl_job_id). */
  getReport: (opts: { site_id?: string; crawl_job_id?: string }) => {
    const params = new URLSearchParams();
    if (opts.site_id) params.set('site_id', opts.site_id);
    if (opts.crawl_job_id) params.set('crawl_job_id', opts.crawl_job_id);
    return req<{ report: SeoCrawlReport | null }>(`/api/lab/seo/reports?${params}`);
  },

  // ── Search Intelligence: Keywords ──────────────────────────────────────────
  keywordProjects: (site_id?: string) => {
    const qs = site_id ? `?site_id=${encodeURIComponent(site_id)}` : '';
    return req<{ projects: SeoKeywordProject[] }>(`/api/lab/seo/keywords/projects${qs}`);
  },
  createKeywordProject: (p: { name: string; site_id?: string; country?: string; language?: string }) =>
    post<{ project: SeoKeywordProject }>('/api/lab/seo/keywords/projects', p),
  deleteKeywordProject: (project_id: string) =>
    req<{ deleted: string }>(`/api/lab/seo/keywords/projects/${encodeURIComponent(project_id)}`, { method: 'DELETE' }),
  keywords: (project_id: string, opts?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams({ project_id });
    if (opts?.limit != null) params.set('limit', String(opts.limit));
    if (opts?.offset != null) params.set('offset', String(opts.offset));
    return req<{ keywords: SeoKeyword[]; total?: number }>(`/api/lab/seo/keywords?${params}`);
  },
  addKeyword: (project_id: string, keyword: string, extras?: Partial<SeoKeyword>) =>
    post<{ keyword: SeoKeyword }>('/api/lab/seo/keywords', { project_id, keyword, ...extras }),
  deleteKeyword: (keyword_id: string) =>
    req<{ deleted: string }>(`/api/lab/seo/keywords/${encodeURIComponent(keyword_id)}`, { method: 'DELETE' }),
  /** @param seed_keyword - was previously called ; renamed to match backend ResearchBody */
  research: (seed_keyword: string, opts?: { country?: string; language?: string; project_id?: string; domain?: string }) =>
    post<{ keywords: SeoResearchKeyword[]; seed_keyword: string }>('/api/lab/seo/keywords/research', { seed_keyword, ...opts }),
  clusters: (project_id: string) =>
    req<{ clusters: SeoKeywordCluster[] }>(`/api/lab/seo/keywords/clusters?project_id=${encodeURIComponent(project_id)}`),
  /** Trigger auto-cluster for a project. The proxy calls /clusters/auto on the backend. */
  createClusters: (project_id: string, ai_assist?: boolean) =>
    post<{ clusters: SeoKeywordCluster[] }>(`/api/lab/seo/keywords/projects/${encodeURIComponent(project_id)}/clusters`, { ai_assist: ai_assist ?? false }),
  /** @param csv_text - was previously called csv_content; renamed to match backend CsvImportBody */
  importKeywordsCsv: (project_id: string, csv_text: string) =>
    post<{ parsed_count?: number; added_count?: number; imported?: number; errors?: string[] }>('/api/lab/seo/keywords/import', { project_id, csv_text }),
  exportKeywordsCsv: (project_id: string) =>
    req<{ csv: string }>(`/api/lab/seo/keywords/export?project_id=${encodeURIComponent(project_id)}`),

  // ── Search Intelligence: Rankings ─────────────────────────────────────────
  rankCheck: (project_id: string, keyword_ids?: string[]) =>
    post<{ job: SeoRankJob }>('/api/lab/seo/rankings/check', { project_id, keyword_ids }),
  rankJobs: (project_id?: string) => {
    const qs = project_id ? `?project_id=${encodeURIComponent(project_id)}` : '';
    return req<{ jobs: SeoRankJob[] }>(`/api/lab/seo/rankings/jobs${qs}`);
  },
  rankHistory: (keyword_id: string, days?: number) => {
    const params = new URLSearchParams({ keyword_id });
    if (days != null) params.set('days', String(days));
    return req<{ history: SeoRankHistoryPoint[] }>(`/api/lab/seo/rankings/history?${params}`);
  },
  rankOverview: (project_id: string) =>
    req<SeoRankOverview>(`/api/lab/seo/rankings/overview?project_id=${encodeURIComponent(project_id)}`),
  rankKeyword: (keyword_id: string) =>
    req<{ keyword: SeoKeyword; history: SeoRankHistoryPoint[] }>(`/api/lab/seo/rankings/keyword/${encodeURIComponent(keyword_id)}`),

  // ── Search Intelligence: Competitors ──────────────────────────────────────
  competitors: (site_id?: string) => {
    const qs = site_id ? `?site_id=${encodeURIComponent(site_id)}` : '';
    return req<{ competitors: SeoCompetitor[] }>(`/api/lab/seo/competitors${qs}`);
  },
  addCompetitor: (p: { domain: string; site_id?: string; project_id?: string; display_name?: string; notes?: string }) =>
    post<{ competitor: SeoCompetitor }>('/api/lab/seo/competitors', p),
  deleteCompetitor: (competitor_id: string) =>
    req<{ deleted: string }>(`/api/lab/seo/competitors/${encodeURIComponent(competitor_id)}`, { method: 'DELETE' }),
  /** Keyword gap analysis vs a competitor. Backend: GET /competitors/gap?project_id=&competitor_domain= */
  competitorGap: (project_id: string, competitor_domain?: string, opts?: { min_volume?: number }) => {
    const params = new URLSearchParams();
    params.set('project_id', project_id);
    if (competitor_domain) params.set('competitor_domain', competitor_domain);
    if (opts?.min_volume != null) params.set('min_volume', String(opts.min_volume));
    return req<{ gap?: SeoCompetitorGapItem[]; keyword_gap: SeoCompetitorGapItem[]; keyword_overlap: SeoCompetitorGapItem[]; competitor_top_pages: unknown[] }>(`/api/lab/seo/competitors/gap?${params}`);
  },

  // ── Search Intelligence: Opportunities ────────────────────────────────────
  opportunities: (site_id?: string) => {
    const qs = site_id ? `?site_id=${encodeURIComponent(site_id)}` : '';
    return req<{ opportunities: SeoOpportunity[] }>(`/api/lab/seo/opportunities${qs}`);
  },
  generateOpportunities: (site_id: string, project_id?: string) =>
    post<{ opportunities: SeoOpportunity[]; generated: number }>('/api/lab/seo/opportunities/generate', { site_id, project_id }),
  dismissOpportunity: (opportunity_id: string) =>
    post<{ opportunity: SeoOpportunity }>(`/api/lab/seo/opportunities/${encodeURIComponent(opportunity_id)}/dismiss`, {}),
  actionOpportunity: (opportunity_id: string) =>
    post<{ opportunity: SeoOpportunity }>(`/api/lab/seo/opportunities/${encodeURIComponent(opportunity_id)}/action`, {}),

  // ── Search Intelligence: Optimise ─────────────────────────────────────────
  optimisePage: (opts: { site_id?: string; page_id?: string; keyword?: string; url?: string }) => {
    const params = new URLSearchParams();
    if (opts.site_id) params.set('site_id', opts.site_id);
    if (opts.page_id) params.set('page_id', opts.page_id);
    if (opts.keyword) params.set('keyword', opts.keyword);
    if (opts.url) params.set('url', opts.url);
    return req<SeoOptimiseResult>(`/api/lab/seo/optimise?${params}`);
  },

  // ── Search Intelligence: Briefs ───────────────────────────────────────────
  briefs: (site_id?: string, project_id?: string) => {
    const params = new URLSearchParams();
    if (site_id) params.set('site_id', site_id);
    if (project_id) params.set('project_id', project_id);
    const qs = params.toString();
    return req<{ briefs: SeoBrief[] }>(`/api/lab/seo/briefs${qs ? `?${qs}` : ''}`);
  },
  /** Create/generate a brief from keyword inputs. Routes to /briefs/generate on backend.
   *  Accepts both new { primary_keyword } and legacy { keyword } field names. */
  createBrief: (p: { primary_keyword?: string; keyword?: string; title?: string; site_id?: string; project_id?: string; secondary_keywords?: string[]; search_intent?: string; target_audience?: string; word_count_min?: number; word_count_max?: number; cta_direction?: string }) =>
    post<{ brief: SeoBrief }>('/api/lab/seo/briefs', { ...p as Record<string, unknown>, primary_keyword: (p as Record<string,unknown>).primary_keyword ?? (p as Record<string,unknown>).keyword }),
  /** Generate content outline for a brief. Accepts brief_id string (legacy) or full params object. */
  generateBrief: (p: string | { primary_keyword?: string; brief_id?: string; site_id?: string; project_id?: string; secondary_keywords?: string[] }) => {
    const body: Record<string, unknown> = typeof p === 'string' ? { brief_id: p } : { ...p as Record<string, unknown> };
    return post<{ brief: SeoBrief }>('/api/lab/seo/briefs/generate', body);
  },
  approveBrief: (brief_id: string) =>
    post<{ brief: SeoBrief }>(`/api/lab/seo/briefs/${encodeURIComponent(brief_id)}/approve`, {}),
  archiveBrief: (brief_id: string) =>
    post<{ brief: SeoBrief }>(`/api/lab/seo/briefs/${encodeURIComponent(brief_id)}/archive`, {}),
  duplicateBrief: (brief_id: string) =>
    post<{ brief: SeoBrief }>(`/api/lab/seo/briefs/${encodeURIComponent(brief_id)}/duplicate`, {}),
  handoffBrief: (brief_id: string) =>
    post<{ brief: SeoBrief; handoff_url?: string }>(`/api/lab/seo/briefs/${encodeURIComponent(brief_id)}/handoff`, {}),

  // ── Search Intelligence: Alerts ───────────────────────────────────────────
  alerts: (site_id?: string) => {
    const qs = site_id ? `?site_id=${encodeURIComponent(site_id)}` : '';
    return req<{ alerts: SeoAlert[] }>(`/api/lab/seo/alerts${qs}`);
  },
  generateAlerts: (site_id?: string) =>
    post<{ alerts: SeoAlert[]; generated: number }>('/api/lab/seo/alerts/generate', { site_id }),
  readAlert: (alert_id: string) =>
    post<{ alert: SeoAlert }>(`/api/lab/seo/alerts/${encodeURIComponent(alert_id)}/read`, {}),
  dismissAlert: (alert_id: string) =>
    post<{ alert: SeoAlert }>(`/api/lab/seo/alerts/${encodeURIComponent(alert_id)}/dismiss`, {}),

  // ── Search Intelligence: Google Connections ────────────────────────────────
  googleConnections: () =>
    req<{ connections: SeoGoogleConnection[] }>('/api/lab/seo/google/connections'),
  googleConnect: () =>
    post<{ auth_url: string; state?: string }>('/api/lab/seo/google/connect', {}),
  googleProperties: (connection_id: string) =>
    req<{ properties: SeoGoogleProperty[] }>(`/api/lab/seo/google/properties?connection_id=${encodeURIComponent(connection_id)}`),
  selectGoogleProperty: (connection_id: string, property_id: string) =>
    post<{ connection: SeoGoogleConnection }>('/api/lab/seo/google/properties/select', { connection_id, property_id }),
  syncGoogleConnection: (connection_id: string) =>
    post<{ syncing: boolean }>(`/api/lab/seo/google/connections/${encodeURIComponent(connection_id)}/sync`, {}),
  disconnectGoogle: (connection_id: string) =>
    post<{ disconnected: string }>(`/api/lab/seo/google/connections/${encodeURIComponent(connection_id)}/disconnect`, {}),

  // ── Per-page Core Web Vitals ───────────────────────────────────────────────
  pageSpeed: (opts: { page_id?: string; url?: string; site_id?: string }) => {
    const params = new URLSearchParams();
    if (opts.page_id) params.set('page_id', opts.page_id);
    if (opts.url) params.set('url', opts.url);
    if (opts.site_id) params.set('site_id', opts.site_id);
    return req<PageSpeedData>(`/api/lab/seo/pagespeed?${params}`);
  },

  // ── Upgraded connections integrations status ───────────────────────────────
  integrations: () =>
    req<{ integrations: SeoIntegrationStatus[] }>('/api/lab/seo/integrations'),

  // ── Backlinks ──────────────────────────────────────────────────────────────
  backlinkSync: (site_id: string) =>
    post<{ job_id?: string; status?: string }>('/api/lab/seo/backlinks/sync', { site_id }),
  backlinkOverview: (site_id?: string) => {
    const qs = site_id ? `?site_id=${encodeURIComponent(site_id)}` : '';
    return req<{ overview: SeoBacklinkOverview }>(`/api/lab/seo/backlinks/overview${qs}`);
  },
  backlinks: (opts?: {
    site_id?: string; status?: string; follow?: boolean; source_domain?: string;
    target_url?: string; anchor?: string; risk?: string; limit?: number; offset?: number;
  }) => {
    const params = new URLSearchParams();
    if (opts?.site_id) params.set('site_id', opts.site_id);
    if (opts?.status) params.set('status', opts.status);
    if (opts?.follow != null) params.set('follow', String(opts.follow));
    if (opts?.source_domain) params.set('source_domain', opts.source_domain);
    if (opts?.target_url) params.set('target_url', opts.target_url);
    if (opts?.anchor) params.set('anchor', opts.anchor);
    if (opts?.risk) params.set('risk', opts.risk);
    if (opts?.limit != null) params.set('limit', String(opts.limit));
    if (opts?.offset != null) params.set('offset', String(opts.offset));
    const qs = params.toString();
    return req<{ backlinks: SeoBacklink[]; total?: number }>(`/api/lab/seo/backlinks${qs ? `?${qs}` : ''}`);
  },
  referringDomains: (site_id?: string) => {
    const qs = site_id ? `?site_id=${encodeURIComponent(site_id)}` : '';
    return req<{ domains: SeoReferringDomain[] }>(`/api/lab/seo/backlinks/referring-domains${qs}`);
  },
  backlinksNewLost: (site_id?: string) => {
    const qs = site_id ? `?site_id=${encodeURIComponent(site_id)}` : '';
    return req<{ new: SeoBacklink[]; lost: SeoBacklink[] }>(`/api/lab/seo/backlinks/new-lost${qs}`);
  },
  anchorTexts: (site_id?: string) => {
    const qs = site_id ? `?site_id=${encodeURIComponent(site_id)}` : '';
    return req<{ anchors: SeoAnchorText[] }>(`/api/lab/seo/backlinks/anchors${qs}`);
  },
  backlinkRisk: (site_id?: string) => {
    const qs = site_id ? `?site_id=${encodeURIComponent(site_id)}` : '';
    return req<{ high_risk: SeoBacklink[]; medium_risk: SeoBacklink[] }>(`/api/lab/seo/backlinks/risk${qs}`);
  },
  linkGap: (site_id: string, competitor_domains?: string[]) =>
    post<{ gap: SeoLinkGapItem[] }>('/api/lab/seo/backlinks/gap', { site_id, competitor_domains }),
  backlinkOpportunities: (site_id?: string) => {
    const qs = site_id ? `?site_id=${encodeURIComponent(site_id)}` : '';
    return req<{ opportunities: SeoLinkGapItem[] }>(`/api/lab/seo/backlinks/opportunities${qs}`);
  },
  exportBacklinks: (site_id?: string) => {
    const qs = site_id ? `?site_id=${encodeURIComponent(site_id)}` : '';
    return req<{ csv: string }>(`/api/lab/seo/backlinks/export${qs}`);
  },

  // ── Local SEO ──────────────────────────────────────────────────────────────
  /** Local SEO overview - proxied to /locations list on backend (no flat /local endpoint). */
  localOverview: (site_id?: string) => {
    const qs = site_id ? `?site_id=${encodeURIComponent(site_id)}` : '';
    return req<{ overview: SeoLocalOverview }>(`/api/lab/seo/local${qs}`);
  },
  /** Get local rank overview for a location (GET). location_id required. */
  localRankings: (location_id: string) =>
    req<{ rankings: Array<{ keyword: string; rank?: number | null; grid?: unknown }> }>(`/api/lab/seo/local-rank?location_id=${encodeURIComponent(location_id)}`),
  /** Trigger a local rank check for a location (POST). */
  checkLocalRank: (p: { location_id: string; keywords: string[]; city?: string; device?: string }) =>
    post<{ results: unknown[] }>('/api/lab/seo/local-rank', p as Record<string, unknown>),
  locations: () =>
    req<{ locations: SeoLocation[] }>('/api/lab/seo/locations'),
  createLocation: (p: Omit<SeoLocation, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) =>
    post<{ location: SeoLocation }>('/api/lab/seo/locations', p as Record<string, unknown>),
  updateLocation: (id: string, patch: Partial<SeoLocation>) =>
    req<{ location: SeoLocation }>(`/api/lab/seo/locations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  archiveLocation: (id: string) =>
    req<{ archived: string }>(`/api/lab/seo/locations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** List reviews for a location. location_id is required by the backend proxy. */
  reviews: (opts: { location_id?: string; status?: string; handled?: boolean }) => {
    const params = new URLSearchParams();
    if (opts.location_id) params.set('location_id', opts.location_id);
    if (opts.status) params.set('status', opts.status);
    if (opts.handled != null) params.set('handled', String(opts.handled));
    return req<{ reviews: SeoReview[]; workspace?: SeoReviewSummary; summary?: SeoReviewSummary }>(`/api/lab/seo/reviews?${params}`);
  },
  /** Draft an AI reply for a review. location_id required. */
  draftReviewResponse: (review_id: string, location_id?: string) =>
    post<{ draft: string; approval_id?: string }>('/api/lab/seo/reviews', { review_id, location_id, action: 'draft' }),
  /** Approve a drafted review reply. */
  approveReviewResponse: (review_id: string, approved_by?: string) =>
    post<{ review: SeoReview }>('/api/lab/seo/reviews', { review_id, approved_by, action: 'approve' }),
  citations: (opts?: { location_id?: string; consistent?: boolean; claimed?: boolean }) => {
    const params = new URLSearchParams();
    if (opts?.location_id) params.set('location_id', opts.location_id);
    if (opts?.consistent != null) params.set('consistent', String(opts.consistent));
    if (opts?.claimed != null) params.set('claimed', String(opts.claimed));
    const qs = params.toString();
    return req<{ citations: SeoCitation[] }>(`/api/lab/seo/citations${qs ? `?${qs}` : ''}`);
  },
  /** Import citations from CSV for a location. Body: { location_id, csv_text } */
  importCitations: (location_id: string, csv_text: string) =>
    post<{ imported: number; errors?: string[] }>('/api/lab/seo/citations', { location_id, csv_text, action: 'import' }),
  /** Export citations CSV for a location. location_id is required by the backend. */
  exportCitations: (location_id: string) =>
    req<{ csv: string }>(`/api/lab/seo/citations/export?location_id=${encodeURIComponent(location_id)}`),
  /** Trigger citation check-all for a location. */
  checkCitationConsistency: (location_id: string) =>
    post<{ checked: number; inconsistent: number }>('/api/lab/seo/citations', { location_id, action: 'check_consistency' }),

  // ── Outreach ──────────────────────────────────────────────────────────────
  outreachContacts: (opts?: { status?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (opts?.status) params.set('status', opts.status);
    if (opts?.limit != null) params.set('limit', String(opts.limit));
    if (opts?.offset != null) params.set('offset', String(opts.offset));
    const qs = params.toString();
    return req<{ contacts: SeoOutreachContact[]; total?: number }>(`/api/lab/seo/outreach/contacts${qs ? `?${qs}` : ''}`);
  },
  importOutreachContacts: (csv_content: string) =>
    post<{ imported: number; errors?: string[] }>('/api/lab/seo/outreach/contacts', { csv_content, action: 'import' }),
  exportOutreachContacts: () =>
    req<{ csv: string }>('/api/lab/seo/outreach/contacts/export'),
  suppressOutreachContact: (id: string) =>
    post<{ contact: SeoOutreachContact }>('/api/lab/seo/outreach/contacts', { id, action: 'suppress' }),
  outreachCampaigns: () =>
    req<{ campaigns: SeoOutreachCampaign[] }>('/api/lab/seo/outreach/campaigns'),
  createOutreachCampaign: (p: { name: string; contact_ids?: string[] }) =>
    post<{ campaign: SeoOutreachCampaign }>('/api/lab/seo/outreach/campaigns', p as Record<string, unknown>),
  updateOutreachCampaign: (id: string, patch: Partial<SeoOutreachCampaign>) =>
    post<{ campaign: SeoOutreachCampaign }>('/api/lab/seo/outreach/campaigns', { id, ...patch, action: 'update' }),
  outreachDrafts: (campaign_id?: string) => {
    const qs = campaign_id ? `?campaign_id=${encodeURIComponent(campaign_id)}` : '';
    return req<{ drafts: SeoOutreachDraft[] }>(`/api/lab/seo/outreach/drafts${qs}`);
  },
  generateOutreachDraft: (campaign_id: string, contact_id: string) =>
    post<{ draft: SeoOutreachDraft }>('/api/lab/seo/outreach/drafts', { campaign_id, contact_id, action: 'generate' }),
  approveOutreachDraft: (draft_id: string) =>
    post<{ draft: SeoOutreachDraft }>('/api/lab/seo/outreach/drafts', { draft_id, action: 'approve' }),
  /** Send an approved draft. Backend requires campaign_id + contact_id (approval-gated). */
  sendOutreach: (campaign_id: string, contact_id: string, opts?: { sequence_index?: number; is_mock?: boolean }) =>
    post<{ sent: boolean; status?: string }>('/api/lab/seo/outreach/send', { campaign_id, contact_id, ...opts }),
  /** @deprecated Use sendOutreach(campaign_id, contact_id) — backend no longer accepts draft_id */
  sendOutreachDraft: (draft_id: string) =>
    post<{ sent: boolean; draft: SeoOutreachDraft }>('/api/lab/seo/outreach/send', { draft_id }),
  linkPlacements: (campaign_id?: string) => {
    const qs = campaign_id ? `?campaign_id=${encodeURIComponent(campaign_id)}` : '';
    return req<{ placements: SeoLinkPlacement[] }>(`/api/lab/seo/outreach/placements${qs}`);
  },

  // ── Scheduler health (admin) ────────────────────────────────────────────────
  schedulerHealth: () =>
    req<{ health: SeoSchedulerHealth }>('/api/lab/seo/scheduler/health'),
  schedulerTick: () =>
    post<{ ticked: boolean }>('/api/lab/seo/scheduler/tick', {}),
  /** Retry a scheduler job. Backend: POST /scheduler/jobs/{job_id}/retry */
  schedulerRetryJob: (job_id: string, source?: string) =>
    post<{ ok: boolean; status?: string }>('/api/lab/seo/scheduler/retry', { job_id, source }),
  schedulerPauseType: (job_type: string) =>
    post<{ paused: boolean }>('/api/lab/seo/scheduler/pause', { job_type }),
  schedulerResumeType: (job_type: string) =>
    post<{ resumed: boolean }>('/api/lab/seo/scheduler/resume', { job_type }),

  // ── Reports: PDF export ───────────────────────────────────────────────────
  /** Generate a PDF report. Accepts new object form or legacy positional args (site_id, crawl_job_id, audience). */
  exportReportPdf: (
    p: string | { site_id: string; kind?: string; date_from?: string; date_to?: string; workspace_name?: string; crawl_job_id?: string },
    crawl_job_id?: string,
    audience?: string,
  ) => {
    const body: Record<string, unknown> =
      typeof p === 'string'
        ? { site_id: p, crawl_job_id, kind: audience ?? 'full', date_from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), date_to: new Date().toISOString().slice(0, 10) }
        : { ...p as Record<string, unknown>, crawl_job_id: (p as Record<string,unknown>).crawl_job_id ?? crawl_job_id };
    return post<{ report_id: string; download_url: string; byte_size?: number; sha256?: string; expires_at?: string }>('/api/lab/seo/reports/pdf', body);
  },
  /** List previously generated PDF reports for a site. */
  listReportPdfs: (site_id?: string) => {
    const qs = site_id ? `?site_id=${encodeURIComponent(site_id)}` : '';
    return req<{ reports: Array<{ report_id: string; download_url: string; kind: string; status: string }> }>(`/api/lab/seo/reports/pdf${qs}`);
  },
};

/* ------------------------------ Meta / Marketing ------------------------------ */
export const metaApi = {
  status: () => req<MetaStatus & { inbox_permissions?: unknown }>('/api/lab/meta/status'),
  inbox: (type?: 'comment' | 'dm') => req<{ inbox: MetaInboxItem[] }>(`/api/lab/meta/inbox${type ? `?type=${type}` : ''}`),
  inboxAction: (action: 'analyze' | 'prepare-reply' | 'route' | 'hide', item_id: string, reply?: string) =>
    post<{ status: string; item?: MetaInboxItem; analysis?: unknown; approval_id?: string }>('/api/lab/meta/inbox', { action, item_id, reply }),
  content: () => req<{ content: MetaContentItem[]; assets: ContentAsset[] }>('/api/lab/meta/content'),
  preparePost: (p: { platform?: string; content_type?: string; idea?: string; caption?: string; media_asset_id?: string }) =>
    post<{ status: string; message?: string; approval_id?: string }>('/api/lab/meta/content', { action: 'prepare-post', ...p }),
  analytics: (range?: string) => req<{ summary: unknown }>(`/api/lab/meta/analytics${range ? `?range=${range}` : ''}`),
  seedDemo: () => post<{ ok: boolean }>('/api/lab/meta/connect', { action: 'demo' }),
  disconnect: () => post<{ ok: boolean }>('/api/lab/meta/connect', { action: 'disconnect' }),
  connectUrl: (feature?: string) => `/api/lab/meta/connect${feature ? `?feature=${encodeURIComponent(feature)}` : ''}`,
  // ── Ads Marketing API ──────────────────────────────────────────────────────
  adAccounts: () =>
    req<{ source?: string; ad_accounts?: MetaAdAccount[]; empty?: boolean; note?: string; error?: string; needs_reconnect?: boolean; message?: string }>('/api/lab/meta/ad-accounts'),
  selectAdAccount: (ad_account_id: string) =>
    post<{ ok?: boolean; defaults?: Record<string, unknown> }>('/api/lab/meta/ad-accounts', { ad_account_id }),
  campaigns: (ad_account_id: string) =>
    req<{ source?: string; campaigns?: MetaCampaign[]; empty?: boolean; note?: string; error?: string; needs_reconnect?: boolean; message?: string }>(`/api/lab/meta/campaigns?ad_account_id=${encodeURIComponent(ad_account_id)}`),
  createCampaign: (p: { ad_account_id: string; name: string; objective?: string }) =>
    post<{ ok?: boolean; status?: string; campaign?: MetaCampaign; note?: string; error?: string; needs_reconnect?: boolean; message?: string }>('/api/lab/meta/campaigns', p),
  insights: (ad_account_id: string, range?: string) =>
    req<{ source?: string; insights?: MetaAdInsights; empty?: boolean; note?: string; date_range?: string; error?: string; needs_reconnect?: boolean; message?: string }>(`/api/lab/meta/insights?ad_account_id=${encodeURIComponent(ad_account_id)}${range ? `&range=${encodeURIComponent(range)}` : ''}`),
  // ── Connection diagnostics + Ads assistant ──────────────────────────────────
  diagnostics: () => req<MetaDiagnostics & { backendUp?: boolean }>('/api/lab/meta/diagnostics'),
  analyzeAds: (ad_account_id: string, range?: string) =>
    post<MetaAdsAnalysis & { backendUp?: boolean }>('/api/lab/meta/ads-analyze', { ad_account_id, range }),
  // ── Brand Brain ─────────────────────────────────────────────────────────────
  brandBrain: () => req<BrandBrain & { backendUp?: boolean }>('/api/lab/meta/brand-brain'),
  generateBrandBrain: () => post<BrandBrain & { backendUp?: boolean }>('/api/lab/meta/brand-brain', { action: 'generate' }),
  // ── Idea Curator ────────────────────────────────────────────────────────────
  generateIdeas: (types?: string[], per_type?: number) =>
    post<IdeaGenerateResult & { backendUp?: boolean }>('/api/lab/meta/ideas', { action: 'generate', types, per_type }),
  ideas: () => req<{ ideas?: ContentIdea[]; backendUp?: boolean }>('/api/lab/meta/ideas'),
  saveIdea: (idea: ContentIdea) =>
    post<{ status?: string; idea?: ContentIdea; backendUp?: boolean }>('/api/lab/meta/ideas', { action: 'save', idea }),
  deleteIdea: (id: string) =>
    req<{ status?: string; backendUp?: boolean }>(`/api/lab/meta/ideas?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  // ── Content Calendar ────────────────────────────────────────────────────────
  calendar: () => req<{ items?: CalendarItem[]; backendUp?: boolean }>('/api/lab/meta/calendar'),
  generateCalendar: (horizon: number, start_date?: string) =>
    post<CalendarResult & { backendUp?: boolean }>('/api/lab/meta/calendar', { horizon, start_date }),
  updateCalendarItem: (id: string, patch: Partial<CalendarItem>) =>
    req<{ status?: string; item?: CalendarItem; backendUp?: boolean }>('/api/lab/meta/calendar', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, patch }),
    }),
  deleteCalendarItem: (id: string) =>
    req<{ status?: string; backendUp?: boolean }>(`/api/lab/meta/calendar?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  regenerateCalendarItem: (id: string) =>
    post<{ status?: string; item?: CalendarItem; backendUp?: boolean }>('/api/lab/meta/calendar', { action: 'regenerate', id }),
  saveCalendarItemToLibrary: (id: string) =>
    post<{ status?: string; idea?: ContentIdea; backendUp?: boolean }>('/api/lab/meta/calendar', { action: 'save-to-library', id }),
  requestPublishCalendarItem: (id: string) =>
    post<{ status?: string; approval_id?: string; item?: CalendarItem; message?: string; note?: string; backendUp?: boolean }>('/api/lab/meta/calendar', { action: 'request-publish', id }),
};

/* ------------------------------ Content ------------------------------ */
export const contentApi = {
  assets: () => req<{ assets: ContentAsset[] }>('/api/lab/content/assets'),
  upload: (filename: string, content_type: string, data_base64: string, metadata?: Record<string, unknown>) =>
    post<{ status: string; asset?: ContentAsset; meta_reachable?: boolean }>('/api/lab/content/assets', { filename, content_type, data_base64, metadata }),
  remove: (id: string) => req<{ ok: boolean; deleted?: string }>(`/api/lab/content/assets?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  storage: () => req<StorageStatus>('/api/lab/content/storage'),
};

/* ------------------------------ Content Creator (AI Influencer pipeline) ------------------------------ */
// Proxies to Python /api/content-creator/* via /api/lab/content-creator/[...path].
// `/status` is always 200 (the connectivity oracle); `/profile` 404s when a tenant
// has no profile yet, which the proxy surfaces as backendUp:false — callers treat
// that as "no profile yet" only when `/status` succeeded.
export const contentCreatorApi = {
  status: () => req<{
    mock_mode?: boolean; mock?: boolean; dry_run?: boolean; live_enabled?: boolean;
    banner?: string; provider?: { name?: string; mode?: string; configured?: boolean; connected?: boolean };
    approval_gates?: Record<string, boolean>;
  }>('/api/lab/content-creator/status'),
  profile: () => req<{ id?: string; profile?: {
    business_name?: string; niche?: string; target_audience?: string; content_goal?: string; brand_tone?: string;
  } }>('/api/lab/content-creator/profile'),
};

/* ------------------------------ Approvals ------------------------------ */
export const approvalsApi = {
  list: () => req<{ items: ApprovalItem[] }>('/api/lab/approvals'),
  resolve: (id: string, decision: 'approve' | 'reject' | 'skip') => post('/api/lab/approvals', { id, decision }),
};

/* ------------------------------ AI Receptionist ------------------------------ */
const R = '/api/lab/receptionist';
export const receptionistApi = {
  // brain / core
  runMessage: (p: { message: string; channel?: string; conversation_id?: string; name?: string; email?: string; phone?: string; company?: string; campaign_id?: string }) =>
    post<RcpRunResult>(`${R}/run`, p),
  getHealth: () => req<RcpHealth>(`${R}/health`),
  getCapabilities: () => req<RcpHealth>(`${R}/health`),
  getOverview: () => req<RcpOverview>(`${R}/overview`),
  getIntegrationStatus: () => req<RcpIntegrationStatus>(`${R}/integrations`),
  testIntegration: (capability: string) => post<{ capability: string; result?: unknown; status?: unknown }>(`${R}/integrations`, { action: 'test', capability }),
  // conversations
  getConversations: () => req<{ conversations: RcpConversation[] }>(`${R}/conversations`),
  getConversation: (id: string) => req<RcpConversationDetail>(`${R}/conversations?id=${encodeURIComponent(id)}`),
  sendConversationMessage: (id: string, message: string) => post<RcpRunResult>(`${R}/run`, { message, conversation_id: id }),
  escalateConversation: (id: string, reason?: string) => post<{ escalation: RcpEscalation }>(`${R}/conversations`, { action: 'escalate', id, reason }),
  // CRM / leads
  getLeads: (status?: string) => req<{ leads: RcpContact[] }>(`${R}/leads${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  updateLead: (id: string, patch: Partial<RcpContact>) => post<{ lead: RcpContact }>(`${R}/leads`, { action: 'update', id, ...patch }),
  leadFollowUp: (id: string, title?: string, due_at?: string) => post<{ task: RcpTask }>(`${R}/leads`, { action: 'follow-up', id, title, due_at }),
  // bookings
  getBookings: () => req<{ bookings: RcpBooking[] }>(`${R}/bookings`),
  createBooking: (p: Partial<RcpBooking>) => post<{ booking: RcpBooking }>(`${R}/bookings`, { action: 'create', ...p }),
  confirmBooking: (id: string) => post<{ booking: RcpBooking }>(`${R}/bookings`, { action: 'confirm', id }),
  cancelBooking: (id: string) => post<{ booking: RcpBooking }>(`${R}/bookings`, { action: 'cancel', id }),
  // quotes
  getQuotes: () => req<{ quotes: RcpQuote[] }>(`${R}/quotes`),
  createQuote: (p: Partial<RcpQuote>) => post<{ quote: RcpQuote }>(`${R}/quotes`, { action: 'create', ...p }),
  updateQuote: (id: string, patch: Partial<RcpQuote>) => post<{ quote: RcpQuote }>(`${R}/quotes`, { action: 'update', id, ...patch }),
  // tasks
  getTasks: (status?: string) => req<{ tasks: RcpTask[] }>(`${R}/tasks${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  createTask: (p: Partial<RcpTask>) => post<{ task: RcpTask }>(`${R}/tasks`, { action: 'create', ...p }),
  completeTask: (id: string) => post<{ task: RcpTask }>(`${R}/tasks`, { action: 'complete', id }),
  // tickets / escalations
  getTickets: () => req<{ tickets: RcpTicket[] }>(`${R}/tickets`),
  getEscalations: () => req<{ escalations: RcpEscalation[] }>(`${R}/tickets?resource=escalations`),
  updateTicket: (id: string, patch: Partial<RcpTicket>) => post<{ ticket: RcpTicket }>(`${R}/tickets`, { action: 'update', id, ...patch }),
  // payments
  getPayments: () => req<{ payments: RcpPayment[] }>(`${R}/payments`),
  createPaymentLink: (p: { amount: number; currency?: string; description?: string; email?: string }) => post<{ payment: RcpPayment; provider?: unknown }>(`${R}/payments`, { action: 'create-link', ...p }),
  // campaigns
  getCampaigns: () => req<{ campaigns: RcpCampaign[] }>(`${R}/campaigns`),
  getCampaignReplies: (campaign_id: string) => req<{ replies: RcpCampaignReply[] }>(`${R}/campaigns?campaign_id=${encodeURIComponent(campaign_id)}`),
  ingestCampaignReply: (p: { campaign_id?: string; message: string; email?: string; phone?: string }) => post<RcpRunResult>(`${R}/campaigns`, { action: 'ingest', ...p }),
  // business profile + knowledge
  getBusinessProfile: () => req<{ profile: RcpBusinessProfile; configured?: boolean }>(`${R}/business-profile`),
  updateBusinessProfile: (patch: Partial<RcpBusinessProfile>) => post<{ profile: RcpBusinessProfile }>(`${R}/business-profile`, patch),
  getKnowledge: () => req<{ items: RcpKnowledgeItem[] }>(`${R}/knowledge`),
  createKnowledge: (p: { title: string; content: string; category?: string; tags?: string[] }) => post<{ item: RcpKnowledgeItem }>(`${R}/knowledge`, { action: 'create', ...p }),
  updateKnowledge: (id: string, patch: Partial<RcpKnowledgeItem>) => post<{ item: RcpKnowledgeItem }>(`${R}/knowledge`, { action: 'update', id, ...patch }),
  deleteKnowledge: (id: string) => post<{ deleted: boolean }>(`${R}/knowledge`, { action: 'delete', id }),
};
