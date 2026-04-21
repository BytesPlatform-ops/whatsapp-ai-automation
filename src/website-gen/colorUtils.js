// Small color math helpers — darken/lighten hex strings to derive
// hover/tint tokens from a single user-supplied primary color so templates
// don't need the user to pick every shade themselves.

function parseHex(hex) {
  let s = String(hex || '').trim().replace(/^#/, '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

function toHex(n) {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, '0');
}

/**
 * Darken a hex color by the given factor (0–1). Returns a new hex string.
 * Falls back to the original hex if parsing fails.
 */
function darken(hex, amount = 0.1) {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const a = Math.max(0, Math.min(1, amount));
  return `#${toHex(rgb.r * (1 - a))}${toHex(rgb.g * (1 - a))}${toHex(rgb.b * (1 - a))}`;
}

/**
 * Lighten a hex color by the given factor (0–1). Returns a new hex string.
 */
function lighten(hex, amount = 0.1) {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const a = Math.max(0, Math.min(1, amount));
  return `#${toHex(rgb.r + (255 - rgb.r) * a)}${toHex(rgb.g + (255 - rgb.g) * a)}${toHex(rgb.b + (255 - rgb.b) * a)}`;
}

/**
 * Validate + normalize a hex input to 7-char `#RRGGBB`. Returns null if invalid.
 */
function normalizeHex(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
}

module.exports = { darken, lighten, normalizeHex, parseHex };
