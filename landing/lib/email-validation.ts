import 'server-only';
import { resolveMx, resolve4 } from 'node:dns/promises';

/**
 * Server-only layered email validation for signup. Layers: format → domain has
 * mail records (MX, A fallback) → disposable denylist. Real mailbox ownership is
 * proven by the OTP, NOT by SMTP probing — we never enumerate mailboxes.
 */

export interface EmailValidation {
  validFormat: boolean;
  validDomain: boolean;
  hasMx: boolean;
  disposable: boolean;
  canProceed: boolean;
  reason?: string;
}

// Reasonable format: local@domain.tld, no spaces, sane structure. Not full RFC
// (that's impractical) — OTP is the real proof.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Common disposable/temporary email domains. Extend as needed; a hosted list or
// API can be swapped in later (see TODO below).
const DISPOSABLE = new Set<string>([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'guerrillamail.biz',
  '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org', 'tempmail.net',
  'yopmail.com', 'yopmail.net', 'throwawaymail.com', 'getnada.com', 'nada.email',
  'trashmail.com', 'trashmail.net', 'sharklasers.com', 'grr.la', 'spam4.me',
  'maildrop.cc', 'dispostable.com', 'fakeinbox.com', 'mailnesia.com', 'mintemail.com',
  'mohmal.com', 'emailondeck.com', 'moakt.com', 'tmail.ws', 'tmails.net',
  'mailcatch.com', 'inboxbear.com', 'tempinbox.com', 'burnermail.io', 'temp-mail.io',
  'mail-temp.com', 'tempr.email', 'discard.email', 'wegwerfemail.de', 'einrot.com',
  'harakirimail.com', 'jetable.org', 'spambox.us', 'mailde.de', 'luxusmail.org',
]);
// TODO: for higher accuracy, integrate a disposable/validation API (e.g. Kickbox,
// ZeroBounce) behind an env key and merge results with this local denylist.

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export async function validateEmailForSignup(rawEmail: string): Promise<EmailValidation> {
  const email = normalize(rawEmail);
  const result: EmailValidation = {
    validFormat: false, validDomain: false, hasMx: false, disposable: false, canProceed: false,
  };

  if (!EMAIL_RE.test(email) || email.length > 254) {
    result.reason = 'Please enter a valid email address.';
    return result;
  }
  result.validFormat = true;

  const domain = email.split('@')[1];
  // Guard against obviously malformed domains (double dots, leading/trailing dot/hyphen).
  if (!domain || /\.\.|^[.-]|[.-]$|@/.test(domain) || !domain.includes('.')) {
    result.reason = 'Please enter a valid email address.';
    return result;
  }
  result.validDomain = true;

  if (DISPOSABLE.has(domain)) {
    result.disposable = true;
    result.reason = 'Please use a non-disposable email address.';
    return result;
  }

  // Domain must be able to receive mail: MX preferred, A record as fallback.
  try {
    const mx = await resolveMx(domain);
    result.hasMx = Array.isArray(mx) && mx.length > 0 && mx.some((r) => r.exchange);
  } catch {
    result.hasMx = false;
  }
  if (!result.hasMx) {
    try {
      const a = await resolve4(domain);
      if (Array.isArray(a) && a.length > 0) result.hasMx = true; // domain resolves; can plausibly receive mail
    } catch { /* no records */ }
  }
  if (!result.hasMx) {
    result.reason = 'We couldn’t verify that email domain. Please check your address.';
    return result;
  }

  result.canProceed = true;
  return result;
}
