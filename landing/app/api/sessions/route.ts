import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/swipeRateLimit';
import { recordSession, sessionIdFromJwt } from '@/lib/session-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /api/sessions — the caller's active sessions (user_sessions).
 * GET → records/touches the current session, then returns the list (current flagged).
 * POST { sessionId } → revoke a session. Revoking the CURRENT one signs you out.
 *   (Supabase has no per-session server revoke for OTHER devices, so those are
 *    marked revoked in-app and fully end on their next token refresh.)
 */
async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: { session } } = await supabase.auth.getSession();
  const currentSessionId = sessionIdFromJwt(session?.access_token);
  return { supabase, user, currentSessionId };
}

export async function GET(req: Request) {
  const { user, currentSessionId } = await ctx();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  await recordSession({
    userId: user.id,
    sessionId: currentSessionId,
    userAgent: req.headers.get('user-agent') ?? '',
    ip: getClientIp(req),
  }).catch(() => {});

  const rows = await prisma.userSession.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { lastSeenAt: 'desc' },
  });
  const sessions = rows.map((s) => ({
    id: s.id,
    sessionId: s.sessionId,
    deviceLabel: s.deviceLabel,
    lastSeenAt: s.lastSeenAt,
    current: s.sessionId === currentSessionId,
  }));
  return NextResponse.json({ sessions });
}

export async function POST(req: Request) {
  const { supabase, user, currentSessionId } = await ctx();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let sessionRowId = '';
  try { sessionRowId = String(((await req.json()) as { sessionId?: string }).sessionId ?? ''); } catch { /* */ }
  if (!sessionRowId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });

  // Only the owner's own rows.
  const row = await prisma.userSession.findFirst({ where: { id: sessionRowId, userId: user.id } });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.userSession.update({ where: { id: row.id }, data: { revokedAt: new Date() } });

  const isCurrent = row.sessionId === currentSessionId;
  if (isCurrent) {
    try { await supabase.auth.signOut(); } catch { /* */ }
  }
  return NextResponse.json({ ok: true, current: isCurrent });
}
