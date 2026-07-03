/**
 * RBAC permission model for Pixie Lab workspaces. Explicit permission keys drive
 * access; roles are convenience presets. Server code is the source of truth —
 * the UI mirrors these but never decides access on its own.
 */

export const PERMISSIONS = [
  'workspace.view', 'workspace.manage',
  'members.view', 'members.invite', 'members.remove', 'members.update_role',
  'billing.view', 'billing.manage',
  'profile.manage_self',
  'website.view', 'website.manage',
  'receptionist.view', 'receptionist.manage',
  'seo.view', 'seo.manage',
  'marketing.view', 'marketing.manage',
  'content.view', 'content.manage',
  'approvals.view', 'approvals.manage',
  'activity.view',
  'settings.view', 'settings.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type Role = 'owner' | 'admin' | 'manager' | 'member' | 'viewer';

const ALL = [...PERMISSIONS] as Permission[];
const VIEW: Permission[] = [
  'workspace.view', 'members.view', 'billing.view',
  'website.view', 'receptionist.view', 'seo.view', 'marketing.view', 'content.view',
  'approvals.view', 'activity.view', 'settings.view', 'profile.manage_self',
];
const SERVICE_MANAGE: Permission[] = [
  'website.manage', 'receptionist.manage', 'seo.manage', 'marketing.manage', 'content.manage', 'approvals.manage',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL,
  admin: ALL, // full access; owner-only actions (transfer, remove admins) gated by role in logic
  manager: [...VIEW, ...SERVICE_MANAGE, 'members.invite'],
  member: [...VIEW, ...SERVICE_MANAGE],
  viewer: [...VIEW],
};

export const ROLES: Role[] = ['owner', 'admin', 'manager', 'member', 'viewer'];

/** Default permission set for a role (used to seed an invite). */
export function permissionsForRole(role: Role): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.viewer)];
}

/** Effective check: owners always pass; otherwise the stored permission list. */
export function hasPermission(role: Role | string, permissions: unknown, perm: Permission): boolean {
  if (role === 'owner') return true;
  const list = Array.isArray(permissions) ? (permissions as string[]) : [];
  return list.includes(perm);
}
