// Pixie Portfolio — Photographer Template
//
// For wedding / portrait / event / family / commercial photographers.
// Image-led: photos ARE the product, the site disappears.
//
// Key differences from general/designer:
//   - Cormorant Garamond display (not Fraunces) — classical wedding/portrait elegance
//   - Olive-sage accent (#6B7A5A) used very sparingly
//   - Full-bleed hero IMAGE instead of typography hero
//   - Masonry/mosaic grid (mixed sizes) instead of alternating cards
//   - Packages section with pricing — conversion-critical
//   - Dark contact section with inquiry form (date, event type, message)
//   - NO custom cursor, letter-rise, magnetic, marquee, glyph dividers, side rail

const {
  PUBLIC_API_BASE, renderActivationBanner, consentField, generatePrivacyBody,
  esc, attr, pad2, normalizeSkillsList,
  firstNameOf,
  quarterLabel, bioParagraphs,
  italicAccent,
  getJsonLd, getFavicon,
} = require('./_shared');

// ─── content fallbacks ──────────────────────────────────────────────────────
function defaultPackages() {
  return [
    { label: '',          name: 'Mini Session',   price: '$450',  duration: '45 min · 1 location', includes: ['45-minute session', '25 edited high-resolution images', 'Online gallery', 'Print release'] },
    { label: 'POPULAR',   name: 'Portrait Session', price: '$850', duration: '2 hours · 2 locations', includes: ['2-hour session', '60 edited high-resolution images', 'Online gallery', 'Pre-session styling call', 'Print release', '5 fine-art prints'] },
    { label: '',          name: 'Wedding Day',    price: 'Starting at $3,400', duration: '8 hours coverage', includes: ['8-hour wedding day coverage', '500+ edited high-resolution images', 'Online gallery', 'Engagement session', 'Pre-wedding planning meeting', 'Custom heirloom album available'] },
  ];
}

function defaultPlaceholderProjects() {
  return [
    { title: 'Maya & Owen',           role: 'Wedding',     year: '2024', link: '', tools: ['Wedding'],   photoUrl: null, description: 'A late-summer wedding in the foothills.' },
    { title: 'Sara at Home',           role: 'Portrait',    year: '2024', link: '', tools: ['Portrait'],  photoUrl: null, description: 'A quiet morning portrait session.' },
    { title: 'Field Kitchen Launch',   role: 'Commercial',  year: '2024', link: '', tools: ['Brand'],     photoUrl: null, description: 'Lifestyle imagery for a farm-to-table launch.' },
    { title: 'The Robinsons',          role: 'Family',      year: '2023', link: '', tools: ['Family'],    photoUrl: null, description: 'Three generations on the family farm.' },
    { title: 'Cara — Branding',        role: 'Personal Brand', year: '2024', link: '', tools: ['Brand'], photoUrl: null, description: 'Editorial brand session for a coach.' },
    { title: 'June + Daisy',           role: 'Engagement',  year: '2024', link: '', tools: ['Engagement'], photoUrl: null, description: 'Sunset hour at the lake.' },
  ];
}

// ─── styles ─────────────────────────────────────────────────────────────────
function getStyles() {
  return `
:root {
  --bg-primary:    #FCFBF8;
  --bg-secondary:  #FFFFFF;
  --bg-dark:       #1A1816;
  --ink-primary:   #1A1816;
  --ink-secondary: #6B6862;
  --ink-tertiary:  #A09B92;
  --ink-inverse:   #F8F6F2;
  --accent:        #6B7A5A;
  --accent-hover:  #4F5C42;
  --accent-soft:   #E0E3D8;
  --line:          rgba(26, 24, 22, 0.08);
  --line-strong:   rgba(26, 24, 22, 0.18);

  --space-1: 4px;   --space-2: 8px;    --space-3: 16px;  --space-4: 24px;
  --space-5: 32px;  --space-6: 48px;   --space-7: 64px;  --space-8: 96px;
  --space-9: 128px; --space-10: 192px;

  --ease-out:   cubic-bezier(0.22, 1, 0.36, 1);
  --ease-expo:  cubic-bezier(0.19, 1, 0.22, 1);

  --dur-fast: 200ms;
  --dur-base: 400ms;
  --dur-slow: 800ms;

  --font-display: 'Cormorant Garamond', Georgia, serif;
  --font-body:    'Inter', system-ui, -apple-system, sans-serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
body {
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.7;
  color: var(--ink-primary);
  background: var(--bg-primary);
  font-weight: 400;
  overflow-x: hidden;
  opacity: 0;
  transition: opacity 600ms var(--ease-out);
}
body.fonts-loaded { opacity: 1; }
::selection { background: var(--accent); color: var(--bg-primary); }
a { color: inherit; text-decoration: none; transition: color var(--dur-fast) var(--ease-out); }
img { max-width: 100%; display: block; }
button { font: inherit; cursor: pointer; border: 0; background: transparent; color: inherit; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }

h1, h2, h3, h4 {
  font-family: var(--font-display);
  font-weight: 400;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: var(--ink-primary);
}
em.italic-accent { font-style: italic; color: var(--accent); }

.skip-link {
  position: absolute; top: -100px; left: var(--space-3);
  padding: 12px 18px;
  background: var(--ink-primary); color: var(--bg-primary);
  font-size: 13px; font-weight: 600;
  z-index: 200;
  transition: top var(--dur-fast) var(--ease-out);
}
.skip-link:focus { top: var(--space-3); }

.container {
  max-width: 1320px; margin: 0 auto;
  padding: 0 var(--space-7);
}
@media (max-width: 1023px) { .container { padding: 0 var(--space-5); } }
@media (max-width: 767px)  { .container { padding: 0 var(--space-4); } }

.eyebrow {
  font-family: var(--font-body);
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--ink-tertiary);
  display: inline-block;
}

section { padding: var(--space-9) 0; position: relative; }
@media (max-width: 767px) { section { padding: var(--space-8) 0; } }

/* ─── nav ─────────────────────────────────────────────────────────────── */
.nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 50;
  transition: background var(--dur-base) var(--ease-out), backdrop-filter var(--dur-base) var(--ease-out);
}
.nav.scrolled {
  background: rgba(252, 251, 248, 0.92);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}
.nav-inner {
  max-width: 1320px; margin: 0 auto;
  padding: 24px var(--space-7);
  display: flex; align-items: center; justify-content: space-between;
  transition: padding var(--dur-base) var(--ease-out);
}
.nav.scrolled .nav-inner { padding: 18px var(--space-7); }
@media (max-width: 1023px) { .nav-inner { padding: 18px var(--space-5); } }
@media (max-width: 767px)  { .nav-inner { padding: 16px var(--space-4); } }

.nav-mark {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 28px;
  font-weight: 400;
  color: var(--ink-inverse);
  transition: color var(--dur-base) var(--ease-out);
}
.nav.scrolled .nav-mark { color: var(--ink-primary); }
.nav-right { display: flex; align-items: center; gap: var(--space-5); }
.nav-links {
  display: flex; align-items: center; gap: var(--space-5);
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.18em; text-transform: uppercase;
}
.nav-links a {
  color: var(--ink-inverse);
  transition: color var(--dur-base) var(--ease-out);
  padding: 4px 0;
}
.nav.scrolled .nav-links a { color: var(--ink-primary); }
.nav-links a:hover { color: var(--accent); }

.nav-cta {
  display: inline-flex; align-items: center;
  padding: 10px 22px;
  border: 1px solid var(--ink-inverse);
  color: var(--ink-inverse);
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.18em; text-transform: uppercase;
  min-height: 40px;
  transition: background var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out);
}
.nav-cta:hover { background: var(--ink-inverse); color: var(--ink-primary); }
.nav.scrolled .nav-cta { border-color: var(--ink-primary); color: var(--ink-primary); }
.nav.scrolled .nav-cta:hover { background: var(--ink-primary); color: var(--bg-primary); }

.nav-burger {
  display: none;
  width: 44px; height: 44px;
  align-items: center; justify-content: center;
  flex-direction: column; gap: 5px;
}
.nav-burger span { display: block; width: 22px; height: 1.5px; background: var(--ink-inverse); transition: background var(--dur-base) var(--ease-out); }
.nav.scrolled .nav-burger span { background: var(--ink-primary); }
@media (max-width: 767px) {
  .nav-links { display: none; }
  .nav-burger { display: inline-flex; }
  .nav-cta { display: none; }
}

.nav-overlay {
  position: fixed; inset: 0;
  background: var(--bg-primary);
  z-index: 100;
  transform: translateX(100%);
  transition: transform var(--dur-base) var(--ease-out);
  padding: var(--space-5) var(--space-4);
  display: flex; flex-direction: column;
}
.nav-overlay.open { transform: translateX(0); }
.nav-overlay-top { display: flex; justify-content: space-between; align-items: center; }
.nav-overlay-close { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; padding: 8px 12px; min-height: 44px; display: inline-flex; align-items: center; }
.nav-overlay-links { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: var(--space-4); }
.nav-overlay-links a {
  font-family: var(--font-display);
  font-size: clamp(28px, 6vw, 40px);
  font-weight: 400;
  padding: 12px 0;
}

/* ─── hero (image-led, structured) ─────────────────────────────────── */
.hero {
  min-height: 100vh; min-height: 100svh;
  position: relative;
  overflow: hidden;
  padding: 0;
}
.hero-image-wrap { position: absolute; inset: 0; z-index: 0; }
.hero-image {
  width: 100%; height: 100%;
  object-fit: cover; object-position: center;
  transform: scale(1.06);
  transition: transform 2.2s var(--ease-out);
}
body.fonts-loaded .hero-image { transform: scale(1.0); }
.hero-image-fallback {
  width: 100%; height: 100%;
  background: linear-gradient(180deg, #2A2624 0%, #14110F 100%);
  display: flex; align-items: center; justify-content: center;
}
.hero-image-fallback svg { width: 80px; height: 80px; opacity: 0.3; }
.hero-image-vignette {
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse at center, rgba(26,24,22,0) 0%, rgba(26,24,22,0.25) 75%, rgba(26,24,22,0.55) 100%),
    linear-gradient(to bottom, rgba(26,24,22,0.35) 0%, rgba(26,24,22,0) 25%, rgba(26,24,22,0) 60%, rgba(26,24,22,0.65) 100%);
  pointer-events: none;
}
.hero-overlay {
  position: absolute; inset: 0; z-index: 2;
  display: grid;
  grid-template-rows: auto 1fr auto;
  padding: 120px var(--space-7) var(--space-7);
  color: var(--ink-inverse);
}
.hero-eyebrow {
  font-family: var(--font-body);
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: rgba(248, 246, 242, 0.78);
  display: flex; align-items: center; gap: var(--space-3);
  opacity: 0; transform: translateY(-10px);
  transition: opacity 1s var(--ease-expo) 100ms, transform 1s var(--ease-expo) 100ms;
}
.hero-eyebrow .rule { flex: 0 0 32px; height: 1px; background: rgba(248,246,242,0.5); display: inline-block; }
.hero-mid {
  display: flex; align-items: center;
  padding: var(--space-6) 0;
}
.hero-name {
  font-family: var(--font-display);
  font-size: clamp(56px, 11vw, 168px);
  font-weight: 400;
  font-style: italic;
  line-height: 0.95;
  letter-spacing: -0.025em;
  max-width: 14ch;
  color: var(--ink-inverse);
  text-shadow: 0 2px 32px rgba(0,0,0,0.18);
  opacity: 0; transform: translateY(40px);
  transition: opacity 1.4s var(--ease-expo) 300ms, transform 1.4s var(--ease-expo) 300ms;
}
.hero-bot { display: flex; flex-direction: column; gap: var(--space-4); }
.hero-tagline {
  font-family: var(--font-display);
  font-size: clamp(18px, 2vw, 26px);
  line-height: 1.4;
  color: rgba(248, 246, 242, 0.92);
  max-width: 540px;
  opacity: 0; transform: translateY(20px);
  transition: opacity 1s var(--ease-expo) 700ms, transform 1s var(--ease-expo) 700ms;
}
.hero-cta {
  display: flex; gap: var(--space-4); align-items: center; flex-wrap: wrap;
  opacity: 0; transform: translateY(20px);
  transition: opacity 1s var(--ease-expo) 900ms, transform 1s var(--ease-expo) 900ms;
}
body.fonts-loaded .hero-eyebrow { opacity: 1; transform: translateY(0); }
body.fonts-loaded .hero-name,
body.fonts-loaded .hero-tagline,
body.fonts-loaded .hero-cta { opacity: 1; transform: translateY(0); }

.btn {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 14px 32px;
  font-family: var(--font-body);
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.24em; text-transform: uppercase;
  min-height: 44px;
  transition: background var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out);
}
.btn-primary {
  background: var(--ink-inverse);
  color: var(--ink-primary);
  border: 1px solid var(--ink-inverse);
}
.btn-primary:hover { background: transparent; color: var(--ink-inverse); }
.btn-text {
  color: var(--ink-inverse);
  padding: 14px 0;
  border-bottom: 1px solid transparent;
}
.btn-text:hover { border-bottom-color: var(--ink-inverse); }
.btn-text svg { width: 14px; height: 10px; transition: transform var(--dur-base) var(--ease-out); }
.btn-text:hover svg { transform: translateX(4px); }

@media (max-width: 767px) {
  .hero-overlay { padding: var(--space-5); }
  .hero-cta { flex-direction: column; align-items: stretch; gap: var(--space-3); }
  .hero-cta .btn { width: 100%; justify-content: center; }
}

/* ─── filter row ──────────────────────────────────────────────────────── */
.work-head { margin-bottom: var(--space-7); display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--space-3); }
.work-head h2 { font-size: clamp(32px, 5vw, 72px); letter-spacing: -0.02em; }
.work-filter {
  display: flex; flex-wrap: wrap; justify-content: center;
  gap: var(--space-4);
  margin-bottom: var(--space-7);
  padding-top: var(--space-5);
  border-top: 1px solid var(--line);
}
.work-filter button {
  font-family: var(--font-body);
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.24em; text-transform: uppercase;
  color: var(--ink-secondary);
  padding: 8px 4px;
  position: relative;
  cursor: pointer;
  transition: color var(--dur-base) var(--ease-out);
}
.work-filter button::after {
  content: ''; position: absolute;
  left: 50%; bottom: 0;
  width: 0; height: 1px;
  background: var(--accent);
  transform: translateX(-50%);
  transition: width var(--dur-base) var(--ease-out);
}
.work-filter button.active, .work-filter button:hover { color: var(--ink-primary); }
.work-filter button.active::after { width: 100%; }

/* ─── year ticker (left margin) ─────────────────────────────────────── */
.year-ticker {
  position: fixed;
  left: 28px; top: 50%;
  transform: translateY(-50%);
  display: flex; flex-direction: column; gap: 14px;
  z-index: 40;
  pointer-events: none;
}
.year-ticker-item {
  font-family: var(--font-body);
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.32em;
  color: var(--ink-tertiary);
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  transition: color 0.4s var(--ease-out), letter-spacing 0.4s var(--ease-out);
  font-feature-settings: "lnum" 1, "tnum" 1;
}
.year-ticker-item.active { color: var(--accent); letter-spacing: 0.42em; }
@media (max-width: 1023px) { .year-ticker { display: none; } }

/* ─── mosaic grid ─────────────────────────────────────────────────────── */
.work-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-auto-flow: row dense;
  gap: var(--space-4);
}
/* Square unit. Every tile — including the 2×2 feature — keeps aspect-ratio:1,
   so a feature is exactly the height of two stacked base rows plus the gap:
   rows align perfectly and dense flow backfills holes, so there are never
   orphan gaps regardless of project count. */
.work-item {
  position: relative;
  overflow: hidden;
  aspect-ratio: 1 / 1;
  background: var(--accent-soft);
  cursor: pointer;
  isolation: isolate;
  transition: box-shadow 0.5s var(--ease-out), opacity 0.8s var(--ease-expo), transform 0.8s var(--ease-expo);
}
.work-item.is-feature { grid-column: span 2; grid-row: span 2; }
/* Scroll-reveal: each tile rises + fades as its row scrolls into view; the
   JS staggers them per row via data-reveal-delay. */
.work-item.is-reveal { opacity: 0; transform: translateY(28px); }
.work-item.is-reveal.in { opacity: 1; transform: none; }
.work-item:hover { z-index: 5; box-shadow: 0 24px 56px rgba(26,24,22,0.18); }
@media (max-width: 1023px) {
  .work-grid { grid-template-columns: repeat(2, 1fr); gap: var(--space-3); }
  .work-item.is-feature { grid-column: span 2; grid-row: span 1; aspect-ratio: 16 / 10; }
}
@media (max-width: 640px) {
  .work-grid { grid-template-columns: 1fr; }
  .work-item, .work-item.is-feature { grid-column: span 1; grid-row: span 1; aspect-ratio: 4 / 5; }
}
.work-item-img {
  position: absolute; inset: 0;
  background-size: cover; background-position: center;
  transition: transform 0.7s var(--ease-out), filter 0.5s var(--ease-out);
}
.work-item:hover .work-item-img { transform: scale(1.05); filter: brightness(0.9); }

/* Image-less tiles — full-bleed typographic statement, alternating tones */
.work-item-empty {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; justify-content: space-between;
  padding: var(--space-5) var(--space-5) var(--space-4);
}
.work-item-empty .corner-meta {
  font-family: var(--font-body);
  font-size: 10px; font-weight: 500;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  font-feature-settings: "lnum" 1, "tnum" 1;
}
.work-item-empty .display-title {
  font-family: var(--font-display);
  font-style: italic;
  font-weight: 400;
  font-size: clamp(40px, 5.4vw, 96px);
  line-height: 0.95;
  letter-spacing: -0.025em;
  max-width: 11ch;
  margin-top: auto;
}
.work-item-empty .corner-bot {
  display: flex; justify-content: space-between; align-items: baseline;
  font-family: var(--font-body);
  font-size: 10px; font-weight: 500;
  letter-spacing: 0.24em; text-transform: uppercase;
}
.work-item-empty .ord {
  font-family: var(--font-display);
  font-style: italic; font-size: 16px;
  letter-spacing: 0; text-transform: none;
}
/* tone variants */
.work-item-empty.tone-cream    { background: #F1ECE0; color: var(--ink-primary); }
.work-item-empty.tone-cream    .corner-meta, .work-item-empty.tone-cream .corner-bot { color: var(--ink-secondary); }
.work-item-empty.tone-sage     { background: #E0E3D8; color: var(--ink-primary); }
.work-item-empty.tone-sage     .corner-meta, .work-item-empty.tone-sage .corner-bot { color: var(--ink-secondary); }
.work-item-empty.tone-charcoal { background: #1A1816; color: var(--ink-inverse); }
.work-item-empty.tone-charcoal .corner-meta, .work-item-empty.tone-charcoal .corner-bot { color: rgba(248,246,242,0.55); }
.work-item-empty.tone-taupe    { background: #C9C0B2; color: var(--ink-primary); }
.work-item-empty.tone-taupe    .corner-meta, .work-item-empty.tone-taupe .corner-bot { color: var(--ink-secondary); }
.work-item-empty.tone-rose     { background: #D8C3BC; color: var(--ink-primary); }
.work-item-empty.tone-rose     .corner-meta, .work-item-empty.tone-rose .corner-bot { color: var(--ink-secondary); }
.work-item:hover .work-item-empty .display-title { transform: translateX(6px); }
.work-item-empty .display-title { transition: transform 0.5s var(--ease-out); }

.work-item-caption {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: column; gap: 3px;
  padding: var(--space-5) var(--space-4) var(--space-3);
  color: var(--ink-inverse);
  background: linear-gradient(to top, rgba(26,24,22,0.74) 0%, rgba(26,24,22,0.12) 58%, rgba(26,24,22,0) 100%);
  transform: translateY(0);
  transition: background 0.4s var(--ease-out);
  z-index: 3;
}
.work-item:hover .work-item-caption {
  background: linear-gradient(to top, rgba(26,24,22,0.82) 0%, rgba(26,24,22,0.22) 62%, rgba(26,24,22,0) 100%);
}
.work-item-caption .ttl {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 18px;
  font-weight: 400;
  line-height: 1.1;
}
.work-item.is-feature .work-item-caption .ttl { font-size: 24px; }
.work-item-caption .cat {
  font-family: var(--font-body);
  font-size: 10px; font-weight: 500;
  letter-spacing: 0.24em; text-transform: uppercase;
  color: rgba(248, 246, 242, 0.78);
}

/* ─── work-item expand cue ──────────────────────────────────────────── */
.work-item-expand {
  position: absolute; top: var(--space-3); right: var(--space-3);
  width: 38px; height: 38px;
  display: flex; align-items: center; justify-content: center;
  color: var(--ink-inverse);
  background: rgba(26, 24, 22, 0.34);
  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
  border-radius: 50%;
  opacity: 0; transform: scale(0.85);
  transition: opacity 0.4s var(--ease-out), transform 0.4s var(--ease-out);
  z-index: 3; pointer-events: none;
}
.work-item-expand svg { width: 17px; height: 17px; }
.work-item:hover .work-item-expand,
.work-item:focus-visible .work-item-expand { opacity: 1; transform: scale(1); }

/* ─── Recent moments — dual-row conveyor ("train") ──────────────────────── */
.work-marquee { display: flex; flex-direction: column; gap: clamp(12px, 1.4vw, 20px); width: 100%; }
.work-row {
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 5%, #000 95%, transparent);
  mask-image: linear-gradient(to right, transparent, #000 5%, #000 95%, transparent);
}
.work-row-track { display: flex; width: max-content; will-change: transform; }
.work-row-a .work-row-track { animation: moment-train-l 55s linear infinite; }
.work-row-b .work-row-track { animation: moment-train-r 67s linear infinite; }
/* Pause the whole conveyor on hover so a tile can be clicked into the lightbox. */
.work-marquee:hover .work-row-track { animation-play-state: paused; }
@keyframes moment-train-l { from { transform: translateX(0); }    to { transform: translateX(-50%); } }
@keyframes moment-train-r { from { transform: translateX(-50%); } to { transform: translateX(0); } }

.moment-card {
  position: relative; flex: 0 0 auto;
  width: clamp(220px, 26vw, 330px); aspect-ratio: 4 / 5;
  margin-right: clamp(12px, 1.4vw, 20px);
  border-radius: 10px; overflow: hidden;
  background: #ECE7DD;
  box-shadow: 0 10px 30px rgba(26, 24, 22, 0.10);
  transition: transform 0.5s var(--ease-out), box-shadow 0.5s var(--ease-out);
}
.moment-card:hover { transform: translateY(-6px); box-shadow: 0 26px 60px rgba(26, 24, 22, 0.20); }
.moment-img {
  position: absolute; inset: 0;
  background-size: cover; background-position: center;
  transition: transform 0.7s var(--ease-out), filter 0.5s var(--ease-out);
}
.moment-card:hover .moment-img { transform: scale(1.06); filter: brightness(0.92); }
.moment-caption {
  position: absolute; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: column; gap: 2px;
  padding: 34px var(--space-3) var(--space-3);
  color: var(--ink-inverse);
  background: linear-gradient(to top, rgba(26, 24, 22, 0.68), rgba(26, 24, 22, 0));
  opacity: 0; transform: translateY(8px);
  transition: opacity 0.4s var(--ease-out), transform 0.4s var(--ease-out);
}
.moment-card:hover .moment-caption { opacity: 1; transform: none; }
.moment-caption .ttl { font-size: 15px; font-weight: 500; letter-spacing: 0.01em; }
.moment-caption .cat { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.82; }
@media (max-width: 767px) { .moment-card { width: clamp(180px, 64vw, 260px); } }
@media (prefers-reduced-motion: reduce) {
  .work-row-track { animation: none !important; transform: none !important; }
  .work-row { overflow-x: auto; -webkit-overflow-scrolling: touch; }
}

/* ─── lightbox ──────────────────────────────────────────────────────── */
.lightbox {
  position: fixed; inset: 0; z-index: 200;
  display: flex; align-items: center; justify-content: center;
  padding: clamp(20px, 5vw, 64px);
  background: rgba(20, 17, 15, 0.94);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  opacity: 0; visibility: hidden;
  transition: opacity 0.45s var(--ease-out), visibility 0.45s var(--ease-out);
}
.lightbox.open { opacity: 1; visibility: visible; }
.lightbox-figure {
  margin: 0; max-width: 100%; max-height: 100%;
  display: flex; flex-direction: column; align-items: center; gap: var(--space-4);
  transform: scale(0.97); opacity: 0;
  transition: transform 0.5s var(--ease-expo), opacity 0.5s var(--ease-expo);
}
.lightbox.open .lightbox-figure { transform: scale(1); opacity: 1; }
.lightbox-img {
  max-width: 100%; max-height: 78vh;
  object-fit: contain;
  border-radius: 2px;
  box-shadow: 0 40px 90px rgba(0, 0, 0, 0.5);
}
.lightbox-caption {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  text-align: center; color: var(--ink-inverse);
}
.lightbox-caption .lb-title { font-family: var(--font-display); font-style: italic; font-size: 24px; }
.lightbox-caption .lb-meta { font-family: var(--font-body); font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase; color: rgba(248, 246, 242, 0.6); }
.lightbox-caption .lb-link {
  margin-top: 6px; font-family: var(--font-body); font-size: 11px; font-weight: 500;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent);
  border-bottom: 1px solid currentColor; padding-bottom: 2px;
}
.lightbox-caption .lb-link[hidden] { display: none; }
.lightbox-close, .lightbox-nav {
  position: absolute; z-index: 2;
  display: flex; align-items: center; justify-content: center;
  background: rgba(248, 246, 242, 0.08);
  color: var(--ink-inverse);
  border: 1px solid rgba(248, 246, 242, 0.16);
  border-radius: 50%; cursor: pointer;
  transition: background 0.3s var(--ease-out), border-color 0.3s var(--ease-out), transform 0.3s var(--ease-out);
}
.lightbox-close:hover, .lightbox-nav:hover { background: rgba(248, 246, 242, 0.18); border-color: rgba(248, 246, 242, 0.4); }
.lightbox-close { top: clamp(16px, 4vw, 36px); right: clamp(16px, 4vw, 36px); width: 48px; height: 48px; }
.lightbox-nav { top: 50%; transform: translateY(-50%); width: 52px; height: 52px; }
.lightbox-nav:hover { transform: translateY(-50%) scale(1.06); }
.lightbox-prev { left: clamp(12px, 3vw, 32px); }
.lightbox-next { right: clamp(12px, 3vw, 32px); }
.lightbox-close svg, .lightbox-nav svg { width: 20px; height: 20px; }
.lightbox-counter {
  position: absolute; bottom: clamp(16px, 4vw, 36px); left: 50%; transform: translateX(-50%);
  font-family: var(--font-body); font-size: 11px; letter-spacing: 0.24em;
  color: rgba(248, 246, 242, 0.55);
  font-feature-settings: "lnum" 1, "tnum" 1;
}
@media (max-width: 640px) {
  .lightbox-nav { width: 44px; height: 44px; }
  .lightbox-img { max-height: 70vh; }
}

/* ─── page-break dividers ──────────────────────────────────────────── */
.page-break {
  display: flex; align-items: center; justify-content: center;
  gap: var(--space-3);
  padding: var(--space-7) 0 var(--space-5);
  font-family: var(--font-body);
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--ink-tertiary);
}
.page-break .rom {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 22px;
  letter-spacing: 0;
  text-transform: none;
  color: var(--accent);
}
.page-break .rule { width: 56px; height: 1px; background: var(--line-strong); display: inline-block; }
@media (max-width: 767px) { .page-break { padding: var(--space-5) 0 var(--space-4); } .page-break .rule { width: 40px; } }

/* ─── about ───────────────────────────────────────────────────────────── */
.about { text-align: center; }
.about-inner { max-width: 640px; margin: 0 auto; }
.about-photo-wrap {
  width: 220px; height: 220px;
  margin: 0 auto var(--space-5);
  border-radius: 999px;
  overflow: hidden;
  background: var(--accent-soft);
}
.about-photo-wrap img { width: 100%; height: 100%; object-fit: cover; }
.about-eyebrow { margin-bottom: var(--space-3); }
.about-title {
  font-size: clamp(36px, 5vw, 64px);
  letter-spacing: -0.02em;
  margin-bottom: var(--space-5);
}
.about-body p {
  font-family: var(--font-body);
  font-size: 17px;
  line-height: 1.7;
  color: var(--ink-primary);
  margin-bottom: var(--space-3);
}
.about-signoff {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 22px;
  color: var(--ink-secondary);
  margin-top: var(--space-5);
}

.featured-in {
  margin-top: var(--space-8);
  padding-top: var(--space-5);
  border-top: 1px solid var(--line);
}
.featured-in-eyebrow { margin-bottom: var(--space-4); }
.featured-in-row {
  display: flex; flex-wrap: wrap; justify-content: center; align-items: center;
  gap: var(--space-5);
  font-family: var(--font-display);
  font-style: italic;
  font-size: 22px;
  color: var(--ink-tertiary);
}
.featured-in-row .dot { color: var(--ink-tertiary); font-style: normal; }

/* ─── packages ────────────────────────────────────────────────────────── */
.packages-head { text-align: center; margin-bottom: var(--space-7); }
.packages-head h2 { font-size: clamp(32px, 5vw, 72px); margin-top: var(--space-3); }
.packages-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-5);
}
@media (max-width: 1023px) { .packages-grid { grid-template-columns: 1fr; } }
.package-card {
  background: var(--bg-secondary);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: var(--space-6);
  display: flex; flex-direction: column;
  position: relative;
  transition: border-color var(--dur-base) var(--ease-out), transform 0.8s var(--ease-expo), box-shadow var(--dur-base) var(--ease-out), opacity 0.8s var(--ease-expo);
}
.package-card:hover {
  border-color: var(--accent);
  transform: translateY(-4px);
  box-shadow: 0 24px 48px rgba(26,24,22,0.06);
}
/* Scroll-reveal: cards stagger in (JS sets data-reveal-delay). */
.package-card.is-reveal { opacity: 0; transform: translateY(28px); }
.package-card.is-reveal.in { opacity: 1; transform: none; }
.package-tag {
  position: absolute; top: -12px; left: 50%;
  transform: translateX(-50%);
  background: var(--accent);
  color: var(--ink-inverse);
  padding: 6px 14px;
  border-radius: 999px;
  font-family: var(--font-body);
  font-size: 10px; font-weight: 500;
  letter-spacing: 0.24em; text-transform: uppercase;
}
.package-eyebrow {
  font-family: var(--font-body);
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.24em; text-transform: uppercase;
  color: var(--ink-tertiary);
  margin-bottom: var(--space-3);
}
.package-name {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 400;
  letter-spacing: -0.01em;
  margin-bottom: var(--space-3);
}
.package-price {
  font-family: var(--font-display);
  font-size: 36px;
  font-weight: 500;
  color: var(--ink-primary);
  margin-bottom: var(--space-2);
  letter-spacing: -0.01em;
}
.package-duration {
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink-secondary);
  margin-bottom: var(--space-5);
  letter-spacing: 0.04em;
}
.package-includes {
  list-style: none;
  border-top: 1px solid var(--line);
  padding-top: var(--space-4);
  margin-bottom: var(--space-5);
  flex: 1;
}
.package-includes li {
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 2;
  color: var(--ink-primary);
  display: flex; gap: var(--space-3);
}
.package-includes li::before {
  content: '—';
  color: var(--accent);
  flex-shrink: 0;
}
.package-cta {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 14px 24px;
  background: transparent;
  color: var(--ink-primary);
  border: 1px solid var(--ink-primary);
  border-radius: 0;
  font-family: var(--font-body);
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.24em; text-transform: uppercase;
  min-height: 44px;
  transition: background var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out);
}
.package-cta:hover { background: var(--ink-primary); color: var(--bg-primary); }

/* ─── testimonial ─────────────────────────────────────────────────────── */
.testimonial { text-align: center; padding: var(--space-9) 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.testimonial-eyebrow { margin-bottom: var(--space-5); }
.testimonial-inner { max-width: 760px; margin: 0 auto; position: relative; }
.testimonial-mark {
  font-family: var(--font-display);
  font-style: italic;
  font-size: clamp(120px, 16vw, 200px);
  line-height: 0.6;
  color: var(--accent-soft);
  position: absolute;
  top: -20px; left: -20px;
  pointer-events: none;
}
.testimonial-quote {
  font-family: var(--font-display);
  font-style: italic;
  font-weight: 400;
  font-size: clamp(20px, 2.4vw, 32px);
  line-height: 1.5;
  color: var(--ink-primary);
  position: relative; z-index: 1;
}
.testimonial-attr {
  margin-top: var(--space-5);
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--ink-secondary);
  letter-spacing: 0.04em;
}

/* ─── contact (dark inquiry section) ──────────────────────────────────── */
.contact-section {
  background: var(--bg-dark);
  color: var(--ink-inverse);
  /* Less bottom padding: the contact section is dark and flows straight into
     the dark footer image, so a full space-10 bottom reads as a dead black
     band. Smaller bottom keeps the form close to the closing image. */
  padding: var(--space-10) 0 var(--space-8);
}
.contact-grid {
  display: grid;
  grid-template-columns: 5fr 7fr;
  gap: var(--space-8);
  align-items: start;
}
@media (max-width: 1023px) { .contact-grid { grid-template-columns: 1fr; gap: var(--space-7); } }

.contact-col-l .eyebrow { color: rgba(248, 246, 242, 0.65); margin-bottom: var(--space-4); }
.contact-col-l h2 {
  font-size: clamp(36px, 5vw, 64px);
  letter-spacing: -0.02em;
  color: var(--ink-inverse);
  margin-bottom: var(--space-4);
}
.contact-col-l h2 em { font-style: italic; color: var(--accent); }
.contact-col-l p {
  font-family: var(--font-body);
  font-size: 17px;
  color: rgba(248, 246, 242, 0.78);
  margin-bottom: var(--space-5);
  max-width: 38ch;
}
.contact-direct { display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-5); padding-top: var(--space-5); border-top: 1px solid rgba(248, 246, 242, 0.15); }
.contact-direct-item {
  display: flex; flex-direction: column; gap: 4px;
}
.contact-direct-item .lbl {
  font-family: var(--font-body);
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.24em; text-transform: uppercase;
  color: rgba(248, 246, 242, 0.55);
}
.contact-direct-item a {
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--ink-inverse);
  border-bottom: 1px solid rgba(248, 246, 242, 0.3);
  padding-bottom: 1px;
  width: fit-content;
  transition: border-color var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out);
}
.contact-direct-item a:hover { color: var(--accent); border-bottom-color: var(--accent); }
.contact-response {
  margin-top: var(--space-4);
  font-family: var(--font-body);
  font-size: 13px;
  color: rgba(248, 246, 242, 0.55);
  letter-spacing: 0.04em;
}

.inquiry-form { display: flex; flex-direction: column; gap: var(--space-3); }
.inquiry-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
@media (max-width: 640px) { .inquiry-row { grid-template-columns: 1fr; } }
.inquiry-form label {
  display: block;
  font-family: var(--font-body);
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(248, 246, 242, 0.55);
  margin-bottom: 6px;
}
.inquiry-form input, .inquiry-form select, .inquiry-form textarea {
  width: 100%;
  padding: 14px 16px;
  background: rgba(248, 246, 242, 0.05);
  border: 1px solid rgba(248, 246, 242, 0.2);
  color: var(--ink-inverse);
  font-family: inherit;
  font-size: 15px;
  border-radius: 0;
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.inquiry-form input:focus, .inquiry-form select:focus, .inquiry-form textarea:focus { outline: none; border-color: var(--accent); background: rgba(248, 246, 242, 0.08); }
.inquiry-form input::placeholder, .inquiry-form textarea::placeholder { color: rgba(248, 246, 242, 0.35); }
.inquiry-form select { appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path fill='%23F8F6F2' d='M6 8L0 0h12z'/></svg>"); background-repeat: no-repeat; background-position: right 16px center; padding-right: 40px; }
.inquiry-form textarea { min-height: 140px; resize: vertical; }
.inquiry-form .consent { display: flex; align-items: flex-start; gap: 10px; font-size: 12px; color: rgba(248, 246, 242, 0.65); margin-top: var(--space-2); }
.inquiry-form .consent input { width: auto; margin-top: 3px; background: transparent; border: 1px solid rgba(248, 246, 242, 0.4); padding: 0; }
.inquiry-form .consent a { text-decoration: underline; color: var(--ink-inverse); }
.inquiry-submit {
  margin-top: var(--space-4);
  width: 100%;
  padding: 18px 32px;
  background: var(--accent);
  color: var(--ink-inverse);
  font-family: var(--font-body);
  font-size: 12px; font-weight: 500;
  letter-spacing: 0.24em; text-transform: uppercase;
  border: 0; border-radius: 0;
  cursor: pointer;
  transition: background var(--dur-base) var(--ease-out);
  min-height: 48px;
}
.inquiry-submit:hover { background: var(--accent-hover); }
.inquiry-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.inquiry-status { font-size: 13px; color: rgba(248, 246, 242, 0.78); margin-top: var(--space-2); }
.inquiry-status.ok { color: #A3D9A0; }
.inquiry-status.err { color: #F0A8A8; }

/* ─── footer ──────────────────────────────────────────────────────────── */
.footer {
  background: var(--bg-dark);
  color: var(--ink-inverse);
  border-top: 1px solid rgba(248, 246, 242, 0.1);
}
.footer-inner {
  padding: var(--space-8) var(--space-7);
  display: flex; flex-direction: column; align-items: center;
  text-align: center; gap: var(--space-4);
}
.footer-signature {
  font-family: var(--font-display);
  font-style: italic;
  font-size: clamp(56px, 9vw, 96px);
  font-weight: 400;
  line-height: 1;
}
/* Footer text rises + fades in on scroll so the page doesn't end static. */
.footer-signature.is-reveal, .footer-meta.is-reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.9s var(--ease-expo), transform 0.9s var(--ease-expo); }
.footer-signature.is-reveal.in, .footer-meta.is-reveal.in { opacity: 1; transform: none; }
.footer-meta {
  font-family: var(--font-body);
  font-size: 12px;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(248, 246, 242, 0.65);
  display: flex; gap: var(--space-3); align-items: center; flex-wrap: wrap; justify-content: center;
}
.footer-meta a { color: var(--ink-inverse); transition: color var(--dur-base) var(--ease-out); }
.footer-meta a:hover { color: var(--accent); }
.footer-meta .sep { color: rgba(248, 246, 242, 0.4); }

/* ─── reveal ──────────────────────────────────────────────────────────── */
.reveal { opacity: 0; transform: translateY(40px); transition: opacity 0.9s var(--ease-expo), transform 0.9s var(--ease-expo); }
.reveal.in { opacity: 1; transform: none; }

/* ─── slim about/contact/privacy ──────────────────────────────────────── */
.page-section { padding: 160px 0 var(--space-9); }
.page-h1 { font-size: clamp(48px, 7vw, 96px); letter-spacing: -0.02em; line-height: 1; margin-bottom: var(--space-7); max-width: 16ch; }
.page-h1 em { font-style: italic; color: var(--accent); }
.page-body { max-width: 60ch; font-size: 17px; line-height: 1.7; }
.page-body p { margin-bottom: var(--space-3); }
.page-body p a { border-bottom: 1px solid var(--ink-primary); padding-bottom: 1px; }
.page-body p a:hover { color: var(--accent); border-bottom-color: var(--accent); }

/* ─── reduced motion / print ─────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  body { opacity: 1 !important; }
  .hero-eyebrow, .hero-name, .hero-tagline, .hero-cta { opacity: 1 !important; transform: none !important; }
  .reveal, .is-reveal { opacity: 1 !important; transform: none !important; }
}
@media print {
  .nav, .nav-overlay, .work-filter { display: none !important; }
  body { background: white !important; color: black !important; opacity: 1 !important; }
  .hero { min-height: auto !important; }
  .hero-image-wrap { display: none; }
  .hero-overlay { position: relative; color: black; padding: 32px 0; }
}
`;
}

// ─── shared bits ────────────────────────────────────────────────────────────
function getNav(c, currentPath) {
  const onHome = currentPath === '/';
  const link = (label, hash) => onHome
    ? `<a href="#${hash}">${esc(label)}</a>`
    : `<a href="/#${hash}">${esc(label)}</a>`;
  const firstName = firstNameOf(c.businessName);
  return `
<header class="nav" id="nav">
  <div class="nav-inner">
    <a class="nav-mark" href="/">${esc(firstName)}</a>
    <div class="nav-right">
      <nav class="nav-links" aria-label="Primary">
        ${link(c.labels?.navProjects || 'Work', 'work')}
        ${link(c.labels?.navAbout || 'About', 'about')}
        ${link('Packages', 'packages')}
        ${link(c.labels?.navContact || 'Contact', 'contact')}
      </nav>
      <a href="${onHome ? '#contact' : '/#contact'}" class="nav-cta">${esc(c.labels?.btnBookSession || 'Book a session')}</a>
      <button class="nav-burger" id="nav-burger" aria-label="Open menu" aria-expanded="false"><span></span><span></span></button>
    </div>
  </div>
</header>
<div class="nav-overlay" id="nav-overlay" aria-hidden="true">
  <div class="nav-overlay-top">
    <span class="nav-mark">${esc(firstName)}</span>
    <button class="nav-overlay-close" id="nav-overlay-close" aria-label="Close menu">Close</button>
  </div>
  <nav class="nav-overlay-links" aria-label="Mobile">
    <a href="${onHome ? '#work' : '/#work'}">${esc(c.labels?.navProjects || 'Work')}</a>
    <a href="${onHome ? '#about' : '/#about'}">${esc(c.labels?.navAbout || 'About')}</a>
    <a href="${onHome ? '#packages' : '/#packages'}">Packages</a>
    <a href="${onHome ? '#contact' : '/#contact'}">${esc(c.labels?.navContact || 'Contact')}</a>
  </nav>
</div>`;
}

function getFooter(c) {
  const year = new Date().getFullYear();
  const place = c.contactAddress || (Array.isArray(c.serviceAreas) && c.serviceAreas[0]) || '';
  const firstName = firstNameOf(c.businessName);
  const socials = [];
  if (c.instagramHandle) socials.push({ label: 'Instagram', href: `https://instagram.com/${c.instagramHandle}` });
  if (c.contactEmail)    socials.push({ label: 'Email',     href: `mailto:${c.contactEmail}` });
  return `
<footer class="footer">
  <div class="footer-inner">
    <p class="footer-signature is-reveal">${esc(firstName)}</p>
    <div class="footer-meta is-reveal" data-reveal-delay="140">
      <span>© ${year} ${esc(c.businessName)}</span>
      ${place ? `<span class="sep">·</span><span>${esc(place)}</span>` : ''}
      ${socials.map((s) => `<span class="sep">·</span><a href="${attr(s.href)}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join('')}
    </div>
  </div>
</footer>`;
}

function getScripts() {
  return `
<script src="https://cdnjs.cloudflare.com/ajax/libs/lenis/1.0.42/lenis.min.js" defer></script>
<script>
window.addEventListener('DOMContentLoaded', function () {
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lenis;

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { document.body.classList.add('fonts-loaded'); });
  else document.body.classList.add('fonts-loaded');

  function initLenis() {
    if (reduceMotion || typeof Lenis === 'undefined') return;
    lenis = new Lenis({ duration: 1.2, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }, smoothWheel: true });
    function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
  }
  setTimeout(initLenis, 80);

  document.querySelectorAll('a[href^="#"], a[href^="/#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var href = a.getAttribute('href');
      if (!href || href === '#') return;
      var hashIdx = href.indexOf('#');
      if (hashIdx < 0) return;
      var sel = href.slice(hashIdx);
      if (sel === '#') return;
      var t = document.querySelector(sel);
      var samePage = href.startsWith('#') || (window.location.pathname === '/' && href.startsWith('/#'));
      if (t && samePage) {
        e.preventDefault();
        if (lenis) lenis.scrollTo(t, { offset: -80, duration: 1.2 });
        else t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  var nav = document.getElementById('nav');
  function onScroll() {
    if (!nav) return;
    if (window.scrollY > window.innerHeight * 0.5) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Hero parallax
  var heroImg = document.querySelector('.hero-image');
  if (heroImg && !reduceMotion) {
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      heroImg.style.transform = 'translate3d(0, ' + (y * 0.3) + 'px, 0) scale(1.05)';
    }, { passive: true });
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        var d = parseInt(el.getAttribute('data-reveal-delay') || '0', 10);
        if (d) {
          el.style.transitionDelay = d + 'ms';
          // Clear the one-off stagger delay after it reveals so later hovers stay snappy.
          setTimeout(function () { el.style.transitionDelay = ''; }, d + 1000);
        }
        el.classList.add('in');
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal, .is-reveal').forEach(function (el) { io.observe(el); });

    // Year ticker — highlight the year of the most-visible work-item
    var ticker = document.querySelectorAll('.year-ticker-item');
    if (ticker.length) {
      var yearObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            var year = e.target.getAttribute('data-year');
            if (!year) return;
            ticker.forEach(function (t) {
              if (t.getAttribute('data-year') === year) t.classList.add('active');
              else t.classList.remove('active');
            });
          }
        });
      }, { threshold: 0.55 });
      document.querySelectorAll('.work-item[data-year]').forEach(function (el) { yearObs.observe(el); });
    }
  } else {
    document.querySelectorAll('.reveal, .is-reveal').forEach(function (el) { el.classList.add('in'); });
  }

  // Filter
  var filterBtns = document.querySelectorAll('.work-filter button');
  var workItems  = document.querySelectorAll('.work-item');
  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filterBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var f = btn.getAttribute('data-filter');
      workItems.forEach(function (item) {
        var cats = (item.getAttribute('data-categories') || '').toLowerCase();
        item.style.display = (f === 'all' || cats.indexOf(f.toLowerCase()) >= 0) ? '' : 'none';
      });
    });
  });

  // Mobile menu
  var burger = document.getElementById('nav-burger');
  var overlay = document.getElementById('nav-overlay');
  var closeBtn = document.getElementById('nav-overlay-close');
  function openMenu() { if (!overlay) return; overlay.classList.add('open'); overlay.setAttribute('aria-hidden', 'false'); if (burger) burger.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; }
  function closeMenu() { if (!overlay) return; overlay.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true'); if (burger) burger.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; }
  if (burger) burger.addEventListener('click', openMenu);
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);
  if (overlay) overlay.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeMenu); });

  // Inquiry form
  var form = document.getElementById('inquiry-form');
  if (form) {
    var status = document.getElementById('inquiry-status');
    var submitBtn = document.getElementById('inquiry-submit');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = new FormData(form);
      if (!data.get('consent')) { status.textContent = 'Please confirm consent first.'; status.className = 'inquiry-status err'; return; }
      submitBtn.disabled = true; status.textContent = 'Sending…'; status.className = 'inquiry-status';
      var msgParts = [];
      if (data.get('event_date')) msgParts.push('Event date: ' + data.get('event_date'));
      if (data.get('event_type')) msgParts.push('Event type: ' + data.get('event_type'));
      if (data.get('message'))    msgParts.push(data.get('message'));
      fetch('${attr(PUBLIC_API_BASE)}/api/leads/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: form.getAttribute('data-site-id') || '',
          name: data.get('name'),
          email: data.get('email'),
          message: msgParts.join('\\n'),
          consent: !!data.get('consent'),
        }),
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.ok) {
          form.innerHTML = '<p style="font-family: var(--font-display); font-style: italic; font-size: 26px; color: var(--ink-inverse); padding: 32px 0;">Thank you. I read every inquiry and will reply within 24 hours.</p>';
        } else { status.textContent = 'Send failed — try emailing directly.'; status.className = 'inquiry-status err'; submitBtn.disabled = false; }
      }).catch(function () { status.textContent = 'Network error — try emailing directly.'; status.className = 'inquiry-status err'; submitBtn.disabled = false; });
    });
  }

  // Lightbox — click any work photo to view it full-size, uncropped.
  var lb = document.getElementById('lightbox');
  var lbTriggers = Array.prototype.slice.call(document.querySelectorAll('[data-lightbox]'));
  if (lb && lbTriggers.length) {
    var lbImg = lb.querySelector('.lightbox-img');
    var lbTitle = lb.querySelector('.lb-title');
    var lbMeta = lb.querySelector('.lb-meta');
    var lbLink = lb.querySelector('.lb-link');
    var lbCounter = lb.querySelector('.lightbox-counter');
    var lbItems = lbTriggers.map(function (t) {
      return { full: t.getAttribute('data-full'), title: t.getAttribute('data-title') || '', meta: t.getAttribute('data-meta') || '', link: t.getAttribute('data-link') || '' };
    });
    var lbIdx = 0, lbReturnFocus = null;
    function lbRender() {
      var it = lbItems[lbIdx];
      lbImg.src = it.full; lbImg.alt = it.title;
      lbTitle.textContent = it.title;
      lbMeta.textContent = it.meta;
      if (it.link) { lbLink.href = it.link; lbLink.hidden = false; } else { lbLink.hidden = true; }
      lbCounter.textContent = (lbIdx + 1) + ' / ' + lbItems.length;
    }
    function lbOpen(i, el) {
      lbIdx = i; lbReturnFocus = el || null; lbRender();
      lb.classList.add('open'); lb.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      if (lenis && lenis.stop) lenis.stop();
      lb.querySelector('.lightbox-close').focus();
    }
    function lbClose() {
      lb.classList.remove('open'); lb.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (lenis && lenis.start) lenis.start();
      if (lbReturnFocus && lbReturnFocus.focus) lbReturnFocus.focus();
    }
    function lbGo(d) { lbIdx = (lbIdx + d + lbItems.length) % lbItems.length; lbRender(); }
    lbTriggers.forEach(function (t, i) { t.addEventListener('click', function (e) { e.preventDefault(); lbOpen(i, t); }); });
    lb.querySelector('.lightbox-close').addEventListener('click', lbClose);
    lb.querySelector('.lightbox-prev').addEventListener('click', function () { lbGo(-1); });
    lb.querySelector('.lightbox-next').addEventListener('click', function () { lbGo(1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) lbClose(); });
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') lbClose();
      else if (e.key === 'ArrowLeft') lbGo(-1);
      else if (e.key === 'ArrowRight') lbGo(1);
    });
  }
});
</script>`;
}

function wrap(c, currentPath, body) {
  const banner = renderActivationBanner(c);
  const title = `${c.businessName} — ${c.industry || 'Photography'}`;
  const description = c.tagline || c.portfolioAbout || c.aboutText || `${c.businessName} — photography`;
  return `<!DOCTYPE html>
<!-- Pixie Portfolio — Photographer v1.0 — generated for ${esc(c.businessName)} -->
<html lang="${esc(c.htmlLang || 'en')}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#FCFBF8">
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(description)}">
<meta property="og:type" content="website">
${getFavicon(c, '#FCFBF8')}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
${getJsonLd(c)}
<style>${getStyles()}</style>
</head>
<body>
${banner}
<a href="#main" class="skip-link">Skip to content</a>
${getNav(c, currentPath)}
<main id="main">
${body}
</main>
${getFooter(c)}
${renderLightbox()}
${getScripts()}
</body>
</html>`;
}

// ─── home ───────────────────────────────────────────────────────────────────
// Editorial mosaic: every tile is a 1×1 square unit, and every 5th is a 2×2
// "feature" so the grid breathes — no polaroid tilt. grid-auto-flow:dense
// backfills around the features so there are never orphan gaps, for any
// project count.
function isFeature(idx) {
  return idx % 5 === 0;
}
function pickTone(idx) {
  return ['tone-cream', 'tone-sage', 'tone-charcoal', 'tone-taupe', 'tone-rose'][idx % 5];
}
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

function renderWorkItem(p, idx) {
  const feature = isFeature(idx) ? ' is-feature' : '';
  const cat = (p.role || (Array.isArray(p.tools) && p.tools[0]) || 'Project').toString();
  const year = p.year || '';
  const tone = pickTone(idx);
  const cover = p.photoUrl
    ? `<div class="work-item-img" style="background-image: url('${attr(p.photoUrl)}')" role="img" aria-label="${attr(p.title)}"></div>`
    : `<div class="work-item-empty ${tone}">
        <div class="corner-meta">${esc(cat)}${year ? ` · ${esc(year)}` : ''}</div>
        <span class="display-title">${esc(p.title)}</span>
        <div class="corner-bot">
          <span class="ord">№ ${esc(ROMAN[idx] || pad2(idx + 1))}</span>
          <span>${year ? esc(year) : ''}</span>
        </div>
      </div>`;
  // Photo tiles open the lightbox (JS) — href points at the full image so it
  // still works without JS. Caption stays visible (not hover-only) so titles
  // read on touch devices too; it deepens on hover.
  const lightboxAttrs = p.photoUrl
    ? `href="${attr(p.photoUrl)}" data-lightbox data-full="${attr(p.photoUrl)}" data-title="${attr(p.title)}" data-meta="${attr(cat + (year ? ` · ${year}` : ''))}"${p.link ? ` data-link="${attr(p.link)}"` : ''}`
    : 'href="javascript:void(0)" tabindex="-1"';
  return `
<a class="work-item is-reveal${feature}" data-reveal-delay="${(idx % 4) * 90}" data-categories="${attr(cat)}" data-year="${attr(year)}" ${lightboxAttrs} aria-label="${attr(p.title)}${p.photoUrl ? ' — view photo' : ''}">
  ${cover}
  ${p.photoUrl ? `<span class="work-item-expand" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M9 20H5a1 1 0 0 1-1-1v-4M15 20h4a1 1 0 0 0 1-1v-4"/></svg></span>` : ''}
  ${p.photoUrl ? `<div class="work-item-caption">
    <span class="ttl">${esc(p.title)}</span>
    <span class="cat">${esc(cat)}${year ? ` · ${esc(year)}` : ''}</span>
  </div>` : ''}
</a>`;
}

// A single tile for the Recent-moments conveyor — same cover + caption +
// lightbox wiring as the grid tile, but a fixed-width card. Clones (added to
// make the loop seamless) stay mouse-clickable but are hidden from a11y/tab.
function renderMomentCard(p, idx, isClone) {
  const cat = (p.role || (Array.isArray(p.tools) && p.tools[0]) || 'Project').toString();
  const year = p.year || '';
  const tone = pickTone(idx);
  const cover = p.photoUrl
    ? `<div class="moment-img" style="background-image: url('${attr(p.photoUrl)}')" role="img" aria-label="${attr(p.title)}"></div>`
    : `<div class="work-item-empty ${tone}">
        <div class="corner-meta">${esc(cat)}${year ? ` · ${esc(year)}` : ''}</div>
        <span class="display-title">${esc(p.title)}</span>
        <div class="corner-bot"><span class="ord">№ ${esc(ROMAN[idx] || pad2(idx + 1))}</span><span>${year ? esc(year) : ''}</span></div>
      </div>`;
  const lightboxAttrs = p.photoUrl
    ? `href="${attr(p.photoUrl)}" data-lightbox data-full="${attr(p.photoUrl)}" data-title="${attr(p.title)}" data-meta="${attr(cat + (year ? ` · ${year}` : ''))}"${p.link ? ` data-link="${attr(p.link)}"` : ''}`
    : 'href="javascript:void(0)" tabindex="-1"';
  // Clones exist only for a seamless wrap: hide them from screen readers + tab
  // order, but keep data-lightbox so any visible tile opens on click.
  const cloneAttrs = isClone ? ' aria-hidden="true" tabindex="-1"' : '';
  return `<a class="moment-card" ${lightboxAttrs}${cloneAttrs} aria-label="${attr(p.title)}${p.photoUrl ? ' — view photo' : ''}">
  ${cover}
  ${p.photoUrl ? `<div class="moment-caption"><span class="ttl">${esc(p.title)}</span><span class="cat">${esc(cat)}${year ? ` · ${esc(year)}` : ''}</span></div>` : ''}
</a>`;
}

// "Recent moments" as a conveyor. With our typical ≤6 uploads ONE row reads
// cleanest — each photo glides past once (only a single clone is added for the
// seamless wrap). Two opposing rows (top scrolls left, bottom right) only kick
// in with a fuller set (8+), where there's enough variety that neither row is
// just repeating a few photos. Every tile still opens the lightbox.
function renderMomentsMarquee(projects) {
  const list = Array.isArray(projects) ? projects.filter(Boolean) : [];
  if (!list.length) return '';
  const twoRows = list.length >= 8;
  // Only pad a row when it's too short to fill the viewport (avoids a visible
  // gap before the clone wraps); a healthy row is used as-is, no repeats.
  const fill = (items, min) => {
    if (items.length >= min) return items.slice();
    const out = [];
    for (let i = 0; out.length < min; i++) out.push(items[i % items.length]);
    return out;
  };
  const buildRow = (items, cls) => {
    const filled = fill(items, 5);
    if (!filled.length) return '';
    const setA = filled.map((p, i) => renderMomentCard(p, i, false)).join('');
    const setB = filled.map((p, i) => renderMomentCard(p, i, true)).join('');
    return `<div class="work-row ${cls}"><div class="work-row-track">${setA}${setB}</div></div>`;
  };
  const rows = twoRows
    ? buildRow(list.filter((_, i) => i % 2 === 0), 'work-row-a') + buildRow(list.filter((_, i) => i % 2 === 1), 'work-row-b')
    : buildRow(list, 'work-row-a');
  return `
<div class="work-marquee reveal" aria-label="Recent moments gallery">
  ${rows}
</div>`;
}

function renderYearTicker(projects) {
  const years = Array.from(new Set(projects.map((p) => p.year).filter(Boolean))).sort();
  if (years.length < 2) return '';
  return `
<aside class="year-ticker" aria-hidden="true">
  ${years.map((y, i) => `<span class="year-ticker-item${i === 0 ? ' active' : ''}" data-year="${attr(y)}">${esc(y)}</span>`).join('')}
</aside>`;
}

function pageBreak(rom, label) {
  return `
<div class="page-break" aria-hidden="true">
  <span class="rule"></span>
  <span>${esc(label)}</span>
  <span class="rom">${esc(rom)}</span>
  <span class="rule"></span>
</div>`;
}

// Single reusable lightbox shell (mounted once per page). The JS in
// getScripts() wires every [data-lightbox] tile to it; inert when there are
// none, so it's harmless on the about/contact pages.
function renderLightbox() {
  return `
<div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer" aria-hidden="true">
  <button type="button" class="lightbox-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  <button type="button" class="lightbox-nav lightbox-prev" aria-label="Previous photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
  <button type="button" class="lightbox-nav lightbox-next" aria-label="Next photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>
  <figure class="lightbox-figure">
    <img class="lightbox-img" alt="">
    <figcaption class="lightbox-caption">
      <span class="lb-title"></span>
      <span class="lb-meta"></span>
      <a class="lb-link" target="_blank" rel="noopener" hidden>View project ↗</a>
    </figcaption>
  </figure>
  <div class="lightbox-counter" aria-live="polite"></div>
</div>`;
}

function renderPackages(c) {
  const packages = (c.packages && Array.isArray(c.packages) && c.packages.length)
    ? c.packages
    : defaultPackages();
  return packages.map((pkg, i) => `
<article class="package-card is-reveal" data-reveal-delay="${i * 110}">
  ${pkg.label ? `<div class="package-tag">${esc(pkg.label)}</div>` : ''}
  ${pkg.eyebrow ? `<div class="package-eyebrow">${esc(pkg.eyebrow)}</div>` : ''}
  <h3 class="package-name">${esc(pkg.name)}</h3>
  <div class="package-price">${esc(pkg.price || 'Inquire')}</div>
  ${pkg.duration ? `<div class="package-duration">${esc(pkg.duration)}</div>` : ''}
  ${Array.isArray(pkg.includes) && pkg.includes.length ? `<ul class="package-includes">${pkg.includes.map((i) => `<li><span>${esc(i)}</span></li>`).join('')}</ul>` : ''}
  <a href="#contact" class="package-cta">Inquire about this</a>
</article>`).join('');
}

function generateHomePage(c) {
  const userProjects = Array.isArray(c.projects) && c.projects.length ? c.projects.slice(0, 9) : null;
  const projects = userProjects || defaultPlaceholderProjects();
  const heroImageUrl = c.heroImage && c.heroImage.url;
  const place = c.contactAddress || (Array.isArray(c.serviceAreas) && c.serviceAreas[0]) || null;
  const role = c.industry || 'Photographer';
  const firstName = firstNameOf(c.businessName);
  const tagline = c.tagline || 'Quiet, story-led photography for the moments worth keeping.';
  const aboutBody = c.portfolioAbout || c.aboutText || `${firstName} is a ${role.toLowerCase()}${place ? ` based in ${place}` : ''} working across weddings, portraits, and editorial. Believes the best photographs feel like remembering.`;
  const paragraphs = bioParagraphs(aboutBody);
  const aboutPhotoUrl = c.aboutPhotoUrl || null;

  // Build category filter list from project roles/tools
  const cats = new Set();
  projects.forEach((p) => {
    if (p.role) cats.add(p.role);
    if (Array.isArray(p.tools)) p.tools.forEach((t) => cats.add(typeof t === 'string' ? t : (t && t.title) || ''));
  });
  const categories = Array.from(cats).filter(Boolean).slice(0, 5);

  const heroImageBlock = heroImageUrl
    ? `<img src="${attr(heroImageUrl)}" alt="${attr((c.heroImage && c.heroImage.alt) || (firstName + ' photography'))}" class="hero-image" loading="eager">`
    : `<div class="hero-image-fallback"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true" style="color: rgba(248, 246, 242, 0.6)"><circle cx="32" cy="32" r="14"/><circle cx="32" cy="32" r="6"/><rect x="6" y="14" width="52" height="40" rx="4"/><circle cx="48" cy="22" r="2" fill="currentColor"/></svg></div>`;

  const eventTypes = ['Wedding', 'Portrait Session', 'Engagement', 'Family / Maternity', 'Event', 'Commercial / Brand', 'Other'];

  const yr = new Date().getFullYear();

  const body = `
<section class="hero">
  <div class="hero-image-wrap">
    ${heroImageBlock}
  </div>
  <div class="hero-image-vignette" aria-hidden="true"></div>
  <div class="hero-overlay">
    <div class="hero-eyebrow">
      <span class="rule" aria-hidden="true"></span>
      <span>${esc(role)}${place ? ` · ${esc(place)}` : ''} · ${yr}</span>
    </div>
    <div class="hero-mid">
      <h1 class="hero-name">${esc(c.businessName)}</h1>
    </div>
    <div class="hero-bot">
      <p class="hero-tagline">${esc(tagline)}</p>
      <div class="hero-cta">
        <a href="#contact" class="btn btn-primary">${esc(c.labels?.btnBookSession || 'Book a session')}</a>
        <a href="#work" class="btn btn-text">View portfolio <svg viewBox="0 0 14 10" fill="currentColor"><path d="M8.5 0l4.8 5L8.5 10l-.7-.7L11.4 5.7H0v-1.4h11.4L7.8.7z"/></svg></a>
      </div>
    </div>
  </div>
</section>

${renderYearTicker(projects)}

<section class="work" id="work">
  <div class="container">
    <div class="work-head reveal">
      <span class="eyebrow">Selected Work</span>
      <h2>${italicAccent('Recent moments')}</h2>
    </div>
  </div>
  ${renderMomentsMarquee(projects)}
</section>

<div class="container">${pageBreak('II', 'The Photographer')}</div>

<section class="about" id="about">
  <div class="container about-inner reveal">
    ${aboutPhotoUrl
      ? `<div class="about-photo-wrap"><img src="${attr(aboutPhotoUrl)}" alt="${attr(firstName + ' — portrait')}" loading="lazy"></div>`
      : ''}
    <div class="about-eyebrow eyebrow">About the photographer</div>
    <h2 class="about-title">${italicAccent("Hi, I'm " + firstName)}</h2>
    <div class="about-body">
      ${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
    </div>
    <div class="about-signoff">— ${esc(firstName)}${place ? `, ${esc(place)}` : ''}</div>
  </div>
</section>

<div class="container">${pageBreak('III', 'Investment')}</div>

<section class="packages" id="packages">
  <div class="container">
    <div class="packages-head reveal">
      <span class="eyebrow">Packages &amp; Pricing</span>
      <h2>${italicAccent('What I offer')}</h2>
    </div>
    <div class="packages-grid">
      ${renderPackages(c)}
    </div>
  </div>
</section>

${c.testimonialQuote ? `
<section class="testimonial">
  <div class="container">
    <div class="testimonial-eyebrow eyebrow">Kind Words</div>
    <div class="testimonial-inner reveal">
      <span class="testimonial-mark" aria-hidden="true">"</span>
      <p class="testimonial-quote">${esc(c.testimonialQuote)}</p>
      <p class="testimonial-attr">${esc(c.testimonialAuthor || 'A recent client')}</p>
    </div>
  </div>
</section>` : ''}

<section class="contact-section" id="contact">
  <div class="container contact-grid">
    <div class="contact-col-l reveal">
      <span class="eyebrow">Get in touch</span>
      <h2>Tell me about your <em>day</em></h2>
      <p>Every story is unique. Tell me about yours — date, location, what feels important — and I'll be in touch within 24 hours.</p>
      <div class="contact-direct">
        ${c.contactEmail ? `<div class="contact-direct-item"><span class="lbl">Email</span><a href="mailto:${attr(c.contactEmail)}">${esc(c.contactEmail)}</a></div>` : ''}
        ${c.contactPhone ? `<div class="contact-direct-item"><span class="lbl">Phone</span><a href="tel:${attr(c.contactPhone)}">${esc(c.contactPhone)}</a></div>` : ''}
        ${c.instagramHandle ? `<div class="contact-direct-item"><span class="lbl">Instagram</span><a href="https://instagram.com/${attr(c.instagramHandle)}" target="_blank" rel="noopener">@${esc(c.instagramHandle)}</a></div>` : ''}
      </div>
      <p class="contact-response">I respond within 24 hours.</p>
    </div>
    <div class="contact-col-r reveal">
      <form class="inquiry-form" id="inquiry-form" data-site-id="${attr(c.siteId || '')}">
        <div class="inquiry-row">
          <div>
            <label for="iq-name">Your name</label>
            <input id="iq-name" name="name" type="text" placeholder="Full name" required>
          </div>
          <div>
            <label for="iq-email">Email</label>
            <input id="iq-email" name="email" type="email" placeholder="you@example.com" required>
          </div>
        </div>
        <div class="inquiry-row">
          <div>
            <label for="iq-date">Event date</label>
            <input id="iq-date" name="event_date" type="date">
          </div>
          <div>
            <label for="iq-type">Event type</label>
            <select id="iq-type" name="event_type">
              <option value="">Select an option</option>
              ${eventTypes.map((t) => `<option value="${attr(t)}">${esc(t)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div>
          <label for="iq-msg">Tell me more</label>
          <textarea id="iq-msg" name="message" placeholder="Where, who, what feels important to capture…" required></textarea>
        </div>
        ${consentField()}
        <button type="submit" class="inquiry-submit" id="inquiry-submit">Send inquiry</button>
        <p class="inquiry-status" id="inquiry-status"></p>
      </form>
    </div>
  </div>
</section>`;

  return wrap(c, '/', body);
}

// ─── slim pages ─────────────────────────────────────────────────────────────
function generateAboutPage(c) {
  const aboutBody = c.portfolioAbout || c.aboutText || `Photography rooted in story, place, and stillness. Working across weddings, portraits, and brand sessions.`;
  const place = c.contactAddress || (Array.isArray(c.serviceAreas) && c.serviceAreas[0]) || null;
  const firstName = firstNameOf(c.businessName);
  const paragraphs = bioParagraphs(aboutBody);
  const body = `
<section class="page-section">
  <div class="container">
    <span class="eyebrow reveal">${esc(c.labels?.navAbout || 'About')}</span>
    <h1 class="page-h1 reveal">${italicAccent("Hi, I'm " + firstName)}</h1>
    <div class="page-body reveal">
      ${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
      ${place ? `<p>Based in ${esc(place)}, available for travel.</p>` : ''}
      <p>For inquiries, <a href="/contact">say hi</a>.</p>
    </div>
  </div>
</section>`;
  return wrap(c, '/about', body);
}

function generateContactPage(c) {
  const body = `
<section class="page-section">
  <div class="container">
    <span class="eyebrow reveal">Say hi</span>
    <h1 class="page-h1 reveal">${italicAccent("Let's talk")}</h1>
    <div class="page-body reveal">
      <p>Tell me about your event, your timeline, and anything else worth knowing. I read every inquiry and reply within 24 hours.</p>
      ${c.contactEmail ? `<p><a href="mailto:${attr(c.contactEmail)}">${esc(c.contactEmail)}</a></p>` : ''}
      ${c.contactPhone ? `<p><a href="tel:${attr(c.contactPhone)}">${esc(c.contactPhone)}</a></p>` : ''}
      ${c.instagramHandle ? `<p><a href="https://instagram.com/${attr(c.instagramHandle)}" target="_blank" rel="noopener">@${esc(c.instagramHandle)}</a></p>` : ''}
    </div>
  </div>
</section>`;
  return wrap(c, '/contact', body);
}

function generatePrivacyPage(c) {
  const body = `
<section class="page-section">
  <div class="container">
    <span class="eyebrow">Privacy</span>
    <h1 class="page-h1">Privacy</h1>
    <div class="page-body" style="margin-top: 32px">${generatePrivacyBody(c)}</div>
  </div>
</section>`;
  return wrap(c, '/privacy', body);
}

function generateThankYouPage(c) {
  const firstName = firstNameOf(c.businessName);
  const body = `
<section class="page-section" style="text-align:center">
  <div class="container">
    <span class="eyebrow">Thank you</span>
    <h1 class="page-h1" style="margin: 32px auto 0; max-width: none">${italicAccent('Thanks for reaching out')}</h1>
    <p class="page-body" style="margin: 32px auto 0">I'll reply within 24 hours. — ${esc(firstName)}</p>
    <p style="margin-top: 64px"><a href="/" style="font-family: var(--font-body); font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--ink-primary); border-bottom: 1px solid var(--ink-primary); padding-bottom: 2px">← Back to portfolio</a></p>
  </div>
</section>`;
  return wrap(c, '/thank-you', body);
}

function generatePages(config) {
  return {
    '/index.html':           generateHomePage(config),
    '/about/index.html':     generateAboutPage(config),
    '/contact/index.html':   generateContactPage(config),
    '/thank-you/index.html': generateThankYouPage(config),
    '/privacy/index.html':   generatePrivacyPage(config),
  };
}

module.exports = { generatePages };
