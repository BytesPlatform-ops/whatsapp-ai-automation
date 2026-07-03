import 'server-only';
import { randomBytes, createHash } from 'node:crypto';

/**
 * Workspace invitation tokens. The raw token is emailed to the invitee; only its
 * SHA-256 hash is stored, so a DB leak can't be used to accept invites. Tokens
 * expire (default 7 days) and are single-use.
 */
export const INVITE_TTL_DAYS = 7;

export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function inviteExpiry(): Date {
  return new Date(Date.now() + INVITE_TTL_DAYS * 86400000);
}

/** Sends the invite email via Resend if configured; no-op (logged) otherwise. */
export async function sendInviteEmail(opts: { to: string; inviteUrl: string; workspaceName: string; inviterEmail: string | null }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[invite] RESEND_API_KEY not set — invite not emailed:', opts.to);
    return false;
  }
  const from = process.env.RESEND_FROM || 'Pixie <onboarding@resend.dev>';
  const html =
    `<h2 style="font-family:system-ui">You're invited to ${escapeHtml(opts.workspaceName)} on Pixie</h2>` +
    `<p style="font-family:system-ui;font-size:14px;color:#334">${opts.inviterEmail ? escapeHtml(opts.inviterEmail) + ' invited you' : 'You were invited'} to collaborate in Pixie Lab.</p>` +
    `<p style="font-family:system-ui"><a href="${opts.inviteUrl}" style="display:inline-block;background:#16A34A;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:700">Accept invitation</a></p>` +
    `<p style="font-family:system-ui;font-size:12px;color:#94a3b8">This invite expires in ${INVITE_TTL_DAYS} days. If you didn't expect it, you can ignore this email.</p>`;
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(key);
    const { error } = await resend.emails.send({ from, to: [opts.to], subject: `You're invited to ${opts.workspaceName} on Pixie`, html });
    if (error) { console.error('[invite] resend error', error); return false; }
    return true;
  } catch (e) {
    console.error('[invite] send threw', e);
    return false;
  }
}

function escapeHtml(v: string): string {
  return v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
