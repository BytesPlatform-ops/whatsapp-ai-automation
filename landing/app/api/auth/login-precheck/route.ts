import { NextResponse } from 'next/server';
import { emailExists } from '@/lib/auth-admin';
import { rateLimitCheck, getClientIp } from '@/lib/swipeRateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/login-precheck — called ONLY after Supabase has already rejected
 * a sign-in with its generic "Invalid login credentials" (which is returned for
 * both a wrong password and a non-existent account). This lets the login form
 * show the accurate reason: "no account on this email" vs. "wrong password".
 * Rate-limited to slow enumeration probing.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (!rateLimitCheck(`login-precheck:ip:${ip}`).ok) {
    return NextResponse.json({ exists: true }, { status: 429 });
  }

  let email = '';
  try {
    const body = (await req.json()) as { email?: string };
    email = String(body?.email ?? '').trim().toLowerCase();
  } catch {
    return NextResponse.json({ exists: true }, { status: 400 });
  }

  // Per-email limit too, so an attacker rotating IPs can't cheaply enumerate a
  // single address (and one IP can't sweep many addresses without hitting the
  // IP bucket above). Disclosure here is consistent with signup-precheck.
  if (email && !rateLimitCheck(`login-precheck:email:${email}`).ok) {
    return NextResponse.json({ exists: true }, { status: 429 });
  }

  try {
    const exists = await emailExists(email);
    return NextResponse.json({ exists });
  } catch {
    // Fail closed to the generic path — assume the account might exist.
    return NextResponse.json({ exists: true });
  }
}
