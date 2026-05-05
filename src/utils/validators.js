const { URL } = require('url');
const net = require('net');

// ── Length caps ──────────────────────────────────────────────────────────
const MAX_BUSINESS_NAME = 80;
const MAX_TAGLINE = 160;
const MAX_PAGE_COPY = 2000;
const MAX_EMAIL = 254;
const MAX_PHONE = 20;
const MAX_URL = 500;

// ── Subdomain blocklist ──────────────────────────────────────────────────
// Reserved labels we don't want users grabbing as their site subdomain.
// Mix of platform names (so a phisher can't claim e.g. `supabase.<our-domain>`)
// and operational labels (admin/api/etc.) Netlify itself rejects most of
// these too, but we reject early so the chat doesn't quote the user a
// subdomain that's about to fail at deploy time.
const SUBDOMAIN_BLOCKLIST = new Set([
  'admin', 'api', 'app', 'auth', 'billing', 'dev', 'login',
  'netlify', 'render', 'root', 'staff', 'staging', 'supabase',
  'test', 'www', 'mail', 'smtp', 'ftp', 'ns', 'ns1', 'ns2',
  'cpanel', 'webmail', 'beta', 'alpha', 'internal',
]);

// ── Disposable-email domain set (small, hand-picked) ─────────────────────
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', 'temp-mail.org', '10minutemail.com',
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'yopmail.com', 'sharklasers.com', 'throwaway.email', 'trashmail.com',
  'getnada.com', 'maildrop.cc', 'fakeinbox.com',
]);

// ── Named CSS colors we accept (small subset; hex covers everything else) ─
const NAMED_COLORS = new Set([
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple',
  'pink', 'brown', 'gray', 'grey', 'cyan', 'magenta', 'lime', 'teal',
  'navy', 'maroon', 'olive', 'silver', 'gold', 'beige', 'transparent',
]);

// ── Private / link-local IP host patterns ────────────────────────────────
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^0\./,
  /\.internal$/i,
  /\.local$/i,
];

/**
 * Return true if `host` is any IP literal in a form that bypasses naïve
 * dotted-quad regex matching. Catches:
 *   - IPv4 dotted-decimal     (127.0.0.1)
 *   - IPv6 (with or without brackets, including IPv4-mapped ::ffff:127.0.0.1)
 *   - Single-integer IPv4     (2130706433 → 127.0.0.1)
 *   - Hex-encoded IPv4        (0x7f.0.0.1, 0x7f000001)
 *   - Octal-encoded IPv4      (0177.0.0.1)
 *
 * Built on top of Node's net.isIP so we don't reinvent parsing for
 * standard forms. The numeric-encoding branches catch what URL.hostname
 * does NOT normalize on its own.
 */
/**
 * Return true if `ip` is a private, loopback, link-local, multicast, or
 * otherwise non-routable address. Used by safeFetch.js after DNS resolves
 * a user-supplied URL — every returned A/AAAA record must pass this check
 * before we open a socket, so DNS rebinding can't slip an internal IP
 * past the static URL validator.
 *
 * Defaults to TRUE for anything that isn't a valid IP string. Callers
 * should reject on true; treating "unknown" as private is the safe default.
 */
function isPrivateIp(ip) {
  if (typeof ip !== 'string' || !ip) return true;
  const v = net.isIP(ip);
  if (v === 4) {
    const parts = ip.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
    const [a, b] = parts;
    if (a === 0) return true;                          // 0.0.0.0/8 "this network"
    if (a === 10) return true;                         // 10.0.0.0/8
    if (a === 127) return true;                        // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;           // 169.254.0.0/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
    if (a === 192 && b === 168) return true;           // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 carrier-grade NAT
    if (a >= 224) return true;                          // 224.0.0.0/4 + 240.0.0.0/4 reserved
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;       // loopback
    if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;        // unspecified
    if (/^fe[89ab][0-9a-f]?:/.test(lower)) return true;                    // fe80::/10 link-local
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;                     // fc00::/7 unique-local
    if (/^ff[0-9a-f]{2}:/.test(lower)) return true;                        // ff00::/8 multicast
    const v4mapped = lower.match(/^::ffff:([0-9.]+)$/);                    // IPv4-mapped
    if (v4mapped) return isPrivateIp(v4mapped[1]);
    return false;
  }
  return true; // Not a valid IP at all — treat as private.
}

function isIpLiteral(host) {
  if (!host) return false;
  const stripped = host.replace(/^\[/, '').replace(/\]$/, '');
  if (net.isIP(stripped)) return true;
  // Single decimal integer (URL parser leaves this as-is in hostname).
  if (/^\d{1,10}$/.test(stripped)) return true;
  // Any 0x-prefixed octet anywhere → hex-encoded IPv4 attempt.
  if (/(^|\.)0x[0-9a-fA-F]+/.test(stripped)) return true;
  // Octal form: leading-zero numeric octets that aren't plain `0`.
  if (/^0\d+(\.\d+){0,3}$/.test(stripped)) return true;
  return false;
}

// ── Tiny helpers ─────────────────────────────────────────────────────────

function ok(value) { return { ok: true, value }; }
function fail(reason) { return { ok: false, reason }; }

/**
 * Strip ASCII control characters (incl. null bytes) and trim.
 * Keeps printable ASCII + newline/tab/CR + extended unicode (so
 * non-Latin business names survive).
 */
function stripControl(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

/**
 * Validate and sanitize a URL string.
 * Returns the sanitized URL or null if invalid.
 *
 * Rejects: non-http(s) schemes, IP literals, localhost, private ranges,
 * link-local, .internal / .local TLDs, hosts without a dot, oversized
 * inputs.
 */
function validateUrl(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length > MAX_URL) return null;

  let urlStr = trimmed;
  if (!/^https?:\/\//i.test(urlStr)) urlStr = 'https://' + urlStr;

  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return null;

  // Normalize host: lowercase, strip a single trailing dot. WHATWG URL
  // already rejects most weird hosts, but `localhost.` (trailing dot) and
  // mixed-case `LocalHost` slip through and bypass our literal regex.
  let host = (parsed.hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host) return null;

  // For non-IP hosts we still require a dot (rejects bare `localhost`,
  // single-label internal names). IP literals are handled separately.
  if (isIpLiteral(host)) return null;
  if (!host.includes('.')) return null;

  for (const re of PRIVATE_HOST_PATTERNS) {
    if (re.test(host)) return null;
  }
  return parsed.href;
}

/**
 * Sanitize text input — strip control characters, limit length.
 * Kept for backward compatibility; new code should prefer the
 * field-specific validators below.
 */
function sanitizeText(text, maxLength = 4096) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/[^\x20-\x7E\n\t\r -￿]/g, '').slice(0, maxLength);
}

/**
 * Legacy phone validator (digits only, 7–15). Kept as an alias so
 * existing callers don't break. Prefer `validatePhone` for new code.
 */
function isValidPhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return false;
  return /^\d{7,15}$/.test(phone);
}

// ── Field validators (return { ok, value } / { ok, reason }) ─────────────

function validateBusinessName(input) {
  if (typeof input !== 'string') return fail('not_string');
  const cleaned = stripControl(input);
  if (!cleaned) return fail('empty');
  if (cleaned.length > MAX_BUSINESS_NAME) return fail('too_long');
  return ok(cleaned);
}

function validateTagline(input) {
  if (typeof input !== 'string') return fail('not_string');
  const cleaned = stripControl(input);
  if (!cleaned) return fail('empty');
  if (cleaned.length > MAX_TAGLINE) return fail('too_long');
  return ok(cleaned);
}

function validatePageCopy(input) {
  if (typeof input !== 'string') return fail('not_string');
  const cleaned = sanitizeHtml(stripControl(input));
  if (!cleaned) return fail('empty');
  if (cleaned.length > MAX_PAGE_COPY) return fail('too_long');
  return ok(cleaned);
}

function validateEmail(input) {
  if (typeof input !== 'string') return fail('not_string');
  const cleaned = stripControl(input).toLowerCase();
  if (!cleaned) return fail('empty');
  if (cleaned.length > MAX_EMAIL) return fail('too_long');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return fail('format');
  const domain = cleaned.split('@')[1];
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return fail('disposable');
  return ok(cleaned);
}

function validatePhone(input) {
  if (typeof input !== 'string') return fail('not_string');
  const cleaned = stripControl(input);
  if (!cleaned) return fail('empty');
  if (cleaned.length > MAX_PHONE) return fail('too_long');
  if (!/^[\d+()\-\s]{7,20}$/.test(cleaned)) return fail('format');
  const digitCount = (cleaned.match(/\d/g) || []).length;
  if (digitCount < 7 || digitCount > 15) return fail('digit_count');
  return ok(cleaned);
}

function validateColor(input) {
  if (typeof input !== 'string') return fail('not_string');
  const cleaned = stripControl(input).toLowerCase();
  if (!cleaned) return fail('empty');
  if (/^#[0-9a-f]{3,8}$/.test(cleaned)) return ok(cleaned);
  if (NAMED_COLORS.has(cleaned)) return ok(cleaned);
  return fail('format');
}

function validateSubdomain(input) {
  if (typeof input !== 'string') return fail('not_string');
  const cleaned = stripControl(input).toLowerCase();
  if (!cleaned) return fail('empty');
  if (cleaned.length < 3 || cleaned.length > 63) return fail('length');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(cleaned)) return fail('format');
  if (SUBDOMAIN_BLOCKLIST.has(cleaned)) return fail('blocked');
  return ok(cleaned);
}

/**
 * Conservative HTML scrubbing for free-text copy that may end up rendered
 * on the generated site. We don't allow rich HTML on this path — anything
 * that could execute or escape context is stripped.
 */
function sanitizeHtml(input) {
  if (typeof input !== 'string') return '';
  let s = input;
  // Iterate the tag/handler strip until the string stabilizes. Without
  // this, payloads like `<scr<script>ipt>` reconstruct themselves after a
  // single pass: the inner `<script>` is stripped and the outer fragments
  // join into a fresh `<script>ipt>`. Capping the loop at 10 passes
  // bounds worst-case runtime against pathological input.
  for (let i = 0; i < 10; i++) {
    const before = s;
    // Drop dangerous tags entirely (with their bodies).
    s = s.replace(/<\s*(script|iframe|object|embed|style|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
    // Drop self-closing / unclosed dangerous tags.
    s = s.replace(/<\s*(script|iframe|object|embed|style|link|meta)[^>]*\/?>/gi, '');
    // Strip inline event handlers (`onclick=...`, `onload=...`, etc).
    // Allow whitespace OR a forward slash before the handler — HTML5 lets
    // attributes be separated by `/` and `<img/onerror=...>` would
    // otherwise bypass the prior `\s` check.
    s = s.replace(/[\s\/]on\w+\s*=\s*"[^"]*"/gi, ' ');
    s = s.replace(/[\s\/]on\w+\s*=\s*'[^']*'/gi, ' ');
    s = s.replace(/[\s\/]on\w+\s*=\s*[^\s>]+/gi, ' ');
    if (s === before) break;
  }
  // Neutralize dangerous URL schemes anywhere they appear (including with
  // tab/newline obfuscation: `java\nscript:`).
  s = s.replace(/j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, '');
  s = s.replace(/d\s*a\s*t\s*a\s*:\s*t\s*e\s*x\s*t\s*\/\s*h\s*t\s*m\s*l/gi, '');
  s = s.replace(/v\s*b\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, '');
  // Template-injection vectors.
  s = s.replace(/`/g, '');
  s = s.replace(/\$\{[^}]*\}/g, '');
  // Null bytes + remaining control chars.
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return s.trim();
}

// ── Image-bytes safety (uploads) ─────────────────────────────────────────
// Per-uploader allowlists are passed in by the caller; this helper just
// runs the shared MIME + magic-byte checks. SVG is hard-blocked everywhere
// regardless of allowlist because SVGs can carry executable scripts that
// run when a browser loads the file from our public Supabase bucket.
const DEFAULT_IMAGE_ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Inspect the first bytes of `buffer` and return a coarse signature string,
 * or null if no known image header is found. Only handles formats we
 * actually accept on this platform — adding a new accepted format means
 * adding its signature here too.
 */
function detectImageMagic(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  // PNG  89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';
  // JPEG FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
  // GIF  "GIF87a" / "GIF89a"
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return 'image/gif';
  // WebP "RIFF" .... "WEBP" — needs 12 bytes
  if (buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'image/webp';
  return null;
}

/**
 * Confirm a user-uploaded image is safe to push to public storage:
 *   - Reject SVG by MIME and by leading-bracket magic bytes.
 *   - Reject any MIME outside the per-uploader allowlist.
 *   - Reject when the magic bytes contradict the claimed MIME (catches
 *     spoofed-MIME attacks like SVG-bytes-with-image/png header).
 *
 * Returns { ok: true } on success or { ok: false, reason } on failure
 * where reason is one of: 'svg_blocked', 'mime_not_allowed',
 * 'magic_byte_mismatch', 'empty_buffer'.
 */
function assertImageBytesSafe(buffer, mimeType, allowed = DEFAULT_IMAGE_ALLOWED) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, reason: 'empty_buffer' };
  }
  const mime = String(mimeType || '').toLowerCase();
  // SVG — hard-blocked regardless of allowlist (XML/text payloads run
  // scripts when the browser renders them from our public bucket).
  if (/\bsvg\b/.test(mime) || mime.includes('svg+xml')) {
    return { ok: false, reason: 'svg_blocked' };
  }
  // Catch SVG / HTML / XML payloads that lie about their MIME ("image/png"
  // but the bytes start with `<svg` or `<?xml`). Anything starting with
  // `<` after stripping leading whitespace is text, not an image.
  let firstNonWs = 0;
  while (firstNonWs < buffer.length && firstNonWs < 8 && buffer[firstNonWs] <= 0x20) firstNonWs++;
  if (firstNonWs < buffer.length && buffer[firstNonWs] === 0x3C /* '<' */) {
    return { ok: false, reason: 'svg_blocked' };
  }
  // Allowlist check.
  if (!allowed.includes(mime)) {
    return { ok: false, reason: 'mime_not_allowed' };
  }
  // Magic-byte check — claimed MIME must match what the bytes actually say.
  const detected = detectImageMagic(buffer);
  if (!detected || detected !== mime) {
    return { ok: false, reason: 'magic_byte_mismatch' };
  }
  return { ok: true };
}

// ── Secret detection + redaction (inbound user messages) ────────────────
// Patterns are typed so redactSecrets() can label what it scrubbed. Each
// regex MUST use the `g` flag so .replace() handles multiple occurrences.
const SECRET_PATTERNS_TYPED = [
  { type: 'openai_or_anthropic_key', re: /\bsk-[A-Za-z0-9_-]{16,}/g },
  { type: 'aws_access_key',          re: /\bAKIA[0-9A-Z]{16}\b/g },
  { type: 'aws_temp_credential',     re: /\bASIA[0-9A-Z]{16}\b/g },
  { type: 'jwt',                     re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  { type: 'private_key_block',       re: /-----BEGIN (?:RSA|OPENSSH|EC|PGP|DSA|ENCRYPTED) PRIVATE KEY-----[\s\S]*?(?:-----END[^\n]*?-----|$)/g },
  { type: 'github_token',            re: /\bghp_[A-Za-z0-9]{30,}/g },
  { type: 'slack_token',             re: /\bxox[bpoa]-[A-Za-z0-9-]{10,}/g },
  { type: 'generic_kv_secret',       re: /\b(?:api[-_ ]?key|token|secret|password)\s*[:=]\s*[A-Za-z0-9_\-+/]{20,}/gi },
];

/**
 * Return true if the input string looks like it contains a real secret.
 * Defense-in-depth: the LLM is also instructed to flag secrets via the
 * INPUT SAFETY prompt section, but the JS check is the backstop.
 */
function detectSecrets(input) {
  if (typeof input !== 'string' || !input) return false;
  for (const { re } of SECRET_PATTERNS_TYPED) {
    // Reset lastIndex so the global flag doesn't leak state between calls.
    re.lastIndex = 0;
    if (re.test(input)) return true;
  }
  return false;
}

/**
 * Replace any apparent secrets in `input` with `[REDACTED:<type>]`.
 * Returns { text, redacted, types[] }. Used at the router boundary so
 * raw secrets never get persisted to the conversation log or replayed
 * into future LLM context.
 */
function redactSecrets(input) {
  if (typeof input !== 'string' || !input) {
    return { text: input || '', redacted: false, types: [] };
  }
  let text = input;
  const types = new Set();
  for (const { type, re } of SECRET_PATTERNS_TYPED) {
    re.lastIndex = 0;
    const before = text;
    text = text.replace(re, () => `[REDACTED:${type}]`);
    if (text !== before) types.add(type);
  }
  return { text, redacted: types.size > 0, types: Array.from(types) };
}

module.exports = {
  // Backward-compat exports.
  validateUrl,
  sanitizeText,
  isValidPhoneNumber,
  // New field validators.
  validateBusinessName,
  validateTagline,
  validatePageCopy,
  validateEmail,
  validatePhone,
  validateColor,
  validateSubdomain,
  sanitizeHtml,
  detectSecrets,
  redactSecrets,
  assertImageBytesSafe,
  detectImageMagic,
  isPrivateIp,
  // Constants exported so callers / tests can reference the limits.
  MAX_BUSINESS_NAME,
  MAX_TAGLINE,
  MAX_PAGE_COPY,
  MAX_EMAIL,
  MAX_PHONE,
  MAX_URL,
};
