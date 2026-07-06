import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Meta connection status + permissions → Python `/api/meta/status` + `/api/meta/permissions`
 * (marketing.view). Never returns tokens. Drives the "connect Meta / setup
 * required" state across the marketing pages.
 */
export async function GET() {
  const g = await guard('marketing.view');
  if (!g.ok) return g.response;
  const [status, perms] = await Promise.all([
    backendGet('/api/meta/status', g.tenant),
    backendGet('/api/meta/permissions', g.tenant),
  ]);
  if (!status.backendUp) return degraded({ configured: false, connected: false });
  return NextResponse.json(
    { backendUp: true, ...(status.data as object), inbox_permissions: perms.backendUp ? perms.data : null },
    { status: status.status, headers: { 'Cache-Control': 'no-store' } },
  );
}
