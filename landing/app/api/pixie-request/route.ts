import { NextResponse } from 'next/server';
import { rateLimitCheck, getClientIp } from '@/lib/swipeRateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Where each Pixie service-page setup request is emailed, via FormSubmit
// (formsubmit.co — no API key). Reuses the waitlist recipient if a dedicated
// one isn't set. ONE-TIME: the first send to a new address triggers a
// FormSubmit confirmation email — click its link once to activate delivery.
const LEAD_EMAIL =
  process.env.PIXIE_REQUEST_EMAIL || process.env.WAITLIST_LEAD_EMAIL || 'bytesuite@bytesplatform.com';

interface PixieRequestBody {
  service?: string;
  slug?: string;
  packageName?: string;
  emailSubject?: string;
  selectedAddOns?: string[];
  addOnFollowUps?: Record<string, string>;
  contactName?: string;
  email?: string;
  businessName?: string;
  link?: string;
  notes?: string;
}

/** Email one setup request to LEAD_EMAIL via FormSubmit's AJAX endpoint. */
async function notifyAdmin(
  payload: Record<string, string>,
  subject: string,
  origin: string,
  referer: string,
): Promise<boolean> {
  if (!LEAD_EMAIL || LEAD_EMAIL.includes('example.com')) {
    console.warn('[pixie-request] recipient not set — request logged only');
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
      _subject: subject,
      _template: 'table',
      _captcha: 'false',
      ...payload,
    }),
  });

  if (!res.ok) {
    console.error('[pixie-request] FormSubmit error', res.status, await res.text().catch(() => ''));
    return false;
  }
  const data = (await res.json().catch(() => null)) as { success?: string; message?: string } | null;
  if (data?.success !== 'true') {
    console.error('[pixie-request] FormSubmit not delivered', data?.message ?? '(no message)');
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

  let body: PixieRequestBody;
  try {
    body = (await req.json()) as PixieRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const email = String(body?.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 422 });
  }

  const clip = (v: unknown, n = 200) => String(v ?? '').trim().slice(0, n);
  const service = clip(body?.service) || 'Pixie';
  const addOns = Array.isArray(body?.selectedAddOns)
    ? body.selectedAddOns.map((a) => clip(a, 80)).filter(Boolean).slice(0, 10)
    : [];
  const followUps =
    body?.addOnFollowUps && typeof body.addOnFollowUps === 'object'
      ? Object.entries(body.addOnFollowUps)
          .map(([k, v]) => `${clip(k, 60)}: ${clip(v, 120)}`)
          .slice(0, 10)
          .join(' | ')
      : '';

  const subject = clip(body?.emailSubject, 120) || `New Pixie ${service} Request`;

  const payload: Record<string, string> = {
    Service: service,
    Package: clip(body?.packageName) || '—',
    Name: clip(body?.contactName) || '—',
    Email: email,
    Business: clip(body?.businessName) || '—',
    Link: clip(body?.link) || '—',
    'Add-ons': addOns.length ? addOns.join(', ') : '—',
    'Add-on choices': followUps || '—',
    Notes: clip(body?.notes, 1000) || '—',
    Source: `Pixie service page (${clip(body?.slug, 60) || 'unknown'})`,
  };

  console.log('[pixie-request] request', { ...payload, ip });

  const origin = req.headers.get('origin') || new URL(req.url).origin;
  const referer = req.headers.get('referer') || origin;
  const delivered = await notifyAdmin(payload, subject, origin, referer).catch((err) => {
    console.error('[pixie-request] notifyAdmin threw', err);
    return false;
  });

  // Surface a real failure so the UI never fakes success when email is broken.
  if (!delivered) {
    return NextResponse.json(
      { error: 'We could not send your request right now. Please try again or reach us on WhatsApp.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
