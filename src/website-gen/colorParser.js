// Parse a user-typed color preference into a normalized hex. Accepts:
//   - hex codes: "#FF5733", "ff5733", "#f53" (3-char shorthand)
//   - named colors: "navy", "forest green", "burgundy"
//   - two-color input: "primary: navy, accent: gold" / "navy and gold"
//
// Falls back to an LLM extractor for phrases like "dusty rose" or
// "warm blue" that aren't in the named-color map.

const { normalizeHex } = require('./colorUtils');
const { generateResponse } = require('../llm/provider');
const { logger } = require('../utils/logger');

// Curated named-color map — covers the ~95% of inputs a small business
// owner would actually type. Values are aesthetically tuned (not raw CSS
// colors) so "green" looks polished, not neon.
const NAMED_COLORS = {
  // Blues
  blue: '#2563EB',
  navy: '#1E3A5F',
  'navy blue': '#1E3A5F',
  sky: '#0EA5E9',
  'sky blue': '#0EA5E9',
  royal: '#2337C6',
  'royal blue': '#2337C6',
  cobalt: '#1E40AF',
  indigo: '#4F46E5',
  cerulean: '#0891B2',
  // Greens
  green: '#16A34A',
  emerald: '#10B981',
  forest: '#166534',
  'forest green': '#166534',
  sage: '#7A9B7A',
  mint: '#34D399',
  olive: '#556B2F',
  lime: '#65A30D',
  teal: '#0D9488',
  // Reds / pinks
  red: '#DC2626',
  crimson: '#B91C3C',
  burgundy: '#7A1A2E',
  scarlet: '#DC2626',
  pink: '#EC4899',
  rose: '#E11D48',
  coral: '#F87171',
  // Purples
  purple: '#9333EA',
  violet: '#7C3AED',
  lavender: '#A78BFA',
  magenta: '#C026D3',
  plum: '#581C87',
  // Warm (orange/yellow/gold/brown)
  orange: '#F97316',
  amber: '#F59E0B',
  gold: '#C9A96E',
  yellow: '#EAB308',
  mustard: '#CA8A04',
  ochre: '#B4713A',
  brown: '#78350F',
  tan: '#B4946C',
  beige: '#D4B896',
  // Neutrals
  black: '#1F2937',
  charcoal: '#1F2937',
  'dark gray': '#374151',
  gray: '#6B7280',
  grey: '#6B7280',
  silver: '#9CA3AF',
  white: '#FFFFFF',
  // Dark themes
  midnight: '#0F172A',
  slate: '#475569',
};

// Quick lookup with case-insensitive + phrase normalization
function lookupNamed(str) {
  const key = String(str || '').trim().toLowerCase();
  if (!key) return null;
  if (NAMED_COLORS[key]) return NAMED_COLORS[key];
  // Try just the last word ("forest green" → "green")
  const last = key.split(/\s+/).slice(-1)[0];
  if (last !== key && NAMED_COLORS[last]) return NAMED_COLORS[last];
  return null;
}

// Extract a hex code (with or without #) from free text.
function extractHex(str) {
  const m = String(str || '').match(/#?[0-9a-f]{3,6}\b/i);
  if (!m) return null;
  return normalizeHex(m[0]);
}

/**
 * Parse a color string → { primaryColor, accentColor } where either
 * or both may be null if nothing recognizable was given. Returns null
 * for entirely unparseable input.
 *
 * Examples:
 *   "purple"                    → { primaryColor: null, accentColor: '#9333EA' }
 *   "#FF5733"                   → { primaryColor: null, accentColor: '#FF5733' }
 *   "primary: navy, accent: gold" → { primaryColor: '#1E3A5F', accentColor: '#C9A96E' }
 *   "navy and gold"             → { primaryColor: '#1E3A5F', accentColor: '#C9A96E' }
 */
async function parseColors(input, { userId = null } = {}) {
  const text = String(input || '').trim();
  if (!text) return null;

  // Look for explicit primary/accent labels first
  const primaryMatch = text.match(/primary\s*[:=]\s*([^,;|\n]+)/i);
  const accentMatch = text.match(/accent\s*[:=]\s*([^,;|\n]+)/i);
  let primaryColor = null;
  let accentColor = null;
  if (primaryMatch) {
    primaryColor = extractHex(primaryMatch[1]) || lookupNamed(primaryMatch[1]);
  }
  if (accentMatch) {
    accentColor = extractHex(accentMatch[1]) || lookupNamed(accentMatch[1]);
  }

  if (primaryColor || accentColor) {
    return { primaryColor, accentColor };
  }

  // "X and Y" / "X with Y" / "X, Y" patterns → two colors
  const pairMatch = text.match(/([a-z\s#0-9]+?)\s*(?:and|with|,|\+)\s*([a-z\s#0-9]+)/i);
  if (pairMatch) {
    const p = extractHex(pairMatch[1]) || lookupNamed(pairMatch[1]);
    const a = extractHex(pairMatch[2]) || lookupNamed(pairMatch[2]);
    if (p && a) return { primaryColor: p, accentColor: a };
  }

  // Single color — apply to accent only (safer; preserves base palette)
  const hex = extractHex(text);
  if (hex) return { primaryColor: null, accentColor: hex };
  const named = lookupNamed(text);
  if (named) return { primaryColor: null, accentColor: named };

  // LLM fallback for "warm blue", "dusty rose", "something calming", etc.
  try {
    const prompt = `Convert this color description to a hex code. Return ONLY JSON:
{ "accentColor": "#RRGGBB" }

If the input is too vague to guess a single color, return { "accentColor": null }.
Prefer slightly muted / professional tones over neon.`;
    const resp = await generateResponse(prompt, [{ role: 'user', content: text }], {
      userId,
      operation: 'webdev_color_parse',
    });
    const m = resp.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      if (parsed.accentColor && typeof parsed.accentColor === 'string') {
        const norm = normalizeHex(parsed.accentColor);
        if (norm) return { primaryColor: null, accentColor: norm };
      }
    }
  } catch (err) {
    logger.warn(`[COLOR-PARSE] LLM fallback failed: ${err.message}`);
  }

  return null;
}

module.exports = { parseColors, lookupNamed, extractHex, NAMED_COLORS };
