import type { User } from '@supabase/supabase-js';

/**
 * The backend is multi-tenant on a free-form `tenant_id` string (passed in the
 * request body / query). We derive a stable tenant from the Supabase user id so
 * every signed-in user gets their own isolated workspace. A custom tenant can
 * be stored in user_metadata.tenant later (e.g. for teams) and wins if present.
 */
export function tenantForUser(user: Pick<User, 'id' | 'user_metadata'> | null | undefined): string {
  if (!user) return 'demo';
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const custom = typeof meta.tenant === 'string' ? meta.tenant.trim() : '';
  if (custom) return custom;
  return `t_${user.id.slice(0, 12)}`;
}

/** A friendly display name from metadata or the email local-part. */
export function displayName(user: Pick<User, 'email' | 'user_metadata'> | null | undefined): string {
  if (!user) return 'there';
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const name = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : '';
  if (name) return name;
  const email = user.email || '';
  return email ? email.split('@')[0] : 'there';
}
