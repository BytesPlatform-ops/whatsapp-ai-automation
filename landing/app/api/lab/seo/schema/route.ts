import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Local structured-data (schema.org) proxy — /api/lab/seo/schema
 *
 * Backend routes (seo/local/routes.py):
 *   GET  /locations/{location_id}/schema            — list proposed/approved schemas
 *   GET  /locations/{location_id}/schema/audit      — audit live vs proposed schema
 *   POST /locations/{location_id}/schema/propose    — generate a schema proposal
 *   POST /schema/{schema_id}/approve                — approve a proposal
 *   POST /schema/{schema_id}/published              — mark as published (recrawl-verified)
 *
 * GET  ?location_id= [&view=audit]                             (seo.view)
 * POST { action:'propose', location_id, ... }                 (seo.manage)
 * POST { action:'approve', schema_id, approved_by }           (seo.manage)
 * POST { action:'published', schema_id }                      (seo.manage)
 */
export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get('location_id');
  if (!location_id) {
    return NextResponse.json({ backendUp: true, error: 'location_id is required' }, { status: 400 });
  }
  const view = searchParams.get('view');
  const base = `/api/agents/seo/locations/${encodeURIComponent(location_id)}/schema`;
  let path = base;
  const params: Record<string, string> = {};
  if (view === 'audit') {
    path = `${base}/audit`;
  } else {
    const status = searchParams.get('status');
    if (status) params.status = status;
  }
  const r = await backendGet(path, g.tenant, Object.keys(params).length ? params : undefined);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action ?? 'propose');

  if (action === 'approve' || action === 'published') {
    const schema_id = String(b.schema_id ?? '');
    if (!schema_id) {
      return NextResponse.json({ backendUp: true, error: 'schema_id is required' }, { status: 400 });
    }
    const path = action === 'approve'
      ? `/api/agents/seo/schema/${encodeURIComponent(schema_id)}/approve`
      : `/api/agents/seo/schema/${encodeURIComponent(schema_id)}/published`;
    const body = action === 'approve' ? { approved_by: b.approved_by ?? '' } : {};
    const r = await backendSend('POST', path, g.tenant, body);
    if (!r.backendUp) return degraded();
    return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // default: propose
  const location_id = String(b.location_id ?? '');
  if (!location_id) {
    return NextResponse.json({ backendUp: true, error: 'location_id is required' }, { status: 400 });
  }
  const r = await backendSend('POST', `/api/agents/seo/locations/${encodeURIComponent(location_id)}/schema/propose`, g.tenant, b);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
