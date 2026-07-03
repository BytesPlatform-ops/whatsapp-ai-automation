import 'server-only';
import { prisma } from '@/lib/prisma';

/**
 * Server-only auth admin helpers. `emailExists` checks Supabase's auth.users via
 * the Prisma direct connection (the pooler user can read the auth schema). Used
 * to prevent duplicate signups and to route existing users to a safe login path.
 * NEVER expose the raw boolean to the public client — return safe messaging.
 */
export async function emailExists(email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  if (!e) return false;
  const rows = await prisma.$queryRaw<Array<{ one: number }>>`
    SELECT 1 AS one FROM auth.users WHERE lower(email) = ${e} LIMIT 1
  `;
  return Array.isArray(rows) && rows.length > 0;
}
