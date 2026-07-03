import { NextResponse } from 'next/server';
import { validateEmailForSignup } from '@/lib/email-validation';
import { rateLimitCheck, getClientIp } from '@/lib/swipeRateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/validate-email — pre-signup email validation (format, domain
 * MX/A, disposable). Returns only a SAFE, non-enumerating result to the client:
 * { canProceed, reason? }. The full internal breakdown never leaves the server.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limit = rateLimitCheck(`validate-email:${ip}`);
  if (!limit.ok) {
    return NextResponse.json({ canProceed: false, reason: 'Too many attempts. Please wait a moment.' }, { status: 429 });
  }

  let email = '';
  try {
    const body = (await req.json()) as { email?: string };
    email = String(body?.email ?? '');
  } catch {
    return NextResponse.json({ canProceed: false, reason: 'Please enter a valid email address.' }, { status: 400 });
  }

  const v = await validateEmailForSignup(email);
  return NextResponse.json({ canProceed: v.canProceed, reason: v.canProceed ? undefined : v.reason });
}
