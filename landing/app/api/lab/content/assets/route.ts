import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Content media library → Python `/api/content/assets`.
 *   GET                                          list assets           (content.view)
 *   POST   { filename, content_type, data_base64 } upload an asset     (content.manage)
 *   DELETE ?id=                                   delete an asset       (content.manage)
 */

export async function GET() {
  const g = await guard('content.view');
  if (!g.ok) return g.response;
  const r = await backendGet('/api/content/assets', g.tenant);
  if (!r.backendUp) return degraded({ assets: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('content.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const filename = String(b.filename || '');
  const content_type = String(b.content_type || '');
  const data_base64 = String(b.data_base64 || '');
  if (!filename || !content_type || !data_base64) {
    return NextResponse.json({ backendUp: true, error: 'filename, content_type and data_base64 are required' }, { status: 400 });
  }
  const r = await backendSend('POST', '/api/content/assets', g.tenant, {
    filename, content_type, data_base64, metadata: b.metadata || {},
  }, undefined, 30000);
  if (!r.backendUp) return degraded({ error: 'The content service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}

export async function DELETE(req: Request) {
  const g = await guard('content.manage');
  if (!g.ok) return g.response;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ backendUp: true, error: 'id required' }, { status: 400 });
  const r = await backendSend('DELETE', `/api/content/assets/${encodeURIComponent(id)}`, g.tenant, {});
  if (!r.backendUp) return degraded({ error: 'The content service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
