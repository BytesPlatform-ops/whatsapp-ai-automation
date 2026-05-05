// Deploy-boundary chokepoint for the website-generator.
//
// The per-template `esc()` calls already HTML-entity-escape every field at
// the moment they're interpolated into a page. That works today, but it
// only protects sites whose author remembered to call esc() at every
// interpolation point. As the codebase grows new templates, a single
// missed escape becomes a stored XSS on the deployed Netlify site.
//
// sanitizeSiteConfig runs ONCE in src/website-gen/generator.js right
// before the config is returned. It walks every string in the tree and
// strips dangerous HTML structures (script tags, on-handlers, javascript:
// URLs, template-injection markers). It also validates fields whose name
// suggests they're URLs — those must pass the hardened validateUrl() or
// they're nulled out, because URL fields rendered into href/src attrs
// are dangerous even when entity-escaped (`javascript:alert(1)` survives
// HTML escaping but executes when used as a link target).
//
// This is ADDITIVE — it doesn't replace esc(). Defense in depth.

const {
  sanitizeHtml,
  validateUrl,
  MAX_BUSINESS_NAME,
  MAX_TAGLINE,
  MAX_PAGE_COPY,
} = require('../utils/validators');

// Field names whose value MUST validate as an http(s) URL or be nulled.
// Match by suffix so nested keys like `agent.profileUrl` are caught too.
const URL_FIELD_SUFFIXES = [
  'url', 'href', 'link', 'image', 'images', 'photo', 'photos',
  'logo', 'thumbnail', 'avatar', 'icon',
];

// Per-field maximum length for strings; anything longer is truncated.
// Falls back to MAX_PAGE_COPY for unknown fields.
const FIELD_MAX_LEN = {
  businessName: MAX_BUSINESS_NAME,
  tagline: MAX_TAGLINE,
  headline: MAX_TAGLINE,
  ctaTitle: MAX_TAGLINE,
  ctaButton: 40,
  ctaText: MAX_TAGLINE,
  primaryCity: 80,
  industry: 80,
  contactEmail: 254,
  contactPhone: 40,
  contactAddress: 240,
  // LLM-generated copy fields default to MAX_PAGE_COPY.
};

function isUrlFieldName(key) {
  if (typeof key !== 'string') return false;
  const lower = key.toLowerCase();
  return URL_FIELD_SUFFIXES.some((s) => lower === s || lower.endsWith(s.charAt(0).toUpperCase() + s.slice(1)) || lower.endsWith(s));
}

function sanitizeStringField(key, value) {
  if (typeof value !== 'string') return value;
  if (isUrlFieldName(key)) {
    // null is the safer fallback than leaving an attacker-controlled
    // string. Templates already null-check these fields.
    const ok = validateUrl(value);
    return ok || null;
  }
  const cleaned = sanitizeHtml(value);
  const cap = FIELD_MAX_LEN[key] != null ? FIELD_MAX_LEN[key] : MAX_PAGE_COPY;
  return cleaned.length > cap ? cleaned.slice(0, cap) : cleaned;
}

/**
 * Deep-walk an object, sanitizing every string and validating every URL
 * field. Returns a new object — never mutates the input. Cycle-safe via
 * a WeakSet because siteConfig is built from JSON-y data but defensive
 * code is cheap.
 */
function sanitizeSiteConfig(input) {
  const seen = new WeakSet();
  function walk(value, key) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return sanitizeStringField(key || '', value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) {
      if (seen.has(value)) return value;
      seen.add(value);
      return value.map((item) => walk(item, key));
    }
    if (typeof value === 'object') {
      if (seen.has(value)) return value;
      seen.add(value);
      const out = {};
      for (const k of Object.keys(value)) {
        out[k] = walk(value[k], k);
      }
      return out;
    }
    return value;
  }
  return walk(input, '');
}

module.exports = { sanitizeSiteConfig };
