import 'server-only';
import { prisma } from '@/lib/prisma';
import { emailExistsViaAdmin } from '@/lib/supabase/admin';

/**
 * Server-only auth admin helpers. `emailExists` checks whether an account exists
 * for an email. Primary path is a fast, indexed raw query against Supabase's
 * auth.users over the Prisma direct connection; if that connection hiccups we
 * retry once and then fall back to the GoTrue admin API (service-role) so a
 * single transient failure doesn't degrade the answer. Used to prevent duplicate
 * signups and to route existing users to a safe login path. NEVER expose the raw
 * boolean to the public client — return safe messaging.
 */
async function emailExistsViaPrisma(email: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ one: number }>>`
    SELECT 1 AS one FROM auth.users WHERE lower(email) = ${email} LIMIT 1
  `;
  return Array.isArray(rows) && rows.length > 0;
}

export async function emailExists(email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  if (!e) return false;

  // Primary: Prisma direct connection, with one retry for transient blips.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await emailExistsViaPrisma(e);
    } catch {
      // fall through to retry / admin fallback
    }
  }

  // Fallback: GoTrue admin API. Returns null when it can't be certain.
  const viaAdmin = await emailExistsViaAdmin(e);
  if (viaAdmin !== null) return viaAdmin;

  // Both sources failed — surface the failure so callers decide the safe default.
  throw new Error('emailExists: all lookup strategies failed');
}
