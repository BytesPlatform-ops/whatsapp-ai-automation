import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { hashToken } from '@/lib/invitations';
import { permissionsForRole, type Role } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/invite/accept { token } — validates a (hashed) invite token, and if
 * the signed-in user's email matches, adds them to the workspace and marks the
 * invite accepted. Returns { needsAuth } when nobody is signed in yet, so the
 * page can send the invitee through OTP signup/login first.
 */
export async function POST(req: Request) {
  const token = String(((await req.json().catch(() => ({}))) as { token?: string }).token ?? '');
  if (!token) return NextResponse.json({ error: 'Invalid invitation link.' }, { status: 400 });

  const invite = await prisma.workspaceInvitation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!invite || invite.status !== 'pending') return NextResponse.json({ error: 'This invitation is no longer valid.' }, { status: 400 });
  if (invite.expiresAt < new Date()) {
    await prisma.workspaceInvitation.update({ where: { id: invite.id }, data: { status: 'expired' } }).catch(() => {});
    return NextResponse.json({ error: 'This invitation has expired.' }, { status: 400 });
  }

  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ needsAuth: true, email: invite.email });

  if ((user.email ?? '').toLowerCase() !== invite.email.toLowerCase()) {
    return NextResponse.json({ error: 'This invitation is for a different email address.' }, { status: 403 });
  }

  const permissions = Array.isArray(invite.permissions) && (invite.permissions as unknown[]).length
    ? (invite.permissions as string[])
    : permissionsForRole(invite.role as Role);

  await prisma.$transaction([
    prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
      create: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role, permissions, status: 'active', invitedBy: invite.invitedBy, joinedAt: new Date() },
      update: { role: invite.role, permissions, status: 'active' },
    }),
    prisma.workspaceInvitation.update({ where: { id: invite.id }, data: { status: 'accepted', acceptedAt: new Date() } }),
  ]);

  return NextResponse.json({ ok: true, workspaceId: invite.workspaceId });
}
