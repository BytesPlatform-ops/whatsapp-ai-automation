import { request as httpsRequest } from 'node:https';
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

/** POST JSON via node:https. Node's fetch()/undici treats Origin & Referer as
 *  forbidden request headers and silently strips them (works on newer local
 *  Node, dropped on Vercel's runtime) — and FormSubmit rejects header-less calls
 *  ("open this page through a web server"). The low-level https client sends the
 *  headers verbatim on every runtime, so delivery works in production. */
function postFormSubmit(
  url: string,
  payload: Record<string, unknown>,
  origin: string,
  referer: string,
): Promise<{ status: number; json: { success?: string; message?: string } | null }> {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const u = new URL(url);
    const req = httpsRequest(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Origin: origin,
          Referer: referer,
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let json: { success?: string; message?: string } | null = null;
          try {
            json = JSON.parse(raw);
          } catch {
            /* non-JSON response */
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on('error', () => resolve({ status: 0, json: null }));
    req.write(data);
    req.end();
  });
}

/** Email each waitlist lead to LEAD_EMAIL via FormSubmit's AJAX endpoint. */
async function notifyAdmin(s: Signup, origin: string, referer: string): Promise<boolean> {
  if (!LEAD_EMAIL || LEAD_EMAIL.includes('example.com')) {
    console.warn('[waitlist] WAITLIST_LEAD_EMAIL not set — signup logged only');
    return false;
  }

  const { status, json } = await postFormSubmit(
    `https://formsubmit.co/ajax/${encodeURIComponent(LEAD_EMAIL)}`,
    {
      _subject: `🎉 New Pixie waitlist lead — ${s.name || s.email}`,
      _template: 'table',
      _captcha: 'false',
      Name: s.name || '—',
      Business: s.business || '—',
      Contact: s.contact || '—',
      Email: s.email,
      'Roles picked': `${s.roles} / 6`,
      Source: 'Join Pixie waitlist',
    },
    origin,
    referer,
  );

  if (status < 200 || status >= 300) {
    console.error('[waitlist] FormSubmit HTTP error', status);
    return false;
  }
  if (json?.success !== 'true') {
    console.error('[waitlist] FormSubmit not delivered', json?.message ?? '(no message)');
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
