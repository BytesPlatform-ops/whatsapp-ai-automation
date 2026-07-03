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

export async function ensureWorkspace(user: { id: string; email?: string | null }): Promise<Membership> {
  const existing = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    include: { workspace: true },
  });
  if (existing) {
    return { workspaceId: existing.workspaceId, userId: user.id, role: existing.role as Role, permissions: (existing.permissions as string[]) ?? [], workspaceName: existing.workspace.name };
  }
  const base = (user.email?.split('@')[0] || 'My').replace(/[^a-z0-9]/gi, '') || 'workspace';
  const slug = `${base.toLowerCase()}-${user.id.slice(0, 8)}`;
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
