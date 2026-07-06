import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SEO audit proxy → Python `/api/agents/seo/audit`.
 *   GET  ?audit_id=            fetch a stored audit + issues   (seo.view)
 *   POST { website_url, crawl_limit?, include_pagespeed? }     run a new audit (seo.manage)
 * Tenant is resolved server-side — the client never picks it.
 */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const auditId = new URL(req.url).searchParams.get('audit_id');
  if (!auditId) return NextResponse.json({ backendUp: true, error: 'audit_id required' }, { status: 400 });
  const r = await backendGet(`/api/agents/seo/audit/${encodeURIComponent(auditId)}`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const website_url = String(b.website_url || '').trim();
  if (website_url.length < 3) return NextResponse.json({ backendUp: true, error: 'A valid website URL is required' }, { status: 400 });
  const r = await backendSend('POST', '/api/agents/seo/audit/start', g.tenant, {
    website_url,
    crawl_limit: Number(b.crawl_limit) > 0 ? Number(b.crawl_limit) : 1,
    include_pagespeed: Boolean(b.include_pagespeed),
  }, undefined, 45000);
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline. Start the backend and try again.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
