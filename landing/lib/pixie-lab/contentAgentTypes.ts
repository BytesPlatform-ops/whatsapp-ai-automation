/**
 * Typed contracts for the General Content Agent, mirroring the backend Pydantic
 * models (backend/content_agent/schemas.py, enums.py, types.py). Kept free of
 * `any` — structured payloads use `Record<string, unknown>` so callers narrow
 * per content type. Shared by the browser client and the UI.
 */

export type ContentType =
  | 'social_post'
  | 'caption'
  | 'blog'
  | 'email'
  | 'ad_copy'
  | 'product_description'
  | 'seo_content'
  | 'video_script'
  | 'carousel'
  | 'rewrite';

export type ContentStatus = 'draft' | 'ready' | 'archived';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

/** A field/control kind the dynamic form renderer knows how to draw. */
export type FieldKind =
  | 'text'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'number'
  | 'toggle'
  | 'tags';

export interface FieldSpec {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  hint?: string;
}

/** One entry from GET /content-types — drives a card + its generation form. */
export interface ContentTypeSpec {
  content_type: ContentType;
  label: string;
  icon: string;
  description: string;
  example: string;
  structured: boolean;
  fields: FieldSpec[];
  controls: FieldSpec[];
}

/** Cross-cutting generation controls (GenerationOptions). */
export interface GenerationOptions {
  tone?: string;
  length?: string; // short | medium | long
  language?: string;
  creativity?: string; // low | balanced | high
  variations?: number; // 1..5
  platform?: string;
  cta?: string;
  include_emojis?: boolean;
  include_hashtags?: boolean;
  pov?: string;
  reading_level?: string;
}

/** Content specifics (GenerationInputs) — a superset across the 10 types. Any
 *  field not relevant to a type is simply ignored by the backend. */
export type GenerationInputs = Record<string, string | number | boolean | string[]>;

export interface GeneratedVariation {
  index: number;
  title: string;
  text: string;
  structured: Record<string, unknown>;
}

export interface UsageMeta {
  provider: string;
  model: string;
  mock: boolean;
  tokens: number;
  estimated_cost: number;
  prompt_version: string;
}

export interface GenerationResult {
  content_type: ContentType;
  variations: GeneratedVariation[];
  usage: UsageMeta;
}

export interface ContentVersion {
  document_id: string;
  version_number: number;
  title: string;
  text: string;
  structured: Record<string, unknown>;
  prompt_version: string;
  request_snapshot: Record<string, unknown>;
  provider: string;
  model: string;
  mock: boolean;
  usage: Record<string, unknown>;
  created_at: string;
  created_by: string; // generation | manual_edit | regenerate | duplicate
  parent_version_id: string;
}

export interface ContentDocument {
  tenant_id?: string;
  user_id: string;
  content_type: ContentType;
  title: string;
  status: ContentStatus;
  current_version_id: string;
  folder: string;
  tags: string[];
  media_asset_ids: string[];
  campaign_ref: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  archived_at: string;
}

// ── Response envelopes ─────────────────────────────────────────────────────────
export interface GeneratePreview {
  content_type: ContentType;
  result: GenerationResult;
  saved: false;
}

export interface GenerateSaved {
  content_type: ContentType;
  result: GenerationResult;
  saved: true;
  id: string;
  document: ContentDocument;
  version: ContentVersion;
  version_id: string;
}

export type GenerateResponse = GeneratePreview | GenerateSaved;

export interface DocumentEnvelope {
  id: string;
  document: ContentDocument;
}

export interface DocumentDetail extends DocumentEnvelope {
  current_version: ContentVersion | null;
  version_count: number;
}

export interface DocumentList {
  total: number;
  page: number;
  page_size: number;
  documents: DocumentEnvelope[];
}

export interface VersionEnvelope {
  id: string;
  version: ContentVersion;
}

export interface VersionList {
  document_id: string;
  current_version_id: string;
  versions: VersionEnvelope[];
}

export interface SavedVersionResponse extends DocumentEnvelope {
  version: ContentVersion;
  version_id: string;
}

export interface StatusResponse {
  mock: boolean;
  mode: string;
  prompt_version: string;
  provider: string;
}

export interface ContentTypesResponse {
  content_types: ContentTypeSpec[];
}

export interface ListDocumentsQuery {
  query?: string;
  content_type?: ContentType | '';
  status?: ContentStatus | '';
  tags?: string; // comma-separated
  include_archived?: boolean;
  sort?: 'updated' | 'created';
  page?: number;
  page_size?: number;
}
