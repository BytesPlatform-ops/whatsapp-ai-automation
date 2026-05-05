// Content-Security-Policy injection for deployed Netlify sites.
//
// The per-template `esc()` plus the new sanitizeSiteConfig chokepoint
// already strip dangerous structures from rendered HTML. CSP is the
// third layer: even if both fail and an attacker manages to inject an
// inline <script> into a deployed page, the browser refuses to execute
// it because no matching SHA-256 hash is in the policy.
//
// We use HASH-based CSP instead of nonces because pages are static-built
// at deploy time — there's no per-request rendering to inject a fresh
// nonce. The set of known-good inline scripts is bounded (currently the
// preview-mode form-disabling script in activationBanner.js plus a few
// in templates), so hashing them at build time costs nothing.

const crypto = require('crypto');

// Match an inline <script> block. Skips external scripts (those with
// src=...) since those load from same-origin / allowlisted hosts and
// don't need per-script hashes.
const INLINE_SCRIPT_RE = /<script\b(?![^>]*\bsrc\s*=)([^>]*)>([\s\S]*?)<\/script\s*>/gi;

function sha256Base64(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('base64');
}

/**
 * Scan `html` for inline <script>…</script> bodies and return the SHA-256
 * hash entries to inject into the script-src directive. Order is
 * preserved so duplicate hashes from identical inline scripts dedupe.
 */
function collectInlineScriptHashes(html) {
  const hashes = new Set();
  if (typeof html !== 'string') return hashes;
  let match;
  INLINE_SCRIPT_RE.lastIndex = 0;
  while ((match = INLINE_SCRIPT_RE.exec(html)) !== null) {
    const body = match[2];
    if (typeof body !== 'string') continue;
    hashes.add(`'sha256-${sha256Base64(body)}'`);
  }
  return hashes;
}

/**
 * Build the policy string for a single page. `extraScriptHashes` is the
 * set returned by collectInlineScriptHashes for that page.
 *
 * Conservative on script-src (the attack surface for XSS), permissive
 * on img-src / frame-src because deployed sites legitimately load images
 * from Supabase Storage, Unsplash CDN, Google Maps, and Stripe iframes.
 */
function buildPolicy(extraScriptHashes) {
  const scriptSrcParts = [
    "'self'",
    'https://cdn.tailwindcss.com',
    'https://js.stripe.com',
    ...Array.from(extraScriptHashes),
  ];
  return [
    "default-src 'self'",
    `script-src ${scriptSrcParts.join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com",
    "img-src 'self' data: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://api.stripe.com",
    "frame-src https://www.google.com https://js.stripe.com https://*.stripe.com https://calendly.com https://*.calendly.com",
    "form-action 'self' https://*.stripe.com",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
}

/**
 * Insert a Content-Security-Policy <meta> tag near the top of <head>.
 * Returns the modified HTML; if the input has no <head> we leave it
 * alone (defensive — non-HTML files like JSON/CSS can flow through the
 * deployer alongside HTML pages).
 */
function injectCspMetaTag(html, policy) {
  if (typeof html !== 'string') return html;
  const headOpenMatch = html.match(/<head\b[^>]*>/i);
  if (!headOpenMatch) return html;
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy.replace(/"/g, '&quot;')}">`;
  const insertAt = headOpenMatch.index + headOpenMatch[0].length;
  return html.slice(0, insertAt) + meta + html.slice(insertAt);
}

/**
 * Public entry: take a single rendered HTML string, compute hashes for
 * its inline scripts, build the policy, and inject the meta tag. Pages
 * that don't end in .html (or strings that don't look like HTML) are
 * returned unchanged.
 */
function applyCsp(html) {
  if (typeof html !== 'string') return html;
  if (!/<head\b/i.test(html)) return html;
  const hashes = collectInlineScriptHashes(html);
  const policy = buildPolicy(hashes);
  return injectCspMetaTag(html, policy);
}

/**
 * Walk a `{ filePath: contents }` map (the shape produced by template
 * generators) and apply CSP to every .html entry. Non-HTML files
 * pass through untouched.
 */
function applyCspToFiles(files) {
  const out = {};
  for (const [fp, content] of Object.entries(files || {})) {
    if (/\.html?$/i.test(fp) && typeof content === 'string') {
      out[fp] = applyCsp(content);
    } else {
      out[fp] = content;
    }
  }
  return out;
}

module.exports = {
  applyCsp,
  applyCspToFiles,
  collectInlineScriptHashes,
  buildPolicy,
  injectCspMetaTag,
};
