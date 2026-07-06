import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';
import { can } from '@/lib/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Meta connection status + permissions → Python `/api/meta/status` + `/api/meta/permissions`
 * (marketing.view). Never returns tokens. Drives the "connect Meta / setup
 * required" state across the marketing pages. Adds `can_manage` so the UI shows
 * the exact missing env vars only to managers/admins (others get a generic
 * "not configured yet" message).
 */
export async function GET() {
  const g = await guard('marketing.view');
  if (!g.ok) return g.response;
  // Demo mode (no membership) = local preview → treat as manager.
  const canManage = g.demo || (g.membership ? can(g.membership, 'marketing.manage') : false);
  const [status, perms] = await Promise.all([
    backendGet('/api/meta/status', g.tenant),
    backendGet('/api/meta/permissions', g.tenant),
  ]);
  if (!status.backendUp) return degraded({ configured: false, connected: false, can_manage: canManage });
  return NextResponse.json(
    { backendUp: true, ...(status.data as object), inbox_permissions: perms.backendUp ? perms.data : null, can_manage: canManage },
    { status: status.status, headers: { 'Cache-Control': 'no-store' } },
  );
}
