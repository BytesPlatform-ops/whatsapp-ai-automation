import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { rateLimitCheck, getClientIp } from '@/lib/swipeRateLimit';
import { storeLead, fetchLeadCount } from '@/lib/waitlistStore';

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
  selected?: string[];
  rejected?: string[];
}

interface Signup {
  email: string;
  roles: number;
  name: string;
  business: string;
  contact: string;
  selected: string[];
  rejected: string[];
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
    ['Interested in', `${s.selected.length} of 6 services`],
  ];

  // Per-service decision table: swiped right = interested, left = not interested.
  const serviceRow = (label: string, interested: boolean) =>
    `<tr><td style="border:1px solid #e2e8f0;padding:8px">${esc(label)}</td>` +
    `<td style="border:1px solid #e2e8f0;padding:8px;color:${interested ? '#16a34a' : '#94a3b8'};font-weight:600">` +
    `${interested ? '✅ Interested' : '✕ Not interested'}</td></tr>`;
  const serviceRows = [
    ...s.selected.map((l) => serviceRow(l, true)),
    ...s.rejected.map((l) => serviceRow(l, false)),
  ].join('');
  const servicesTable = serviceRows
    ? `<h3 style="font-family:system-ui;margin:20px 0 8px">Services</h3>` +
      `<table cellpadding="8" style="border-collapse:collapse;font-family:system-ui;font-size:14px;min-width:340px">` +
      `<tr><th style="border:1px solid #e2e8f0;background:#f8fafc;text-align:left;padding:8px">Service</th>` +
      `<th style="border:1px solid #e2e8f0;background:#f8fafc;text-align:left;padding:8px">Decision</th></tr>` +
      serviceRows +
      `</table>`
    : '';

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
    `</table>` +
    servicesTable +
    `<p style="color:#94a3b8;font-family:system-ui;font-size:12px">Source: Join Pixie waitlist</p>`;

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

/** Live count of stored waitlist signups — powers the "seats left" counter on
 *  the Join Pixie card. Returns `{ count }`; the client turns that into seats
 *  left using SEAT_CAP. Never errors hard: a null count (no Supabase / failure)
 *  reports as 0 so the client falls back to its static number. */
export async function GET(): Promise<NextResponse> {
  const count = await fetchLeadCount().catch(() => null);
  return NextResponse.json(
    { count: count ?? 0, live: count !== null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
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
  const clipList = (arr: unknown) =>
    Array.isArray(arr) ? arr.map((x) => clip(x)).filter(Boolean).slice(0, 6) : [];
  const signup: Signup = {
    email,
    roles,
    name: clip(body?.name),
    business: clip(body?.business),
    contact: clip(body?.contact),
    selected: clipList(body?.selected),
    rejected: clipList(body?.rejected),
  };

  console.log('[waitlist] signup', { ...signup, ip });

  // Email (primary) and Supabase storage (best-effort, for the admin panel) run
  // together. A storage failure (e.g. table not created yet) must NOT fail the
  // signup — only the email gates the response.
  const [result] = await Promise.all([
    notifyAdmin(signup).catch((err) => {
      console.error('[waitlist] notifyAdmin threw', err);
      return { ok: false, detail: `threw:${err?.message ?? 'unknown'}` };
    }),
    storeLead({ ...signup, ip })
      .then((r) => {
        if (!r.ok) console.error('[waitlist] store failed:', r.detail);
      })
      .catch((err) => console.error('[waitlist] store threw', err)),
  ]);

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
