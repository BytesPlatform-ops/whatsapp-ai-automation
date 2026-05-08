// Pixie General Portfolio Template v1.0
//
// One template for ALL creative professionals — designers, developers,
// photographers, writers, artists, freelancers. Built strictly to the
// "Neutral Creative" spec:
//   - Editorial off-white palette, single warm-tan accent used sparingly
//   - Fraunces (display) + Inter (body); no third typeface
//   - Lenis smooth scroll + GSAP magnetic CTAs + IntersectionObserver reveals
//   - 8px custom cursor that morphs on link / project hover
//   - 7 sections on home: Nav, Hero, Marquee, Work, About, Services, Contact, Footer
//
// About + Contact remain as slim dedicated pages so direct links work; the
// nav links on home are in-page anchors, the nav on slim pages links back to
// home anchors (`/#about`, `/#contact`) so the user always lands on the
// single-page editorial experience.

const { env } = require('../../../config/env');
const { renderActivationBanner } = require('../../activationBanner');
const { consentField, generatePrivacyBody } = require('../_privacy');

const PUBLIC_API_BASE = process.env.PUBLIC_API_BASE_URL || env.chatbot.baseUrl;

// ─── helpers ────────────────────────────────────────────────────────────────
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

function quarterLabel() {
  const q = Math.ceil((new Date().getMonth() + 2) / 3);
  return `Q${q} ${new Date().getFullYear()}`;
}

// Italicize the second-to-last word of a section title for personality —
// e.g. "Recent work" → "Recent <em>work</em>." When only one word, italic
// the whole thing.
function italicAccent(text) {
  const words = String(text).trim().split(/\s+/);
  if (words.length < 2) return `<em class="italic-accent">${esc(text)}</em>`;
  const last = words.pop();
  return `${esc(words.join(' '))} <em class="italic-accent">${esc(last)}</em>`;
}

// Split a bio string into 2–3 paragraph blocks. Splits on blank lines first;
// falls back to splitting on sentence boundaries when the user wrote a
// single block.
function bioParagraphs(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  if (raw.includes('\n\n')) return raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const sentences = raw.split(/(?<=[.!?])\s+/);
  if (sentences.length <= 2) return [raw];
  // Group sentences into 2 paragraphs of roughly equal length.
  const half = Math.ceil(sentences.length / 2);
  return [sentences.slice(0, half).join(' '), sentences.slice(half).join(' ')];
}

// Industry → opinionated point-of-view tagline fallback. Used when the user
// hasn't given a real bio.
function defaultPovTagline(role) {
  const r = String(role || '').toLowerCase();
  if (/design|brand|ux|ui/.test(r))           return 'Working on the boring parts of design — the parts that decide whether the work survives a year.';
  if (/develop|engineer|programmer/.test(r))  return "Building software that doesn't draw attention to itself.";
  if (/photo/.test(r))                        return 'Photographs that look more like remembering than performing.';
  if (/writ|copy|content|journ/.test(r))      return 'Sentences that earn the next sentence.';
  if (/illustrat|paint|artist/.test(r))       return 'Drawings that finish their own thought.';
  return 'Independent work. Quiet about it.';
}

// ─── default content ────────────────────────────────────────────────────────
function defaultPlaceholderProjects() {
  const yr = new Date().getFullYear();
  return [
    { title: 'Add your first project',  role: '', year: String(yr),     link: '', tools: ['Replace from the dashboard'], photoUrl: null, description: 'Title, year, two-line note. Pixie keeps the structure; you bring the work.' },
    { title: 'Then a second one',        role: '', year: String(yr),     link: '', tools: ['Three is usually enough'], photoUrl: null, description: 'Quality reads better than quantity. Show the cases that say something specific.' },
    { title: 'Three is usually enough',  role: '', year: String(yr - 1), link: '', tools: ['Show range, not volume'], photoUrl: null, description: 'A spread of years tells a clearer story than five back-to-back from one year.' },
  ];
}

function defaultServices(industry) {
  const ind = (industry || '').toLowerCase();
  if (/develop|engineer|programmer/.test(ind)) {
    return [
      { title: 'Product Engineering',         desc: 'End-to-end builds — architecture through ship. Tested code, fast load times.' },
      { title: 'Frontend & Design Systems',   desc: 'Component libraries and pixel-precise UI work that scales with the team.' },
      { title: 'Consulting & Audits',         desc: 'Code reviews, performance audits, architectural consulting for teams that need a second pair of eyes.' },
    ];
  }
  if (/photo|videograph/.test(ind)) {
    return [
      { title: 'Editorial & Brand',           desc: 'Editorial shoots, brand campaigns, and lifestyle imagery that tells a story.' },
      { title: 'Portraits',                   desc: 'Studio and on-location portraits — individual to team and event coverage.' },
      { title: 'Print & Retouching',          desc: 'High-fidelity retouching, print production, and digital deliverables across formats.' },
    ];
  }
  if (/writ|journ|copy|content/.test(ind)) {
    return [
      { title: 'Brand & Editorial Writing',   desc: 'Voice work, longer-form pieces, and editorial features for brands and publications.' },
      { title: 'Copy & Conversion',           desc: 'Landing pages, product copy, and email sequences focused on clarity and outcomes.' },
      { title: 'Strategy & Voice Guides',     desc: 'Voice-and-tone systems, content strategy docs, and writing playbooks for in-house teams.' },
    ];
  }
  return [
    { title: 'Brand Identity',                desc: 'Logo systems, visual language, brand guidelines that scale.' },
    { title: 'Editorial & Web Design',        desc: 'Minimal, type-driven websites that feel handcrafted.' },
    { title: 'Art Direction',                 desc: 'Photography direction, campaign concepts, creative oversight.' },
  ];
}

// ─── styles ────────────────────────────────────────────────────────────────
function getStyles() {
  return `
:root {
  --bg-primary:   #FAF8F4;
  --bg-secondary: #F0EAE0;
  --bg-card:      #FFFFFF;
  --ink-primary:  #0A0A0A;
  --ink-secondary:#5C5C5C;
  --ink-tertiary: #8E8E8E;
  --accent:       #B8935A;
  --accent-hover: #9A7840;
  --accent-soft:  #E8DCC4;
  --line:         rgba(10, 10, 10, 0.08);
  --line-strong:  rgba(10, 10, 10, 0.16);
  --shadow-soft:  0 1px 3px rgba(10,10,10,0.04), 0 8px 24px rgba(10,10,10,0.04);
  --shadow-hover: 0 8px 32px rgba(10,10,10,0.08);

  --space-1: 4px;   --space-2: 8px;    --space-3: 16px;  --space-4: 24px;
  --space-5: 32px;  --space-6: 48px;   --space-7: 64px;  --space-8: 96px;
  --space-9: 128px; --space-10: 192px;

  --ease-out:    cubic-bezier(0.22, 1, 0.36, 1);
  --ease-inout:  cubic-bezier(0.65, 0, 0.35, 1);
  --ease-expo:   cubic-bezier(0.19, 1, 0.22, 1);

  --dur-fast: 200ms;
  --dur-base: 400ms;
  --dur-slow: 800ms;
  --dur-hero: 1200ms;

  --font-display: 'Fraunces', Georgia, serif;
  --font-body:    'Inter', system-ui, -apple-system, sans-serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
body {
  font-family: var(--font-body);
  font-size: 17px;
  line-height: 1.7;
  color: var(--ink-primary);
  background: var(--bg-primary);
  font-weight: 400;
  overflow-x: hidden;
}
::selection { background: var(--accent); color: var(--bg-primary); }
a { color: inherit; text-decoration: none; transition: color var(--dur-fast) var(--ease-out); }
img { max-width: 100%; display: block; }
button { font: inherit; cursor: pointer; border: 0; background: transparent; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }

h1, h2, h3, h4 {
  font-family: var(--font-display);
  font-weight: 400;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: var(--ink-primary);
}

.skip-link {
  position: absolute; top: -100px; left: var(--space-3);
  padding: 12px 18px;
  background: var(--ink-primary); color: var(--bg-primary);
  font-size: 13px; font-weight: 600; letter-spacing: 0.04em;
  z-index: 200;
  transition: top var(--dur-fast) var(--ease-out);
}
.skip-link:focus { top: var(--space-3); }

.container {
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 var(--space-7);
}
@media (max-width: 1023px) { .container { padding: 0 var(--space-5); } }
@media (max-width: 767px)  { .container { padding: 0 var(--space-4); } }

.eyebrow {
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
  display: inline-block;
}

.italic-accent { font-style: italic; color: var(--accent); font-weight: 400; }

.body-large {
  font-size: clamp(16px, 1.5vw, 19px);
  line-height: 1.6;
  color: var(--ink-primary);
}
.caption {
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--ink-secondary);
}

section { padding: var(--space-9) 0; }
@media (max-width: 767px) { section { padding: var(--space-8) 0; } }

/* ─── nav ─────────────────────────────────────────────────────────────── */
.nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 50;
  transition: background var(--dur-base) var(--ease-out),
              backdrop-filter var(--dur-base) var(--ease-out),
              border-bottom-color var(--dur-base) var(--ease-out);
  border-bottom: 1px solid transparent;
}
.nav.scrolled {
  background: rgba(250, 248, 244, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom-color: var(--line);
}
.nav-inner {
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px var(--space-7);
  display: flex; align-items: center; justify-content: space-between;
  transition: padding var(--dur-base) var(--ease-out);
}
.nav.scrolled .nav-inner { padding: 16px var(--space-7); }
@media (max-width: 1023px) { .nav-inner, .nav.scrolled .nav-inner { padding: 18px var(--space-5); } }
@media (max-width: 767px)  { .nav-inner, .nav.scrolled .nav-inner { padding: 16px var(--space-4); } }

.nav-mark {
  font-family: var(--font-display);
  font-size: 20px; font-weight: 500;
  letter-spacing: -0.01em;
  color: var(--ink-primary);
}
.nav-links {
  display: flex; align-items: center; gap: var(--space-6);
  font-size: 13px; font-weight: 500;
}
.nav-links a {
  color: var(--ink-primary);
  position: relative;
  padding: 4px 0;
}
.nav-links a:not(.nav-cta)::after {
  content: ''; position: absolute;
  left: 0; bottom: -2px;
  width: 0; height: 1px;
  background: var(--accent);
  transition: width var(--dur-base) var(--ease-out);
}
.nav-links a:not(.nav-cta):hover { color: var(--accent); }
.nav-links a:not(.nav-cta):hover::after { width: 100%; }
.nav-cta {
  padding: 10px 20px;
  background: var(--ink-primary);
  color: var(--bg-primary);
  border-radius: 999px;
  font-weight: 500;
  transition: background var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
  min-height: 44px;
  display: inline-flex; align-items: center; justify-content: center;
}
.nav-cta:hover { background: var(--accent); }

.nav-burger {
  display: none;
  width: 44px; height: 44px;
  align-items: center; justify-content: center;
  flex-direction: column; gap: 5px;
}
.nav-burger span {
  display: block; width: 22px; height: 1.5px;
  background: var(--ink-primary);
  transition: transform var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out);
}
@media (max-width: 767px) {
  .nav-links { display: none; }
  .nav-burger { display: inline-flex; }
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
.nav-overlay-top {
  display: flex; justify-content: space-between; align-items: center;
}
.nav-overlay-close {
  font-size: 14px; font-weight: 500; color: var(--ink-primary);
  padding: 8px 12px;
  min-height: 44px;
  display: inline-flex; align-items: center;
}
.nav-overlay-links {
  flex: 1; display: flex; flex-direction: column; justify-content: center;
  gap: var(--space-4);
}
.nav-overlay-links a {
  font-family: var(--font-display);
  font-size: clamp(28px, 6vw, 40px);
  font-weight: 400;
  color: var(--ink-primary);
  padding: 12px 0;
}
.nav-overlay-links a .num {
  font-size: 12px;
  letter-spacing: 0.18em;
  color: var(--accent);
  font-family: var(--font-body);
  font-weight: 600;
  margin-right: var(--space-3);
  vertical-align: middle;
}

/* ─── hero ────────────────────────────────────────────────────────────── */
.hero {
  min-height: 100vh; min-height: 100svh;
  display: flex; flex-direction: column;
  justify-content: flex-end;
  padding-bottom: var(--space-7);
  padding-top: 140px;
  position: relative;
}
.hero-eyebrow { margin-bottom: var(--space-7); opacity: 0; }
.hero-eyebrow.in { animation: fade-up var(--dur-slow) var(--ease-expo) 100ms forwards; }

.hero-greeting {
  font-family: var(--font-display);
  font-style: italic;
  font-size: clamp(22px, 3vw, 32px);
  font-weight: 400;
  color: var(--ink-secondary);
  margin-bottom: var(--space-3);
  opacity: 0;
}
.hero-greeting.in { animation: fade-up var(--dur-slow) var(--ease-expo) 250ms forwards; }

.hero-name {
  font-family: var(--font-display);
  font-size: clamp(56px, 12vw, 180px);
  font-weight: 400;
  line-height: 0.95;
  letter-spacing: -0.04em;
  font-variation-settings: "opsz" 144;
  color: var(--ink-primary);
  margin-bottom: var(--space-5);
  perspective: 800px;
}
.hero-name .word { display: inline-block; white-space: nowrap; margin-right: 0.18em; }
.hero-name .word:last-child { margin-right: 0; }
.hero-name.split .char {
  display: inline-block;
  opacity: 0;
  transform: translateY(100%) rotateX(-45deg);
  transform-origin: 50% 100%;
}
.hero-name.split.in .char {
  animation: char-rise var(--dur-hero) var(--ease-expo) both;
}
@keyframes char-rise {
  to { opacity: 1; transform: translateY(0) rotateX(0deg); }
}

.hero-role {
  font-family: var(--font-display);
  font-style: italic;
  font-size: clamp(20px, 2.5vw, 32px);
  font-weight: 400;
  color: var(--ink-secondary);
  margin-bottom: var(--space-5);
  opacity: 0;
}
.hero-role.in { animation: fade-up var(--dur-slow) var(--ease-expo) forwards; }

.hero-tag {
  font-family: var(--font-body);
  font-size: clamp(16px, 1.5vw, 19px);
  line-height: 1.6;
  color: var(--ink-primary);
  max-width: 540px;
  margin-bottom: var(--space-6);
  opacity: 0;
}
.hero-tag.in { animation: fade-up var(--dur-slow) var(--ease-expo) forwards; }

.hero-ctas {
  display: flex; gap: var(--space-3); flex-wrap: wrap;
  opacity: 0;
}
.hero-ctas.in { animation: fade-up var(--dur-slow) var(--ease-expo) forwards; }

.btn {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 14px 28px;
  border-radius: 999px;
  font-family: var(--font-body);
  font-size: 16px; font-weight: 500;
  min-height: 44px;
  transition: background var(--dur-base) var(--ease-out),
              color var(--dur-base) var(--ease-out),
              transform var(--dur-base) var(--ease-out);
  white-space: nowrap;
}
.btn-primary {
  background: var(--ink-primary);
  color: var(--bg-primary);
}
.btn-primary:hover { background: var(--accent); }
.btn-secondary {
  padding: 14px 0;
  color: var(--ink-primary);
}
.btn-secondary svg { width: 14px; height: 10px; transition: transform var(--dur-base) var(--ease-out); }
.btn-secondary:hover { color: var(--accent); }
.btn-secondary:hover svg { transform: translateX(4px); }

.hero-scroll {
  position: absolute;
  right: var(--space-7); bottom: var(--space-6);
  display: inline-flex; flex-direction: column; align-items: center; gap: 12px;
  font-family: var(--font-body);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-tertiary);
  opacity: 0;
}
.hero-scroll.in { animation: fade-up var(--dur-slow) var(--ease-expo) 1.4s forwards; }
.hero-scroll-line {
  width: 1px; height: 40px; background: var(--ink-tertiary);
  transform-origin: top;
  animation: scroll-pulse 1.8s ease-in-out infinite;
}
@keyframes scroll-pulse {
  0%, 100% { transform: scaleY(1); }
  50%      { transform: scaleY(0.5); }
}
@media (max-width: 1023px) { .hero-scroll { display: none; } }

@keyframes fade-up {
  from { opacity: 0; transform: translateY(40px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (max-width: 767px) {
  .hero { padding-bottom: var(--space-6); }
  .hero-ctas { flex-direction: column; align-items: stretch; gap: var(--space-3); }
  .hero-ctas .btn { width: 100%; justify-content: center; }
}

/* ─── marquee ─────────────────────────────────────────────────────────── */
.marquee {
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  padding: var(--space-5) 0;
  overflow: hidden;
  white-space: nowrap;
  background: var(--bg-primary);
}
.marquee-track {
  display: inline-flex;
  animation: marquee-scroll 60s linear infinite;
  will-change: transform;
}
.marquee:hover .marquee-track { animation-play-state: paused; }
@keyframes marquee-scroll {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
.marquee-item {
  font-family: var(--font-display);
  font-style: italic;
  font-size: clamp(28px, 5vw, 64px);
  font-weight: 400;
  color: var(--ink-tertiary);
  padding: 0 var(--space-5);
  flex-shrink: 0;
  letter-spacing: -0.01em;
}
.marquee-item .sep { color: var(--ink-tertiary); font-style: normal; margin: 0 0.05em; }
@media (max-width: 767px) { .marquee-track { animation-duration: 90s; } }

/* ─── work ────────────────────────────────────────────────────────────── */
.work-head { margin-bottom: var(--space-8); }
.work-head .eyebrow { margin-bottom: var(--space-4); }
.work-head h2 {
  font-size: clamp(36px, 6vw, 84px);
  letter-spacing: -0.02em;
}

.work-list {
  display: flex; flex-direction: column;
  gap: var(--space-9);
}
@media (max-width: 767px) { .work-list { gap: var(--space-7); } }

.project {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-7);
  align-items: center;
}
.project.flip { direction: rtl; }
.project.flip > * { direction: ltr; }
@media (max-width: 1023px) {
  .project { grid-template-columns: 1fr; gap: var(--space-5); }
  .project.flip { direction: ltr; }
}

.project-cover {
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: 12px;
  overflow: hidden;
  background: var(--accent-soft);
  isolation: isolate;
}
.project-cover-img {
  position: absolute; inset: 0;
  background-size: cover; background-position: center;
  transition: transform 600ms var(--ease-out), filter 600ms var(--ease-out);
}
.project:hover .project-cover-img { transform: scale(1.04); filter: brightness(1.05); }

.project-cover-empty {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  padding: var(--space-6);
  background: var(--accent-soft);
}
.project-cover-empty span {
  font-family: var(--font-display);
  font-size: clamp(28px, 4vw, 52px);
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--ink-primary);
  text-align: center;
}

.project-info { display: flex; flex-direction: column; }
.project-num {
  font-family: var(--font-display);
  font-size: 32px; font-weight: 400;
  color: var(--ink-tertiary);
  margin-bottom: var(--space-3);
  transition: color var(--dur-base) var(--ease-out);
}
.project:hover .project-num { color: var(--accent); }
.project-title {
  font-family: var(--font-display);
  font-size: clamp(26px, 3.5vw, 44px);
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.15;
  margin-bottom: var(--space-3);
  color: var(--ink-primary);
}
.project-desc {
  font-size: 16px;
  line-height: 1.6;
  color: var(--ink-primary);
  max-width: 480px;
  margin-bottom: var(--space-3);
}
.project-tags {
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--ink-secondary);
  margin-bottom: var(--space-4);
}
.project-link {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 14px; font-weight: 500;
  color: var(--ink-primary);
  align-self: flex-start;
  padding: 6px 0;
  border-bottom: 1px solid var(--ink-primary);
  transition: color var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out);
}
.project-link svg { width: 12px; height: 10px; transition: transform var(--dur-base) var(--ease-out); }
.project:hover .project-link { color: var(--accent); border-bottom-color: var(--accent); }
.project:hover .project-link svg { transform: translateX(4px); }

/* ─── about ───────────────────────────────────────────────────────────── */
.about-grid {
  display: grid;
  grid-template-columns: 4fr 6fr;
  gap: var(--space-8);
  align-items: start;
}
@media (max-width: 1023px) { .about-grid { grid-template-columns: 1fr; gap: var(--space-6); } }

.about-photo {
  width: 100%;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  border-radius: 8px;
  background: var(--accent-soft);
}
.about-photo-caption { margin-top: var(--space-3); }
@media (max-width: 1023px) { .about-photo { max-height: 360px; aspect-ratio: 16 / 10; } }

.about-photo-fallback {
  display: flex; flex-direction: column; gap: var(--space-3);
}
.about-photo-fallback .greet {
  font-family: var(--font-display);
  font-style: italic;
  font-size: clamp(22px, 3vw, 32px);
  color: var(--ink-secondary);
}
.about-photo-fallback .name {
  font-family: var(--font-display);
  font-size: clamp(56px, 10vw, 140px);
  font-weight: 400;
  line-height: 0.92;
  letter-spacing: -0.04em;
  color: var(--ink-primary);
  font-variation-settings: "opsz" 144;
}

.about-text .eyebrow { margin-bottom: var(--space-4); }
.about-text h2 {
  font-size: clamp(36px, 6vw, 84px);
  letter-spacing: -0.02em;
  margin-bottom: var(--space-5);
}
.about-text p {
  font-size: clamp(16px, 1.5vw, 19px);
  line-height: 1.6;
  color: var(--ink-primary);
  max-width: 540px;
  margin-bottom: var(--space-3);
}
.about-text p a { color: var(--ink-primary); border-bottom: 1px solid var(--ink-primary); padding-bottom: 1px; }
.about-text p a:hover { color: var(--accent); border-bottom-color: var(--accent); }

.about-mini {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: var(--space-6);
  margin-top: var(--space-6);
  padding-top: var(--space-5);
  border-top: 1px solid var(--line);
  max-width: 540px;
}
.about-mini .col .eyebrow { margin-bottom: var(--space-3); }
.about-mini ul { list-style: none; }
.about-mini li {
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 2;
  color: var(--ink-primary);
}

/* ─── services ────────────────────────────────────────────────────────── */
.services-head { margin-bottom: var(--space-7); }
.services-head .eyebrow { margin-bottom: var(--space-4); }
.services-head h2 {
  font-size: clamp(36px, 6vw, 84px);
  letter-spacing: -0.02em;
}

.services-list { border-top: 1px solid var(--line); }
.service-row {
  display: grid;
  grid-template-columns: 60px 1fr;
  column-gap: var(--space-5);
  padding: var(--space-5) 0;
  border-bottom: 1px solid var(--line);
  transition: background var(--dur-base) var(--ease-out), padding var(--dur-base) var(--ease-out);
  position: relative;
}
.service-row:hover {
  background: var(--bg-secondary);
  padding: var(--space-5) var(--space-4);
}
.service-row:hover .s-num { transform: scale(1.1); color: var(--accent); }
.service-row:hover .s-title { color: var(--accent); }
.service-row:hover .s-arrow { transform: translateX(0); opacity: 1; }
.s-num {
  font-family: var(--font-display);
  font-size: 28px; font-weight: 400;
  color: var(--ink-tertiary);
  transition: transform var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out);
}
.s-body { display: flex; flex-direction: column; gap: var(--space-2); }
.s-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: var(--space-3);
}
.s-title {
  font-family: var(--font-display);
  font-size: clamp(24px, 3vw, 32px);
  font-weight: 500;
  letter-spacing: -0.01em;
  color: var(--ink-primary);
  transition: color var(--dur-base) var(--ease-out);
}
.s-arrow {
  font-family: var(--font-display);
  font-size: 24px;
  color: var(--accent);
  opacity: 0;
  transform: translateX(-8px);
  transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
}
.s-desc {
  font-size: 16px;
  line-height: 1.6;
  color: var(--ink-secondary);
  max-width: 480px;
}
@media (max-width: 767px) {
  .service-row { grid-template-columns: 1fr; row-gap: var(--space-2); padding: var(--space-4) 0; }
  .service-row:hover { padding: var(--space-4) var(--space-3); }
  .s-title { font-size: 22px; }
  .s-arrow { display: none; }
}

/* ─── contact ─────────────────────────────────────────────────────────── */
.contact { padding: 140px 0; text-align: center; }
.contact .eyebrow { margin-bottom: var(--space-4); }
.contact h2 {
  font-size: clamp(40px, 8vw, 120px);
  letter-spacing: -0.02em;
  line-height: 1.05;
  max-width: 18ch;
  margin: 0 auto var(--space-7);
}
.contact-email {
  display: inline-block;
  font-family: var(--font-display);
  font-size: clamp(24px, 4vw, 56px);
  font-weight: 400;
  letter-spacing: -0.02em;
  color: var(--ink-primary);
  position: relative;
  padding: 4px 0;
  margin-bottom: var(--space-6);
}
.contact-email::after {
  content: ''; position: absolute;
  left: 0; bottom: 0;
  width: 100%; height: 2px;
  background: var(--accent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform var(--dur-base) var(--ease-out);
}
.contact-email:hover::after { transform: scaleX(1); }
.contact-socials {
  display: flex; align-items: center; justify-content: center; flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
  font-size: 14px;
  color: var(--ink-secondary);
}
.contact-socials .label { color: var(--ink-tertiary); }
.contact-socials .dot { color: var(--ink-tertiary); }
.contact-socials a {
  color: var(--ink-primary);
  position: relative;
  padding: 4px 2px;
}
.contact-socials a::after {
  content: ''; position: absolute;
  left: 0; bottom: 0;
  width: 0; height: 1px;
  background: var(--accent);
  transition: width var(--dur-base) var(--ease-out);
}
.contact-socials a:hover { color: var(--accent); }
.contact-socials a:hover::after { width: 100%; }
.contact-availability {
  display: inline-flex; align-items: center; gap: 10px;
  font-family: var(--font-body);
  font-size: 13px; font-weight: 500;
  color: var(--ink-secondary);
  letter-spacing: 0.04em;
}
.contact-availability .live-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #10B981;
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.18);
}

/* ─── footer ──────────────────────────────────────────────────────────── */
.footer {
  border-top: 1px solid var(--line);
  padding: 48px 0;
}
.footer-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--space-4);
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink-secondary);
  letter-spacing: 0.02em;
}
.footer-row .center { text-align: center; }
.footer-row .right  { text-align: right; }
.footer-back {
  display: inline-flex; align-items: center; gap: 6px;
  color: var(--ink-secondary);
  cursor: pointer;
  transition: color var(--dur-base) var(--ease-out);
}
.footer-back:hover { color: var(--accent); }
@media (max-width: 767px) {
  .footer-row { grid-template-columns: 1fr; text-align: left; }
  .footer-row .center, .footer-row .right { text-align: left; }
}

/* ─── reveal-on-scroll ─────────────────────────────────────────────────── */
.reveal {
  opacity: 0;
  transform: translateY(40px);
  transition: opacity var(--dur-slow) var(--ease-expo),
              transform var(--dur-slow) var(--ease-expo);
}
.reveal.in { opacity: 1; transform: none; }

/* ─── custom cursor ────────────────────────────────────────────────────── */
.cursor {
  position: fixed; left: 0; top: 0;
  width: 8px; height: 8px;
  background: var(--ink-primary);
  border-radius: 50%;
  pointer-events: none;
  z-index: 200;
  transform: translate(-50%, -50%);
  transition: width var(--dur-base) var(--ease-out),
              height var(--dur-base) var(--ease-out),
              background var(--dur-fast) var(--ease-out),
              opacity var(--dur-fast) var(--ease-out);
  mix-blend-mode: difference;
  opacity: 0;
}
.cursor.ready { opacity: 1; }
.cursor.link { width: 60px; height: 60px; }
.cursor.view {
  width: 80px; height: 80px;
  background: var(--ink-primary);
  mix-blend-mode: normal;
}
.cursor::after {
  content: '';
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-body);
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--bg-primary);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out) 100ms;
}
.cursor.view::after { content: 'View →'; opacity: 1; }
@media (pointer: coarse), (max-width: 767px) {
  .cursor { display: none; }
  body { cursor: auto; }
}
@media (pointer: fine) {
  body { cursor: none; }
  a, button { cursor: none; }
}

/* ─── slim about + contact + privacy + thank-you ───────────────────────── */
.page-section { padding: 160px 0 var(--space-10); }
.page-h1 {
  font-size: clamp(56px, 9vw, 140px);
  letter-spacing: -0.04em;
  line-height: 0.92;
  margin-bottom: var(--space-7);
  max-width: 16ch;
}
.page-body {
  max-width: 60ch;
  font-size: clamp(16px, 1.5vw, 19px);
  line-height: 1.65;
  color: var(--ink-primary);
}
.page-body p { margin-bottom: var(--space-3); }
.page-body p a { color: var(--ink-primary); border-bottom: 1px solid var(--ink-primary); padding-bottom: 1px; }
.page-body p a:hover { color: var(--accent); border-bottom-color: var(--accent); }

.detail-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: var(--space-6);
  margin-top: var(--space-7);
  padding-top: var(--space-5);
  border-top: 1px solid var(--line);
}
@media (max-width: 767px) { .detail-grid { grid-template-columns: 1fr; gap: var(--space-5); } }
.detail-grid h4 {
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: var(--space-2);
}
.detail-grid p {
  font-family: var(--font-display);
  font-size: 20px;
  line-height: 1.4;
  color: var(--ink-primary);
}
.detail-grid a { border-bottom: 1px solid var(--ink-primary); padding-bottom: 1px; }
.detail-grid a:hover { color: var(--accent); border-bottom-color: var(--accent); }

.form { display: flex; flex-direction: column; gap: var(--space-3); max-width: 640px; margin-top: var(--space-6); }
.form input, .form textarea {
  width: 100%;
  padding: 16px 18px;
  border: 1px solid var(--line-strong);
  background: var(--bg-card);
  font-family: inherit;
  font-size: 15px;
  color: var(--ink-primary);
  border-radius: 0;
  transition: border-color var(--dur-fast) var(--ease-out);
}
.form input:focus, .form textarea:focus { outline: none; border-color: var(--ink-primary); }
.form textarea { min-height: 160px; resize: vertical; }
.form button {
  align-self: flex-start;
  padding: 16px 32px;
  background: var(--ink-primary);
  color: var(--bg-primary);
  font-size: 13px; font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  border-radius: 999px;
  transition: background var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
  min-height: 44px;
}
.form button:hover { background: var(--accent); transform: translateY(-1px); }
.form button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.form .consent { display: flex; align-items: flex-start; gap: 10px; font-size: 12px; color: var(--ink-secondary); }
.form .consent input { width: auto; margin-top: 3px; }
.form .consent a { text-decoration: underline; }
.form-status { font-size: 13px; color: var(--ink-secondary); }
.form-status.ok { color: #1A7A3A; }
.form-status.err { color: #B3261E; }

/* ─── reduced motion ─────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  .hero-name.split .char { opacity: 1 !important; transform: none !important; }
  .hero-eyebrow, .hero-greeting, .hero-role, .hero-tag, .hero-ctas, .hero-scroll { opacity: 1 !important; transform: none !important; }
  .reveal { opacity: 1 !important; transform: none !important; }
  .marquee-track { animation: none !important; }
  body { cursor: auto !important; }
  a, button { cursor: pointer !important; }
  .cursor { display: none !important; }
}
`;
}

// ─── shared bits ────────────────────────────────────────────────────────────
function getNav(c, currentPath) {
  const onHome = currentPath === '/';
  const link = (label, hash) => onHome
    ? `<a href="#${hash}" data-cursor="link">${esc(label)}</a>`
    : `<a href="/#${hash}" data-cursor="link">${esc(label)}</a>`;
  const firstName = firstNameOf(c.businessName);
  return `
<header class="nav" id="nav">
  <div class="nav-inner">
    <a class="nav-mark" href="/" data-cursor="link">${esc(firstName)}</a>
    <nav class="nav-links" aria-label="Primary">
      ${link('Work', 'work')}
      ${link('About', 'about')}
      ${link('Services', 'services')}
      ${link('Contact', 'contact')}
      ${c.contactEmail ? `<a href="mailto:${attr(c.contactEmail)}" class="nav-cta" data-cursor="link" data-magnetic>Get in touch</a>` : ''}
    </nav>
    <button class="nav-burger" id="nav-burger" aria-label="Open menu" aria-expanded="false">
      <span></span><span></span>
    </button>
  </div>
</header>
<div class="nav-overlay" id="nav-overlay" aria-hidden="true">
  <div class="nav-overlay-top">
    <span class="nav-mark">${esc(firstName)}</span>
    <button class="nav-overlay-close" id="nav-overlay-close" aria-label="Close menu">Close</button>
  </div>
  <nav class="nav-overlay-links" aria-label="Mobile">
    <a href="${onHome ? '#work' : '/#work'}"><span class="num">01</span>Work</a>
    <a href="${onHome ? '#about' : '/#about'}"><span class="num">02</span>About</a>
    <a href="${onHome ? '#services' : '/#services'}"><span class="num">03</span>Services</a>
    <a href="${onHome ? '#contact' : '/#contact'}"><span class="num">04</span>Contact</a>
    ${c.contactEmail ? `<a href="mailto:${attr(c.contactEmail)}"><span class="num">05</span>Get in touch</a>` : ''}
  </nav>
</div>`;
}

function getFooter(c) {
  const year = new Date().getFullYear();
  const place = c.contactAddress || (Array.isArray(c.serviceAreas) && c.serviceAreas[0]) || '';
  return `
<footer class="footer">
  <div class="container">
    <div class="footer-row">
      <span>© ${year} ${esc(c.businessName)}</span>
      <span class="center">${place ? `Designed in ${esc(place)}` : 'Designed & built with care'}</span>
      <span class="right"><a href="#top" class="footer-back" id="back-top" data-cursor="link">Back to top ↑</a></span>
    </div>
  </div>
</footer>`;
}

function getScripts() {
  return `
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" defer></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js" defer></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/lenis/1.0.42/lenis.min.js" defer></script>
<script>
window.addEventListener('DOMContentLoaded', function () {
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia && (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 767px)').matches);
  var lenis;

  // ── Lenis smooth scroll ─────────────────────────────────────────────
  function initLenis() {
    if (reduceMotion || typeof Lenis === 'undefined') return;
    lenis = new Lenis({
      duration: 1.2,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true,
      smoothTouch: false,
      touchMultiplier: 2,
    });
    function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
    if (typeof ScrollTrigger !== 'undefined') {
      lenis.on('scroll', ScrollTrigger.update);
    }
    if (typeof gsap !== 'undefined' && gsap.ticker) {
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    }
  }

  // wait briefly for CDN scripts to register
  function waitForLibs(cb) {
    var tries = 0;
    (function poll() {
      if ((typeof Lenis !== 'undefined' && typeof gsap !== 'undefined') || tries > 40) {
        cb();
        return;
      }
      tries++;
      setTimeout(poll, 50);
    })();
  }

  waitForLibs(function () {
    initLenis();

    // ── Smooth-scroll anchors ──────────────────────────────────────
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
          if (lenis) lenis.scrollTo(t, { offset: -40 });
          else t.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    // ── Nav scroll background ──────────────────────────────────────
    var nav = document.getElementById('nav');
    function onScroll() {
      if (!nav) return;
      if (window.scrollY > 80) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // ── Hero name letter-by-letter rise ────────────────────────────
    var heroName = document.querySelector('.hero-name');
    function fireHeroIn() {
      if (heroName) heroName.classList.add('in');
      var els = ['.hero-eyebrow', '.hero-greeting', '.hero-role', '.hero-tag', '.hero-ctas', '.hero-scroll'];
      els.forEach(function (sel) {
        var el = document.querySelector(sel);
        if (el) el.classList.add('in');
      });
    }
    function splitHero() {
      if (!heroName || reduceMotion) { fireHeroIn(); return; }
      var raw = heroName.getAttribute('data-text') || heroName.textContent;
      heroName.innerHTML = '';
      var ci = 0;
      var words = raw.split(' ');
      words.forEach(function (word) {
        var wEl = document.createElement('span');
        wEl.className = 'word';
        word.split('').forEach(function (ch) {
          var cEl = document.createElement('span');
          cEl.className = 'char';
          cEl.textContent = ch;
          cEl.style.animationDelay = (0.05 + ci * 0.04) + 's';
          wEl.appendChild(cEl);
          ci++;
        });
        heroName.appendChild(wEl);
      });
      heroName.classList.add('split');
      requestAnimationFrame(fireHeroIn);
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(splitHero);
    } else {
      splitHero();
    }

    // ── Scroll reveal ──────────────────────────────────────────────
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
      document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
    } else {
      document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
    }

    // ── Custom cursor (desktop only) ───────────────────────────────
    if (!coarse && !reduceMotion) {
      var cursor = document.createElement('div');
      cursor.className = 'cursor';
      cursor.setAttribute('aria-hidden', 'true');
      document.body.appendChild(cursor);
      var cx = 0, cy = 0, tx = 0, ty = 0;
      document.addEventListener('mousemove', function (e) {
        tx = e.clientX; ty = e.clientY;
        if (!cursor.classList.contains('ready')) cursor.classList.add('ready');
      });
      function tick() {
        cx += (tx - cx) * 0.15;
        cy += (ty - cy) * 0.15;
        cursor.style.transform = 'translate(' + cx + 'px, ' + cy + 'px) translate(-50%, -50%)';
        requestAnimationFrame(tick);
      }
      tick();
      document.querySelectorAll('a, button').forEach(function (el) {
        el.addEventListener('mouseenter', function () {
          if (el.getAttribute('data-cursor') === 'view') cursor.classList.add('view');
          else cursor.classList.add('link');
        });
        el.addEventListener('mouseleave', function () {
          cursor.classList.remove('link');
          cursor.classList.remove('view');
        });
      });
    }

    // ── Magnetic CTAs ──────────────────────────────────────────────
    if (!coarse && !reduceMotion && typeof gsap !== 'undefined') {
      document.querySelectorAll('[data-magnetic]').forEach(function (btn) {
        btn.addEventListener('mousemove', function (e) {
          var r = btn.getBoundingClientRect();
          var x = e.clientX - r.left - r.width / 2;
          var y = e.clientY - r.top - r.height / 2;
          gsap.to(btn, { x: x * 0.3, y: y * 0.3, duration: 0.4, ease: 'power3.out' });
        });
        btn.addEventListener('mouseleave', function () {
          gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.5)' });
        });
      });
    }

    // ── Back to top ───────────────────────────────────────────────
    var backTop = document.getElementById('back-top');
    if (backTop) {
      backTop.addEventListener('click', function (e) {
        e.preventDefault();
        if (lenis) lenis.scrollTo(0);
        else window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  });

  // ── Mobile menu (works regardless of CDN libs) ─────────────────
  var burger = document.getElementById('nav-burger');
  var overlay = document.getElementById('nav-overlay');
  var closeBtn = document.getElementById('nav-overlay-close');
  function openMenu() {
    if (!overlay) return;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    if (burger) burger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }
  function closeMenu() {
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    if (burger) burger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }
  if (burger) burger.addEventListener('click', openMenu);
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);
  if (overlay) overlay.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeMenu); });
});
</script>`;
}

function wrap(c, currentPath, body) {
  const banner = renderActivationBanner(c);
  const title = `${c.businessName} — ${c.industry || 'Portfolio'}`;
  const description = c.tagline || c.portfolioAbout || c.aboutText || `${c.businessName} — portfolio`;
  return `<!DOCTYPE html>
<!-- Pixie General Portfolio Template v1.0 — generated for ${esc(c.businessName)} -->
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(description)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${getStyles()}</style>
</head>
<body>
${banner}
<a href="#main" class="skip-link">Skip to content</a>
${getNav(c, currentPath)}
<main id="main"><span id="top"></span>
${body}
</main>
${getFooter(c)}
${getScripts()}
</body>
</html>`;
}

// ─── home (single-page editorial) ───────────────────────────────────────────
function renderProject(p, idx) {
  const num = pad2(idx + 1);
  const tags = normalizeSkillsList(p.tools).slice(0, 4);
  const meta = [tags.length ? tags[0] : null, p.year, tags.length > 1 ? tags.slice(1).join(' · ') : null].filter(Boolean).join(' · ');
  const flip = idx % 2 === 1 ? ' flip' : '';
  const cover = p.photoUrl
    ? `<div class="project-cover-img" style="background-image: url('${attr(p.photoUrl)}')" role="img" aria-label="${attr(p.title)}"></div>`
    : `<div class="project-cover-empty"><span>${esc(p.title)}</span></div>`;

  return `
<article class="project${flip} reveal" data-cursor="view">
  <a class="project-cover-link" ${p.link ? `href="${attr(p.link)}" target="_blank" rel="noopener"` : 'href="javascript:void(0)" tabindex="-1"'} aria-label="${attr(p.title)}">
    <div class="project-cover">
      ${cover}
    </div>
  </a>
  <div class="project-info">
    <div class="project-num">${num}.</div>
    <h3 class="project-title">${esc(p.title)}</h3>
    ${p.description ? `<p class="project-desc">${esc(p.description)}</p>` : ''}
    ${meta ? `<div class="project-tags">${esc(meta)}</div>` : ''}
    ${p.link ? `<a class="project-link" href="${attr(p.link)}" target="_blank" rel="noopener" data-cursor="link">View project <svg viewBox="0 0 14 10" fill="currentColor"><path d="M8.5 0l4.8 5L8.5 10l-.7-.7L11.4 5.7H0v-1.4h11.4L7.8.7z"/></svg></a>` : ''}
  </div>
</article>`;
}

function renderSocials(c) {
  const links = [];
  if (c.instagramHandle) links.push({ label: 'Instagram', href: `https://instagram.com/${c.instagramHandle}` });
  if (c.twitterHandle)   links.push({ label: 'Twitter',   href: `https://twitter.com/${c.twitterHandle}` });
  if (c.linkedinHandle)  links.push({ label: 'LinkedIn',  href: `https://linkedin.com/in/${c.linkedinHandle}` });
  if (c.behanceHandle)   links.push({ label: 'Behance',   href: `https://behance.net/${c.behanceHandle}` });
  if (c.githubHandle)    links.push({ label: 'GitHub',    href: `https://github.com/${c.githubHandle}` });
  if (links.length === 0) return '';
  const inner = links.map((l, i) => {
    const sep = i < links.length - 1 ? '<span class="dot">·</span>' : '';
    return `<a href="${attr(l.href)}" target="_blank" rel="noopener" data-cursor="link">${esc(l.label)}</a>${sep}`;
  }).join('');
  return `<div class="contact-socials reveal"><span class="label">Or find me on</span> ${inner}</div>`;
}

function generateHomePage(c) {
  const userProjects = Array.isArray(c.projects) && c.projects.length ? c.projects.slice(0, 6) : null;
  const projects = userProjects || defaultPlaceholderProjects();
  const services = (Array.isArray(c.services) && normalizeSkillsList(c.services).length === 0)
    ? [] // skills array exists but normalizes to empty → hide section
    : defaultServices(c.industry);
  const skills = normalizeSkillsList(c.services);
  const place = c.contactAddress || (Array.isArray(c.serviceAreas) && c.serviceAreas[0]) || null;
  const role = c.industry || 'Maker';
  const tagline = c.tagline || defaultPovTagline(role);
  const yearsNum = c.yearsExperience || 5;
  const firstName = firstNameOf(c.businessName);
  const aboutPhotoUrl = c.aboutPhotoUrl || (c.heroImage && c.heroImage.url) || null;

  const bioText = c.portfolioAbout || c.aboutText || `${firstName} is a ${role.toLowerCase()}${place ? ` based in ${place}` : ''}. ${tagline}`;
  const paragraphs = bioParagraphs(bioText);

  // Marquee items — discipline-aware defaults if user has no skills yet.
  const marqueeBase = skills.length ? skills.slice(0, 8) : (
    /develop|engineer/.test(role.toLowerCase())     ? ['Frontend', 'Backend', 'Systems', 'Performance', 'Design Systems', 'Architecture'] :
    /photo/.test(role.toLowerCase())                ? ['Editorial', 'Brand', 'Portrait', 'Print', 'Direction'] :
    /writ|copy|content|journ/.test(role.toLowerCase()) ? ['Editorial', 'Brand Voice', 'Long-form', 'Strategy', 'Copy'] :
    /illustrat|paint|artist/.test(role.toLowerCase()) ? ['Illustration', 'Editorial', 'Print', 'Type', 'Murals'] :
    ['Brand Identity', 'Web Design', 'Art Direction', 'Editorial', 'Type']
  );
  const marqueeStrip = marqueeBase.concat(marqueeBase).map((s, i, arr) => {
    return `<span class="marquee-item">${esc(s)}<span class="sep"> · </span></span>`;
  }).join('');

  const expertiseItems = (skills.length ? skills.slice(0, 5) : services.slice(0, 4).map((s) => s.title));
  const availabilityItems = [
    'Open to projects',
    place ? 'Remote or on-site' : 'Remote',
    `${quarterLabel()} onwards`,
  ];

  const photoBlock = aboutPhotoUrl
    ? `<figure>
        <img class="about-photo" src="${attr(aboutPhotoUrl)}" alt="${attr(firstName + ' — portrait')}" loading="lazy" width="800" height="1000">
        ${place ? `<figcaption class="caption about-photo-caption">${esc(place)}</figcaption>` : ''}
      </figure>`
    : `<div class="about-photo-fallback">
        <span class="greet">Hi, I'm</span>
        <span class="name">${esc(firstName)}</span>
        ${place ? `<span class="caption">${esc(place)}</span>` : ''}
      </div>`;

  const showServices = services.length > 0;

  const body = `
<section class="hero" id="hero">
  <div class="container">
    <div class="hero-eyebrow"><span class="eyebrow">Portfolio · ${new Date().getFullYear()}</span></div>
    <p class="hero-greeting">Hi, I'm</p>
    <h1 class="hero-name" data-text="${attr(c.businessName)}">${esc(c.businessName)}</h1>
    <p class="hero-role">${esc(role)}${place ? ` <span aria-hidden="true">·</span> ${esc(place)}` : ''}</p>
    <p class="hero-tag">${esc(tagline)}</p>
    <div class="hero-ctas">
      ${c.contactEmail ? `<a class="btn btn-primary" href="mailto:${attr(c.contactEmail)}" data-cursor="link" data-magnetic>Get in touch</a>` : ''}
      <a class="btn btn-secondary" href="#work" data-cursor="link">View work <svg viewBox="0 0 14 10" fill="currentColor"><path d="M8.5 0l4.8 5L8.5 10l-.7-.7L11.4 5.7H0v-1.4h11.4L7.8.7z"/></svg></a>
    </div>
  </div>
  <div class="hero-scroll" aria-hidden="true">
    <span>Scroll</span>
    <span class="hero-scroll-line"></span>
  </div>
</section>

<section class="marquee" aria-hidden="true">
  <div class="marquee-track">${marqueeStrip}</div>
</section>

<section class="work" id="work">
  <div class="container">
    <div class="work-head">
      <span class="eyebrow reveal">Selected Work · ${pad2(projects.length)} ${projects.length === 1 ? 'project' : 'projects'}</span>
      <h2 class="reveal">${italicAccent('Recent work')}</h2>
    </div>
    <div class="work-list">
      ${projects.map((p, i) => renderProject(p, i)).join('')}
    </div>
  </div>
</section>

<section class="about" id="about">
  <div class="container about-grid">
    <div class="about-photo-col reveal">
      ${photoBlock}
    </div>
    <div class="about-text reveal">
      <span class="eyebrow">About</span>
      ${aboutPhotoUrl ? `<h2>Hi, I'm ${italicAccent(firstName)}</h2>` : ''}
      ${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
      <div class="about-mini">
        <div class="col">
          <span class="eyebrow">Expertise</span>
          <ul>${expertiseItems.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        </div>
        <div class="col">
          <span class="eyebrow">Availability</span>
          <ul>${availabilityItems.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        </div>
      </div>
    </div>
  </div>
</section>

${showServices ? `
<section class="services" id="services">
  <div class="container">
    <div class="services-head">
      <span class="eyebrow reveal">What I do</span>
      <h2 class="reveal">${italicAccent('Services')}</h2>
    </div>
    <div class="services-list">
      ${services.map((s, i) => `
        <div class="service-row reveal">
          <div class="s-num">${pad2(i + 1)} /</div>
          <div class="s-body">
            <div class="s-row">
              <h3 class="s-title">${esc(s.title)}</h3>
              <span class="s-arrow" aria-hidden="true">→</span>
            </div>
            <p class="s-desc">${esc(s.desc)}</p>
          </div>
        </div>`).join('')}
    </div>
  </div>
</section>` : ''}

<section class="contact" id="contact">
  <div class="container">
    <span class="eyebrow reveal">Let's work together</span>
    <h2 class="reveal">${italicAccent('Have a project in mind?')}</h2>
    ${c.contactEmail ? `<a class="contact-email reveal" href="mailto:${attr(c.contactEmail)}" data-cursor="link" data-magnetic>${esc(c.contactEmail)}</a>` : ''}
    ${renderSocials(c)}
    <div class="contact-availability reveal">
      <span class="live-dot" aria-hidden="true"></span>
      <span>Available for new projects · ${esc(quarterLabel())}</span>
    </div>
  </div>
</section>`;

  return wrap(c, '/', body);
}

// ─── slim about page ───────────────────────────────────────────────────────
function generateAboutPage(c) {
  const aboutBody = c.portfolioAbout || c.aboutText || `Working in ${c.industry || 'creative practice'} with a focus on craft, clarity, and shipping things that hold up.`;
  const skills = normalizeSkillsList(c.services);
  const yearsLine = c.yearsExperience ? `${c.yearsExperience}+ years` : '';
  const firstName = firstNameOf(c.businessName);
  const place = c.contactAddress || (Array.isArray(c.serviceAreas) && c.serviceAreas[0]) || null;
  const paragraphs = bioParagraphs(aboutBody);

  const body = `
<section class="page-section">
  <div class="container">
    <span class="eyebrow reveal">About</span>
    <h1 class="page-h1 reveal">${italicAccent('Hi, I\'m ' + firstName)}</h1>
    <div class="page-body reveal">
      ${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
      ${c.industry ? `<p>${yearsLine ? `${esc(yearsLine)} working in ${esc(c.industry)} — ` : `Currently focused on ${esc(c.industry)} — `}building work that's clear, honest, and useful.</p>` : ''}
      <p>If you're building something that needs care, <a href="/contact">let's talk</a>.</p>
    </div>
    <div class="detail-grid reveal">
      ${skills.length ? `<div><h4>Toolkit</h4><p>${esc(skills.join(' · '))}</p></div>` : ''}
      ${c.contactEmail ? `<div><h4>Reach out</h4><p><a href="mailto:${attr(c.contactEmail)}">${esc(c.contactEmail)}</a></p></div>` : ''}
      ${place ? `<div><h4>Based</h4><p>${esc(place)}</p></div>` : ''}
      ${c.instagramHandle ? `<div><h4>Elsewhere</h4><p><a href="https://instagram.com/${attr(c.instagramHandle)}" target="_blank" rel="noopener">@${esc(c.instagramHandle)}</a></p></div>` : ''}
    </div>
  </div>
</section>`;
  return wrap(c, '/about', body);
}

// ─── slim contact page ─────────────────────────────────────────────────────
function generateContactPage(c) {
  const body = `
<section class="page-section">
  <div class="container">
    <span class="eyebrow reveal">Say hi</span>
    <h1 class="page-h1 reveal">${italicAccent('Let\'s talk')}</h1>
    <div class="page-body reveal">
      <p>Tell me about your project, your timeline, and anything else worth knowing. I read everything that comes through and reply within a day or two.</p>
    </div>

    <div class="detail-grid reveal">
      ${c.contactEmail ? `<div><h4>Email</h4><p><a href="mailto:${attr(c.contactEmail)}">${esc(c.contactEmail)}</a></p></div>` : ''}
      ${c.contactPhone ? `<div><h4>Phone</h4><p><a href="tel:${attr(c.contactPhone)}">${esc(c.contactPhone)}</a></p></div>` : ''}
      ${c.instagramHandle ? `<div><h4>Instagram</h4><p><a href="https://instagram.com/${attr(c.instagramHandle)}" target="_blank" rel="noopener">@${esc(c.instagramHandle)}</a></p></div>` : ''}
    </div>

    <form class="form reveal" id="cf">
      <input type="text" name="name" placeholder="Your name" required>
      <input type="email" name="email" placeholder="Your email" required>
      <textarea name="message" placeholder="What do you want to build?" required></textarea>
      ${consentField()}
      <button type="submit" id="cf-btn">Send message</button>
      <p class="form-status" id="cf-status"></p>
    </form>
  </div>
</section>

<script>
(function(){
  var form = document.getElementById('cf');
  var status = document.getElementById('cf-status');
  var btn = document.getElementById('cf-btn');
  if (!form) return;
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var data = new FormData(form);
    if (!data.get('consent')) { status.textContent = 'Please confirm consent first.'; status.className = 'form-status err'; return; }
    btn.disabled = true; status.textContent = 'Sending…'; status.className = 'form-status';
    fetch('${attr(PUBLIC_API_BASE)}/api/leads/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: '${attr(c.siteId || '')}',
        name: data.get('name'), email: data.get('email'),
        message: data.get('message'),
        consent: !!data.get('consent'),
      }),
    }).then(function(r){return r.json();}).then(function(j){
      if (j && j.ok) { status.textContent = "Got it — I'll reply soon."; status.className = 'form-status ok'; form.reset(); }
      else { status.textContent = 'Send failed — try emailing directly.'; status.className = 'form-status err'; btn.disabled = false; }
    }).catch(function(){ status.textContent = 'Network error — try emailing directly.'; status.className = 'form-status err'; btn.disabled = false; });
  });
})();
</script>`;
  return wrap(c, '/contact', body);
}

// ─── privacy / thank-you ───────────────────────────────────────────────────
function generatePrivacyPage(c) {
  const body = `
<section class="page-section">
  <div class="container">
    <span class="eyebrow">Privacy</span>
    <h1 class="page-h1">Privacy</h1>
    <div class="page-body" style="margin-top: var(--space-5)">${generatePrivacyBody(c)}</div>
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
    <h1 class="page-h1" style="margin: var(--space-5) auto 0; max-width: none">${italicAccent('Got your message')}</h1>
    <p class="page-body" style="margin: var(--space-5) auto 0">I'll reply within a day or two. — ${esc(firstName)}</p>
    <p style="margin-top: var(--space-7)"><a href="/" style="font-family: var(--font-body); font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-primary); border-bottom: 1px solid var(--ink-primary); padding-bottom: 2px">← Back to work</a></p>
  </div>
</section>`;
  return wrap(c, '/thank-you', body);
}

// ─── entry ──────────────────────────────────────────────────────────────────
function generatePortfolioPages(config) {
  return {
    '/index.html':           generateHomePage(config),
    '/about/index.html':     generateAboutPage(config),
    '/contact/index.html':   generateContactPage(config),
    '/thank-you/index.html': generateThankYouPage(config),
    '/privacy/index.html':   generatePrivacyPage(config),
  };
}

module.exports = { generatePortfolioPages };
