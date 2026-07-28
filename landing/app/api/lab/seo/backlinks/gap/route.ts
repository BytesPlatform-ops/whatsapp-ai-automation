import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Backend route (seo/backlinks/routes.py):
 *   GET /backlinks/gap?site_id=&competitors=&domain=
 *
 * The backend defines this as GET (read-only analysis). The proxy converts the
 * client POST body into GET query params to match the backend contract.
 */
export async function POST(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.site_id) {
    return NextResponse.json({ backendUp: true, error: 'site_id is required' }, { status: 400 });
  }
  // Backend uses GET with query params; build params from body
  const params: Record<string, string | number | boolean | undefined> = {
    site_id: String(b.site_id),
  };
  if (b.domain) params.domain = String(b.domain);
  // competitor_domains array → repeated 'competitors' query params handled by backendUrl
  // Use backendGet with site_id + pass competitors as comma-separated or repeated
  // The backend expects List[str] via Query; use backendGet with multiple entries
  const { backendUrl, tenantHeaders } = await import('@/lib/pixie-lab/backend');
  const url = new URL(backendUrl('/api/agents/seo/backlinks/gap', g.tenant, params));
  const competitors: string[] = Array.isArray(b.competitor_domains) ? b.competitor_domains as string[] : [];
  for (const c of competitors) url.searchParams.append('competitors', c);
  try {
    const res = await fetch(url.toString(), { cache: 'no-store', headers: { Accept: 'application/json', ...tenantHeaders(g.tenant) } });
    const data = res.ok ? await res.json().catch(() => null) : null;
    if (!res.ok) return NextResponse.json({ backendUp: false, error: `Backend error ${res.status}` }, { status: 502 });
    return NextResponse.json({ backendUp: true, ...(data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ backendUp: false, error: 'Network error' }, { status: 200 });
  }
}
