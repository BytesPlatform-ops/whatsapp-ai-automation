// Portfolio template — single generic, audience-agnostic design that
// works for any creative freelancer (designer / developer / photographer
// / writer / freelancer / artist).
//
// Visual language: editorial. Big display serif (Fraunces) for headlines
// against an Inter body. Dark ink + warm paper palette + one accent color.
// Asymmetric project grid, masthead-style top bar, animated marquee strip,
// "currently / now" status section, full-bleed closing footer with the
// user's name as a giant sign-off.
//
// Reads the same `config` shape every other template gets from
// generateWebsiteContent. Portfolio-specific fields:
//   - portfolioAbout : 1-2 sentence bio (string, optional)
//   - projects       : array of { title, description, role, year, link,
//                                  tools, photoUrl } from the user's
//                                  iterative collection (optional)

const { env } = require('../../../config/env');
const { computeHeroPaletteFromConfig } = require('../../heroPalette');
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

function pages() {
  return [
    { n: 'Index', h: '/' },
    { n: 'About', h: '/about' },
    { n: 'Contact', h: '/contact' },
  ];
}

// ─── styles ────────────────────────────────────────────────────────────────
function getStyles(pc, ac) {
  return `
:root {
  --ink: #0e0e10;
  --ink-soft: #1a1a1d;
  --paper: #fafaf7;
  --paper-soft: #f0f0eb;
  --line: rgba(14, 14, 16, 0.08);
  --line-strong: rgba(14, 14, 16, 0.18);
  --mute: rgba(14, 14, 16, 0.55);
  --mute-soft: rgba(14, 14, 16, 0.4);
  --primary: ${pc};
  --accent: ${ac};
  --radius: 4px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 16px; line-height: 1.6;
  color: var(--ink); background: var(--paper);
  font-weight: 400;
  cursor: none;
}
@media (max-width: 920px) { body { cursor: auto; } }
h1, h2, h3, h4 {
  font-family: 'Fraunces', 'Inter', serif;
  font-weight: 500;
  letter-spacing: -0.025em;
  line-height: 1; color: var(--ink);
}
em { font-style: italic; font-weight: 400; }
.italic-accent { font-style: italic; color: var(--accent); font-weight: 400; }
p { color: var(--ink-soft); }
a { color: inherit; text-decoration: none; }
img { max-width: 100%; display: block; }
.container { max-width: 1440px; margin: 0 auto; padding: 0 48px; }
@media (max-width: 920px) { .container { padding: 0 24px; } }
@media (max-width: 720px) { .container { padding: 0 18px; } }

/* ─── custom cursor ─── */
.cursor {
  position: fixed; top: 0; left: 0;
  width: 12px; height: 12px;
  background: var(--ink); border-radius: 50%;
  pointer-events: none; z-index: 9999;
  transition: transform 0.18s cubic-bezier(.2,.8,.2,1), background 0.15s, width 0.18s, height 0.18s;
  transform: translate(-50%, -50%);
  mix-blend-mode: difference;
}
.cursor.hov { width: 56px; height: 56px; background: var(--paper); }
.cursor.hov.has-label::after {
  content: attr(data-label);
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--ink); mix-blend-mode: normal;
}
@media (max-width: 920px) { .cursor { display: none; } }

/* ─── masthead (very top of page, editorial mast) ─── */
.mast {
  border-bottom: 1px solid var(--line);
  padding: 16px 48px;
  display: grid; grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 24px; align-items: center;
  font-family: 'Inter', sans-serif;
  font-size: 11px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--mute);
}
.mast-cell { display: flex; align-items: center; gap: 8px; }
.mast-cell.right { justify-content: flex-end; text-align: right; }
.mast-cell.center { justify-content: center; }
.mast-name { color: var(--ink); font-weight: 600; letter-spacing: 0.14em; }
.mast-status-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #4ade80;
  animation: pulse 2.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.5); }
  50% { box-shadow: 0 0 0 6px rgba(74, 222, 128, 0); }
}
@media (max-width: 920px) {
  .mast { grid-template-columns: 1fr 1fr; padding: 14px 24px; gap: 12px; font-size: 10px; }
  .mast-cell.center { justify-content: flex-start; text-align: left; }
  .mast-cell.right { justify-content: flex-end; }
  .mast-cell.hide-mobile { display: none; }
}

/* ─── nav (sticky) ─── */
.nav {
  position: sticky; top: 0; z-index: 50;
  background: var(--paper);
  border-bottom: 1px solid var(--line);
  transition: transform 0.3s cubic-bezier(.2,.8,.2,1);
}
.nav.hide { transform: translateY(-100%); }
.nav-inner {
  display: flex; align-items: center; justify-content: space-between;
  padding: 22px 48px;
}
@media (max-width: 920px) { .nav-inner { padding: 18px 24px; } }
.nav-brand {
  font-family: 'Fraunces', serif; font-weight: 500; font-size: 22px;
  letter-spacing: -0.015em;
}
.nav-brand .ast { color: var(--accent); margin-left: 4px; }
.nav-links { display: flex; gap: 40px; align-items: center; }
.nav-links a {
  font-family: 'Inter', sans-serif;
  font-size: 13px; font-weight: 500;
  position: relative;
  letter-spacing: 0.005em;
}
.nav-links a.active::before {
  content: ''; position: absolute; left: -14px; top: 50%;
  width: 5px; height: 5px; background: var(--accent); border-radius: 50%;
  transform: translateY(-50%);
}
.nav-links a:hover { color: var(--accent); }
@media (max-width: 720px) { .nav-links { gap: 22px; } }

/* ─── hero ─── */
.hero { padding: 80px 0 100px; position: relative; }
.hero-tag {
  display: inline-flex; align-items: center; gap: 10px;
  margin-bottom: 56px;
  font-family: 'Inter', sans-serif;
  font-size: 12px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--mute);
}
.hero-tag .ln { width: 32px; height: 1px; background: var(--ink); display: inline-block; }
.hero-name {
  font-family: 'Fraunces', serif;
  font-weight: 500;
  font-size: clamp(60px, 14vw, 220px);
  line-height: 0.92;
  letter-spacing: -0.045em;
  margin-bottom: 0;
}
.hero-name .ast {
  display: inline-block;
  color: var(--accent);
  font-size: 0.4em;
  vertical-align: top;
  margin-top: 0.2em; margin-left: 0.05em;
  animation: spin 14s linear infinite;
}
@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
.hero-role {
  font-family: 'Fraunces', serif;
  font-style: italic; font-weight: 400;
  font-size: clamp(40px, 8vw, 120px);
  line-height: 1;
  color: var(--mute);
  letter-spacing: -0.03em;
  margin-top: 0.05em;
}
.hero-role .accent { color: var(--accent); }
.hero-bottom {
  display: grid; grid-template-columns: 1fr 1fr; gap: 64px;
  margin-top: 80px;
  padding-top: 48px;
  border-top: 1px solid var(--line);
}
@media (max-width: 720px) { .hero-bottom { grid-template-columns: 1fr; gap: 32px; } }
.hero-bio {
  font-family: 'Fraunces', serif; font-weight: 400;
  font-size: clamp(20px, 1.8vw, 26px);
  line-height: 1.4;
  letter-spacing: -0.005em;
  color: var(--ink-soft);
  max-width: 38ch;
}
.hero-actions {
  display: flex; flex-direction: column; gap: 18px; align-items: flex-start;
  align-self: end;
}
.hero-cta {
  display: inline-flex; align-items: center; gap: 14px;
  padding: 20px 32px;
  background: var(--ink); color: var(--paper);
  border-radius: 999px;
  font-family: 'Inter', sans-serif;
  font-size: 14px; font-weight: 500; letter-spacing: 0.005em;
  transition: transform 0.18s, box-shadow 0.18s, background 0.18s;
}
.hero-cta:hover { transform: translateY(-2px); box-shadow: 0 16px 40px rgba(14,14,16,0.22); background: var(--accent); }
.hero-cta svg { width: 14px; height: 10px; }
.hero-secondary {
  font-family: 'Inter', sans-serif;
  font-size: 13px; font-weight: 500;
  border-bottom: 1px solid var(--ink);
  padding-bottom: 2px; align-self: flex-start;
}

/* ─── marquee ─── */
.marquee {
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: var(--paper);
  padding: 36px 0;
  overflow: hidden;
  white-space: nowrap;
}
.marquee-track {
  display: inline-flex; gap: 56px;
  animation: scroll 35s linear infinite;
  font-family: 'Fraunces', serif;
  font-size: clamp(36px, 5vw, 72px);
  font-weight: 400;
  letter-spacing: -0.025em;
  color: var(--ink);
}
.marquee-track > span { display: inline-flex; align-items: center; gap: 56px; }
.marquee-track .sep {
  font-size: 0.7em; color: var(--accent);
  display: inline-block;
  animation: spin 8s linear infinite;
}
@keyframes scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

/* ─── now / currently ─── */
.now { padding: 100px 0; border-bottom: 1px solid var(--line); }
.now-grid {
  display: grid; grid-template-columns: 1fr 3fr; gap: 64px;
  align-items: start;
}
@media (max-width: 720px) { .now-grid { grid-template-columns: 1fr; gap: 24px; } }
.now-label {
  font-family: 'Inter', sans-serif;
  font-size: 12px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--mute);
}
.now-text {
  font-family: 'Fraunces', serif; font-weight: 400;
  font-size: clamp(24px, 2.4vw, 38px);
  line-height: 1.35;
  letter-spacing: -0.015em;
  color: var(--ink);
}
.now-text em { color: var(--accent); font-style: italic; }
.now-meta {
  margin-top: 32px;
  display: flex; gap: 32px; flex-wrap: wrap;
  font-family: 'Inter', sans-serif; font-size: 13px;
  color: var(--mute);
}
.now-meta .item { display: flex; flex-direction: column; gap: 4px; }
.now-meta .label { font-size: 10px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--mute-soft); }
.now-meta .val { color: var(--ink); font-weight: 500; font-size: 14px; letter-spacing: 0; }

/* ─── projects ─── */
.projects-section { padding: 140px 0 100px; }
.projects-header {
  display: grid; grid-template-columns: 2fr 1fr; gap: 48px;
  align-items: end; margin-bottom: 80px;
}
@media (max-width: 720px) { .projects-header { grid-template-columns: 1fr; gap: 24px; } }
.projects-header h2 {
  font-size: clamp(48px, 7vw, 96px);
  line-height: 1; letter-spacing: -0.035em; max-width: 14ch;
}
.projects-header h2 em { color: var(--accent); }
.projects-header-meta {
  display: flex; flex-direction: column; gap: 10px;
  font-family: 'Inter', sans-serif;
  justify-self: end; text-align: right;
  color: var(--mute);
}
@media (max-width: 720px) { .projects-header-meta { justify-self: start; text-align: left; } }
.projects-header-meta .label {
  font-size: 11px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase;
}
.projects-header-meta .val {
  font-family: 'Fraunces', serif; font-style: italic;
  font-size: 22px; color: var(--ink); font-weight: 400;
}

.projects-grid {
  display: grid; grid-template-columns: repeat(12, 1fr); gap: 96px 32px;
}
@media (max-width: 920px) { .projects-grid { grid-template-columns: 1fr; gap: 80px; } }
.project-card { display: block; grid-column: span 6; position: relative; }
@media (max-width: 920px) { .project-card { grid-column: span 1; } }
.project-card.wide { grid-column: span 12; }
@media (max-width: 920px) { .project-card.wide { grid-column: span 1; } }
.project-card.wide .project-cover { aspect-ratio: 16 / 9; }
.project-cover {
  aspect-ratio: 4 / 3;
  background: var(--paper-soft);
  background-size: cover; background-position: center;
  border-radius: var(--radius);
  position: relative;
  overflow: hidden;
}
.project-cover-img {
  position: absolute; inset: 0;
  background-size: cover; background-position: center;
  transition: transform 0.7s cubic-bezier(.2,.8,.2,1);
}
.project-card:hover .project-cover-img { transform: scale(1.04); }
.project-cover-empty {
  display: flex; align-items: center; justify-content: center;
  font-family: 'Fraunces', serif; font-weight: 400; font-size: clamp(120px, 18vw, 280px);
  color: rgba(14,14,16,0.14);
  letter-spacing: -0.05em;
  background: linear-gradient(135deg, var(--paper-soft) 0%, #e8e6df 100%);
  font-style: italic;
}
.project-num {
  position: absolute; top: 24px; left: 24px;
  z-index: 2;
  font-family: 'Inter', sans-serif;
  font-size: 11px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--paper);
  mix-blend-mode: difference;
}
.project-overlay {
  position: absolute; inset: 0;
  background: rgba(14,14,16,0.45);
  backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.4s;
  z-index: 1;
}
.project-card:hover .project-overlay { opacity: 1; }
.project-overlay-cta {
  display: inline-flex; align-items: center; gap: 12px;
  padding: 14px 24px;
  background: var(--paper); color: var(--ink);
  border-radius: 999px;
  font-family: 'Inter', sans-serif;
  font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
  transform: translateY(8px);
  transition: transform 0.4s cubic-bezier(.2,.8,.2,1);
}
.project-card:hover .project-overlay-cta { transform: translateY(0); }
.project-overlay-cta svg { width: 12px; height: 12px; }

.project-meta {
  padding: 32px 4px 0;
  display: grid; grid-template-columns: 1fr auto; gap: 32px; align-items: start;
}
.project-meta-main { min-width: 0; }
.project-title {
  font-family: 'Fraunces', serif;
  font-size: clamp(28px, 3vw, 44px);
  font-weight: 500;
  line-height: 1.05; letter-spacing: -0.02em;
  margin-bottom: 14px;
}
.project-title em { color: var(--accent); font-style: italic; font-weight: 400; }
.project-sub {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  font-family: 'Inter', sans-serif;
  font-size: 13px; color: var(--mute);
  margin-bottom: 16px;
}
.project-sub-dot { display: inline-block; width: 3px; height: 3px; background: var(--mute); border-radius: 50%; }
.project-desc { font-size: 16px; line-height: 1.55; color: var(--ink-soft); max-width: 56ch; }
.project-tools { margin-top: 18px; display: flex; flex-wrap: wrap; gap: 6px; }
.project-tool {
  font-size: 11px; font-weight: 500; letter-spacing: 0.04em; text-transform: lowercase;
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  color: var(--ink-soft);
}
.project-link-meta {
  font-family: 'Fraunces', serif; font-style: italic;
  font-size: 16px; color: var(--accent); font-weight: 400;
  white-space: nowrap;
}
.project-link-meta svg { width: 12px; height: 12px; vertical-align: -1px; margin-left: 4px; transition: transform 0.18s; }
.project-card:hover .project-link-meta svg { transform: translate(2px, -2px); }

/* ─── closing footer (the moment) ─── */
.outro {
  background: var(--ink); color: var(--paper);
  padding: 140px 0 0;
  position: relative; overflow: hidden;
  margin-top: 80px;
}
.outro::before {
  content: '✺'; position: absolute;
  top: 80px; right: 6%; font-size: clamp(120px, 14vw, 220px);
  color: var(--accent); opacity: 0.9;
  font-family: 'Fraunces', serif;
  animation: spin 16s linear infinite;
  z-index: 0;
}
.outro .container { position: relative; z-index: 1; }
.outro-eyebrow {
  font-family: 'Inter', sans-serif;
  font-size: 12px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(250,250,247,0.5);
  margin-bottom: 32px;
}
.outro-headline {
  font-family: 'Fraunces', serif;
  font-weight: 500;
  font-size: clamp(60px, 11vw, 168px);
  line-height: 0.95;
  letter-spacing: -0.04em;
  color: var(--paper);
  margin-bottom: 56px;
  max-width: 12ch;
}
.outro-headline em { color: var(--accent); font-style: italic; font-weight: 400; }
.outro-cta {
  display: inline-flex; align-items: center; gap: 14px;
  padding: 22px 36px;
  background: var(--paper); color: var(--ink);
  border-radius: 999px;
  font-family: 'Inter', sans-serif;
  font-size: 15px; font-weight: 500;
  transition: transform 0.18s, background 0.18s, color 0.18s;
}
.outro-cta:hover { transform: translateY(-2px); background: var(--accent); color: var(--paper); }
.outro-cta svg { width: 14px; height: 10px; }

.outro-grid {
  margin-top: 120px; padding-top: 56px;
  border-top: 1px solid rgba(250,250,247,0.12);
  display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 48px;
  font-family: 'Inter', sans-serif;
}
@media (max-width: 720px) { .outro-grid { grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 80px; } }
.outro-cell .label {
  font-size: 11px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(250,250,247,0.5); margin-bottom: 12px;
}
.outro-cell .val {
  font-family: 'Fraunces', serif; font-weight: 400;
  font-size: 22px; color: var(--paper);
  letter-spacing: -0.01em;
}
.outro-cell .val a { border-bottom: 1px solid rgba(250,250,247,0.3); padding-bottom: 1px; }
.outro-cell .val a:hover { border-bottom-color: var(--accent); color: var(--accent); }
.outro-sig {
  font-family: 'Fraunces', serif; font-style: italic; font-weight: 400;
  font-size: clamp(72px, 14vw, 200px);
  line-height: 0.85;
  color: var(--paper);
  letter-spacing: -0.04em;
  margin-top: 80px; margin-bottom: 0;
  padding-bottom: 64px;
  opacity: 0.96;
}
.outro-bottom {
  border-top: 1px solid rgba(250,250,247,0.12);
  padding: 32px 0;
  display: flex; align-items: center; justify-content: space-between;
  font-family: 'Inter', sans-serif;
  font-size: 12px; color: rgba(250,250,247,0.5);
  flex-wrap: wrap; gap: 16px;
}
.outro-bottom-links { display: flex; gap: 28px; }
.outro-bottom a:hover { color: var(--accent); }

/* ─── about page ─── */
.about-section { padding: 100px 0 80px; max-width: 920px; margin: 0 auto; }
.about-eyebrow {
  font-family: 'Inter', sans-serif;
  font-size: 12px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--mute); margin-bottom: 48px;
}
.about-section h1 {
  font-size: clamp(52px, 8vw, 120px);
  margin-bottom: 64px;
  max-width: 16ch;
}
.about-body p {
  font-family: 'Fraunces', serif; font-weight: 400;
  font-size: clamp(18px, 1.5vw, 22px);
  line-height: 1.55;
  margin-bottom: 24px;
  color: var(--ink-soft);
  letter-spacing: -0.005em;
}
.about-body p a { border-bottom: 1px solid var(--ink); padding-bottom: 1px; }
.about-detail-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 48px 56px;
  margin-top: 96px; padding-top: 56px; border-top: 1px solid var(--line);
}
@media (max-width: 720px) { .about-detail-grid { grid-template-columns: 1fr; gap: 32px; } }
.about-detail h4 {
  font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--mute);
  margin-bottom: 16px;
}
.about-detail p {
  font-family: 'Fraunces', serif; font-size: 18px; line-height: 1.6;
  font-weight: 400;
}
.about-detail a { border-bottom: 1px solid var(--ink); padding-bottom: 1px; }

/* ─── contact page ─── */
.contact-section { padding: 100px 0 80px; max-width: 760px; margin: 0 auto; }
.contact-section h1 { font-size: clamp(60px, 9vw, 132px); margin-bottom: 28px; }
.contact-section .lead {
  font-family: 'Fraunces', serif;
  font-size: clamp(20px, 1.6vw, 26px);
  color: var(--mute); margin-bottom: 64px; max-width: 50ch;
  line-height: 1.4;
}
.contact-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; margin-bottom: 64px; }
@media (max-width: 720px) { .contact-grid { grid-template-columns: 1fr; gap: 24px; } }
.contact-block h4 {
  font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--mute); margin-bottom: 12px;
}
.contact-block a, .contact-block p {
  font-family: 'Fraunces', serif; font-weight: 400;
  font-size: 18px;
}
.contact-block a { border-bottom: 1px solid var(--ink); padding-bottom: 1px; }
.form { display: flex; flex-direction: column; gap: 20px; padding-top: 56px; border-top: 1px solid var(--line); }
.form input, .form textarea {
  width: 100%;
  padding: 18px 20px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  font-family: inherit; font-size: 16px;
  background: transparent;
  color: var(--ink);
  transition: border-color 0.15s;
}
.form input:focus, .form textarea:focus { outline: none; border-color: var(--ink); }
.form textarea { min-height: 160px; resize: vertical; font-family: 'Fraunces', serif; font-size: 18px; line-height: 1.5; }
.form button {
  align-self: flex-start;
  padding: 18px 36px;
  background: var(--ink); color: var(--paper);
  border: 0; border-radius: 999px;
  font-family: inherit; font-size: 14px; font-weight: 500; cursor: pointer;
  transition: transform 0.18s, background 0.18s;
}
.form button:hover { transform: translateY(-2px); background: var(--accent); }
.form button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.form .consent { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: var(--mute); }
.form .consent input { width: auto; margin-top: 3px; }
.form .consent a { text-decoration: underline; }
.form-status { font-size: 14px; color: var(--mute); }
.form-status.ok { color: #1a7a3a; }
.form-status.err { color: #b3261e; }

/* ─── reveal-on-scroll ─── */
.rv { opacity: 0; transform: translateY(28px); transition: opacity 0.7s cubic-bezier(.2,.8,.2,1), transform 0.7s cubic-bezier(.2,.8,.2,1); }
.rv.in { opacity: 1; transform: none; }
.rv.d1 { transition-delay: 0.1s; }
.rv.d2 { transition-delay: 0.2s; }
.rv.d3 { transition-delay: 0.3s; }
.rv.d4 { transition-delay: 0.4s; }

/* ─── make all clickables show our cursor visibly ─── */
a, button, .project-card { cursor: none; }
@media (max-width: 920px) { a, button, .project-card { cursor: pointer; } }
`;
}

// ─── shared bits ────────────────────────────────────────────────────────────
function getMast(c) {
  const year = new Date().getFullYear();
  const place = c.contactAddress || (Array.isArray(c.serviceAreas) && c.serviceAreas[0]) || 'Remote';
  return `
<div class="mast">
  <div class="mast-cell"><span class="mast-name">${esc(c.businessName)}</span></div>
  <div class="mast-cell center hide-mobile">${esc(c.industry || 'Portfolio')}</div>
  <div class="mast-cell hide-mobile">${esc(place)} · ${year}</div>
  <div class="mast-cell right"><span class="mast-status-dot"></span>Available</div>
</div>`;
}

function getNav(c, currentPath) {
  return `
<nav class="nav" id="nav">
  <div class="nav-inner">
    <a class="nav-brand" href="/">${esc((c.businessName || '').split(/\s+/)[0] || c.businessName)}<span class="ast">✺</span></a>
    <div class="nav-links">
      ${pages().map((p) => `<a href="${attr(p.h)}"${currentPath === p.h ? ' class="active"' : ''} data-cursor-label="${attr(p.n.toLowerCase())}">${esc(p.n)}</a>`).join('')}
    </div>
  </div>
</nav>`;
}

function getOutro(c) {
  const place = c.contactAddress || (Array.isArray(c.serviceAreas) && c.serviceAreas[0]) || 'Remote';
  const year = new Date().getFullYear();
  return `
<section class="outro">
  <div class="container">
    <p class="outro-eyebrow rv">— Currently booking —</p>
    <h2 class="outro-headline rv d1">Got an <em>idea</em> worth making?</h2>
    <a href="/contact" class="outro-cta rv d2" data-cursor-label="say hi">Start the conversation <svg viewBox="0 0 14 10" fill="currentColor"><path d="M8.5 0l4.8 5L8.5 10l-.7-.7L11.4 5.7H0v-1.4h11.4L7.8.7z"/></svg></a>

    <div class="outro-grid rv d3">
      ${c.contactEmail ? `<div class="outro-cell"><div class="label">Email</div><div class="val"><a href="mailto:${attr(c.contactEmail)}">${esc(c.contactEmail)}</a></div></div>` : ''}
      ${c.contactPhone ? `<div class="outro-cell"><div class="label">Phone</div><div class="val"><a href="tel:${attr(c.contactPhone)}">${esc(c.contactPhone)}</a></div></div>` : ''}
      <div class="outro-cell"><div class="label">Based</div><div class="val">${esc(place)}</div></div>
      ${c.instagramHandle ? `<div class="outro-cell"><div class="label">Instagram</div><div class="val"><a href="https://instagram.com/${attr(c.instagramHandle)}" target="_blank" rel="noopener">@${esc(c.instagramHandle)}</a></div></div>` : ''}
    </div>

    <h3 class="outro-sig rv d4">${esc(c.businessName)}<span style="color:var(--accent)">.</span></h3>
  </div>
  <div class="container">
    <div class="outro-bottom">
      <span>© ${year} ${esc(c.businessName)}. All rights reserved.</span>
      <div class="outro-bottom-links">
        <a href="/">Index</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
        <a href="/privacy">Privacy</a>
      </div>
    </div>
  </div>
</section>`;
}

function getScript() {
  return `
<script>
(function(){
  // Reveal on scroll
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.rv').forEach((el) => io.observe(el));
  } else {
    document.querySelectorAll('.rv').forEach((el) => el.classList.add('in'));
  }

  // Hide nav on scroll-down, show on scroll-up
  const nav = document.getElementById('nav');
  if (nav) {
    let lastY = window.scrollY;
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      window.requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y > 80 && y > lastY) nav.classList.add('hide');
        else nav.classList.remove('hide');
        lastY = y; ticking = false;
      });
      ticking = true;
    }, { passive: true });
  }

  // Custom cursor (desktop only)
  if (window.matchMedia('(min-width: 920px)').matches) {
    const cursor = document.createElement('div');
    cursor.className = 'cursor';
    document.body.appendChild(cursor);
    let tx = 0, ty = 0, cx = 0, cy = 0;
    document.addEventListener('mousemove', (e) => { tx = e.clientX; ty = e.clientY; });
    function tick(){
      cx += (tx - cx) * 0.22;
      cy += (ty - cy) * 0.22;
      cursor.style.transform = 'translate(' + cx + 'px,' + cy + 'px) translate(-50%,-50%)';
      requestAnimationFrame(tick);
    }
    tick();
    const isHov = (el) => el && (el.tagName === 'A' || el.tagName === 'BUTTON' || el.classList.contains('project-card'));
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest('a,button,.project-card');
      if (el) {
        cursor.classList.add('hov');
        const lbl = el.getAttribute('data-cursor-label') || el.querySelector('[data-cursor-label]')?.getAttribute('data-cursor-label');
        if (lbl) { cursor.setAttribute('data-label', lbl); cursor.classList.add('has-label'); }
        else { cursor.classList.remove('has-label'); cursor.removeAttribute('data-label'); }
      }
    });
    document.addEventListener('mouseout', (e) => {
      if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('a,button,.project-card')) {
        cursor.classList.remove('hov', 'has-label');
        cursor.removeAttribute('data-label');
      }
    });
  }
})();
</script>`;
}

function wrap(c, currentPath, body) {
  const banner = renderActivationBanner(c);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.businessName)} — ${esc(c.industry || 'Portfolio')}</title>
<meta name="description" content="${attr(c.tagline || c.portfolioAbout || c.businessName + ' — portfolio')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,400;1,9..144,500&display=swap">
<style>${getStyles(c.primaryColor || '#0e0e10', c.accentColor || '#ff5b04')}</style>
</head>
<body>
${banner}
${getMast(c)}
${getNav(c, currentPath)}
${body}
${getOutro(c)}
${getScript()}
</body>
</html>`;
}

// ─── project card ───────────────────────────────────────────────────────────
function projectCover(p, idx) {
  const numLabel = `${pad2(idx + 1)} — Project`;
  if (p.photoUrl) {
    return `
<div class="project-cover">
  <span class="project-num">${numLabel}</span>
  <div class="project-cover-img" style="background-image: url('${attr(p.photoUrl)}')"></div>
  <div class="project-overlay"><span class="project-overlay-cta">View case <svg viewBox="0 0 14 14" fill="currentColor"><path d="M3 11l8-8M5 3h6v6"/></svg></span></div>
</div>`;
  }
  const initial = String(p.title || '?').trim().charAt(0).toUpperCase();
  return `
<div class="project-cover project-cover-empty">
  <span>${esc(initial)}</span>
  <span class="project-num">${numLabel}</span>
  <div class="project-overlay"><span class="project-overlay-cta">View case <svg viewBox="0 0 14 14" fill="currentColor"><path d="M3 11l8-8M5 3h6v6"/></svg></span></div>
</div>`;
}

function renderProjectCard(p, idx, totalCount) {
  // First card spans full-width when there are 3+ projects — gives the
  // grid an editorial rhythm instead of a flat 2-column wall.
  const isWide = idx === 0 && totalCount >= 3;
  const subs = [p.role, p.year].filter(Boolean);
  const toolsBlock = Array.isArray(p.tools) && p.tools.length
    ? `<div class="project-tools">${p.tools.slice(0, 6).map((t) => `<span class="project-tool">${esc(t)}</span>`).join('')}</div>`
    : '';
  const linkBadge = p.link
    ? `<span class="project-link-meta">View<svg viewBox="0 0 14 14" fill="currentColor"><path d="M3 11l8-8M5 3h6v6"/></svg></span>`
    : '';
  return `
<a class="project-card rv" ${p.link ? `href="${attr(p.link)}" target="_blank" rel="noopener"` : 'href="javascript:void(0)"'} ${isWide ? 'data-wide="true"' : ''}>
  <div class="${isWide ? 'project-card-inner wide-inner' : ''}"></div>
  ${projectCover(p, idx)}
  <div class="project-meta">
    <div class="project-meta-main">
      <h3 class="project-title">${esc(p.title)}</h3>
      ${subs.length ? `<div class="project-sub">${subs.map((s, i) => (i > 0 ? `<span class="project-sub-dot"></span>${esc(s)}` : esc(s))).join('')}</div>` : ''}
      ${p.description ? `<p class="project-desc">${esc(p.description)}</p>` : ''}
      ${toolsBlock}
    </div>
    ${linkBadge}
  </div>
</a>`.replace('class="project-card rv"', isWide ? 'class="project-card wide rv"' : 'class="project-card rv"');
}

// ─── default placeholders ──────────────────────────────────────────────────
function defaultPlaceholderProjects() {
  return [
    { title: 'Selected Work', description: 'A recent client project — replace this card with your own from the dashboard.', role: '', year: '', link: '', tools: [], photoUrl: null },
    { title: 'Case Study', description: 'A deeper look at a problem and the design / engineering decisions that shaped it.', role: '', year: '', link: '', tools: [], photoUrl: null },
    { title: 'Personal Project', description: 'Something self-initiated, exploring a craft, tool, or curiosity.', role: '', year: '', link: '', tools: [], photoUrl: null },
  ];
}

// ─── pages ──────────────────────────────────────────────────────────────────
function generateHomePage(c) {
  const userProjects = Array.isArray(c.projects) && c.projects.length ? c.projects : null;
  const projects = userProjects || defaultPlaceholderProjects();
  const hasUserProjects = !!userProjects;
  const skills = Array.isArray(c.services) && c.services.length ? c.services : [];
  const aboutLine = c.portfolioAbout || c.aboutText || `Building thoughtful ${c.industry || 'creative work'} with care for craft and outcomes.`;
  const firstName = (c.businessName || '').split(/\s+/)[0] || c.businessName || 'Maker';
  const lastName = (c.businessName || '').split(/\s+/).slice(1).join(' ') || '';
  const place = c.contactAddress || (Array.isArray(c.serviceAreas) && c.serviceAreas[0]) || null;
  const yearsLine = c.yearsExperience ? `${c.yearsExperience}+ years` : 'Some years';

  const marqueeItems = skills.length
    ? skills.slice(0, 8)
    : ['Brand', 'Identity', 'Product', 'Web', 'Editorial', 'Type', 'Craft'];
  const marqueeRow = marqueeItems
    .map((s) => `<span>${esc(s)}</span><span class="sep">✺</span>`)
    .join('');

  const nowText = `Currently working in <em>${esc(c.industry || 'creative practice')}</em>${place ? ` from <em>${esc(place)}</em>` : ''}, building things that hold up. Open to new collaborations and selective freelance.`;

  const body = `
<section class="hero">
  <div class="container">
    <div class="hero-tag rv"><span class="ln"></span>Portfolio · ${new Date().getFullYear()}</div>
    <h1 class="hero-name rv d1">${esc(firstName)}${lastName ? ' ' + esc(lastName) : ''}<span class="ast">✺</span></h1>
    <div class="hero-role rv d2"><em>${esc(c.industry || 'maker')}</em><span class="accent">.</span></div>
    <div class="hero-bottom">
      <p class="hero-bio rv d3">${esc(aboutLine)}</p>
      <div class="hero-actions rv d4">
        <a class="hero-cta" href="/contact" data-cursor-label="say hi">Say hi <svg viewBox="0 0 14 10" fill="currentColor"><path d="M8.5 0l4.8 5L8.5 10l-.7-.7L11.4 5.7H0v-1.4h11.4L7.8.7z"/></svg></a>
        <a class="hero-secondary" href="#work">↓ See selected work</a>
      </div>
    </div>
  </div>
</section>

<section class="marquee">
  <div class="marquee-track">
    <span>${marqueeRow}</span>
    <span>${marqueeRow}</span>
  </div>
</section>

<section class="now">
  <div class="container">
    <div class="now-grid">
      <div class="rv"><p class="now-label">— Currently —</p></div>
      <div class="rv d1">
        <p class="now-text">${nowText}</p>
        <div class="now-meta">
          <div class="item"><span class="label">Status</span><span class="val">Available · Q${Math.ceil((new Date().getMonth() + 1) / 3)}</span></div>
          <div class="item"><span class="label">Experience</span><span class="val">${esc(yearsLine)}</span></div>
          ${place ? `<div class="item"><span class="label">Based</span><span class="val">${esc(place)}</span></div>` : ''}
        </div>
      </div>
    </div>
  </div>
</section>

<section class="projects-section" id="work">
  <div class="container">
    <div class="projects-header">
      <h2 class="rv">${hasUserProjects ? `Selected <em>work</em>.` : `Recent <em>work</em>.`}</h2>
      <div class="projects-header-meta rv d1">
        <span class="label">— Index of work —</span>
        <span class="val">${hasUserProjects ? `${pad2(projects.length)} project${projects.length === 1 ? '' : 's'}` : 'A peek'}</span>
      </div>
    </div>
    <div class="projects-grid">
      ${projects.slice(0, 6).map((p, i) => renderProjectCard(p, i, projects.length)).join('')}
    </div>
  </div>
</section>`;
  return wrap(c, '/', body);
}

function generateAboutPage(c) {
  const aboutBody = c.portfolioAbout || c.aboutText || `Working in ${c.industry || 'creative practice'} with a focus on craft, clarity, and shipping things that hold up.`;
  const skills = Array.isArray(c.services) && c.services.length ? c.services : [];
  const yearsLine = c.yearsExperience ? `${c.yearsExperience}+ years` : '';
  const firstName = (c.businessName || '').split(/\s+/)[0] || 'me';
  const place = c.contactAddress || (Array.isArray(c.serviceAreas) && c.serviceAreas[0]) || null;

  const body = `
<section class="about-section container">
  <p class="about-eyebrow rv">— About —</p>
  <h1 class="rv d1">A few words about <em class="italic-accent">${esc(firstName)}</em>.</h1>
  <div class="about-body rv d2">
    <p>${esc(aboutBody)}</p>
    ${c.industry ? `<p>${yearsLine ? `${esc(yearsLine)} working in ${esc(c.industry)} — ` : `Currently focused on ${esc(c.industry)} — `}building work that's <em class="italic-accent">clear, honest, and useful</em>. Less is usually more, but the right detail is everything.</p>` : ''}
    <p>If you're building something that needs care, <a href="/contact">let's talk</a>.</p>
  </div>
  <div class="about-detail-grid rv d3">
    ${skills.length ? `<div class="about-detail"><h4>Toolkit</h4><p>${esc(skills.join(' · '))}</p></div>` : ''}
    ${c.contactEmail ? `<div class="about-detail"><h4>Reach out</h4><p><a href="mailto:${attr(c.contactEmail)}">${esc(c.contactEmail)}</a></p></div>` : ''}
    ${place ? `<div class="about-detail"><h4>Based</h4><p>${esc(place)}</p></div>` : ''}
    ${c.instagramHandle ? `<div class="about-detail"><h4>Elsewhere</h4><p><a href="https://instagram.com/${attr(c.instagramHandle)}" target="_blank" rel="noopener">@${esc(c.instagramHandle)}</a></p></div>` : ''}
  </div>
</section>`;
  return wrap(c, '/about', body);
}

function generateContactPage(c) {
  const body = `
<section class="contact-section container">
  <p class="about-eyebrow rv">— Say hi —</p>
  <h1 class="rv d1">Let's <em class="italic-accent">talk</em>.</h1>
  <p class="lead rv d2">Tell me about your project, your timeline, and anything else worth knowing. I read everything that comes through and reply within a day or two.</p>

  <div class="contact-grid rv d3">
    ${c.contactEmail ? `<div class="contact-block"><h4>Email</h4><p><a href="mailto:${attr(c.contactEmail)}">${esc(c.contactEmail)}</a></p></div>` : ''}
    ${c.contactPhone ? `<div class="contact-block"><h4>Phone</h4><p><a href="tel:${attr(c.contactPhone)}">${esc(c.contactPhone)}</a></p></div>` : ''}
    ${c.instagramHandle ? `<div class="contact-block"><h4>Instagram</h4><p><a href="https://instagram.com/${attr(c.instagramHandle)}" target="_blank" rel="noopener">@${esc(c.instagramHandle)}</a></p></div>` : ''}
  </div>

  <form class="form rv d3" id="cf">
    <input type="text" name="name" placeholder="Your name" required>
    <input type="email" name="email" placeholder="Your email" required>
    <textarea name="message" placeholder="What do you want to build?" required></textarea>
    ${consentField()}
    <button type="submit" id="cf-btn" data-cursor-label="send">Send message</button>
    <p class="form-status" id="cf-status"></p>
  </form>
</section>

<script>
(function(){
  const form = document.getElementById('cf');
  const status = document.getElementById('cf-status');
  const btn = document.getElementById('cf-btn');
  if (!form) return;
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    const data = new FormData(form);
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
    }).then((r) => r.json()).then((j) => {
      if (j && j.ok) { status.textContent = 'Got it — I\\'ll reply soon.'; status.className = 'form-status ok'; form.reset(); }
      else { status.textContent = 'Send failed — try emailing directly.'; status.className = 'form-status err'; btn.disabled = false; }
    }).catch(() => { status.textContent = 'Network error — try emailing directly.'; status.className = 'form-status err'; btn.disabled = false; });
  });
})();
</script>`;
  return wrap(c, '/contact', body);
}

function generatePrivacyPage(c) {
  const body = `
<section class="about-section container">
  <p class="about-eyebrow">— Privacy —</p>
  <h1>Privacy</h1>
  <div class="about-body" style="margin-top:32px">${generatePrivacyBody(c)}</div>
</section>`;
  return wrap(c, '/privacy', body);
}

function generateThankYouPage(c) {
  const body = `
<section class="about-section container" style="text-align:center">
  <p class="about-eyebrow">— Thank you —</p>
  <h1>Got your <em class="italic-accent">message</em>.</h1>
  <p class="lead" style="margin-top:32px;color:var(--mute)">I'll reply within a day or two. — ${esc((c.businessName || '').split(' ')[0] || c.businessName)}</p>
  <p style="margin-top:48px"><a href="/" class="hero-cta" style="background:var(--ink);color:var(--paper);">Back to work</a></p>
</section>`;
  return wrap(c, '/thank-you', body);
}

// ─── entry ─────────────────────────────────────────────────────────────────
function generatePortfolioPages(config /* watermark unused — banner pulled from config */) {
  return {
    '/index.html': generateHomePage(config),
    '/about/index.html': generateAboutPage(config),
    '/contact/index.html': generateContactPage(config),
    '/thank-you/index.html': generateThankYouPage(config),
    '/privacy/index.html': generatePrivacyPage(config),
  };
}

module.exports = { generatePortfolioPages };
