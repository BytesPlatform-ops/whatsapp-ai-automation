import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';

/**
 * App-level session tracking. Supabase doesn't expose a per-device session list
 * to the client, so we record the current session (from the access token's
 * `session_id` claim) into user_sessions on load. IP is hashed (never stored
 * raw) and we keep only a coarse device label.
 */

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex').slice(0, 32);
}

/** Coarse, privacy-friendly device label from a user-agent string. */
export function deviceLabel(ua: string): string {
  const os = /Windows/i.test(ua) ? 'Windows' : /Macintosh|Mac OS/i.test(ua) ? 'macOS' : /iPhone|iPad|iOS/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : /Linux/i.test(ua) ? 'Linux' : 'Unknown OS';
  const browser = /Edg\//i.test(ua) ? 'Edge' : /Chrome\//i.test(ua) ? 'Chrome' : /Firefox\//i.test(ua) ? 'Firefox' : /Safari\//i.test(ua) ? 'Safari' : 'Browser';
  return `${browser} · ${os}`;
}

/** Decode the `session_id` claim from a Supabase access token (JWT), safely. */
export function sessionIdFromJwt(accessToken: string | undefined | null): string | null {
  if (!accessToken) return null;
  try {
    const payload = accessToken.split('.')[1];
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { session_id?: string };
    return json.session_id ?? null;
  } catch {
    return null;
  }
}

/** Upsert (touch) the current session row. No-op if we can't identify it. */
export async function recordSession(opts: { userId: string; sessionId: string | null; userAgent: string; ip: string }) {
  const { userId, sessionId, userAgent, ip } = opts;
  if (!sessionId) return;
  const data = {
    userAgent: userAgent.slice(0, 400),
    ipHash: ip ? sha256(ip + ':' + userId) : null,
    deviceLabel: deviceLabel(userAgent),
    lastSeenAt: new Date(),
    revokedAt: null,
  };
  await prisma.userSession.upsert({
    where: { userId_sessionId: { userId, sessionId } },
    create: { userId, sessionId, ...data },
    update: data,
  });
}
