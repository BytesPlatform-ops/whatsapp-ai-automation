'use client';

/**
 * Typed browser client for social publishing. Talks ONLY to the same-origin
 * authenticated proxies `/api/lab/publishing/*` and `/api/lab/social/*` — never
 * the Python backend, never a tenant id, never a token. Discriminated results so
 * callers handle unauthorized / forbidden / not-found / conflict / validation /
 * offline distinctly.
 */

export type PublishStatus =
  | 'draft' | 'scheduled' | 'queued' | 'publishing' | 'published'
  | 'failed' | 'cancelled' | 'retry_wait' | 'reconnection_required';

export type Platform = 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'x' | 'youtube';
export type PublishMode = 'dry_run' | 'live';
export type SourceProduct = 'content_agent' | 'ai_influencer';
export type ContentFormat = 'text' | 'link' | 'image' | 'video' | 'carousel' | 'reel' | 'story';

export interface AccountCapabilities {
  platform: string;
  live_capable: boolean;
  publishing_authorized: boolean;
  missing_scopes: string[];
  reconnection_required: boolean;
  formats_supported: Record<string, boolean>;
  limits: { max_media: number; caption_limit: number; aspect_ratios: string[]; formats: string[] };
  scheduling: boolean;
}

export interface SocialConnection {
  connection_id: string;
  platform: string;
  account_id: string;
  page_id: string;
  display_name: string;
  scopes: string[];
  capabilities: AccountCapabilities;
  publishing_authorized: boolean;
  reconnection_required: boolean;
}

export interface PublishJob {
  tenant_id?: string;
  source_product: SourceProduct;
  connection_id: string;
  platform: Platform;
  account_id: string;
  mode: PublishMode;
  status: PublishStatus;
  snapshot: Record<string, unknown>;
  scheduled_utc: string;
  local_time: string;
  timezone: string;
  attempt_count: number;
  max_attempts: number;
  next_retry_utc: string;
  platform_post_id: string;
  platform_permalink: string;
  error_category: string;
  error_correlation_id: string;
  created_by: string;
  cancelled_by: string;
  created_at: string;
  updated_at: string;
}

export interface PublishingConfig {
  publish_mode: PublishMode;
  meta_publish_enabled: boolean;
  live_allowed: boolean;
  worker_enabled: boolean;
  default_timezone: string;
  max_retries: number;
}

export type PubErrorKind =
  | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'validation'
  | 'gate_blocked' | 'live_disabled' | 'offline' | 'server' | 'unknown';

export interface PubError {
  kind: PubErrorKind;
  status: number;
  message: string;
  detail?: unknown;
}

export type PubResult<T> = { ok: true; data: T } | { ok: false; error: PubError };

interface CallOpts {
  body?: Record<string, unknown>;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

function classify(status: number, code?: string): PubErrorKind {
  if (code === 'gate_blocked') return 'gate_blocked';
  if (code === 'live_disabled') return 'live_disabled';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 422 || status === 400) return 'validation';
  if (status >= 500) return 'server';
  return 'unknown';
}

function messageFrom(json: Record<string, unknown> | null, status: number): { message: string; code?: string; detail?: unknown } {
  const detail = json?.detail;
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const d = detail as Record<string, unknown>;
    const code = typeof d.error === 'string' ? d.error : undefined;
    if (typeof d.message === 'string') return { message: d.message, code, detail };
  }
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { loc?: unknown[]; msg?: string };
    const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : '';
    return { message: `${field ? `${field}: ` : ''}${first.msg || 'Invalid input.'}`, detail };
  }
  if (typeof detail === 'string') return { message: detail, detail };
  if (typeof json?.error === 'string') return { message: json.error as string };
  return { message: `Request failed (${status}).` };
}

async function call<T>(base: string, method: string, path: string, opts: CallOpts = {}): Promise<PubResult<T>> {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(`${base}${path}`, origin);
  for (const [k, v] of Object.entries(opts.params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  let res: Response;
  try {
    res = await fetch(url.toString().replace(url.origin, ''), {
      method,
      cache: 'no-store',
      signal: opts.signal,
      headers: method === 'GET' ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(opts.body || {}),
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    return { ok: false, error: { kind: 'offline', status: 0, message: 'Network error — the service is unreachable.' } };
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (json && json.backendUp === false && res.ok) {
    return { ok: false, error: { kind: 'offline', status: 503, message: String(json.error || 'The publishing service is offline.') } };
  }
  if (res.ok) return { ok: true, data: json as unknown as T };
  const { message, code, detail } = messageFrom(json, res.status);
  return { ok: false, error: { kind: classify(res.status, code), status: res.status, message, detail } };
}

const PUB = '/api/lab/publishing';
const SOCIAL = '/api/lab/social';

// ── social ──────────────────────────────────────────────────────────────────
export const listConnections = (signal?: AbortSignal) => call<{ connections: SocialConnection[] }>(SOCIAL, 'GET', '/connections', { signal });
export const getCapabilities = (signal?: AbortSignal) => call<{ accounts: Array<{ connection_id: string; platform: string; display_name: string; capabilities: AccountCapabilities }> }>(SOCIAL, 'GET', '/capabilities', { signal });
export const validateConnection = (connectionId: string) => call<{ publishing_authorized: boolean; missing_scopes: string[]; reconnection_required: boolean }>(SOCIAL, 'POST', `/connections/${encodeURIComponent(connectionId)}/validate`, { body: {} });

// ── publishing ──────────────────────────────────────────────────────────────
export const getPublishingConfig = (signal?: AbortSignal) => call<PublishingConfig>(PUB, 'GET', '/config', { signal });

export interface CreateJobArgs {
  sourceProduct: SourceProduct;
  connectionId: string;
  platform: Platform;
  contentFormat: ContentFormat;
  text?: string;
  link?: string;
  mediaAssetIds?: string[];
  firstComment?: string;
  documentId?: string;
  versionId?: string;
  influencerVideoId?: string;
  mode?: PublishMode;
  scheduledLocal?: string;
  timezone?: string;
  idempotencyKey?: string;
  confirm?: boolean;
  createdBy?: string;
}

export const createPublishJob = (a: CreateJobArgs) =>
  call<{ id: string; job: PublishJob; created: boolean }>(PUB, 'POST', '/jobs', {
    body: {
      source_product: a.sourceProduct,
      connection_id: a.connectionId,
      platform: a.platform,
      content_format: a.contentFormat,
      text: a.text || '',
      link: a.link || '',
      media_asset_ids: a.mediaAssetIds || [],
      first_comment: a.firstComment || '',
      document_id: a.documentId || '',
      version_id: a.versionId || '',
      influencer_video_id: a.influencerVideoId || '',
      mode: a.mode || 'dry_run',
      scheduled_local: a.scheduledLocal || '',
      timezone: a.timezone || '',
      idempotency_key: a.idempotencyKey || '',
      confirm: Boolean(a.confirm),
      created_by: a.createdBy || '',
    },
  });

export const listJobs = (q: { status?: string; platform?: string; source_product?: string } = {}, signal?: AbortSignal) =>
  call<{ jobs: Array<{ id: string; job: PublishJob }> }>(PUB, 'GET', '/jobs', { params: q, signal });
export const getJob = (id: string, signal?: AbortSignal) => call<{ id: string; job: PublishJob; attempts: unknown[] }>(PUB, 'GET', `/jobs/${encodeURIComponent(id)}`, { signal });
export const getAttempts = (id: string, signal?: AbortSignal) => call<{ job_id: string; attempts: unknown[] }>(PUB, 'GET', `/jobs/${encodeURIComponent(id)}/attempts`, { signal });
export const cancelJob = (id: string, cancelledBy = '') => call<{ id: string; job: PublishJob }>(PUB, 'POST', `/jobs/${encodeURIComponent(id)}/cancel`, { body: { cancelled_by: cancelledBy } });
export const retryJob = (id: string) => call<{ id: string; job: PublishJob }>(PUB, 'POST', `/jobs/${encodeURIComponent(id)}/retry`, { body: {} });
export const rescheduleJob = (id: string, scheduledLocal: string, timezone: string) =>
  call<{ id: string; job: PublishJob }>(PUB, 'POST', `/jobs/${encodeURIComponent(id)}/reschedule`, { body: { scheduled_local: scheduledLocal, timezone } });
export const editJob = (id: string, patch: { text?: string; first_comment?: string; media_asset_ids?: string[] }) =>
  call<{ id: string; job: PublishJob }>(PUB, 'PATCH', `/jobs/${encodeURIComponent(id)}`, { body: { ...patch } });
export const getCalendar = (signal?: AbortSignal) => call<{ events: Array<Record<string, unknown>> }>(PUB, 'GET', '/calendar', { signal });
export const getHistory = (signal?: AbortSignal) => call<{ history: Array<Record<string, unknown>> }>(PUB, 'GET', '/history', { signal });
export const runWorkerOnce = () => call<{ count: number; processed: unknown[] }>(PUB, 'POST', '/worker/run-once', { body: {} });
