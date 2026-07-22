import { NextResponse } from 'next/server';
import { guard, backendForward, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Authenticated catch-all proxy → Python `/api/social/*` (connected publishing
 * destinations + capabilities). Reads require `content.view`, mutations
 * `content.manage`. Tenant resolved server-side; tokens never traverse this proxy
 * (the backend never returns them). OAuth connect/callback use the existing
 * `/api/meta/connect` routes — not duplicated here.
 */

const SEGMENT = /^[A-Za-z0-9_.:-]+$/;

function resolveBackendPath(parts: string[] | undefined): string | null {
  if (!parts || parts.length === 0) return null;
  if (!parts.every((p) => p && p !== '.' && p !== '..' && SEGMENT.test(p))) return null;
  return `/api/social/${parts.join('/')}`;
}

function forwardableQuery(reqUrl: string): Record<string, string> {
  const out: Record<string, string> = {};
  new URL(reqUrl).searchParams.forEach((v, k) => {
    if (k !== 'tenant_id') out[k] = v;
  });
  return out;
}

function respond(status: number, data: unknown) {
  const noStore = { 'Cache-Control': 'no-store' } as Record<string, string>;
  if (status >= 500) {
    return NextResponse.json({ backendUp: true, error: 'The social service had an error.' }, { status, headers: noStore });
  }
  const body = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : { data };
  return NextResponse.json({ backendUp: true, ...body }, { status, headers: noStore });
}

export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  const path = resolveBackendPath(params.path);
  if (!path) return NextResponse.json({ backendUp: true, error: 'Unknown social path' }, { status: 404 });
  const g = await guard('content.view');
  if (!g.ok) return g.response;
  const r = await backendForward('GET', path, g.tenant, undefined, forwardableQuery(req.url));
  if (!r.backendUp) return degraded({ error: 'The social service is offline.' });
  return respond(r.status, r.data);
}

export async function POST(req: Request, { params }: { params: { path: string[] } }) {
  const path = resolveBackendPath(params.path);
  if (!path) return NextResponse.json({ backendUp: true, error: 'Unknown social path' }, { status: 404 });
  const g = await guard('content.manage');
  if (!g.ok) return g.response;
  const raw = await req.json().catch(() => ({}));
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const r = await backendForward('POST', path, g.tenant, body, forwardableQuery(req.url));
  if (!r.backendUp) return degraded({ error: 'The social service is offline.' });
  return respond(r.status, r.data);
}
