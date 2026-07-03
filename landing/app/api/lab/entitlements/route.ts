import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentMembership, can } from '@/lib/workspace';
import type { Permission } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Service entitlements — workspace-scoped, backed by the workspace_services table
 * (Prisma). The workspace is resolved SERVER-SIDE from the session (never a
 * client-supplied tenant), so one account can never see or change another's
 * services. A missing row = locked, so a fresh workspace starts clean. Replaces
 * the old external-service proxy + global mock that leaked state across users.
 *
 *   GET                                   → this workspace's 5 service states
 *   POST { action:'activate'|'start_trial'|'checkout', agent }
 * Activating/trialing requires the caller to have `<service>.manage` permission.
 */

const SERVICES = ['website', 'receptionist', 'seo', 'marketing', 'content'] as const;
type Service = (typeof SERVICES)[number];

function lockedAll() {
  return SERVICES.map((agent) => ({ agent, state: 'locked' as const, trial_ends_at: null }));
}

export async function GET() {
  try {
    const ctx = await getCurrentMembership();
    if (!ctx) return NextResponse.json({ backendUp: true, entitlements: lockedAll() });

    const rows = await prisma.workspaceService.findMany({ where: { workspaceId: ctx.membership.workspaceId } });
    const byKey = new Map(rows.map((r) => [r.serviceKey, r]));
    const entitlements = SERVICES.map((agent) => {
      const r = byKey.get(agent);
      return { agent, state: r?.status ?? 'locked', trial_ends_at: r?.trialEndsAt?.toISOString() ?? null };
    });
    return NextResponse.json({ backendUp: true, entitlements }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    // Never crash the dashboard — degrade to all-locked (safe) and log for ops.
    console.error('[entitlements] GET failed:', e?.message);
    return NextResponse.json({ backendUp: true, entitlements: lockedAll() }, { headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(req: Request) {
  const ctx = await getCurrentMembership();
  if (!ctx) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { action?: string; agent?: string };
  const agent = body.agent as Service;
  if (!SERVICES.includes(agent)) return NextResponse.json({ ok: false, error: 'unknown service' }, { status: 400 });

  // Managing a service (activate / start trial) requires the manage permission.
  if (!can(ctx.membership, `${agent}.manage` as Permission)) {
    return NextResponse.json({ ok: false, error: 'You do not have permission to manage this service.' }, { status: 403 });
  }

  const workspaceId = ctx.membership.workspaceId;

  if (body.action === 'checkout') {
    // Paid unlock flows go through billing (in-shell), never a global backend.
    return NextResponse.json({ ok: true, checkout_url: `/pixie-lab/billing?plan=${agent}` });
  }

  if (body.action === 'start_trial') {
    const now = new Date();
    const ends = new Date(now.getTime() + 7 * 86_400_000);
    await prisma.workspaceService.upsert({
      where: { workspaceId_serviceKey: { workspaceId, serviceKey: agent } },
      create: { workspaceId, serviceKey: agent, status: 'trial', trialStartedAt: now, trialEndsAt: ends, activatedBy: ctx.user.id },
      update: { status: 'trial', trialStartedAt: now, trialEndsAt: ends, activatedBy: ctx.user.id },
    });
    return NextResponse.json({ ok: true, state: 'trial' });
  }

  // default: activate
  await prisma.workspaceService.upsert({
    where: { workspaceId_serviceKey: { workspaceId, serviceKey: agent } },
    create: { workspaceId, serviceKey: agent, status: 'active', activatedBy: ctx.user.id },
    update: { status: 'active', activatedBy: ctx.user.id },
  });
  return NextResponse.json({ ok: true, state: 'active' });
}
