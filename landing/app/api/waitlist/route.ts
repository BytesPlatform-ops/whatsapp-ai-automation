import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { rateLimitCheck, getClientIp } from '@/lib/swipeRateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Each Join Pixie waitlist lead is emailed here.
const LEAD_EMAIL = process.env.WAITLIST_LEAD_EMAIL || 'bytesuite@bytesplatform.com';

// Sender. The default onboarding@resend.dev needs NO domain verification, but in
// Resend test mode it only delivers to YOUR Resend account's own email — which is
// fine when that account is bytesuite@bytesplatform.com. For other recipients or
// production volume, verify a domain in Resend and set
// RESEND_FROM="Pixie <noreply@bytesplatform.com>".
const FROM = process.env.RESEND_FROM || 'Pixie Waitlist <onboarding@resend.dev>';

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

function esc(v: string): string {
  return v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

/** Email one waitlist lead to LEAD_EMAIL via Resend (works from Vercel — unlike
 *  FormSubmit, whose CDN 403-blocks datacenter IPs). */
async function notifyAdmin(s: Signup): Promise<{ ok: boolean; detail: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[waitlist] RESEND_API_KEY not set — signup logged only');
    return { ok: false, detail: 'no-api-key' };
  }

  const rows: [string, string][] = [
    ['Name', s.name || '—'],
    ['Business', s.business || '—'],
    ['Contact', s.contact || '—'],
    ['Email', s.email],
    ['Roles picked', `${s.roles} / 6`],
  ];
  const html =
    `<h2 style="font-family:system-ui">🎉 New Pixie waitlist lead</h2>` +
    `<table cellpadding="8" style="border-collapse:collapse;font-family:system-ui;font-size:14px">` +
    rows
      .map(
        ([k, v]) =>
          `<tr><td style="border:1px solid #e2e8f0;background:#f8fafc"><b>${esc(k)}</b></td>` +
          `<td style="border:1px solid #e2e8f0">${esc(v)}</td></tr>`,
      )
      .join('') +
    `</table><p style="color:#94a3b8;font-family:system-ui;font-size:12px">Source: Join Pixie waitlist</p>`;

  try {
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [LEAD_EMAIL],
      subject: `🎉 New Pixie waitlist lead — ${s.name || s.email}`,
      html,
    });
    if (error) {
      console.error('[waitlist] Resend error', error);
      return { ok: false, detail: `resend:${error.name || ''} ${error.message || ''}`.trim() };
    }
    return { ok: true, detail: data?.id || 'sent' };
  } catch (err: any) {
    console.error('[waitlist] Resend threw', err);
    return { ok: false, detail: `threw:${err?.message ?? 'unknown'}` };
  }
}

export async function POST(req: Request): Promise<NextResponse> {
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

  const result = await notifyAdmin(signup).catch((err) => {
    console.error('[waitlist] notifyAdmin threw', err);
    return { ok: false, detail: `threw:${err?.message ?? 'unknown'}` };
  });

  if (!result.ok) {
    // Don't expose internals to visitors; the reason is in the server logs.
    console.error('[waitlist] delivery failed:', result.detail);
    return NextResponse.json(
      { error: 'We could not send your signup right now. Please try again shortly.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
