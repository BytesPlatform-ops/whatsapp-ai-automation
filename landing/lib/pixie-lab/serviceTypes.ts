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
export interface RcpHealth {
  status?: string; agent_slug?: string; llm_provider?: string; model?: string; handlers?: number;
  persistence?: { backend?: string; durable?: boolean; supabase_configured?: boolean };
  mode?: Record<string, unknown>;
  capabilities?: { intents?: string[]; handlers?: string[]; actions_supported?: number; provider_capabilities?: string[] };
}

/** Envelope every proxy returns: backendUp flags whether the FastAPI service
 *  answered, so the UI can show a "service offline / setup required" state. */
export type Envelope<T> = { backendUp: boolean; error?: string } & Partial<T>;
