import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Authenticated catch-all proxy → Python `/api/content-creator/*` (the 13-stage
 * AI Influencer pipeline). One file forwards every method the backend router
 * uses; there is no per-endpoint duplication.
 *
 * Security contract (mirrors app/api/lab/content/assets):
 *  - `guard('content.view')` on reads / `guard('content.manage')` on mutations —
 *    401 when not signed in, 403 without the permission (skipped in local demo).
 *  - The workspace tenant is resolved SERVER-SIDE by the backend helpers and
 *    injected into every request; a client-supplied `tenant_id` is dropped, so a
 *    browser can never reach another workspace's pipeline data.
 *  - The internal shared secret is attached to every backend call.
 *  - Only well-formed content-creator subpaths are forwarded — never an open
 *    proxy (segments are validated; `..`/traversal is rejected), and the target
 *    is always under `/api/content-creator/`.
 *  - 4xx/5xx backend bodies are not spread downstream (they may carry internal
 *    detail); the backend helpers already drop non-2xx payloads.
 */

const SEGMENT = /^[A-Za-z0-9_-]+$/;

function resolveBackendPath(parts: string[] | undefined): string | null {
  if (!parts || parts.length === 0) return null;
  // Reject empty / traversal / unexpected characters — keeps this from ever
  // becoming a generic open proxy.
  if (!parts.every((p) => p && p !== '.' && p !== '..' && SEGMENT.test(p))) return null;
  return `/api/content-creator/${parts.join('/')}`;
}

function forwardableQuery(reqUrl: string): Record<string, string> {
  const out: Record<string, string> = {};
  new URL(reqUrl).searchParams.forEach((v, k) => {
    if (k !== 'tenant_id') out[k] = v; // tenant is server-resolved, never client-supplied
  });
  return out;
}

function shape(data: unknown): Record<string, unknown> {
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : { data };
}

function notFound() {
  return NextResponse.json({ backendUp: true, error: 'Unknown content-creator path' }, { status: 404 });
}

export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  const path = resolveBackendPath(params.path);
  if (!path) return notFound();
  const g = await guard('content.view');
  if (!g.ok) return g.response;
  const r = await backendGet(path, g.tenant, forwardableQuery(req.url));
  if (!r.backendUp) return degraded({ error: 'The content creator service is offline.' });
  return NextResponse.json({ backendUp: true, ...shape(r.data) }, {
    status: r.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function mutate(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  req: Request,
  params: { path: string[] },
) {
  const path = resolveBackendPath(params.path);
  if (!path) return notFound();
  const g = await guard('content.manage');
  if (!g.ok) return g.response;
  const raw = await req.json().catch(() => ({}));
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const r = await backendSend(method, path, g.tenant, body, forwardableQuery(req.url));
  if (!r.backendUp) return degraded({ error: 'The content creator service is offline.' });
  return NextResponse.json({ backendUp: true, ...shape(r.data) }, { status: r.status });
}

export function POST(req: Request, ctx: { params: { path: string[] } }) {
  return mutate('POST', req, ctx.params);
}
export function PUT(req: Request, ctx: { params: { path: string[] } }) {
  return mutate('PUT', req, ctx.params);
}
export function PATCH(req: Request, ctx: { params: { path: string[] } }) {
  return mutate('PATCH', req, ctx.params);
}
export function DELETE(req: Request, ctx: { params: { path: string[] } }) {
  return mutate('DELETE', req, ctx.params);
}
