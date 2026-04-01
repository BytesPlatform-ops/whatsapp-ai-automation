const { URL } = require('url');

/**
 * Validate and sanitize a URL string.
 * Returns the sanitized URL or null if invalid.
 */
function validateUrl(input) {
  if (!input || typeof input !== 'string') return null;

  let urlStr = input.trim();

  // Add protocol if missing
  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = 'https://' + urlStr;
  }

  try {
    const parsed = new URL(urlStr);
    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    // Must have a valid hostname with a dot (e.g. example.com)
    if (!parsed.hostname.includes('.')) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Sanitize text input — strip control characters, limit length.
 */
function sanitizeText(text, maxLength = 4096) {
  if (!text || typeof text !== 'string') return '';
  // Remove non-printable control characters except newlines/tabs
  return text.replace(/[^\x20-\x7E\n\t\r\u00A0-\uFFFF]/g, '').slice(0, maxLength);
}

/**
 * Validate phone number format (E.164).
 */
function isValidPhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return false;
  return /^\d{7,15}$/.test(phone);
}

module.exports = { validateUrl, sanitizeText, isValidPhoneNumber };
