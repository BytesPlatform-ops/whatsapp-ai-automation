import { NextResponse } from 'next/server';
import { rateLimitCheck, getClientIp } from '@/lib/swipeRateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Where each Join Pixie waitlist lead is emailed, via FormSubmit (formsubmit.co
// — no API key needed). Set WAITLIST_LEAD_EMAIL on the app, or edit the fallback.
//
// ONE-TIME SETUP: the first time FormSubmit sends to a new address it emails a
// confirmation link to that address — click it once to activate delivery.
const LEAD_EMAIL = process.env.WAITLIST_LEAD_EMAIL || 'bytesuite@bytesplatform.com';

interface WaitlistRequest {
  email: string;
  roles?: number;
  name?: string;
  business?: string;
  contact?: string;
}

interface Signup {
  email: string;
  roles: number;
  name: string;
  business: string;
  contact: string;
}

/** Email each waitlist lead to LEAD_EMAIL via FormSubmit's AJAX endpoint. */
async function notifyAdmin(s: Signup, origin: string, referer: string): Promise<boolean> {
  if (!LEAD_EMAIL || LEAD_EMAIL.includes('example.com')) {
    console.warn('[waitlist] WAITLIST_LEAD_EMAIL not set — signup logged only');
    return false;
  }

  const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(LEAD_EMAIL)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // FormSubmit rejects header-less server-to-server calls ("open this page
      // through a web server"); forward the site's origin so it accepts them.
      Origin: origin,
      Referer: referer,
    },
    body: JSON.stringify({
      _subject: `🎉 New Pixie waitlist lead — ${s.name || s.email}`,
      _template: 'table',
      _captcha: 'false',
      Name: s.name || '—',
      Business: s.business || '—',
      Contact: s.contact || '—',
      Email: s.email,
      'Roles picked': `${s.roles} / 6`,
      Source: 'Join Pixie waitlist',
    }),
  });

  if (!res.ok) {
    console.error('[waitlist] FormSubmit error', res.status, await res.text().catch(() => ''));
    return false;
  }
  const data = (await res.json().catch(() => null)) as { success?: string; message?: string } | null;
  if (data?.success !== 'true') {
    console.error('[waitlist] FormSubmit not delivered', data?.message ?? '(no message)');
    return false;
  }
  return true;
}

export async function POST(req: Request): Promise<NextResponse<{ ok: true } | { error: string }>> {
  const ip = getClientIp(req);
  const limit = rateLimitCheck(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many requests. Retry in ${limit.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } },
    );
  }

  let body: WaitlistRequest;
  try {
    body = (await req.json()) as WaitlistRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const email = String(body?.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 422 });
  }

  const roles = Number.isFinite(body?.roles) ? Math.max(0, Math.min(6, Number(body.roles))) : 0;
  const clip = (v: unknown) => String(v ?? '').trim().slice(0, 120);
  const signup: Signup = {
    email,
    roles,
    name: clip(body?.name),
    business: clip(body?.business),
    contact: clip(body?.contact),
  };

  console.log('[waitlist] signup', { ...signup, ip });

  const origin = req.headers.get('origin') || new URL(req.url).origin;
  const referer = req.headers.get('referer') || `${origin}/join-pixie`;
  const delivered = await notifyAdmin(signup, origin, referer).catch((err) => {
    console.error('[waitlist] notifyAdmin threw', err);
    return false;
  });

  // Surface a real failure instead of faking success when delivery is broken.
  if (!delivered) {
    return NextResponse.json(
      { error: 'We could not send your signup right now. Please try again shortly.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
