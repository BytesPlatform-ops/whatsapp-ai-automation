import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /api/notifications — the caller's email notification preferences
 * (notification_preferences via Prisma). GET seeds+returns; PATCH updates.
 * Security emails are critical and cannot be turned off (always coerced true).
 */
async function currentUser() {
  try { return (await createClient().auth.getUser()).data.user; } catch { return null; }
}

const KEYS = ['emailLeads', 'emailApprovals', 'emailBilling', 'productUpdates', 'weeklySummary'] as const;

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const prefs = await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  });
  return NextResponse.json({ prefs });
}

export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* */ }

  const update: Record<string, boolean> = {};
  for (const k of KEYS) if (typeof body[k] === 'boolean') update[k] = body[k] as boolean;
  update.emailSecurity = true; // critical — never disabled

  const prefs = await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...update },
    update,
  });
  return NextResponse.json({ prefs });
}
