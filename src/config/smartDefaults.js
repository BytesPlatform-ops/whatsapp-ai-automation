/**
 * smartDefaults.js
 *
 * When a user delegates to the bot at an optional collection step —
 * "whatever you think", "you decide", "skip", "idk you pick" — we should
 * apply a sensible default, *tell the user what we picked*, and let them
 * change it. This module is the one source of truth for those defaults.
 *
 * Usage from a handler:
 *
 *   const { defaultsFor, describeDefault } = require('../../config/smartDefaults');
 *   const d = defaultsFor(industry);
 *   await saveData(user, { brandColors: d.colors });
 *   await sendTextMessage(user.phone_number, describeDefault('colors', d));
 *
 * All matches are case-insensitive + partial. If an industry isn't found
 * we fall back to a tasteful neutral default.
 */

'use strict';

// ─── Per-industry defaults ────────────────────────────────────────────
// Keys are lowercased partial-match substrings. First key that appears
// inside the user's industry string wins, so "dental clinic" → "dental".
// Colors are the strings users typed (e.g. "navy and gold") and ALSO a
// hex triplet for the website generator.
const INDUSTRY_DEFAULTS = {
  salon:        { colors: 'rose gold and soft cream', hex: { primaryColor: '#1F2937', secondaryColor: '#111827', accentColor: '#EC4899' }, style: 'modern feminine', symbol: 'a minimalist scissors or leaf icon' },
  beauty:       { colors: 'rose gold and soft cream', hex: { primaryColor: '#1F2937', secondaryColor: '#111827', accentColor: '#EC4899' }, style: 'modern feminine', symbol: 'a minimalist flower' },
  barber:       { colors: 'black, deep red and cream',  hex: { primaryColor: '#1A1A1A', secondaryColor: '#0A0A0A', accentColor: '#B91C1C' }, style: 'bold retro',      symbol: 'a straight razor or pole' },
  spa:          { colors: 'sage green and warm beige',  hex: { primaryColor: '#3F4A3C', secondaryColor: '#2A332A', accentColor: '#D4C5A9' }, style: 'calm natural',    symbol: 'a leaf or drop' },

  restaurant:   { colors: 'warm terracotta and cream',  hex: { primaryColor: '#1C1917', secondaryColor: '#0C0A09', accentColor: '#D97706' }, style: 'warm appetizing', symbol: 'a fork and knife icon' },
  food:         { colors: 'warm terracotta and cream',  hex: { primaryColor: '#1C1917', secondaryColor: '#0C0A09', accentColor: '#D97706' }, style: 'warm appetizing', symbol: 'a chef hat or bowl' },
  cafe:         { colors: 'coffee brown and cream',     hex: { primaryColor: '#3B2A1E', secondaryColor: '#1E140A', accentColor: '#C08457' }, style: 'cozy inviting',   symbol: 'a coffee cup' },
  bakery:       { colors: 'pastel pink and cream',      hex: { primaryColor: '#4A2A1E', secondaryColor: '#2A1810', accentColor: '#F4A7B9' }, style: 'warm artisanal',  symbol: 'a wheat sheaf or baked good' },

  hvac:         { colors: 'trust blue and orange CTA',  hex: { primaryColor: '#1E3A5F', secondaryColor: '#0F172A', accentColor: '#F97316' }, style: 'trustworthy pro', symbol: 'a snowflake / flame combo' },
  heating:      { colors: 'trust blue and orange CTA',  hex: { primaryColor: '#1E3A5F', secondaryColor: '#0F172A', accentColor: '#F97316' }, style: 'trustworthy pro', symbol: 'a flame icon' },
  cooling:      { colors: 'trust blue and orange CTA',  hex: { primaryColor: '#1E3A5F', secondaryColor: '#0F172A', accentColor: '#F97316' }, style: 'trustworthy pro', symbol: 'a snowflake icon' },
  plumber:      { colors: 'navy blue and yellow',       hex: { primaryColor: '#1E3A8A', secondaryColor: '#0F1F4F', accentColor: '#FBBF24' }, style: 'reliable bold',   symbol: 'a wrench or pipe icon' },
  construction: { colors: 'charcoal and safety orange', hex: { primaryColor: '#2C3E50', secondaryColor: '#1A252F', accentColor: '#E67E22' }, style: 'rugged bold',     symbol: 'a hammer or hard-hat' },

  tech:         { colors: 'deep slate and electric indigo', hex: { primaryColor: '#1E293B', secondaryColor: '#0F172A', accentColor: '#6366F1' }, style: 'modern minimal', symbol: 'a geometric glyph' },
  software:     { colors: 'deep slate and electric indigo', hex: { primaryColor: '#1E293B', secondaryColor: '#0F172A', accentColor: '#6366F1' }, style: 'modern minimal', symbol: 'a geometric glyph' },

  healthcare:   { colors: 'medical teal and white',     hex: { primaryColor: '#0F4C75', secondaryColor: '#0A2E4D', accentColor: '#38BDF8' }, style: 'clean trustworthy', symbol: 'a cross or heartbeat line' },
  medical:      { colors: 'medical teal and white',     hex: { primaryColor: '#0F4C75', secondaryColor: '#0A2E4D', accentColor: '#38BDF8' }, style: 'clean trustworthy', symbol: 'a cross or heartbeat line' },
  dental:       { colors: 'cool teal and white',        hex: { primaryColor: '#0F4C75', secondaryColor: '#0A2E4D', accentColor: '#38BDF8' }, style: 'clean friendly',    symbol: 'a tooth icon' },

  finance:      { colors: 'navy and champagne',         hex: { primaryColor: '#1E3A5F', secondaryColor: '#0F2440', accentColor: '#4A90D9' }, style: 'premium trustworthy', symbol: 'a column or shield' },
  legal:        { colors: 'charcoal and gold',          hex: { primaryColor: '#1C2833', secondaryColor: '#0D1B2A', accentColor: '#7F8C8D' }, style: 'premium classic',    symbol: 'a scale or pillar' },
  law:          { colors: 'charcoal and gold',          hex: { primaryColor: '#1C2833', secondaryColor: '#0D1B2A', accentColor: '#7F8C8D' }, style: 'premium classic',    symbol: 'a scale or pillar' },

  'real estate': { colors: 'charcoal and champagne',    hex: { primaryColor: '#2D3436', secondaryColor: '#1A1D1E', accentColor: '#B8860B' }, style: 'premium polished', symbol: 'a house or key icon' },
  property:     { colors: 'charcoal and champagne',     hex: { primaryColor: '#2D3436', secondaryColor: '#1A1D1E', accentColor: '#B8860B' }, style: 'premium polished', symbol: 'a house icon' },

  fitness:      { colors: 'black and energy red',       hex: { primaryColor: '#18181B', secondaryColor: '#09090B', accentColor: '#EF4444' }, style: 'bold energetic',  symbol: 'a dumbbell or flame' },
  gym:          { colors: 'black and energy red',       hex: { primaryColor: '#18181B', secondaryColor: '#09090B', accentColor: '#EF4444' }, style: 'bold energetic',  symbol: 'a dumbbell' },

  education:    { colors: 'academic blue and white',    hex: { primaryColor: '#1E3A5F', secondaryColor: '#0F2440', accentColor: '#60A5FA' }, style: 'approachable pro', symbol: 'a book or graduation cap' },
  creative:     { colors: 'slate and violet',           hex: { primaryColor: '#1F2937', secondaryColor: '#111827', accentColor: '#8B5CF6' }, style: 'playful artistic', symbol: 'an abstract mark' },
  design:       { colors: 'slate and violet',           hex: { primaryColor: '#1F2937', secondaryColor: '#111827', accentColor: '#8B5CF6' }, style: 'playful artistic', symbol: 'an abstract mark' },

  retail:       { colors: 'black and violet',           hex: { primaryColor: '#18181B', secondaryColor: '#09090B', accentColor: '#A78BFA' }, style: 'modern ecommerce', symbol: 'a shopping bag' },
  ecommerce:    { colors: 'black and violet',           hex: { primaryColor: '#18181B', secondaryColor: '#09090B', accentColor: '#A78BFA' }, style: 'modern ecommerce', symbol: 'a shopping bag' },

  automotive:   { colors: 'gunmetal and red',           hex: { primaryColor: '#1E293B', secondaryColor: '#0F172A', accentColor: '#DC2626' }, style: 'bold mechanical', symbol: 'a wheel or steering' },
  travel:       { colors: 'ocean teal and white',       hex: { primaryColor: '#0F4C75', secondaryColor: '#0A2E4D', accentColor: '#06B6D4' }, style: 'airy inviting',   symbol: 'a globe or plane' },
};

// Neutral fallback when industry isn't recognised.
const FALLBACK = {
  colors: 'charcoal navy and warm cream',
  hex: { primaryColor: '#1E293B', secondaryColor: '#0F172A', accentColor: '#6366F1' },
  style: 'clean modern',
  symbol: 'a subtle geometric mark',
};

/**
 * Find the defaults object for an industry string. Matches partial,
 * case-insensitive on any of the INDUSTRY_DEFAULTS keys.
 */
function defaultsFor(industry) {
  const key = String(industry || '').toLowerCase().trim();
  if (!key) return { ...FALLBACK };

  // Exact match first
  if (INDUSTRY_DEFAULTS[key]) return { ...INDUSTRY_DEFAULTS[key] };

  // Partial match — longest matching key wins so "dental clinic" beats
  // "de" if we ever had one.
  const hit = Object.keys(INDUSTRY_DEFAULTS)
    .filter((k) => key.includes(k) || k.includes(key))
    .sort((a, b) => b.length - a.length)[0];

  if (hit) return { ...INDUSTRY_DEFAULTS[hit] };
  return { ...FALLBACK };
}

/**
 * Produce a short human-friendly message explaining the default you just
 * applied, so the user knows what we picked and can override if they want.
 *
 * @param {'colors'|'style'|'symbol'|'hours'|'instagram'} kind
 * @param {object} d  A defaults object from defaultsFor()
 * @param {object} opts optional: { industry }
 */
function describeDefault(kind, d, opts = {}) {
  const industry = opts.industry ? ` for ${opts.industry}` : '';
  switch (kind) {
    case 'colors':
      return `I'll go with *${d.colors}* — that palette works really well${industry}. Let me know if you'd rather something different.`;
    case 'style':
      return `I'll design it with a *${d.style}* vibe${industry}. Happy to swap that if you have something specific in mind.`;
    case 'symbol':
      return `I'll use *${d.symbol}* as the symbol direction. Say the word if you want a different concept.`;
    default:
      return `Got it — I'll pick something that fits${industry}. You can always tell me to change it.`;
  }
}

module.exports = {
  defaultsFor,
  describeDefault,
  INDUSTRY_DEFAULTS,
  FALLBACK,
};
