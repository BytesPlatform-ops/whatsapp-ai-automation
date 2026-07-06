import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Activity log proxy → Python `/api/activity`. The tenant is resolved SERVER-SIDE
 * from the session (workspace-scoped) — a client-supplied tenant_id is ignored —
 * so the log can never surface another workspace's events.
 */
export async function GET() {
  const g = await guard('activity.view');
  if (!g.ok) return g.response;
  const r = await backendGet('/api/activity', g.tenant, { limit: 30 });
  if (!r.backendUp) return degraded({ events: [] });
  return NextResponse.json({ backendUp: true, events: r.data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
