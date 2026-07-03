import 'server-only';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { permissionsForRole, hasPermission, type Permission, type Role } from '@/lib/permissions';

/**
 * Workspace + membership resolution (server-only). Every user gets a personal
 * workspace with an owner membership on first access; team RBAC (invites, extra
 * members) builds on top of this. Permission checks live here — never trust the
 * client.
 */
export interface Membership { workspaceId: string; userId: string; role: Role; permissions: string[]; workspaceName: string }

async function membershipOf(userId: string): Promise<Membership | null> {
  const m = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: { workspace: true },
  });
  return m ? { workspaceId: m.workspaceId, userId, role: m.role as Role, permissions: (m.permissions as string[]) ?? [], workspaceName: m.workspace.name } : null;
}

export async function ensureWorkspace(user: { id: string; email?: string | null }): Promise<Membership> {
  const existing = await membershipOf(user.id);
  if (existing) return existing;

  // Deterministic slug per user, so concurrent first-load requests collide on the
  // unique slug instead of creating duplicate workspaces.
  const base = (user.email?.split('@')[0] || 'My').replace(/[^a-z0-9]/gi, '') || 'workspace';
  const slug = `${base.toLowerCase()}-${user.id.slice(0, 8)}`;
  try {
    const ws = await prisma.workspace.create({
      data: {
        name: `${user.email?.split('@')[0] || 'My'}'s workspace`,
        slug,
        ownerId: user.id,
        members: { create: { userId: user.id, role: 'owner', permissions: permissionsForRole('owner'), status: 'active', joinedAt: new Date() } },
      },
      include: { members: true },
    });
    return { workspaceId: ws.id, userId: user.id, role: 'owner', permissions: (ws.members[0].permissions as string[]) ?? [], workspaceName: ws.name };
  } catch (e) {
    // Race: a concurrent request already created this user's workspace
    // (unique slug / workspace_members constraint). Return the existing one.
    const again = await membershipOf(user.id);
    if (again) return again;
    throw e;
  }
}

/** The signed-in user + their primary workspace membership (creates one if none). */
export async function getCurrentMembership(): Promise<{ user: { id: string; email: string | null }; membership: Membership } | null> {
  let user = null;
  try { user = (await createClient().auth.getUser()).data.user; } catch { user = null; }
  if (!user) return null;
  const membership = await ensureWorkspace(user);
  return { user: { id: user.id, email: user.email ?? null }, membership };
}

export function can(membership: Pick<Membership, 'role' | 'permissions'>, perm: Permission): boolean {
  return hasPermission(membership.role, membership.permissions, perm);
}

function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Server-side route guard for a page. Allows demo mode (no Supabase) so local
 *  preview still works; otherwise requires the permission on the caller's
 *  membership. Returns { ok } — the page renders <AccessRestricted /> when false. */
export async function guardPermission(perm: Permission): Promise<{ ok: boolean; membership: Membership | null }> {
  if (!supabaseConfigured()) return { ok: true, membership: null };
  const ctx = await getCurrentMembership();
  if (!ctx) return { ok: false, membership: null };
  return { ok: can(ctx.membership, perm), membership: ctx.membership };
}
