import { NextResponse } from 'next/server';
import { guard, backendUrl, tenantHeaders, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const A = '/api/agents/ai-receptionist';
const MAX_UPLOAD_BYTES = 10_000_000;

/** POST a PDF as the raw request body. The filename is forwarded as a query
 *  param; the tenant is server-derived and the internal secret is attached. */
export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const filename = new URL(req.url).searchParams.get('filename') || 'document.pdf';
  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) return NextResponse.json({ backendUp: true, error: 'empty file' }, { status: 400 });
  if (buf.byteLength > MAX_UPLOAD_BYTES) return NextResponse.json({ backendUp: true, error: 'file too large' }, { status: 413 });
  try {
    const res = await fetch(backendUrl(`${A}/knowledge-sources/pdf`, g.tenant, { filename }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf', Accept: 'application/json', ...tenantHeaders(g.tenant) },
      body: buf,
      cache: 'no-store',
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json({ backendUp: true, ...(data as object) }, { status: res.status });
  } catch {
    return degraded({ error: 'The receptionist service is offline.' });
  }
}
