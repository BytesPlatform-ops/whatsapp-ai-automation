/**
 * Shared types for the Pixie service backends (SEO / Meta / Content), mirroring
 * the FastAPI response schemas in backend/{seo,meta,content}. Kept intentionally
 * loose (optional fields) because the backend degrades gracefully when API keys
 * are missing — the UI must tolerate partial payloads.
 */

/* ----------------------------- SEO ----------------------------- */

export type SeoFixMode = 'auto_fix' | 'approval_required' | 'copy_ready' | 'manual_only' | 'unsupported';
export type SeoSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type SeoDifficulty = 'easy' | 'medium' | 'hard';

// ── Durable pipeline types ──────────────────────────────────────────────────

export type SeoCrawlStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type SeoCrawlType = 'site' | 'single';
export type SeoIssueStatus = 'open' | 'resolved' | 'ignored';
export type SeoConnectionStatus = 'pending' | 'connected' | 'disconnected' | 'error';
export type SeoRobotsPolicy = 'respect' | 'ignore';

/** A registered site in the durable SEO pipeline. */
export interface SeoDurableSite {
  id: string;
  tenant_id?: string;
  domain: string;
  canonical_base_url?: string;
  display_name?: string;
  connection_status?: SeoConnectionStatus;
  country?: string;
  language?: string;
  target_location?: string;
  crawl_limit?: number;
  crawl_frequency?: string;
  robots_policy?: SeoRobotsPolicy;
  sitemap_urls?: string[];
  included_paths?: string[];
  excluded_paths?: string[];
  created_at?: string;
  updated_at?: string;
}

/** A crawl job returned by the durable pipeline. */
export interface SeoCrawlJob {
  id: string;
  tenant_id?: string;
  site_id: string;
  status: SeoCrawlStatus;
  crawl_type: SeoCrawlType;
  requested_limit?: number;
  discovered_count?: number;
  crawled_count?: number;
  failed_count?: number;
  queued_at?: string;
  started_at?: string;
  finished_at?: string;
  cancelled_at?: string;
  error_category?: string;
  retry_count?: number;
  progress?: number;
  config_snapshot?: Record<string, unknown>;
}

/** Summary of a crawled page (heavy fields like raw HTML are excluded). */
export interface SeoCrawledPageSummary {
  id: string;
  site_id: string;
  crawl_job_id: string;
  url: string;
  normalized_url?: string;
  status_code?: number;
  content_type?: string;
  canonical?: string;
  title?: string;
  meta_description?: string;
  h1?: string;
  word_count?: number;
  indexability?: string;
  internal_links_in?: number;
  internal_links_out?: number;
  response_time_ms?: number;
  page_size_bytes?: number;
  crawled_at?: string;
}

/** A durable SEO issue from a crawl job (distinct from the audit-mode SeoIssue). */
export interface SeoCrawlIssue {
  id: string;
  site_id: string;
  crawl_job_id: string;
  page_id?: string;
  rule_key: string;
  category?: string;
  severity?: SeoSeverity;
  status?: SeoIssueStatus;
  evidence?: Record<string, unknown>;
  recommendation?: string;
  fix_mode?: string;
  rule_version?: string;
  first_detected_at?: string;
  last_detected_at?: string;
  resolved_at?: string;
}

/** A site-wide SEO report produced after a completed crawl. */
export interface SeoCrawlReport {
  id: string;
  site_id: string;
  crawl_job_id: string;
  score: number;
  category_scores?: Record<string, number>;
  issue_counts?: Record<string, number>;
  created_at?: string;
  export_metadata?: Record<string, unknown>;
}

export interface SeoIssue {
  id: string;
  audit_id?: string;
  page_url?: string;
  platform?: string;
  category?: string;
  severity?: SeoSeverity;
  issue?: string;
  one_liner?: string;
  fix_one_liner?: string;
  impact?: string;
  difficulty?: SeoDifficulty;
  fix_mode?: SeoFixMode;
  auto_fix_available?: boolean;
  connection_required?: boolean;
  status?: string;
  created_at?: string;
}

export interface SeoAudit {
  id: string;
  tenant_id?: string;
  website_url?: string;
  final_url?: string;
  platform?: string;
  platform_confidence?: number;
  connected?: boolean;
  score?: number;
  max_score?: number;
  category_scores?: Record<string, number>;
  counts?: Record<string, number>;
  issue_count?: number;
  created_at?: string;
}

export interface SeoAuditResult {
  status: string;
  audit: SeoAudit;
  platform?: { detected_platform?: string; confidence?: number; evidence?: string[] };
  issues: SeoIssue[];
}

export interface SeoConnectionPlatform {
  platform: string;
  name: string;
  support?: string;
  can_optimize?: boolean;
  required?: boolean;
  risk?: string;
  connect?: string;
  connected: boolean;
  connected_as?: string | null;
}

export interface SeoHistoryAudit {
  id: string;
  website_url?: string;
  final_url?: string;
  platform?: string;
  score?: number;
  max_score?: number;
  issue_count?: number;
  created_at?: string;
}

// ── Search Intelligence types ──────────────────────────────────────────────

/** A keyword project (container for tracked keywords). */
export interface SeoKeywordProject {
  id: string;
  tenant_id?: string;
  site_id?: string;
  name: string;
  country?: string;
  language?: string;
  created_at?: string;
  updated_at?: string;
  keyword_count?: number;
}

/** A tracked keyword inside a project. */
export interface SeoKeyword {
  id: string;
  project_id: string;
  keyword: string;
  search_volume?: number | null;
  difficulty?: number | null;
  cpc?: number | null;
  intent?: string | null;
  current_rank?: number | null;
  previous_rank?: number | null;
  rank_change?: number | null;
  url?: string | null;
  cluster_id?: string | null;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

/** A cluster of semantically related keywords. */
export interface SeoKeywordCluster {
  id: string;
  project_id: string;
  name: string;
  pillar_keyword?: string;
  keyword_count?: number;
  avg_volume?: number | null;
  avg_difficulty?: number | null;
  created_at?: string;
}

/** Keyword research result item. */
export interface SeoResearchKeyword {
  keyword: string;
  search_volume?: number | null;
  difficulty?: number | null;
  cpc?: number | null;
  intent?: string | null;
  competition?: string | null;
}

/** A rank-check job. */
export interface SeoRankJob {
  id: string;
  project_id?: string;
  site_id?: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  keyword_count?: number;
  checked_count?: number;
  created_at?: string;
  finished_at?: string | null;
}

/** Rank history for a single keyword. */
export interface SeoRankHistoryPoint {
  date: string;
  rank: number | null;
  url?: string | null;
}

/** Summary of current rankings for a project. */
export interface SeoRankOverview {
  project_id?: string;
  total_keywords?: number;
  top_3?: number;
  top_10?: number;
  top_100?: number;
  not_ranked?: number;
  avg_rank?: number | null;
  rank_distribution?: Record<string, number>;
  last_checked_at?: string | null;
}

/** A competitor domain entry. */
export interface SeoCompetitor {
  id: string;
  site_id?: string;
  project_id?: string;
  domain: string;
  display_name?: string;
  notes?: string | null;
  created_at?: string;
}

/** Competitor keyword gap item. */
export interface SeoCompetitorGapItem {
  keyword: string;
  competitor_domain: string;
  competitor_rank?: number | null;
  our_rank?: number | null;
  search_volume?: number | null;
  difficulty?: number | null;
  opportunity_score?: number | null;
}

/** A content/SEO opportunity. */
export interface SeoOpportunity {
  id: string;
  site_id?: string;
  project_id?: string;
  type: string;
  title: string;
  description?: string;
  keyword?: string | null;
  priority?: 'high' | 'medium' | 'low';
  status?: 'open' | 'actioned' | 'dismissed';
  estimated_traffic_gain?: number | null;
  created_at?: string;
}

/** On-page optimisation recommendation for a specific page + keyword. */
export interface SeoOptimiseResult {
  site_id?: string;
  page_id?: string;
  url?: string;
  keyword?: string;
  recommendations?: SeoOptimiseRecommendation[];
  current_score?: number | null;
  potential_score?: number | null;
  generated_at?: string;
}

export interface SeoOptimiseRecommendation {
  type: string;
  priority: 'high' | 'medium' | 'low';
  current_value?: string | null;
  suggested_value?: string | null;
  explanation?: string;
}

/** A content brief for a target keyword/topic. */
export interface SeoBrief {
  id: string;
  site_id?: string;
  project_id?: string;
  keyword?: string;
  title?: string;
  status?: 'draft' | 'approved' | 'archived' | 'handed_off';
  target_word_count?: number | null;
  outline?: SeoBriefSection[];
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SeoBriefSection {
  heading: string;
  level?: number;
  notes?: string;
}

/** An SEO alert event (ranking drop, new opportunity, etc). */
export interface SeoAlert {
  id: string;
  site_id?: string;
  project_id?: string;
  type: string;
  title: string;
  body?: string;
  severity?: 'info' | 'warning' | 'critical';
  read?: boolean;
  dismissed?: boolean;
  created_at?: string;
}

/** Google Search Console / Analytics connection. */
export interface SeoGoogleConnection {
  id: string;
  site_id?: string;
  provider: 'search_console' | 'analytics' | 'google';
  status: 'connected' | 'disconnected' | 'expired' | 'error' | 'pending';
  display_name?: string | null;
  email?: string | null;
  selected_property?: string | null;
  last_synced_at?: string | null;
  created_at?: string;
}

/** A Google property (GSC site / GA4 property) the user can select. */
export interface SeoGoogleProperty {
  id: string;
  name: string;
  url?: string;
  provider: string;
}

/** Detailed integration status for the Connections page. */
export interface SeoIntegrationStatus {
  platform: string;
  name: string;
  description?: string;
  status: 'connected' | 'not_connected' | 'needs_attention' | 'token_expired' | 'permission_missing' | 'sync_running';
  connected_as?: string | null;
  last_synced_at?: string | null;
  can_optimize?: boolean;
  can_connect?: boolean;
  can_reconnect?: boolean;
  can_disconnect?: boolean;
  can_configure?: boolean;
  notes?: string | null;
}

// ── Backlinks ─────────────────────────────────────────────────────────────────

export interface SeoBacklinkOverview {
  site_id?: string;
  total_backlinks?: number | null;
  referring_domains?: number | null;
  new_last_30d?: number | null;
  lost_last_30d?: number | null;
  follow_count?: number | null;
  nofollow_count?: number | null;
  avg_domain_rating?: number | null;
  last_synced_at?: string | null;
}

export interface SeoBacklink {
  id: string;
  site_id?: string;
  source_url?: string;
  source_domain?: string;
  target_url?: string;
  anchor_text?: string | null;
  follow?: boolean;
  first_seen?: string | null;
  last_seen?: string | null;
  status?: 'active' | 'lost';
  risk?: 'low' | 'medium' | 'high' | null;
  domain_rating?: number | null;
  page_rating?: number | null;
}

export interface SeoReferringDomain {
  domain: string;
  backlink_count?: number;
  follow_count?: number;
  nofollow_count?: number;
  domain_rating?: number | null;
  first_seen?: string | null;
  last_seen?: string | null;
}

export interface SeoAnchorText {
  anchor: string;
  count?: number;
  follow_count?: number;
}

export interface SeoLinkGapItem {
  domain: string;
  links_to_competitor?: string | null;
  links_to_us?: boolean;
  opportunity_score?: number | null;
}

// ── Local SEO ─────────────────────────────────────────────────────────────────

export interface SeoLocalOverview {
  location_count?: number;
  avg_rating?: number | null;
  total_reviews?: number;
  unanswered_reviews?: number;
  citation_count?: number;
  inconsistent_citations?: number;
  local_rank_avg?: number | null;
}

export interface SeoLocation {
  id: string;
  tenant_id?: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  phone?: string | null;
  website?: string | null;
  google_place_id?: string | null;
  status?: 'active' | 'archived';
  created_at?: string;
  updated_at?: string;
}

export interface SeoReview {
  id: string;
  location_id?: string;
  platform?: string;
  author?: string | null;
  rating?: number | null;
  body?: string | null;
  status?: 'unanswered' | 'answered' | 'ignored';
  sentiment?: 'positive' | 'neutral' | 'negative' | null;
  response_draft?: string | null;
  response_approval_id?: string | null;
  published_at?: string | null;
  created_at?: string;
}

export interface SeoReviewSummary {
  total?: number;
  avg_rating?: number | null;
  unanswered?: number;
  distribution?: Record<string, number>;
}

export interface SeoCitation {
  id: string;
  location_id?: string;
  directory?: string;
  name_on_listing?: string | null;
  address_on_listing?: string | null;
  phone_on_listing?: string | null;
  website_on_listing?: string | null;
  claimed?: boolean | null;
  consistent?: boolean | null;
  listing_url?: string | null;
  last_checked_at?: string | null;
  created_at?: string;
}

// ── Outreach ──────────────────────────────────────────────────────────────────

export interface SeoOutreachContact {
  id: string;
  tenant_id?: string;
  name?: string | null;
  email?: string | null;
  website?: string | null;
  domain?: string | null;
  tags?: string[];
  status?: 'active' | 'suppressed';
  created_at?: string;
}

export type OutreachCampaignStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export interface SeoOutreachCampaign {
  id: string;
  tenant_id?: string;
  name: string;
  status?: OutreachCampaignStatus;
  contact_count?: number;
  sent_count?: number;
  reply_count?: number;
  placement_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SeoOutreachDraft {
  id: string;
  campaign_id?: string;
  contact_id?: string;
  subject?: string | null;
  body?: string | null;
  status?: 'pending' | 'approved' | 'rejected' | 'sent';
  approval_id?: string | null;
  created_at?: string;
}

export interface SeoLinkPlacement {
  id: string;
  campaign_id?: string;
  contact_id?: string;
  target_url?: string | null;
  anchor?: string | null;
  source_domain?: string | null;
  status?: 'pending' | 'confirmed' | 'lost';
  confirmed_at?: string | null;
  created_at?: string;
}

// ── Scheduler Health ──────────────────────────────────────────────────────────

export interface SeoSchedulerHealth {
  enabled?: boolean;
  instance_id?: string | null;
  last_heartbeat?: string | null;
  jobs_claimed?: number;
  jobs_completed?: number;
  jobs_failed?: number;
  jobs_retried?: number;
  jobs_running?: number;
  oldest_due?: string | null;
  quota_errors?: number;
  stale_lock_recoveries?: number;
  job_types?: string[];
}

/** Core Web Vitals / PageSpeed data stored per-page. */
export interface PageSpeedData {
  url?: string;
  source?: 'pagespeed' | 'crux' | 'lab' | string;
  collected_at?: string | null;
  field_data_available?: boolean;
  provider_error?: string | null;
  mobile?: PageSpeedMetrics;
  desktop?: PageSpeedMetrics;
}

export interface PageSpeedMetrics {
  performance_score?: number | null;
  lcp_ms?: number | null;
  cls?: number | null;
  inp_ms?: number | null;
  fcp_ms?: number | null;
  tbt_ms?: number | null;
  ttfb_ms?: number | null;
}

/* ----------------------------- Meta / Marketing ----------------------------- */

export type MetaPermState = 'available' | 'app_review_needed' | 'missing';

export interface MetaStatus {
  configured?: boolean;
  /** Names (never values) of required Meta env vars still unset. */
  missing_config?: string[];
  /** Whether the viewer may manage the integration (marketing.manage). */
  can_manage?: boolean;
  connected?: boolean;
  mode?: string; // 'live' | 'demo' | ''
  live?: boolean;
  display_name?: string;
  pages?: unknown[];
  instagram?: unknown[];
  ad_accounts?: unknown[];
  defaults?: Record<string, unknown>;
  permissions?: { publishing?: MetaPermState; insights?: MetaPermState; ads_read?: MetaPermState; comments?: MetaPermState; dms?: MetaPermState };
  execution_mode?: string;
}

/** A Meta ad account as returned by /api/meta/ad-accounts. Never carries a token. */
export interface MetaAdAccount {
  id: string;
  name: string;
  account_id?: string;
  account_status?: number;
  account_status_label?: string;
  currency?: string;
  timezone_name?: string;
}

/** A Meta campaign row from /api/meta/campaigns. */
export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective: string;
}

/** Account-level ads insights from /api/meta/insights. */
export interface MetaAdInsights {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
}

/** A single connection-diagnostics check from /api/meta/diagnostics. */
export type MetaCheckStatus = 'ok' | 'warning' | 'error' | 'skipped';
export interface MetaDiagnosticCheck {
  id: string;
  label: string;
  status: MetaCheckStatus;
  detail: string;
  remediation?: string;
}
export interface MetaRequiredScope { scope: string; label: string; why: string }
export interface MetaDiagnostics {
  connected?: boolean;
  mode?: string | null;
  demo?: boolean;
  overall?: 'ok' | 'warning' | 'error' | 'disconnected';
  checks?: MetaDiagnosticCheck[];
  permissions?: Record<string, string>;
  missing_permissions?: string[];
  required_scopes?: MetaRequiredScope[];
}

/** Read-only Ads Assistant output from /api/meta/ads/analyze. */
export interface MetaAdsSignal { type: 'weak' | 'attention' | 'opportunity'; title: string; detail: string }
export interface MetaAdsAngle { angle: string; rationale: string }
export interface MetaAdsSuggestedCampaign { name: string; objective: string; rationale: string }
export interface MetaAdsAnalysis {
  status?: string;
  message?: string;
  source?: string;
  ad_account_id?: string;
  date_range?: string;
  campaign_count?: number;
  insights?: MetaAdInsights;
  insights_error?: string | null;
  signals?: MetaAdsSignal[];
  summary?: string;
  suggested_angles?: MetaAdsAngle[];
  suggested_paused_campaigns?: MetaAdsSuggestedCampaign[];
  llm_provider?: string;
  model?: string;
  note?: string;
  error?: string;
  needs_reconnect?: boolean;
}

/** Brand Brain — learned brand identity from old posts (/api/meta/brand-brain). */
export interface BrandBrainPost { caption: string; type?: string; engagement?: number; platform?: string; permalink?: string }
export interface BrandBrainStats {
  total_posts?: number;
  avg_engagement?: number;
  top_posts?: BrandBrainPost[];
  weak_posts?: BrandBrainPost[];
  post_types?: Record<string, number>;
}
export interface BrandBrainAnalyzed {
  brand_tone?: string;
  audience?: string;
  services?: string[];
  best_topics?: string[];
  best_hooks?: string[];
  weak_topics?: string[];
  content_pillars?: string[];
  cta_style?: string;
  posting_suggestions?: string[];
}
export interface BrandBrain {
  status?: string;
  exists?: boolean;
  source?: string;
  partial?: boolean;
  errors?: string[];
  generated_at?: string;
  post_count?: number;
  ai_generated?: boolean;
  analyzed?: BrandBrainAnalyzed;
  stats?: BrandBrainStats;
  llm_provider?: string;
  model?: string;
  message?: string;
}

/** Idea Curator — a single content idea (/api/meta/ideas). */
export interface ContentIdea {
  id: string;
  type: string;
  type_label?: string;
  title: string;
  hook: string;
  slide_flow_or_script: string;
  visual_direction: string;
  caption: string;
  cta: string;
  saved?: boolean;
}
export interface IdeaGenerateResult {
  status?: string;
  ideas?: ContentIdea[];
  types?: string[];
  brand_brain_used?: boolean;
  ai_generated?: boolean;
  llm_provider?: string;
  note?: string;
  message?: string;
}

/** Content Calendar item + generation result (/api/meta/calendar). */
export type CalendarStatus = 'draft' | 'review' | 'approved' | 'scheduled' | 'published' | 'rejected';
export interface CalendarItem {
  id: string;
  date: string;
  platform: string;
  content_type: string;
  topic: string;
  hook: string;
  caption: string;
  visual_direction: string;
  status: CalendarStatus;
  created_at?: string;
}
export interface CalendarResult {
  status?: string;
  horizon?: number;
  items?: CalendarItem[];
  brand_brain_used?: boolean;
  ai_generated?: boolean;
  note?: string;
  message?: string;
}

export type MetaSentiment = 'positive' | 'neutral' | 'negative' | 'angry' | 'spam';

export interface MetaInboxItem {
  id: string;
  interaction_type?: 'comment' | 'dm' | string;
  sender_name?: string;
  message_text?: string;
  status?: string;
  sentiment?: MetaSentiment;
  intent?: string;
  recommended_route?: string;
  risk_level?: string;
  approval_id?: string;
  prepared_reply?: string;
  asset_id?: string;
  created_at?: string;
}

export interface MetaContentItem {
  id: string;
  caption?: string;
  platform?: string;
  status?: string;
  media_url?: string;
  created_at?: string;
}

/* ----------------------------- Content assets ----------------------------- */

export interface ContentAsset {
  id: string;
  uploaded_by?: string;
  asset_type?: 'image' | 'video' | 'thumbnail' | 'reel';
  mime_type?: string;
  storage_provider?: 'supabase' | 'local';
  storage_path?: string;
  public_url?: string;
  filename?: string;
  size_bytes?: number;
  duration_seconds?: number | null;
  width?: number | null;
  height?: number | null;
  metadata_json?: Record<string, unknown>;
  created_at?: string;
}

export interface StorageStatus {
  provider?: string;
  bucket?: string;
  configured?: boolean;
  meta_reachable?: boolean;
  persistence?: { backend?: string; durable?: boolean; multi_instance?: boolean; supabase_configured?: boolean; warning?: string };
}

/* ----------------------------- Approvals ----------------------------- */

export interface ApprovalItem {
  id: string;
  agent?: string;
  status?: 'pending' | 'executed' | 'skipped' | string;
  capability?: string;
  risk_level?: 'low' | 'medium' | 'high' | string;
  prepared_output?: { caption?: string; reply?: string; will_publish_to?: string; [k: string]: unknown };
  preview?: string;
  execution_result?: { executed?: boolean; detail?: string };
  created_at?: string;
}

/* ----------------------------- AI Receptionist ----------------------------- */

export interface RcpRunResult {
  reply?: string;
  intent?: string;
  action?: string;
  status?: string;
  confidence?: number;
  sentiment?: string;
  degraded?: boolean;
  llm_provider?: string;
  model?: string;
  conversation_id?: string;
  contact_id?: string | null;
  record_type?: string;
  record_id?: string;
  record?: Record<string, unknown> | null;
  provider_status?: Record<string, unknown> | null;
  escalated?: boolean;
  action_id?: string;
}

export interface RcpOverview {
  totals?: Record<string, number>;
  rates?: { ai_resolution_rate?: number; human_escalation_rate?: number };
  channel_breakdown?: Record<string, number>;
  sentiment_breakdown?: Record<string, number>;
  intent_distribution?: Record<string, number>;
  booking_status_breakdown?: Record<string, number>;
  lead_status_breakdown?: Record<string, number>;
  ticket_priority_breakdown?: Record<string, number>;
  campaign_reply_classification?: Record<string, number>;
  conversion_funnel?: Record<string, number>;
}

export interface RcpProviderStatus {
  capability: string;
  provider?: string;
  connected?: boolean;
  status?: string; // connected | missing_env | mock | ready | ...
  mode?: string;
  required_env?: string[];
  missing_env?: string[];
  note?: string;
}

export interface RcpIntegrationStatus {
  llm?: { provider?: string; model?: string; status?: string; note?: string };
  core_capabilities?: { capability: string; status?: string; provider?: string; mode?: string }[];
  receptionist_providers?: RcpProviderStatus[];
  persistence?: { backend?: string; durable?: boolean; multi_instance?: boolean; supabase_configured?: boolean };
  mode?: Record<string, unknown>;
}

export interface RcpConversation {
  id: string; tenant_id?: string; contact_id?: string | null; channel?: string;
  subject?: string; status?: string; last_intent?: string; last_action?: string;
  sentiment?: string; summary?: string; message_count?: number;
  created_at?: string; updated_at?: string;
}
export interface RcpMessage {
  id: string; conversation_id?: string; role?: string; text?: string; channel?: string;
  intent?: string; action?: string; confidence?: number; degraded?: boolean; created_at?: string;
}
export interface RcpConversationDetail { conversation: RcpConversation; messages: RcpMessage[]; actions: Record<string, unknown>[]; }

export interface RcpContact {
  id: string; name?: string | null; email?: string | null; phone?: string | null;
  company?: string | null; service_interest?: string; budget?: string; urgency?: string;
  notes?: string; source?: string; intent?: string; status?: string; score?: number;
  tags?: string[]; last_message_summary?: string; last_contact_at?: string;
  consent?: boolean; activity?: { at?: string; note?: string }[]; created_at?: string; updated_at?: string;
}

export interface RcpBooking {
  id: string; contact_id?: string | null; name?: string | null; phone?: string | null; email?: string | null;
  service_type?: string; date?: string; time?: string; timezone?: string; notes?: string;
  status?: string; calendar_event_id?: string; calendar_html_link?: string; source?: string; created_at?: string;
}
export interface RcpQuote {
  id: string; name?: string | null; email?: string | null; phone?: string | null; service?: string;
  scope?: string; quantity?: string; location?: string; timeline?: string; budget?: string; notes?: string;
  status?: string; estimated_min?: number | null; estimated_max?: number | null; currency?: string; created_at?: string;
}
export interface RcpTask {
  id: string; kind?: string; title?: string; related_type?: string; related_id?: string;
  owner?: string; status?: string; due_at?: string; notes?: string; contact_id?: string | null; created_at?: string;
}
export interface RcpTicket {
  id: string; kind?: string; subject?: string; body?: string; priority?: string; sentiment?: string;
  status?: string; assigned_to?: string; contact_id?: string | null; created_at?: string;
}
export interface RcpEscalation {
  id: string; reason?: string; priority?: string; status?: string; context?: string;
  notified?: string[]; conversation_id?: string; created_at?: string;
}
export interface RcpPayment {
  id: string; name?: string | null; email?: string | null; amount?: number | null; currency?: string;
  description?: string; status?: string; payment_link?: string; provider?: string; provider_ref?: string; created_at?: string;
}
export interface RcpCampaign { id: string; name?: string; type?: string; status?: string; channels?: string[]; dry_run?: boolean; }
export interface RcpCampaignReply {
  id: string; campaign_id?: string; from_email?: string | null; from_phone?: string | null;
  channel?: string; text?: string; classification?: string; action_taken?: string; status?: string; created_at?: string;
}
export interface RcpBusinessProfile {
  tenant_id?: string; business_name?: string; industry?: string; hours?: string; services?: string[];
  pricing_notes?: string; location?: string; address?: string; phone?: string; email?: string; website?: string;
  policies?: string; process?: string; tone?: string; escalation_rules?: string; custom_instructions?: string;
  faqs?: { q?: string; a?: string }[]; updated_at?: string;
}
export interface RcpKnowledgeItem { id: string; title?: string; content?: string; category?: string; tags?: string[]; created_at?: string; }

// ── Wave 6: knowledge sources, config versions, worker, usage, analytics ─────
export interface RcpKnowledgeSource {
  id: string; source_type: 'pdf' | 'website' | 'text'; title?: string; url?: string;
  filename?: string; status?: string; index_status?: string; chunk_count?: number;
  page_count?: number; pages_indexed?: number; failed_pages?: number; version?: string;
  created_at?: string; updated_at?: string;
}
export interface RcpIngestionJob { id: string; kind?: string; url?: string; status?: string; source_id?: string; error?: string; }
export interface RcpEvidence {
  source_id: string; chunk_id: string; source_type?: string; source_title?: string;
  url?: string; page?: number | null; text: string; score: number; method: string;
  version?: string; freshness?: number;
}
export interface RcpRetrievalResult { confident: boolean; method: string; outcome: string; answer: string; evidence: RcpEvidence[]; }
export interface RcpConfig {
  tenant_id?: string; business_name?: string; assistant_name?: string; tone?: string;
  languages?: string; hours?: string; timezone?: string; prices?: string; services?: string | string[];
  cancellation_policy?: string; refund_policy?: string; payment_policy?: string; booking_rules?: string;
  policies?: string; escalation_triggers?: string; handoff_rules?: string; escalation_contacts?: string;
  restricted_subjects?: string; config_version?: number; updated_at?: string; updated_by?: string;
  [k: string]: unknown;
}
export interface RcpConfigVersion { id: string; version: number; status: string; updated_by?: string; created_at?: string; }
export interface RcpWorkerJob {
  id: string; job_type?: string; status?: string; run_at?: string; attempts?: number;
  max_attempts?: number; priority?: number; last_error?: string; lock_owner?: string; updated_at?: string;
}
export interface RcpWorkerHealth {
  worker?: Record<string, unknown>; due_count?: number; tenant_jobs?: Record<string, number>;
}
export interface RcpReminder { id: string; title?: string; remind_at?: string; channel?: string; status?: string; contact_id?: string; }
export interface RcpUsageSummary {
  period?: { start?: string; end?: string; fallback?: boolean };
  counters?: Record<string, number>; gauges?: Record<string, number>;
}
export interface RcpLimit { limit_key?: string; used?: number; limit?: number; remaining?: number; within_limit?: boolean; allowed?: boolean; }
export interface RcpApproval {
  id: string; agent?: string; title?: string; action_type?: string; status?: string;
  description?: string; risk_level?: string; prepared_output?: Record<string, unknown>;
  execution_result?: Record<string, unknown> | null; preview?: string; created_at?: string;
}
export interface RcpAnalyticsRange {
  range?: { start?: string; end?: string; preset?: string }; generated_at?: string;
  metrics?: Record<string, number>; rates?: Record<string, number>; top_intents?: Record<string, number>;
}

// ── Wave 8/9: Gmail / Calendar / Widget provider surfaces ────────────────────
export interface RcpGmailStatus {
  connection?: { connected?: boolean; email?: string; can_read?: boolean; can_draft?: boolean; can_send?: boolean; state?: string };
  reply_mode?: string; last_history_id?: string; last_sync_at?: string;
}
export interface RcpGmailDraft {
  id: string; to?: string; subject?: string; body?: string; thread_id?: string; status?: string;
  provider_message_id?: string; approval_id?: string; reply_mode?: string; updated_at?: string;
}
export interface RcpCalendarStatus {
  connection?: { connected?: boolean; email?: string; can_read_freebusy?: boolean; can_write_events?: boolean; state?: string };
  configured?: boolean; calendar_id?: string; timezone?: string; services?: Record<string, number>;
}
export interface RcpCalendar { calendar_id: string; name?: string; access_role?: string; timezone?: string; primary?: boolean; }
export interface RcpSlot { start: string; end: string; timezone?: string; }
export interface RcpBookingRow {
  id: string; name?: string; email?: string; service_type?: string; status?: string; start?: string; end?: string;
  timezone?: string; provider_event_id?: string; provider_link?: string; conversation_id?: string;
}
export interface RcpWidgetConfig {
  public_id?: string; enabled?: boolean; allowed_domains?: string[]; dev_mode?: boolean;
  welcome_message?: string; offline_message?: string; updated_at?: string;
}
export interface RcpWidgetVerification {
  installed?: boolean;
  domains?: { domain: string; status?: string; last_verified_at?: string; last_failure?: string; evidence?: string }[];
}

// ── Wave 12: WhatsApp ────────────────────────────────────────────────────────
export interface RcpWhatsAppStatus {
  connection?: {
    connected?: boolean; waba_id?: string; waba_name?: string; phone_number_id?: string;
    display_phone_number?: string; verified_name?: string; can_send?: boolean; can_template?: boolean;
    webhook_subscribed?: boolean; quality?: string; state?: string;
  };
  reply_mode?: string;
}
export interface RcpWhatsAppTemplate {
  name: string; language?: string; category?: string; status?: string; variables?: number;
  last_synced_at?: string;
}
export interface RcpWhatsAppDraft {
  id: string; wa_id?: string; text?: string; message_type?: string; status?: string;
  provider_message_id?: string; approval_id?: string; template_required?: boolean;
  window_open?: boolean; provider_error?: string; updated_at?: string;
}
export interface RcpHealth {
  status?: string; agent_slug?: string; llm_provider?: string; model?: string; handlers?: number;
  persistence?: { backend?: string; durable?: boolean; supabase_configured?: boolean };
  mode?: Record<string, unknown>;
  capabilities?: { intents?: string[]; handlers?: string[]; actions_supported?: number; provider_capabilities?: string[] };
}

/** Envelope every proxy returns: backendUp flags whether the FastAPI service
 *  answered, so the UI can show a "service offline / setup required" state. */
export type Envelope<T> = { backendUp: boolean; error?: string } & Partial<T>;
