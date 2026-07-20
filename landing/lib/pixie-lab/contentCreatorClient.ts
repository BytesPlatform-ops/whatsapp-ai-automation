'use client';

/**
 * Typed browser client for the Content Creator (AI Influencer) pipeline. Talks
 * ONLY to the same-origin authenticated proxy `/api/lab/content-creator/*` — never
 * the Python backend directly, and never sends a tenant id (the proxy resolves the
 * workspace tenant server-side). Returns a discriminated result so callers handle
 * unauthorized / forbidden / not-found / conflict(gate) / validation / offline /
 * server distinctly. No request bodies or credentials are logged.
 */

import type {
  CostEstimate,
  CreatorGate,
  CreatorStage,
  CreatorStatus,
  Idea,
  InfluencerIdentity,
  Script,
  Video,
  WizardState,
} from './contentCreatorTypes';

const BASE = '/api/lab/content-creator';

export type CreatorErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'offline'
  | 'server'
  | 'unknown';

export interface CreatorError {
  kind: CreatorErrorKind;
  status: number;
  message: string;
  gate?: CreatorGate;
  detail?: unknown;
}

export type CreatorResult<T> = { ok: true; data: T } | { ok: false; error: CreatorError };

interface CallOpts {
  body?: Record<string, unknown>;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

function classify(status: number): CreatorErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 422) return 'validation';
  if (status >= 500) return 'server';
  return 'unknown';
}

function messageFrom(json: Record<string, unknown> | null, status: number): { message: string; gate?: CreatorGate; detail?: unknown } {
  const detail = json?.detail;
  // gate-blocked conflict: FastAPI wraps HTTPException(detail={...}) under `detail`
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const d = detail as Record<string, unknown>;
    if (d.error === 'gate_blocked') {
      return { message: String(d.detail || 'This step is gated by an approval.'), gate: d.gate as CreatorGate, detail };
    }
    if (typeof d.message === 'string') return { message: d.message, detail };
  }
  // FastAPI 422 validation array
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { loc?: unknown[]; msg?: string };
    const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : '';
    return { message: `${field ? `${field}: ` : ''}${first.msg || 'Invalid input.'}`, detail };
  }
  if (typeof detail === 'string') return { message: detail, detail };
  if (typeof json?.error === 'string') return { message: json.error as string };
  return { message: `Request failed (${status}).` };
}

async function call<T>(method: string, path: string, opts: CallOpts = {}): Promise<CreatorResult<T>> {
  const url = new URL(`${BASE}${path}`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
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
    if ((e as Error)?.name === 'AbortError') throw e; // let callers see cancellation
    return { ok: false, error: { kind: 'offline', status: 0, message: 'Network error — the service is unreachable.' } };
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  // Proxy signals an unreachable backend with backendUp:false (HTTP 200).
  if (json && json.backendUp === false && res.ok) {
    return { ok: false, error: { kind: 'offline', status: 503, message: String(json.error || 'The content creator service is offline.') } };
  }
  if (res.ok) return { ok: true, data: (json as unknown) as T };
  const { message, gate, detail } = messageFrom(json, res.status);
  return { ok: false, error: { kind: classify(res.status), status: res.status, message, gate, detail } };
}

// ── Status + resume ──────────────────────────────────────────────────────────
export const getCreatorStatus = (signal?: AbortSignal) => call<CreatorStatus>('GET', '/status', { signal });
export const getWizardState = (signal?: AbortSignal) => call<WizardState>('GET', '/wizard-state', { signal });

// ── Stage 1 — profile ────────────────────────────────────────────────────────
export const getCreatorProfile = (signal?: AbortSignal) => call<{ id: string; profile: unknown }>('GET', '/profile', { signal });
export const createCreatorProfile = (body: Record<string, unknown>) => call<{ id: string; profile: unknown }>('POST', '/profile', { body });

// ── Stage 2 — identity ───────────────────────────────────────────────────────
export const getInfluencerIdentity = (signal?: AbortSignal) => call<{ id: string; identity: InfluencerIdentity }>('GET', '/influencer', { signal });
export const createIdentityFromCharacteristics = (body: Record<string, unknown>) =>
  call<{ id: string; identity: InfluencerIdentity }>('POST', '/influencer/from-characteristics', { body });
export const uploadIdentityReference = (body: Record<string, unknown>) =>
  call<{ id: string; identity: InfluencerIdentity }>('POST', '/influencer/upload-reference', { body });

// ── Stage 3 — provider ───────────────────────────────────────────────────────
export const connectProvider = (body: Record<string, unknown>) => call<{ id?: string; provider?: unknown }>('POST', '/provider/connect', { body });

// ── Stage 4/5 — ideas + gate 1 ───────────────────────────────────────────────
export const generateIdeas = (seeds: string[] = []) => call<{ ideas: Array<{ id: string; idea: Idea; reasons?: string[] }> }>('POST', '/ideas/generate', { body: { seeds } });
export const listIdeas = (signal?: AbortSignal) => call<{ ideas: Array<{ id: string; idea: Idea }> }>('GET', '/ideas', { signal });
export const approveIdea = (ideaId: string, note = '') => call<{ id: string; idea: Idea }>('POST', `/ideas/${encodeURIComponent(ideaId)}/approve`, { body: { note } });
export const rejectIdea = (ideaId: string, note = '') => call<{ id: string; idea: Idea }>('POST', `/ideas/${encodeURIComponent(ideaId)}/reject`, { body: { note } });

// ── Stage 6/7 — script + gate 2 ──────────────────────────────────────────────
export const generateScript = (ideaId: string) => call<{ id: string; script: Script }>('POST', '/scripts/generate', { body: { idea_id: ideaId } });
export const getScript = (scriptId: string, signal?: AbortSignal) => call<{ id: string; script: Script }>('GET', `/scripts/${encodeURIComponent(scriptId)}`, { signal });
export const approveScript = (scriptId: string, note = '') => call<{ id: string; script: Script }>('POST', `/scripts/${encodeURIComponent(scriptId)}/approve`, { body: { note } });
export const rejectScript = (scriptId: string, note = '') => call<{ id: string; script: Script }>('POST', `/scripts/${encodeURIComponent(scriptId)}/reject`, { body: { note } });

// ── Stage 8 — cost + gate 3 (production) ─────────────────────────────────────
export const getCostEstimate = (scriptId: string, durationSeconds = 15, retryBudget = 2) =>
  call<CostEstimate>('POST', '/cost-estimate', { body: { script_id: scriptId, duration_seconds: durationSeconds, retry_budget: retryBudget } });
export const approveProduction = (note = '') => call<{ status: string }>('POST', '/production/approve', { body: { note } });

// ── Stage 9/10 — video + quality ─────────────────────────────────────────────
export const startVideoGeneration = (scriptId: string, durationSeconds = 15) =>
  call<{ id: string; video: Video }>('POST', '/videos/generate', { body: { script_id: scriptId, duration_seconds: durationSeconds } });
export const getVideoStatus = (videoId: string, signal?: AbortSignal) =>
  call<{ video_id: string; video: Video }>('GET', `/videos/${encodeURIComponent(videoId)}/status`, { signal });
export const runQualityCheck = (videoId: string) => call<{ video_id: string; quality: unknown; retry: unknown }>('POST', `/videos/${encodeURIComponent(videoId)}/quality-check`, { body: {} });

// ── Stage 11/12 — publish gate + posting ─────────────────────────────────────
export const approvePublish = (videoId: string, note = '') => call<{ video_id: string; status: string }>('POST', `/videos/${encodeURIComponent(videoId)}/publish-approve`, { body: { note } });
export const schedulePosts = (videoId: string, platforms: string[] = ['meta', 'instagram']) =>
  call<{ posts: unknown[] }>('POST', '/posts/schedule', { body: { video_id: videoId, platforms } });
export const listPosts = (signal?: AbortSignal) => call<{ posts: Array<{ id: string; post: unknown }> }>('GET', '/posts', { signal });

// ── Stage 13 — analytics ─────────────────────────────────────────────────────
export const syncAnalytics = () => call<{ metrics: unknown; learning: unknown }>('POST', '/analytics/sync', { body: {} });
export const getAnalytics = (signal?: AbortSignal) => call<{ metrics: unknown[] }>('GET', '/analytics', { signal });
export const getLearnings = (signal?: AbortSignal) => call<{ learning: unknown }>('GET', '/learnings', { signal });

// ── Invalidation (upstream edit) ─────────────────────────────────────────────
export const invalidateFrom = (fromStage: CreatorStage) => call<{ reset_gates: string[] }>('POST', '/wizard/invalidate', { body: { from_stage: fromStage } });

// ── Video polling ────────────────────────────────────────────────────────────
const TERMINAL: ReadonlySet<Video['status']> = new Set(['ready', 'failed', 'mock']);

export interface PollOptions {
  intervalMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
  onUpdate?: (video: Video, attempt: number) => void;
}

/**
 * Poll a generation job until terminal (ready/failed/mock), bounded by maxAttempts.
 * Stops on abort (component unmount) and on terminal status. Never loops forever.
 * Returns the final result, or an error (including 'offline'/'timeout').
 */
export async function pollVideo(videoId: string, opts: PollOptions = {}): Promise<CreatorResult<Video>> {
  const interval = opts.intervalMs ?? 2000;
  const maxAttempts = opts.maxAttempts ?? 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (opts.signal?.aborted) return { ok: false, error: { kind: 'offline', status: 0, message: 'Polling cancelled.' } };
    const res = await getVideoStatus(videoId, opts.signal);
    if (!res.ok) return res;
    const video = res.data.video;
    opts.onUpdate?.(video, attempt);
    if (TERMINAL.has(video.status)) return { ok: true, data: video };
    await new Promise<void>((resolve) => setTimeout(resolve, interval));
  }
  return { ok: false, error: { kind: 'server', status: 0, message: 'Video generation timed out. You can retry.' } };
}
