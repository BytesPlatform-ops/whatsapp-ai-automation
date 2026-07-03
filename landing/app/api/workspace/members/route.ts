import { NextResponse } from 'next/server';
import { getCurrentMembership, can } from '@/lib/workspace';
import { prisma } from '@/lib/prisma';
import { ROLES, permissionsForRole, type Role } from '@/lib/permissions';
import { generateInviteToken, inviteExpiry, sendInviteEmail } from '@/lib/invitations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INVITABLE: Role[] = ['admin', 'manager', 'member', 'viewer'];

async function emailsFor(userIds: string[]): Promise<Record<string, { email: string | null; name: string | null }>> {
  const map: Record<string, { email: string | null; name: string | null }> = {};
  if (!userIds.length) return map;
  const profiles = await prisma.profile.findMany({ where: { id: { in: userIds } } });
  for (const p of profiles) map[p.id] = { email: p.email, name: p.fullName };
  const missing = userIds.filter((id) => !map[id]);
  if (missing.length) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; email: string | null }>>(
      `SELECT id::text AS id, email FROM auth.users WHERE id = ANY($1::uuid[])`, missing,
    );
    for (const r of rows) map[r.id] = { email: r.email, name: null };
  }
  return map;
}

// GET — list members + pending invitations (requires members.view)
export async function GET() {
  const ctx = await getCurrentMembership();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!can(ctx.membership, 'members.view')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const wid = ctx.membership.workspaceId;
  const [members, invitations] = await Promise.all([
    prisma.workspaceMember.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: 'asc' } }),
    prisma.workspaceInvitation.findMany({ where: { workspaceId: wid, status: 'pending' }, orderBy: { createdAt: 'desc' } }),
  ]);
  const info = await emailsFor(members.map((m) => m.userId));

  return NextResponse.json({
    me: { userId: ctx.user.id, role: ctx.membership.role, canInvite: can(ctx.membership, 'members.invite'), canRemove: can(ctx.membership, 'members.remove'), canUpdateRole: can(ctx.membership, 'members.update_role') },
    members: members.map((m) => ({
      id: m.id, userId: m.userId, role: m.role, status: m.status,
      permissions: m.permissions, joinedAt: m.joinedAt,
      email: info[m.userId]?.email ?? null, name: info[m.userId]?.name ?? null,
      isSelf: m.userId === ctx.user.id,
    })),
    invitations: invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, status: i.status, expiresAt: i.expiresAt })),
    roles: ROLES.filter((r) => r !== 'owner'),
  });
}

// POST — invite a member by email (requires members.invite)
export async function POST(req: Request) {
  const ctx = await getCurrentMembership();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!can(ctx.membership, 'members.invite')) return NextResponse.json({ error: 'You do not have permission to invite members.' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { email?: string; role?: string; permissions?: string[] };
  const email = String(body.email ?? '').trim().toLowerCase();
  const role = (INVITABLE.includes(body.role as Role) ? body.role : 'member') as Role;
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 422 });

  const wid = ctx.membership.workspaceId;
  // Already a member?
  const existingUser = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id::text AS id FROM auth.users WHERE lower(email)=$1 LIMIT 1`, email);
  if (existingUser[0]) {
    const m = await prisma.workspaceMember.findFirst({ where: { workspaceId: wid, userId: existingUser[0].id } });
    if (m) return NextResponse.json({ error: 'That person is already a member.' }, { status: 409 });
  }
  // Pending invite already?
  const pending = await prisma.workspaceInvitation.findFirst({ where: { workspaceId: wid, email, status: 'pending' } });
  if (pending) return NextResponse.json({ error: 'An invite is already pending for that email.' }, { status: 409 });

  const permissions = Array.isArray(body.permissions) && body.permissions.length ? body.permissions : permissionsForRole(role);
  const { token, tokenHash } = generateInviteToken();
  await prisma.workspaceInvitation.create({
    data: { workspaceId: wid, email, role, permissions, tokenHash, invitedBy: ctx.user.id, expiresAt: inviteExpiry() },
  });

  const origin = req.headers.get('origin') || new URL(req.url).origin;
  const emailed = await sendInviteEmail({ to: email, inviteUrl: `${origin}/invite/accept?token=${token}`, workspaceName: ctx.membership.workspaceName, inviterEmail: ctx.user.email });
  return NextResponse.json({ ok: true, emailed });
}

// PATCH — change a member's role/permissions (requires members.update_role)
export async function PATCH(req: Request) {
  const ctx = await getCurrentMembership();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!can(ctx.membership, 'members.update_role')) return NextResponse.json({ error: 'You do not have permission to change roles.' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { memberId?: string; role?: string; permissions?: string[] };
  const role = body.role as Role;
  if (!INVITABLE.includes(role)) return NextResponse.json({ error: 'Invalid role.' }, { status: 422 });

  const target = await prisma.workspaceMember.findFirst({ where: { id: String(body.memberId ?? ''), workspaceId: ctx.membership.workspaceId } });
  if (!target) return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
  if (target.role === 'owner') return NextResponse.json({ error: 'The owner’s role can’t be changed here.' }, { status: 403 });
  // Only the owner may touch admins.
  if (target.role === 'admin' && ctx.membership.role !== 'owner') return NextResponse.json({ error: 'Only the owner can change an admin.' }, { status: 403 });

  const permissions = Array.isArray(body.permissions) && body.permissions.length ? body.permissions : permissionsForRole(role);
  const updated = await prisma.workspaceMember.update({ where: { id: target.id }, data: { role, permissions } });
  return NextResponse.json({ ok: true, member: { id: updated.id, role: updated.role } });
}

// DELETE — remove a member or cancel an invitation
export async function DELETE(req: Request) {
  const ctx = await getCurrentMembership();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { kind?: string; id?: string };
  const id = String(body.id ?? '');
  const wid = ctx.membership.workspaceId;

  if (body.kind === 'invite') {
    if (!can(ctx.membership, 'members.invite')) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
    await prisma.workspaceInvitation.updateMany({ where: { id, workspaceId: wid, status: 'pending' }, data: { status: 'revoked' } });
    return NextResponse.json({ ok: true });
  }

  if (!can(ctx.membership, 'members.remove')) return NextResponse.json({ error: 'You do not have permission to remove members.' }, { status: 403 });
  const target = await prisma.workspaceMember.findFirst({ where: { id, workspaceId: wid } });
  if (!target) return NextResponse.json({ error: 'Member not found.' }, { status: 404 });

  if (target.role === 'owner') {
    const owners = await prisma.workspaceMember.count({ where: { workspaceId: wid, role: 'owner' } });
    if (owners <= 1) return NextResponse.json({ error: 'You can’t remove the only owner.' }, { status: 403 });
  }
  if (target.role === 'admin' && ctx.membership.role !== 'owner') return NextResponse.json({ error: 'Only the owner can remove an admin.' }, { status: 403 });

  await prisma.workspaceMember.delete({ where: { id: target.id } });
  return NextResponse.json({ ok: true });
}
