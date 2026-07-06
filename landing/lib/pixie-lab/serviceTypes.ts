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

/** Envelope every proxy returns: backendUp flags whether the FastAPI service
 *  answered, so the UI can show a "service offline / setup required" state. */
export type Envelope<T> = { backendUp: boolean; error?: string } & Partial<T>;
