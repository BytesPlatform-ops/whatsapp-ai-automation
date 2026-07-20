/**
 * Content Creator pipeline contract — the single frontend source of truth for the
 * AI Influencer wizard. Mirrors the ACTUAL backend (backend/content_creator):
 *   - stages:  enums.PipelineStage (13) + pipeline/stages.py STAGE_META titles
 *   - gates:   enums.ApprovalGate (4) + GATE_BLOCKS_STAGE
 *   - schemas: content_creator/schemas.py (Pydantic v2)
 *   - wizard:  content_creator/wizard.py::build_wizard_state
 *
 * Do NOT hardcode the legacy 6-step lib/pipelines.ts runway here — this reflects
 * the real 13 stages the backend implements.
 */

// ── Enums (exact backend string values) ──────────────────────────────────────
export type CreatorStage =
  | 'intake'
  | 'influencer_setup'
  | 'provider_connection'
  | 'idea_generation'
  | 'idea_approval'
  | 'script_generation'
  | 'script_approval'
  | 'cost_estimate'
  | 'video_generation'
  | 'quality_check'
  | 'publish_approval'
  | 'posting'
  | 'analytics';

export type CreatorGate = 'idea' | 'script' | 'production' | 'publish';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'needs_changes';

export type StageStatus = 'complete' | 'current' | 'locked';

export type VideoStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'mock';

export type QualityStatus = 'pass' | 'fail' | 'needs_retry' | 'manual_review';

export type IdentitySource = 'reference_image' | 'generated_character';

// ── Artifact models (match schemas.py) ───────────────────────────────────────
export interface CreatorProfile {
  tenant_id?: string;
  business_name: string;
  business_type: string;
  product_or_service: string;
  target_audience: string;
  niche: string;
  content_goal: string;
  brand_tone: string;
  language: string;
  selling_points: string[];
  competitors: string[];
  cta_style: string;
  compliance_notes: string;
}

export interface InfluencerIdentity {
  tenant_id?: string;
  source: IdentitySource;
  active: boolean;
  reference_ref: string;
  reference_hosted: boolean;
  reference_asset_id: string;
  characteristics: Record<string, unknown>;
  locked: boolean;
}

export interface Idea {
  tenant_id?: string;
  title: string;
  angle: string;
  hook: string;
  score: number;
  source: string;
  approval_status: ApprovalStatus;
}

export interface Script {
  tenant_id?: string;
  idea_ref: string;
  hook: string;
  body: string;
  cta: string;
  word_count: number;
  approx_seconds: number;
  approval_status: ApprovalStatus;
}

export interface Video {
  tenant_id?: string;
  script_ref: string;
  status: VideoStatus;
  asset_ref: string;
  preview_ref: string;
  identity_ref: string;
  aspect_ratio: string;
  duration_seconds: number;
  model: string;
  provider: string;
  provider_mode: string;
  provider_job_id: string;
  result_url: string;
  storage_url: string;
  progress: number;
  error: string;
}

export interface QualityCheck {
  tenant_id?: string;
  video_ref: string;
  status: QualityStatus;
  deterministic_flags: string[];
  llm_flags: string[];
  retry_count: number;
}

export interface CreatorPost {
  tenant_id?: string;
  video_ref: string;
  platform: string;
  status: string;
  scheduled_time: string;
  dry_run: boolean;
  external_ref: string;
}

export interface CostEstimate {
  tenant_id: string;
  provider: string;
  provider_mode: string;
  cost_estimate: {
    estimated_credits?: number;
    estimated_provider_cost?: number;
    pixie_markup?: number;
    final_user_price?: number;
    currency?: string;
    duration_seconds?: number;
    retry_budget?: number;
    model?: string;
  };
  requires_approval: boolean;
  estimate_type: 'mock_estimated' | 'pixie_estimated' | 'none' | 'unavailable' | string;
  status?: string;
  message?: string;
}

// ── Wizard aggregate (matches wizard.py::build_wizard_state) ─────────────────
export interface WizardStageView {
  stage: CreatorStage;
  n: number;
  title: string;
  gate: CreatorGate | null;
  status: StageStatus;
  done: boolean;
}

export interface WizardState {
  tenant_id: string;
  mock: boolean;
  dry_run: boolean;
  current_stage: CreatorStage;
  complete: boolean;
  completed_count: number;
  total_stages: number;
  stages: WizardStageView[];
  gates: Record<CreatorGate, ApprovalStatus>;
  profile: CreatorProfile | null;
  profile_id: string | null;
  identity: InfluencerIdentity | null;
  identity_id: string | null;
  provider: Record<string, unknown> | null;
  ideas: Array<{ id: string; idea: Idea }>;
  approved_idea_id: string | null;
  scripts: Array<{ id: string; script: Script }>;
  approved_script_id: string | null;
  video: { id: string; video: Video } | null;
  quality: { id: string; quality: QualityCheck } | null;
  posts: Array<{ id: string; post: CreatorPost }>;
  metrics: unknown[];
  learning: Record<string, unknown> | null;
}

export interface CreatorStatus {
  mock?: boolean;
  dry_run?: boolean;
  banner?: string;
  provider?: { name?: string; mode?: string; configured?: boolean; connected?: boolean };
  billing?: { mode?: string; requires_cost_approval?: boolean; markup_enabled?: boolean };
}

// ── Stage metadata (drives the wizard shell + step routing) ──────────────────
export interface StageMeta {
  stage: CreatorStage;
  n: number;
  title: string;
  short: string;
  description: string;
  gate: CreatorGate | null;
  aiGenerated: boolean;
  canIncurCost: boolean;
  requiresPolling: boolean;
  canRegenerate: boolean;
}

export const STAGES: StageMeta[] = [
  { stage: 'intake', n: 1, title: 'Business intake', short: 'Intake', gate: null, aiGenerated: false, canIncurCost: false, requiresPolling: false, canRegenerate: false,
    description: 'Tell Pixie about the business so every idea, script and video stays on-brand.' },
  { stage: 'influencer_setup', n: 2, title: 'Influencer setup', short: 'Identity', gate: null, aiGenerated: false, canIncurCost: false, requiresPolling: false, canRegenerate: false,
    description: 'Lock one AI influencer identity — an uploaded reference image or described characteristics.' },
  { stage: 'provider_connection', n: 3, title: 'Provider connection', short: 'Provider', gate: null, aiGenerated: false, canIncurCost: false, requiresPolling: false, canRegenerate: false,
    description: 'Choose how videos are produced: Pixie-managed, your own provider key, or prompt export.' },
  { stage: 'idea_generation', n: 4, title: 'Idea generation', short: 'Ideas', gate: null, aiGenerated: true, canIncurCost: false, requiresPolling: false, canRegenerate: true,
    description: 'Generate and score reel ideas from the business profile and current trends.' },
  { stage: 'idea_approval', n: 5, title: 'Gate 1 · Idea approval', short: 'Approve idea', gate: 'idea', aiGenerated: false, canIncurCost: false, requiresPolling: false, canRegenerate: false,
    description: 'Approve the idea to unlock script generation.' },
  { stage: 'script_generation', n: 6, title: 'Script generation', short: 'Script', gate: null, aiGenerated: true, canIncurCost: false, requiresPolling: false, canRegenerate: true,
    description: 'Draft an AIDA short-form script from the approved idea.' },
  { stage: 'script_approval', n: 7, title: 'Gate 2 · Script approval', short: 'Approve script', gate: 'script', aiGenerated: false, canIncurCost: false, requiresPolling: false, canRegenerate: false,
    description: 'Approve the script to unlock the production cost estimate.' },
  { stage: 'cost_estimate', n: 8, title: 'Cost estimate · Gate 3 production', short: 'Cost', gate: 'production', aiGenerated: false, canIncurCost: false, requiresPolling: false, canRegenerate: false,
    description: 'Review the production estimate and approve production. No provider spend happens before this gate.' },
  { stage: 'video_generation', n: 9, title: 'Video generation', short: 'Video', gate: null, aiGenerated: true, canIncurCost: true, requiresPolling: true, canRegenerate: true,
    description: 'Generate the video from the locked identity and approved script, then poll until ready.' },
  { stage: 'quality_check', n: 10, title: 'Quality check', short: 'Quality', gate: null, aiGenerated: true, canIncurCost: false, requiresPolling: false, canRegenerate: true,
    description: 'Run deterministic quality checks on the generated video.' },
  { stage: 'publish_approval', n: 11, title: 'Gate 4 · Publish approval', short: 'Approve publish', gate: 'publish', aiGenerated: false, canIncurCost: false, requiresPolling: false, canRegenerate: false,
    description: 'Approve publishing to unlock scheduling.' },
  { stage: 'posting', n: 12, title: 'Posting', short: 'Post', gate: null, aiGenerated: false, canIncurCost: false, requiresPolling: false, canRegenerate: false,
    description: 'Schedule the post. Dry-run only until live publishing is enabled.' },
  { stage: 'analytics', n: 13, title: 'Analytics + learning', short: 'Analytics', gate: null, aiGenerated: true, canIncurCost: false, requiresPolling: false, canRegenerate: true,
    description: 'Sync performance metrics and learning. Values are synthetic in mock mode.' },
];

export const STAGE_BY_KEY: Record<CreatorStage, StageMeta> = STAGES.reduce((acc, s) => {
  acc[s.stage] = s;
  return acc;
}, {} as Record<CreatorStage, StageMeta>);

export const GATES: Record<CreatorGate, { title: string; blocks: CreatorStage; spend: boolean }> = {
  idea: { title: 'Idea approval', blocks: 'script_generation', spend: false },
  script: { title: 'Script approval', blocks: 'cost_estimate', spend: false },
  production: { title: 'Production approval', blocks: 'video_generation', spend: true },
  publish: { title: 'Publish approval', blocks: 'posting', spend: false },
};

/** Which downstream gates a given stage's edit invalidates (mirrors the backend
 *  _INVALIDATION_GATES map so the UI can warn before saving an upstream change). */
export const INVALIDATES: Partial<Record<CreatorStage, CreatorGate[]>> = {
  intake: ['idea', 'script', 'production', 'publish'],
  influencer_setup: ['idea', 'script', 'production', 'publish'],
  provider_connection: ['production', 'publish'],
  idea_generation: ['idea', 'script', 'production', 'publish'],
  idea_approval: ['script', 'production', 'publish'],
  script_generation: ['script', 'production', 'publish'],
  script_approval: ['production', 'publish'],
  cost_estimate: ['production', 'publish'],
  video_generation: ['publish'],
  quality_check: ['publish'],
};
