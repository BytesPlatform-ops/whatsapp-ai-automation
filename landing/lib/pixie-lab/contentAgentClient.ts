'use client';

/**
 * Typed browser client for the General Content Agent. Talks ONLY to the
 * same-origin authenticated proxy `/api/lab/content-agent/*` — never the Python
 * backend directly, and never sends a tenant id (the proxy resolves the workspace
 * tenant server-side). Returns a discriminated result so callers handle
 * unauthorized / forbidden / not-found / conflict / validation / provider-down /
 * offline / server distinctly. No request bodies or generated content are logged.
 */

import type {
  ContentStatus,
  ContentType,
  ContentTypesResponse,
  DocumentDetail,
  DocumentEnvelope,
  DocumentList,
  GenerateResponse,
  GenerationInputs,
  GenerationOptions,
  ListDocumentsQuery,
  SavedVersionResponse,
  StatusResponse,
  GeneratedVariation,
  VersionList,
} from './contentAgentTypes';

const BASE = '/api/lab/content-agent';

export type AgentErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'provider_unavailable'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'provider_timeout'
  | 'offline'
  | 'server'
  | 'unknown';

export interface AgentError {
  kind: AgentErrorKind;
  status: number;
  message: string;
  fields?: string[];
  detail?: unknown;
}

export type AgentResult<T> = { ok: true; data: T } | { ok: false; error: AgentError };

interface CallOpts {
  body?: Record<string, unknown>;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

function classify(status: number): AgentErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 422 || status === 400) return 'validation';
  if (status === 429) return 'rate_limited';
  if (status === 402) return 'quota_exceeded';
  if (status === 503) return 'provider_unavailable';
  if (status === 504) return 'provider_timeout';
  if (status >= 500) return 'server';
  return 'unknown';
}

function messageFrom(
  json: Record<string, unknown> | null,
  status: number,
): { message: string; fields?: string[]; detail?: unknown } {
  const detail = json?.detail;
  // Structured HTTPException(detail={...}) bodies from the content-agent router.
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const d = detail as Record<string, unknown>;
    if (d.error === 'missing_inputs') {
      return { message: String(d.message || 'Missing required input.'), fields: (d.fields as string[]) || [], detail };
    }
    if (d.status === 'provider_unavailable') {
      return { message: String(d.message || 'The content provider is unavailable.'), detail };
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

async function call<T>(method: string, path: string, opts: CallOpts = {}): Promise<AgentResult<T>> {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(`${BASE}${path}`, origin);
  for (const [k, v] of Object.entries(opts.params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  let res: Response;
  try {
    res = await fetch(url.toString().replace(url.origin, ''), {
      method,
      cache: 'no-store',
      signal: opts.signal,
      headers:
        method === 'GET'
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(opts.body || {}),
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e; // let callers see cancellation
    return { ok: false, error: { kind: 'offline', status: 0, message: 'Network error — the service is unreachable.' } };
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  // Proxy signals an unreachable backend with backendUp:false (HTTP 200).
  if (json && json.backendUp === false && res.ok) {
    return { ok: false, error: { kind: 'offline', status: 503, message: String(json.error || 'The content agent service is offline.') } };
  }
  if (res.ok) return { ok: true, data: json as unknown as T };
  const { message, fields, detail } = messageFrom(json, res.status);
  return { ok: false, error: { kind: classify(res.status), status: res.status, message, fields, detail } };
}

// ── Registry + status ──────────────────────────────────────────────────────────
export const getContentTypes = (signal?: AbortSignal) =>
  call<ContentTypesResponse>('GET', '/content-types', { signal });
export const getAgentStatus = (signal?: AbortSignal) => call<StatusResponse>('GET', '/status', { signal });

// ── Generation ─────────────────────────────────────────────────────────────────
export interface GenerateArgs {
  contentType: ContentType;
  inputs: GenerationInputs;
  options?: GenerationOptions;
  title?: string;
  save?: boolean;
  signal?: AbortSignal;
}

/**
 * Generate variations. `inputs` (the flat form values) is forwarded as BOTH the
 * backend `inputs` and `options` — each Pydantic model ignores fields it does not
 * own, so a single flat form object routes topic→inputs and platform→options
 * without the UI needing to know the split. Explicit `options` overrides win.
 */
export function generateContent(args: GenerateArgs): Promise<AgentResult<GenerateResponse>> {
  const merged = { ...args.inputs, ...(args.options || {}) };
  return call<GenerateResponse>('POST', '/generate', {
    body: {
      content_type: args.contentType,
      inputs: args.inputs,
      options: merged,
      title: args.title || '',
      save: Boolean(args.save),
    },
    signal: args.signal,
  });
}

// ── Documents ──────────────────────────────────────────────────────────────────
export const listDocuments = (q: ListDocumentsQuery = {}, signal?: AbortSignal) =>
  call<DocumentList>('GET', '/documents', {
    params: {
      query: q.query,
      content_type: q.content_type,
      status: q.status,
      tags: q.tags,
      include_archived: q.include_archived,
      sort: q.sort,
      page: q.page,
      page_size: q.page_size,
    },
    signal,
  });

export const getDocument = (id: string, signal?: AbortSignal) =>
  call<DocumentDetail>('GET', `/documents/${encodeURIComponent(id)}`, { signal });

export interface SaveGeneratedArgs {
  contentType: ContentType;
  variation: GeneratedVariation;
  title?: string;
  settings?: Record<string, unknown>;
  provider?: string;
  model?: string;
  mock?: boolean;
  promptVersion?: string;
}

export const saveGenerated = (a: SaveGeneratedArgs) =>
  call<SavedVersionResponse>('POST', '/documents', {
    body: {
      content_type: a.contentType,
      variation: a.variation,
      title: a.title || '',
      settings: a.settings || {},
      provider: a.provider || 'mock',
      model: a.model || 'mock',
      mock: a.mock ?? true,
      prompt_version: a.promptVersion || '',
    },
  });

export interface DocumentPatch {
  title?: string;
  status?: ContentStatus;
  folder?: string;
  tags?: string[];
  campaign_ref?: string;
}

export const updateDocument = (id: string, patch: DocumentPatch) =>
  call<DocumentEnvelope>('PATCH', `/documents/${encodeURIComponent(id)}`, { body: { ...patch } });

export const deleteDocument = (id: string) =>
  call<{ id: string; deleted: boolean }>('DELETE', `/documents/${encodeURIComponent(id)}`);

export const archiveDocument = (id: string) =>
  call<DocumentEnvelope>('POST', `/documents/${encodeURIComponent(id)}/archive`, { body: {} });
export const restoreDocument = (id: string) =>
  call<DocumentEnvelope>('POST', `/documents/${encodeURIComponent(id)}/restore`, { body: {} });
export const duplicateDocument = (id: string) =>
  call<DocumentEnvelope & { source_id: string }>('POST', `/documents/${encodeURIComponent(id)}/duplicate`, { body: {} });

// ── Versions ───────────────────────────────────────────────────────────────────
export const getVersions = (id: string, signal?: AbortSignal) =>
  call<VersionList>('GET', `/documents/${encodeURIComponent(id)}/versions`, { signal });

export const createManualVersion = (id: string, v: { title?: string; text: string; structured?: Record<string, unknown> }) =>
  call<SavedVersionResponse>('POST', `/documents/${encodeURIComponent(id)}/versions`, {
    body: { title: v.title || '', text: v.text, structured: v.structured || {} },
  });

export const regenerateDocument = (id: string) =>
  call<SavedVersionResponse & { result: unknown }>('POST', `/documents/${encodeURIComponent(id)}/regenerate`, { body: {} });

export const setCurrentVersion = (id: string, versionId: string) =>
  call<DocumentEnvelope & { current_version_id: string }>(
    'POST',
    `/documents/${encodeURIComponent(id)}/set-current-version`,
    { body: { version_id: versionId } },
  );
