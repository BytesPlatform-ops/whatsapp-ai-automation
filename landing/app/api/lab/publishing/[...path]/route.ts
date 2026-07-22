import { NextResponse } from 'next/server';
import { guard, backendForward, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Authenticated catch-all proxy → Python `/api/publishing/*` (publish jobs,
 * calendar, history, job actions). Mirrors the content-agent proxy:
 *  - `guard('content.view')` on reads / `guard('content.manage')` on mutations.
 *  - The workspace tenant is resolved SERVER-SIDE and injected; a client tenant is
 *    dropped, so a browser can never touch another workspace's publish jobs.
 *  - The internal shared secret is attached to every backend call.
 *  - Never caches; never logs job payloads; never exposes the backend URL/secret.
 * Structured 4xx bodies (gate_blocked, live_disabled, invalid_schedule, …) are
 * forwarded so the UI can drive validation/confirmation states.
 */

const SEGMENT = /^[A-Za-z0-9_.:-]+$/;

function resolveBackendPath(parts: string[] | undefined): string | null {
  if (!parts || parts.length === 0) return null;
  if (!parts.every((p) => p && p !== '.' && p !== '..' && SEGMENT.test(p))) return null;
  return `/api/publishing/${parts.join('/')}`;
}

function forwardableQuery(reqUrl: string): Record<string, string> {
  const out: Record<string, string> = {};
  new URL(reqUrl).searchParams.forEach((v, k) => {
    if (k !== 'tenant_id') out[k] = v;
  });
  return out;
}

function notFound() {
  return NextResponse.json({ backendUp: true, error: 'Unknown publishing path' }, { status: 404 });
}

function respond(status: number, data: unknown) {
  const noStore = { 'Cache-Control': 'no-store' } as Record<string, string>;
  if (status >= 500) {
    const d = data as { detail?: unknown; message?: unknown } | null;
    const msg = typeof d?.detail === 'string' ? d.detail : typeof d?.message === 'string' ? d.message : 'The publishing service had an error.';
    return NextResponse.json({ backendUp: true, error: msg }, { status, headers: noStore });
  }
  const body = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : { data };
  return NextResponse.json({ backendUp: true, ...body }, { status, headers: noStore });
}

export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  const path = resolveBackendPath(params.path);
  if (!path) return notFound();
  const g = await guard('content.view');
  if (!g.ok) return g.response;
  const r = await backendForward('GET', path, g.tenant, undefined, forwardableQuery(req.url));
  if (!r.backendUp) return degraded({ error: 'The publishing service is offline.' });
  return respond(r.status, r.data);
}

async function mutate(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', req: Request, params: { path: string[] }) {
  const path = resolveBackendPath(params.path);
  if (!path) return notFound();
  const g = await guard('content.manage');
  if (!g.ok) return g.response;
  const raw = await req.json().catch(() => ({}));
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const r = await backendForward(method, path, g.tenant, body, forwardableQuery(req.url));
  if (!r.backendUp) return degraded({ error: 'The publishing service is offline.' });
  return respond(r.status, r.data);
}

export function POST(req: Request, ctx: { params: { path: string[] } }) {
  return mutate('POST', req, ctx.params);
}
export function PATCH(req: Request, ctx: { params: { path: string[] } }) {
  return mutate('PATCH', req, ctx.params);
}
export function DELETE(req: Request, ctx: { params: { path: string[] } }) {
  return mutate('DELETE', req, ctx.params);
}
