import { NextResponse } from 'next/server';
import { validateEmailForSignup } from '@/lib/email-validation';
import { emailExists } from '@/lib/auth-admin';
import { rateLimitCheck, getClientIp } from '@/lib/swipeRateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/signup-precheck — validates the email (format/domain/disposable)
 * and checks whether an account already exists, all server-side. Returns a
 * status the signup form acts on:
 *   'invalid' → show reason
 *   'exists'  → show the safe "if an account exists…" message + sign-in path
 *   'ok'      → proceed with signUp + OTP
 * The raw existence boolean is never returned; the response is rate-limited to
 * slow enumeration probing.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limit = rateLimitCheck(`signup-precheck:${ip}`);
  if (!limit.ok) {
    return NextResponse.json({ status: 'invalid', reason: 'Too many attempts. Please wait a moment.' }, { status: 429 });
  }

  let email = '';
  try {
    const body = (await req.json()) as { email?: string };
    email = String(body?.email ?? '');
  } catch {
    return NextResponse.json({ status: 'invalid', reason: 'Please enter a valid email address.' }, { status: 400 });
  }

  const v = await validateEmailForSignup(email);
  if (!v.canProceed) {
    return NextResponse.json({ status: 'invalid', reason: v.reason });
  }

  try {
    if (await emailExists(email)) {
      return NextResponse.json({ status: 'exists' });
    }
  } catch {
    // If the existence check fails, fail open to signUp — Supabase's own
    // anti-enumeration will still prevent a true duplicate.
    return NextResponse.json({ status: 'ok' });
  }

  return NextResponse.json({ status: 'ok' });
}
