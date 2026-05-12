// Shared helpers + boilerplate used by all four portfolio templates
// (general / designer / photographer / developer).
//
// Each template file imports leaf utilities from here so we don't duplicate
// escaping / name-shaping / fallback logic across four ~1500-line modules.

const { env } = require('../../../config/env');
const { renderActivationBanner } = require('../../activationBanner');
const { consentField, generatePrivacyBody } = require('../_privacy');

const PUBLIC_API_BASE = process.env.PUBLIC_API_BASE_URL || env.chatbot.baseUrl;

// ─── escaping ───────────────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
const attr = (s) => esc(s).replace(/\n/g, ' ');
const pad2 = (n) => String(n).padStart(2, '0');

// ─── name shaping ──────────────────────────────────────────────────────────
function asSkillName(s) {
  if (typeof s === 'string') return s;
  if (s && typeof s === 'object') return s.title || s.name || s.label || '';
  return '';
}
function normalizeSkillsList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(asSkillName).filter(Boolean);
}
function firstNameOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts[0] || (name || 'Maker');
}
function initialsOf(name) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join('') || '·';
}
function firstInitialOf(name) {
  return ((name || '?').trim().charAt(0) || '·').toUpperCase();
}
function projectInitials(title) {
  return String(title || '·')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join('') || '·';
}

function quarterLabel() {
  const q = Math.ceil((new Date().getMonth() + 2) / 3);
  return `Q${q} ${new Date().getFullYear()}`;
}

// Italicize the last word of a title (used for section displays like
// "Recent <em>work</em>"). When only one word, italicize the whole thing.
function italicAccent(text) {
  const words = String(text).trim().split(/\s+/);
  if (words.length < 2) return `<em class="italic-accent">${esc(text)}</em>`;
  const last = words.pop();
  return `${esc(words.join(' '))} <em class="italic-accent">${esc(last)}</em>`;
}

// Italicize the FIRST word — used for "Hi, I'm" hero greetings.
function italicFirst(text) {
  const words = String(text).trim().split(/\s+/);
  if (words.length < 2) return `<em class="italic-accent">${esc(text)}</em>`;
  const first = words.shift();
  return `<em class="italic-accent">${esc(first)}</em> ${esc(words.join(' '))}`;
}

function bioParagraphs(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  if (raw.includes('\n\n')) return raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const sentences = raw.split(/(?<=[.!?])\s+/);
  if (sentences.length <= 2) return [raw];
  const half = Math.ceil(sentences.length / 2);
  return [sentences.slice(0, half).join(' '), sentences.slice(half).join(' ')];
}

// ─── meta tags ──────────────────────────────────────────────────────────────
function getJsonLd(c) {
  const place = c.contactAddress || (Array.isArray(c.serviceAreas) && c.serviceAreas[0]) || '';
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: c.businessName,
    jobTitle: c.industry || 'Creative',
  };
  if (place) data.address = { '@type': 'PostalAddress', addressLocality: place };
  if (c.contactEmail) data.email = `mailto:${c.contactEmail}`;
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

// Inline SVG favicon — first initial in serif on the template's bg color.
function getFavicon(c, bg) {
  const initial = firstInitialOf(c.businessName);
  const bgHex = (bg || '#FAF8F4').replace('#', '%23');
  return `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='${bgHex}'/><text x='50' y='72' font-family='Georgia,serif' font-size='72' fill='%230A0A0A' text-anchor='middle'>${encodeURIComponent(initial)}</text></svg>">`;
}

module.exports = {
  PUBLIC_API_BASE,
  renderActivationBanner,
  consentField,
  generatePrivacyBody,
  esc, attr, pad2,
  asSkillName, normalizeSkillsList,
  firstNameOf, initialsOf, firstInitialOf, projectInitials,
  quarterLabel, bioParagraphs,
  italicAccent, italicFirst,
  getJsonLd, getFavicon,
};
