import { NextResponse } from 'next/server';
import { guard, backendForward, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Authenticated catch-all proxy → Python `/api/content-creator/*` (the 13-stage
 * AI Influencer pipeline). One file forwards every method the backend router uses.
 *
 * Security contract (mirrors app/api/lab/content/assets):
 *  - `guard('content.view')` on reads / `guard('content.manage')` on mutations —
 *    401 when not signed in, 403 without the permission (skipped in local demo).
 *  - The workspace tenant is resolved SERVER-SIDE and injected into every request;
 *    a client-supplied `tenant_id` is dropped, so a browser can never reach another
 *    workspace's pipeline data.
 *  - The internal shared secret is attached to every backend call.
 *  - Only well-formed content-creator subpaths are forwarded — never an open proxy.
 *
 * Errors: the content-creator router's 4xx bodies are STRUCTURED and safe
 * (`{error:'gate_blocked', gate, detail}`, FastAPI 422 validation), so this proxy
 * FORWARDS them with the original status — the wizard needs them to drive gate and
 * validation UX. 5xx bodies are reduced to a generic message + status.
 */

const SEGMENT = /^[A-Za-z0-9_-]+$/;

function resolveBackendPath(parts: string[] | undefined): string | null {
  if (!parts || parts.length === 0) return null;
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

function notFound() {
  return NextResponse.json({ backendUp: true, error: 'Unknown content-creator path' }, { status: 404 });
}

function respond(status: number, data: unknown) {
  // 2xx → forward the object as-is. 4xx → forward the (safe, structured) error
  // body so the client can classify gate_blocked / validation / not-found. 5xx →
  // never spread an arbitrary body; surface only a generic message.
  const noStore = { 'Cache-Control': 'no-store' } as Record<string, string>;
  if (status >= 500) {
    const d = data as { detail?: unknown; message?: unknown } | null;
    const msg = typeof d?.detail === 'string' ? d.detail
      : typeof d?.message === 'string' ? d.message
      : 'The content creator service had an error.';
    return NextResponse.json({ backendUp: true, error: msg }, { status, headers: noStore });
  }
  const body = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : { data };
  return NextResponse.json({ backendUp: true, ...body }, { status, headers: noStore });
}

export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  const path = resolveBackendPath(params.path);
  if (!path) return notFound();
  const g = await guard('content.view');
  if (!g.ok) return g.response;
  const r = await backendForward('GET', path, g.tenant, undefined, forwardableQuery(req.url));
  if (!r.backendUp) return degraded({ error: 'The content creator service is offline.' });
  return respond(r.status, r.data);
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
  const r = await backendForward(method, path, g.tenant, body, forwardableQuery(req.url));
  if (!r.backendUp) return degraded({ error: 'The content creator service is offline.' });
  return respond(r.status, r.data);
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
