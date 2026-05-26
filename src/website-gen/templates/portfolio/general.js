// Pixie Portfolio — General Template (v1.1, parameterized)
//
// Editorial single-page scroll for any creative who hasn't matched a niche
// (catch-all + freelancer fallback). Designer template re-uses this with
// override opts (coral accent + richer case-study meta).
//
// Sections: Nav · Hero · Manifesto · Marquee · Work · About · Process ·
// Services · Contact · Footer.

const {
  PUBLIC_API_BASE, renderActivationBanner, consentField, generatePrivacyBody,
  esc, attr, pad2, normalizeSkillsList,
  firstNameOf, initialsOf, projectInitials,
  quarterLabel, bioParagraphs,
  italicAccent, italicFirst,
  getJsonLd, getFavicon,
} = require('./_shared');

// ─── opinionated content fallbacks ──────────────────────────────────────────
function defaultPovTagline(role) {
  const r = String(role || '').toLowerCase();
  if (/design|brand|ux|ui/.test(r))           return 'Working on the boring parts of design — the parts that decide whether the work survives a year.';
  if (/develop|engineer|programmer/.test(r))  return "Building software that doesn't draw attention to itself.";
  if (/photo/.test(r))                        return 'Photographs that look more like remembering than performing.';
  if (/writ|copy|content|journ/.test(r))      return 'Sentences that earn the next sentence.';
  if (/illustrat|paint|artist/.test(r))       return 'Drawings that finish their own thought.';
  return 'Independent work. Quiet about it.';
}

function defaultPlaceholderProjects() {
  const yr = new Date().getFullYear();
  return [
    { title: 'Add your first project',  role: '', year: String(yr),     link: '', tools: ['Replace from the dashboard'], photoUrl: null, description: 'Title, year, two-line note. Pixie keeps the structure; you bring the work.' },
    { title: 'Then a second one',        role: '', year: String(yr),     link: '', tools: ['Three is usually enough'], photoUrl: null, description: 'Quality reads better than quantity. Show the cases that say something specific.' },
    { title: 'Three is usually enough',  role: '', year: String(yr - 1), link: '', tools: ['Show range, not volume'], photoUrl: null, description: 'A spread of years tells a clearer story than five back-to-back from one year.' },
    { title: 'Four if one is older',     role: '', year: String(yr - 2), link: '', tools: ['Editorial Pacing'], photoUrl: null, description: 'One older project signals a body of work, not a sprint of activity.' },
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

// Titles read from the LLM-translated labels block when available (so a
// Portuguese site shows "Descoberta / Direção / Refinamento / Entrega"
// instead of English). Descriptions stay English in the fallback only —
// the LLM-generated processSteps in siteConfig replace these wholesale
// when present, so non-English users rarely see English descriptions.
function processSteps(c) {
  const L = (c && c.labels) || {};
  return [
    { title: L.procDiscovery  || 'Discovery',  desc: 'Listen first. Understand the business, audience, and constraints before sketching anything.' },
    { title: L.procDirection  || 'Direction',  desc: 'Sketch broad. Three directions, each fully explored, before narrowing to one.' },
    { title: L.procRefinement || 'Refinement', desc: "Iterate ruthlessly. Cut what isn't earning its place. Polish what is." },
    { title: L.procDelivery   || 'Delivery',   desc: 'Ship clean. Documented systems, tested across breakpoints, ready for the next hands.' },
  ];
}

// ─── styles ────────────────────────────────────────────────────────────────
function getStyles(opts) {
  const accent      = opts.accent      || '#B8935A';
  const accentHover = opts.accentHover || '#9A7840';
  const accentSoft  = opts.accentSoft  || '#E8DCC4';
  return `
:root {
  --bg-primary:    #FAF8F4;
  --bg-secondary:  #F0EAE0;
  --bg-card:       #FFFFFF;
  --ink-primary:   #0A0A0A;
  --ink-secondary: #5C5C5C;
  --ink-tertiary:  #8E8E8E;
  --accent:        ${accent};
  --accent-hover:  ${accentHover};
  --accent-soft:   ${accentSoft};
  --line:          rgba(10, 10, 10, 0.08);
  --line-strong:   rgba(10, 10, 10, 0.16);

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
  font-variation-settings: "opsz" 14;
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
em.italic-accent {
  font-style: italic;
  color: var(--accent);
  font-variation-settings: "opsz" 100, "SOFT" 80, "WONK" 1;
}

body::after {
  content: '';
  position: fixed; inset: 0;
  pointer-events: none;
  z-index: 1;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='5'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.04 0'/></filter><rect width='200' height='200' filter='url(%23n)'/></svg>");
  opacity: 0.5;
  mix-blend-mode: multiply;
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
  max-width: 1440px; margin: 0 auto;
  padding: 0 var(--space-7);
  position: relative; z-index: 2;
}
@media (max-width: 1023px) { .container { padding: 0 var(--space-5); } }
@media (max-width: 767px)  { .container { padding: 0 var(--space-4); } }

.eyebrow {
  font-family: var(--font-body);
  font-size: 12px; font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
  display: inline-block;
}

.section-indicator {
  font-family: var(--font-body);
  font-size: 12px; font-weight: 500;
  letter-spacing: 0.16em;
  color: var(--ink-tertiary);
  display: inline-flex; gap: 4px;
  margin-bottom: var(--space-3);
  font-feature-settings: "lnum" 1, "tnum" 1;
}
.section-indicator-current { color: var(--ink-primary); }

section { padding: var(--space-9) 0; position: relative; z-index: 2; }
@media (max-width: 767px) { section { padding: var(--space-8) 0; } }

/* side rail */
.side-rail {
  position: fixed;
  left: 24px; top: 50%;
  transform: translateY(-50%) rotate(-90deg);
  transform-origin: left center;
  display: flex; gap: 32px;
  font-family: var(--font-body);
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-tertiary);
  white-space: nowrap;
  z-index: 50;
  pointer-events: none;
}
.side-rail-current { color: var(--accent); transition: color var(--dur-base) var(--ease-out); }
@media (max-width: 1023px) { .side-rail { display: none; } }

/* nav */
.nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 50;
  transition: background var(--dur-base) var(--ease-out),
              backdrop-filter var(--dur-base) var(--ease-out),
              border-bottom-color var(--dur-base) var(--ease-out);
  border-bottom: 1px solid transparent;
}
.nav.scrolled {
  background: rgba(250, 248, 244, 0.85);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border-bottom-color: var(--line);
}
.nav-inner {
  max-width: 1440px; margin: 0 auto;
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
}
.nav-right { display: flex; align-items: center; gap: var(--space-5); }
.nav-links { display: flex; align-items: center; gap: var(--space-6); font-size: 13px; font-weight: 500; }
.nav-links a { color: var(--ink-primary); position: relative; padding: 4px 0; }
.nav-links a::after {
  content: ''; position: absolute; left: 0; bottom: -2px;
  width: 0; height: 1px; background: var(--accent);
  transition: width var(--dur-base) var(--ease-out);
}
.nav-links a:hover { color: var(--accent); }
.nav-links a:hover::after { width: 100%; }

.nav-cta {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 18px;
  background: var(--ink-primary);
  color: var(--bg-primary);
  border-radius: 999px;
  font-family: var(--font-body);
  font-size: 13px; font-weight: 500;
  letter-spacing: 0.02em;
  min-height: 40px;
  transition: background var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
}
.nav-cta:hover { background: var(--accent-hover); }
.nav-cta-icon { display: inline-block; font-size: 14px; line-height: 1; transition: transform var(--dur-base) var(--ease-out); }
.nav-cta:hover .nav-cta-icon { transform: rotate(45deg); }

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
  .nav-cta { width: 44px; height: 44px; padding: 0; justify-content: center; }
  .nav-cta-text { display: none; }
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
.nav-overlay-close { font-size: 14px; font-weight: 500; padding: 8px 12px; min-height: 44px; display: inline-flex; align-items: center; }
.nav-overlay-links { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: var(--space-4); }
.nav-overlay-links a {
  font-family: var(--font-display);
  font-size: clamp(28px, 6vw, 40px);
  font-weight: 400;
  padding: 12px 0;
}
.nav-overlay-links a .num {
  font-size: 12px;
  letter-spacing: 0.18em;
  color: var(--accent);
  font-family: var(--font-body);
  font-weight: 600;
  margin-right: var(--space-3);
  font-feature-settings: "lnum" 1, "tnum" 1;
}

/* hero */
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
  font-size: clamp(22px, 3vw, 32px);
  color: var(--ink-secondary);
  margin-bottom: var(--space-3);
  opacity: 0;
}
.hero-greeting.in { animation: fade-up var(--dur-slow) var(--ease-expo) 250ms forwards; }
.hero-greeting em.italic-accent { font-style: italic; }

.hero-name {
  font-family: var(--font-display);
  font-size: clamp(56px, 12vw, 180px);
  font-weight: 400;
  line-height: 0.95;
  letter-spacing: -0.04em;
  font-variation-settings: "opsz" 144, "SOFT" 50, "WONK" 1;
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
  will-change: transform;
}
.hero-name.split.in .char {
  animation: char-rise var(--dur-hero) var(--ease-expo) both;
}
@keyframes char-rise { to { opacity: 1; transform: translateY(0) rotateX(0deg); } }

.hero-role {
  font-family: var(--font-display);
  font-style: italic;
  font-size: clamp(20px, 2.5vw, 32px);
  color: var(--ink-secondary);
  margin-bottom: var(--space-5);
  opacity: 0;
}
.hero-role.in { animation: fade-up var(--dur-slow) var(--ease-expo) forwards; }
.hero-tag {
  font-family: var(--font-body);
  font-size: clamp(16px, 1.5vw, 19px);
  line-height: 1.6;
  max-width: 540px;
  margin-bottom: var(--space-6);
  opacity: 0;
}
.hero-tag.in { animation: fade-up var(--dur-slow) var(--ease-expo) forwards; }
.hero-ctas { display: flex; gap: var(--space-3); flex-wrap: wrap; opacity: 0; }
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
              transform var(--dur-base) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
  white-space: nowrap;
}
.btn-primary { background: var(--ink-primary); color: var(--bg-primary); }
.btn-primary:hover { background: var(--accent-hover); }
.btn-secondary { padding: 14px 0; color: var(--ink-primary); }
.btn-secondary svg { width: 14px; height: 10px; transition: transform var(--dur-base) var(--ease-out); }
.btn-secondary:hover { color: var(--accent); }
.btn-secondary:hover svg { transform: translateX(4px); }

.hero-right-rail {
  position: absolute;
  top: 140px; right: var(--space-7);
  width: 180px;
  font-family: var(--font-body);
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-secondary);
}
.hero-rail-block { padding: var(--space-3) 0; border-bottom: 1px solid var(--line); }
.hero-rail-block:last-child { border-bottom: 0; }
.hero-rail-block .lbl { color: var(--ink-tertiary); display: block; margin-bottom: 4px; font-size: 10px; }
.hero-rail-block .v { color: var(--ink-primary); }
.hero-rail-block .v.live { font-feature-settings: "tnum" 1, "lnum" 1; }
@media (max-width: 1023px) { .hero-right-rail { display: none; } }

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
@keyframes scroll-pulse { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.5); } }
@media (max-width: 1023px) { .hero-scroll { display: none; } }

@keyframes fade-up { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }

@media (max-width: 767px) {
  .hero { padding-bottom: var(--space-6); padding-top: 110px; }
  .hero-name { font-size: clamp(56px, 14vw, 88px); }
  .hero-ctas { flex-direction: column; align-items: stretch; gap: var(--space-3); }
  .hero-ctas .btn-primary { width: 100%; justify-content: center; }
  .hero-ctas .btn-secondary { padding: var(--space-3) 0; }
}

/* manifesto */
.manifesto {
  padding: clamp(80px, 10vw, 140px) 0;
  text-align: center;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.manifesto-text {
  font-family: var(--font-display);
  font-weight: 300;
  font-size: clamp(28px, 4vw, 52px);
  line-height: 1.3;
  letter-spacing: -0.015em;
  max-width: 1100px; margin: 0 auto;
}
.manifesto-text em { font-style: italic; }
.manifesto-text .accent { color: var(--accent); }
.manifesto-attribution {
  margin-top: var(--space-5);
  font-family: var(--font-body);
  font-size: 13px; font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--ink-secondary);
}

/* glyph divider */
.section-divider { display: flex; justify-content: center; padding: var(--space-7) 0 var(--space-5); }
.section-divider .glyph {
  font-family: var(--font-display);
  font-size: 28px;
  color: var(--accent);
  display: inline-block; line-height: 1;
}
.section-divider.in-view .glyph { animation: glyphRotate 12s linear infinite; }
@keyframes glyphRotate { to { transform: rotate(360deg); } }
@media (max-width: 767px) { .section-divider { padding: var(--space-5) 0 var(--space-4); } .section-divider .glyph { font-size: 20px; } }

/* marquee */
.marquee {
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  padding: var(--space-5) 0;
  overflow: hidden; white-space: nowrap;
}
.marquee-track {
  display: inline-flex; align-items: center;
  animation: marquee-scroll 60s linear infinite;
  will-change: transform;
}
.marquee:hover .marquee-track { animation-duration: 120s; }
@keyframes marquee-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.marquee-track > span { flex-shrink: 0; display: inline-block; }
.marquee-word {
  font-family: var(--font-display);
  font-style: italic;
  font-size: clamp(40px, 7vw, 96px);
  color: var(--ink-tertiary);
  padding: 0 24px;
  letter-spacing: -0.01em;
  font-variation-settings: "opsz" 100, "SOFT" 50, "WONK" 1;
  transition: color 200ms var(--ease-out), transform 200ms var(--ease-out);
}
.marquee-word:hover { color: var(--ink-primary); transform: scale(1.05); }
.marquee-glyph {
  font-family: var(--font-display);
  font-size: clamp(20px, 3vw, 36px);
  color: var(--accent);
  padding: 0 12px;
}
.marquee:hover .marquee-glyph { animation: glyphRotate 4s linear infinite; }
@media (max-width: 767px) { .marquee-track { animation-duration: 78s; } }

/* work */
.work-head { margin-bottom: var(--space-8); }
.work-head h2 { font-size: clamp(36px, 6vw, 84px); letter-spacing: -0.02em; }
.work-list { display: flex; flex-direction: column; gap: var(--space-9); }
@media (max-width: 767px) { .work-list { gap: var(--space-7); } }

.project { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-7); align-items: center; }
.project.flip { direction: rtl; }
.project.flip > * { direction: ltr; }
@media (max-width: 1023px) { .project { grid-template-columns: 1fr; gap: var(--space-5); } .project.flip { direction: ltr; } }

.project-cover-wrap {
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: 12px;
  overflow: hidden;
  isolation: isolate;
  background: var(--bg-secondary);
}
.project-cover-img-wrap { position: absolute; inset: 0; }
.project-cover-img {
  position: absolute; inset: 0;
  background-size: cover; background-position: center;
  transition: transform 600ms var(--ease-out), filter 600ms var(--ease-out);
  will-change: transform;
}
.project:hover .project-cover-img { transform: scale(1.04) translateY(-8px); filter: brightness(1.05); }
.project-year-stamp {
  position: absolute;
  top: 16px; right: 16px;
  padding: 6px 14px;
  background: var(--bg-primary);
  border-radius: 999px;
  font-family: var(--font-display);
  font-weight: 500; font-size: 18px;
  font-feature-settings: "lnum" 1, "tnum" 1;
  letter-spacing: -0.01em;
  z-index: 3;
}
.project-info { display: flex; flex-direction: column; transition: transform 600ms var(--ease-out); }
.project:hover .project-info { transform: translateY(4px); }
.project-num {
  font-family: var(--font-display);
  font-size: clamp(72px, 10vw, 144px);
  font-weight: 400;
  line-height: 1;
  color: transparent;
  -webkit-text-stroke: 1.5px var(--ink-primary);
  margin-bottom: var(--space-3);
  font-feature-settings: "lnum" 1, "tnum" 1;
  letter-spacing: -0.04em;
  transition: -webkit-text-stroke-color 0.4s var(--ease-out);
}
.project:hover .project-num { -webkit-text-stroke-color: var(--accent); }
.project-meta-eyebrow {
  font-family: var(--font-body);
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-tertiary);
  margin-bottom: var(--space-3);
}
.project-title {
  font-family: var(--font-display);
  font-size: clamp(26px, 3.5vw, 44px);
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.15;
  margin-bottom: var(--space-3);
}
.project-desc {
  font-size: 16px; line-height: 1.6;
  max-width: 480px;
  margin-bottom: var(--space-4);
}
.project-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3) var(--space-4);
  margin-bottom: var(--space-4);
  padding: var(--space-4) 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.project-meta-grid .row { display: flex; flex-direction: column; gap: 2px; }
.project-meta-grid .lbl {
  font-family: var(--font-body);
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-tertiary);
}
.project-meta-grid .val { font-size: 15px; color: var(--ink-primary); line-height: 1.4; }

.project-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: var(--space-4); }
.project-tag {
  display: inline-block;
  padding: 4px 12px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  font-family: var(--font-body);
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-secondary);
  transition: border-color 200ms var(--ease-out), color 200ms var(--ease-out);
}
.project-tag:hover { border-color: var(--accent); color: var(--accent); }
.project-link {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 14px; font-weight: 500;
  align-self: flex-start;
  padding: 6px 0;
  position: relative;
}
.project-link::after {
  content: ''; position: absolute;
  left: 0; bottom: 0; width: 100%; height: 1px;
  background: var(--ink-primary);
  transform: scaleX(1); transform-origin: right;
  transition: transform 400ms var(--ease-out), background-color 400ms var(--ease-out);
}
.project-link:hover::after { transform-origin: left; background-color: var(--accent); }
.project-link svg { width: 12px; height: 10px; transition: transform var(--dur-base) var(--ease-out); }
.project-link:hover { color: var(--accent); }
.project-link:hover svg { transform: translate(8px, -2px) rotate(8deg); }

/* placeholder cards (4 styles) */
.placeholder-card { position: absolute; inset: 0; display: flex; overflow: hidden; }

.placeholder-numeric { background: var(--bg-secondary); align-items: center; justify-content: center; padding: var(--space-6); text-align: center; flex-direction: column; }
.placeholder-bg-grid { position: absolute; inset: 0; background-image: radial-gradient(rgba(10,10,10,0.06) 1.5px, transparent 1.5px); background-size: 8px 8px; }
.placeholder-num-bg {
  position: absolute; top: -40px; right: -20px;
  font-family: var(--font-display);
  font-size: clamp(160px, 28vw, 280px);
  font-weight: 500; line-height: 0.9;
  color: var(--accent-soft);
  letter-spacing: -0.04em;
  font-feature-settings: "lnum" 1, "tnum" 1;
  pointer-events: none;
}
.placeholder-numeric .placeholder-title {
  position: relative; z-index: 1;
  font-family: var(--font-display);
  font-size: clamp(40px, 5vw, 72px);
  font-weight: 500; letter-spacing: -0.02em; line-height: 1;
}
.placeholder-numeric .placeholder-meta {
  position: absolute; z-index: 1;
  bottom: 24px; left: 24px;
  font-family: var(--font-body);
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--ink-secondary);
}

.placeholder-editorial { background: #1A1815; align-items: stretch; }
.placeholder-editorial .placeholder-frame {
  flex: 1; margin: 24px;
  border: 1px solid rgba(248, 244, 240, 0.2);
  padding: var(--space-5);
  display: flex; flex-direction: column; justify-content: space-between;
  color: var(--bg-primary); gap: var(--space-3);
}
.placeholder-editorial .placeholder-eyebrow {
  font-family: var(--font-body);
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(248, 244, 240, 0.55);
}
.placeholder-editorial .placeholder-title-italic {
  font-family: var(--font-display);
  font-style: italic; font-weight: 400;
  font-size: clamp(40px, 5vw, 72px);
  letter-spacing: -0.02em; line-height: 1.05;
  color: var(--bg-primary);
  font-variation-settings: "opsz" 100, "SOFT" 80, "WONK" 1;
}
.placeholder-editorial .placeholder-rule { width: 60px; height: 2px; background: var(--accent); margin: var(--space-3) 0 var(--space-2); }
.placeholder-editorial .placeholder-quote {
  font-family: var(--font-display);
  font-style: italic;
  font-size: clamp(15px, 1.4vw, 18px);
  color: rgba(248, 244, 240, 0.78);
  line-height: 1.5; max-width: 36ch;
}

.placeholder-geometric { background: var(--bg-primary); }
.placeholder-shapes { position: absolute; inset: 0; width: 100%; height: 100%; }
.placeholder-shapes .shape { transition: transform 1.2s var(--ease-out); transform-origin: center; transform-box: fill-box; }
.project:hover .placeholder-shapes .shape-circle { transform: translate(15px, -10px); }
.project:hover .placeholder-shapes .shape-square { transform: translate(-12px, 8px); }
.project:hover .placeholder-shapes .shape-rect   { transform: translate(8px, -6px); }
.placeholder-geometric .placeholder-title-bl {
  position: absolute;
  bottom: 32px; left: 32px;
  font-family: var(--font-display);
  font-size: clamp(32px, 4vw, 56px);
  font-weight: 500; letter-spacing: -0.02em; line-height: 1;
  max-width: 60%; z-index: 2;
}

.placeholder-colorfield {
  background: linear-gradient(135deg, var(--accent-soft) 0%, #E8DFD0 50%, var(--bg-secondary) 100%);
  align-items: center; justify-content: center;
}
.placeholder-initials {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: clamp(180px, 30vw, 320px);
  line-height: 0.85;
  letter-spacing: -0.06em;
  color: var(--ink-primary);
  opacity: 0.15;
  font-feature-settings: "lnum" 1, "tnum" 1;
  font-variation-settings: "opsz" 144;
}
.placeholder-colorfield .placeholder-title-mid {
  position: absolute;
  font-family: var(--font-display);
  font-size: clamp(32px, 4vw, 56px);
  font-weight: 500; letter-spacing: -0.02em; line-height: 1;
  text-align: center; max-width: 80%;
  padding: 0 var(--space-4);
}
.placeholder-colorfield .placeholder-meta-bl {
  position: absolute;
  bottom: 24px; left: 24px;
  font-family: var(--font-body);
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--ink-secondary);
  font-feature-settings: "lnum" 1, "tnum" 1;
}

/* about */
.about-grid { display: grid; grid-template-columns: 4fr 6fr; gap: var(--space-8); align-items: start; }
@media (max-width: 1023px) { .about-grid { grid-template-columns: 1fr; gap: var(--space-6); } }
.about-photo { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; border-radius: 8px; background: var(--accent-soft); }
.about-photo-caption { margin-top: var(--space-3); font-family: var(--font-body); font-size: 13px; color: var(--ink-secondary); letter-spacing: 0.04em; }
@media (max-width: 1023px) { .about-photo { max-height: 360px; aspect-ratio: 16 / 10; } }

.about-signature { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-3) 0 var(--space-5); }
.about-signature .name-display {
  font-family: var(--font-display);
  font-size: clamp(80px, 10vw, 160px);
  line-height: 0.9;
  letter-spacing: -0.04em;
  font-variation-settings: "opsz" 144, "SOFT" 50, "WONK" 1;
}
.about-signature .signature-mark {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 32px;
  color: var(--ink-secondary);
  font-variation-settings: "opsz" 30, "SOFT" 80, "WONK" 1;
}
.about-mini-meta {
  list-style: none;
  border-top: 1px solid var(--line);
  margin-top: var(--space-4); padding-top: var(--space-4);
  display: flex; flex-direction: column; gap: var(--space-3);
}
.about-mini-meta li { font-size: 16px; display: flex; align-items: baseline; gap: var(--space-3); }
.about-mini-meta li span:first-child {
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--ink-tertiary);
  width: 110px; flex-shrink: 0;
}

.about-text .eyebrow { margin-bottom: var(--space-3); }
.about-text h2 { font-size: clamp(36px, 6vw, 84px); letter-spacing: -0.02em; margin-bottom: var(--space-5); }
.about-text p { font-size: clamp(16px, 1.5vw, 19px); line-height: 1.6; max-width: 540px; margin-bottom: var(--space-3); }
.about-text p a { border-bottom: 1px solid var(--ink-primary); padding-bottom: 1px; }
.about-text p a:hover { color: var(--accent); border-bottom-color: var(--accent); }

.about-mini { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-6); margin-top: var(--space-6); padding-top: var(--space-5); border-top: 1px solid var(--line); max-width: 540px; }
.about-mini .col .eyebrow { margin-bottom: var(--space-3); }
.about-mini ul { list-style: none; }
.about-mini li { font-size: 16px; line-height: 2; }

/* process */
.process-head { margin-bottom: var(--space-7); }
.process-head h2 { font-size: clamp(36px, 6vw, 84px); letter-spacing: -0.02em; }
.process-list { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-6); list-style: none; }
@media (max-width: 1023px) { .process-list { grid-template-columns: repeat(2, 1fr); gap: var(--space-5); } }
@media (max-width: 640px)  { .process-list { grid-template-columns: 1fr; } }
.process-list li { display: flex; flex-direction: column; gap: var(--space-3); }
.process-num {
  font-family: var(--font-display);
  font-size: 64px;
  color: var(--accent);
  line-height: 1;
  font-feature-settings: "lnum" 1, "tnum" 1;
  letter-spacing: -0.02em;
}
.process-list h3 { font-family: var(--font-display); font-size: 24px; font-weight: 500; letter-spacing: -0.01em; }
.process-list p { font-size: 15px; line-height: 1.6; color: var(--ink-secondary); max-width: 240px; }

/* services */
.services-head { margin-bottom: var(--space-7); }
.services-head h2 { font-size: clamp(36px, 6vw, 84px); letter-spacing: -0.02em; }
.services-list { border-top: 1px solid var(--line); }
.service-row {
  display: grid;
  grid-template-columns: 60px 1fr;
  column-gap: var(--space-5);
  padding: var(--space-5) 0;
  border-bottom: 1px solid var(--line);
  transition: background var(--dur-base) var(--ease-out), padding var(--dur-base) var(--ease-out);
}
.service-row:hover { background: var(--bg-secondary); padding: var(--space-5) var(--space-4); }
.service-row:hover .s-num { transform: scale(1.1); color: var(--accent); }
.service-row:hover .s-title { color: var(--accent); }
.service-row:hover .s-arrow { transform: translateX(0); opacity: 1; }
.s-num {
  font-family: var(--font-display);
  font-size: 28px; color: var(--ink-tertiary);
  font-feature-settings: "lnum" 1, "tnum" 1;
  transition: transform var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out);
}
.s-body { display: flex; flex-direction: column; gap: var(--space-2); }
.s-row { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: var(--space-3); }
.s-title {
  font-family: var(--font-display);
  font-size: clamp(24px, 3vw, 32px);
  font-weight: 500; letter-spacing: -0.01em;
  transition: color var(--dur-base) var(--ease-out);
}
.s-arrow {
  font-family: var(--font-display);
  font-size: 24px; color: var(--accent);
  opacity: 0; transform: translateX(-8px);
  transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
}
.s-desc { font-size: 16px; line-height: 1.6; color: var(--ink-secondary); max-width: 480px; }
@media (max-width: 767px) {
  .service-row { grid-template-columns: 1fr; row-gap: var(--space-2); padding: var(--space-4) 0; }
  .service-row:hover { padding: var(--space-4) var(--space-3); }
  .s-title { font-size: 22px; }
  .s-arrow { display: none; }
}

/* contact */
.contact { padding: 140px 0; text-align: center; }
.contact .eyebrow { margin-bottom: var(--space-4); }
.contact h2 {
  font-size: clamp(40px, 8vw, 120px);
  letter-spacing: -0.02em; line-height: 1.05;
  max-width: 18ch; margin: 0 auto var(--space-7);
}
.contact-email {
  display: inline-block;
  font-family: var(--font-display);
  font-size: clamp(24px, 4vw, 56px);
  font-weight: 400;
  letter-spacing: -0.02em;
  position: relative;
  padding: 4px 0;
  margin-bottom: var(--space-6);
  font-variation-settings: "opsz" 96, "SOFT" 30;
}
.contact-email::after {
  content: ''; position: absolute;
  left: 0; bottom: 0;
  width: 100%; height: 2px;
  background: var(--accent);
  transform: scaleX(0); transform-origin: left;
  transition: transform var(--dur-base) var(--ease-out);
}
.contact-email:hover::after { transform: scaleX(1); }
.contact-socials { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: var(--space-3); margin-bottom: var(--space-5); font-size: 14px; color: var(--ink-secondary); }
.contact-socials .label { color: var(--ink-tertiary); }
.contact-socials .dot { color: var(--ink-tertiary); }
.contact-socials a { color: var(--ink-primary); position: relative; padding: 4px 2px; }
.contact-socials a::after { content: ''; position: absolute; left: 0; bottom: 0; width: 0; height: 1px; background: var(--accent); transition: width var(--dur-base) var(--ease-out); }
.contact-socials a:hover { color: var(--accent); }
.contact-socials a:hover::after { width: 100%; }
.contact-availability { display: inline-flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 500; color: var(--ink-secondary); letter-spacing: 0.04em; }
.contact-availability .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #10B981; box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.18); }

/* footer */
.footer { background: var(--bg-primary); position: relative; z-index: 2; }
.footer-marquee { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: var(--space-5) 0; overflow: hidden; white-space: nowrap; }
.footer-marquee-track { display: inline-flex; align-items: center; animation: marquee-scroll 90s linear infinite; will-change: transform; }
.footer-marquee-track > span {
  flex-shrink: 0;
  font-family: var(--font-display);
  font-style: italic;
  font-size: clamp(48px, 8vw, 120px);
  padding: 0 var(--space-5);
  line-height: 1;
  letter-spacing: -0.02em;
  font-variation-settings: "opsz" 144, "SOFT" 80, "WONK" 1;
}
.footer-marquee-track .footer-marquee-glyph {
  color: var(--accent); font-style: normal;
  font-size: clamp(28px, 4vw, 52px);
  font-variation-settings: "opsz" 60;
}
@media (max-width: 767px) { .footer-marquee-track > span { font-size: clamp(36px, 10vw, 56px); } }

.footer-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-6); padding: var(--space-7); max-width: 1440px; margin: 0 auto; }
@media (max-width: 1023px) { .footer-grid { grid-template-columns: repeat(2, 1fr); padding: var(--space-7) var(--space-5); } }
@media (max-width: 480px)  { .footer-grid { grid-template-columns: 1fr; padding: var(--space-7) var(--space-4); } }
.footer-eyebrow { font-family: var(--font-body); font-size: 12px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent); margin-bottom: var(--space-4); }
.footer-col ul { list-style: none; }
.footer-col li { font-size: 14px; line-height: 2; color: var(--ink-secondary); }
.footer-col li a { color: var(--ink-primary); transition: color 200ms var(--ease-out); }
.footer-col li a:hover { color: var(--accent); }
.footer-email-col {
  display: block;
  font-family: var(--font-display);
  font-size: 18px;
  margin-bottom: var(--space-2);
  border-bottom: 1px solid var(--ink-primary);
  padding-bottom: 1px;
  width: fit-content;
  word-break: break-word;
  transition: color 200ms var(--ease-out), border-color 200ms var(--ease-out);
}
.footer-email-col:hover { color: var(--accent); border-bottom-color: var(--accent); }
.footer-availability-line { font-size: 13px; color: var(--ink-secondary); margin-top: var(--space-3); }
.footer-col p { font-size: 13px; line-height: 1.6; color: var(--ink-secondary); margin-bottom: var(--space-2); }
.footer-col p em { font-family: var(--font-display); font-style: italic; color: var(--ink-primary); }

.footer-bottom { border-top: 1px solid var(--line); padding: var(--space-4) var(--space-7); display: grid; grid-template-columns: 1fr auto; align-items: center; font-size: 13px; color: var(--ink-secondary); max-width: 1440px; margin: 0 auto; letter-spacing: 0.02em; }
.back-to-top { color: var(--ink-secondary); padding: 4px 8px; transition: color 200ms var(--ease-out); }
.back-to-top:hover { color: var(--accent); }
@media (max-width: 1023px) { .footer-bottom { padding: var(--space-4) var(--space-5); } }
@media (max-width: 480px) { .footer-bottom { grid-template-columns: 1fr; gap: var(--space-3); padding: var(--space-4); } .footer-bottom .right { display: none; } }

.mobile-back-top {
  display: none;
  position: fixed;
  bottom: var(--space-4); right: var(--space-4);
  width: 44px; height: 44px;
  border-radius: 50%;
  background: var(--ink-primary);
  color: var(--bg-primary);
  align-items: center; justify-content: center;
  font-size: 16px;
  z-index: 60;
  opacity: 0; pointer-events: none;
  transform: translateY(20px);
  transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out);
  box-shadow: 0 8px 24px rgba(10,10,10,0.15);
}
.mobile-back-top.visible { opacity: 1; pointer-events: auto; transform: translateY(0); }
@media (max-width: 767px) { .mobile-back-top { display: inline-flex; } }

/* reveal */
.reveal { opacity: 0; transform: translateY(40px); transition: opacity var(--dur-slow) var(--ease-expo), transform var(--dur-slow) var(--ease-expo); }
.reveal.in { opacity: 1; transform: none; }
.project-cover-wrap.reveal-clip { clip-path: inset(0 0 100% 0); transition: clip-path 1.4s var(--ease-expo); }
.project-cover-wrap.reveal-clip.in { clip-path: inset(0 0 0 0); }

/* cursor */
.cursor {
  position: fixed; left: 0; top: 0;
  width: 8px; height: 8px;
  background: var(--ink-primary);
  border-radius: 50%;
  pointer-events: none;
  z-index: 200;
  transform: translate(-50%, -50%);
  transition: width var(--dur-base) var(--ease-out), height var(--dur-base) var(--ease-out), border-radius var(--dur-base) var(--ease-out), background var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out);
  mix-blend-mode: difference;
  opacity: 0;
}
.cursor.ready { opacity: 1; }
.cursor.text { width: 2px; height: 22px; border-radius: 1px; }
.cursor.link { width: 36px; height: 36px; }
.cursor.button { width: 60px; height: 60px; mix-blend-mode: normal; box-shadow: 0 8px 24px rgba(10,10,10,0.2); }
.cursor.view { width: 80px; height: 80px; mix-blend-mode: normal; }
.cursor.email { width: 80px; height: 80px; mix-blend-mode: normal; }
.cursor::after { content: ''; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: var(--font-body); font-size: 11px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--bg-primary); opacity: 0; transition: opacity var(--dur-fast) var(--ease-out) 100ms; }
.cursor.view::after { content: 'View →'; opacity: 1; }
.cursor.email::after { content: 'Email'; opacity: 1; }
@media (pointer: coarse), (hover: none), (max-width: 767px) { .cursor { display: none !important; } body { cursor: auto; } }
@media (pointer: fine) and (hover: hover) and (min-width: 768px) { body { cursor: none; } a, button, [data-cursor] { cursor: none; } }

/* slim about + contact + privacy */
.page-section { padding: 160px 0 var(--space-10); }
.page-h1 { font-size: clamp(56px, 9vw, 140px); letter-spacing: -0.04em; line-height: 0.92; margin-bottom: var(--space-7); max-width: 16ch; font-variation-settings: "opsz" 144, "SOFT" 50, "WONK" 1; }
.page-body { max-width: 60ch; font-size: clamp(16px, 1.5vw, 19px); line-height: 1.65; }
.page-body p { margin-bottom: var(--space-3); }
.page-body p a { border-bottom: 1px solid var(--ink-primary); padding-bottom: 1px; }
.page-body p a:hover { color: var(--accent); border-bottom-color: var(--accent); }
.detail-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-6); margin-top: var(--space-7); padding-top: var(--space-5); border-top: 1px solid var(--line); }
@media (max-width: 767px) { .detail-grid { grid-template-columns: 1fr; gap: var(--space-5); } }
.detail-grid h4 { font-family: var(--font-body); font-size: 12px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent); margin-bottom: var(--space-2); }
.detail-grid p { font-family: var(--font-display); font-size: 20px; line-height: 1.4; }
.detail-grid a { border-bottom: 1px solid var(--ink-primary); padding-bottom: 1px; }
.detail-grid a:hover { color: var(--accent); border-bottom-color: var(--accent); }

.form { display: flex; flex-direction: column; gap: var(--space-3); max-width: 640px; margin-top: var(--space-6); }
.form input, .form textarea { width: 100%; padding: 16px 18px; border: 1px solid var(--line-strong); background: var(--bg-card); font-family: inherit; font-size: 15px; color: var(--ink-primary); border-radius: 0; transition: border-color var(--dur-fast) var(--ease-out); }
.form input:focus, .form textarea:focus { outline: none; border-color: var(--ink-primary); }
.form textarea { min-height: 160px; resize: vertical; }
.form button { align-self: flex-start; padding: 16px 32px; background: var(--ink-primary); color: var(--bg-primary); font-size: 13px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 999px; transition: background var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out); min-height: 44px; }
.form button:hover { background: var(--accent-hover); transform: translateY(-1px); }
.form button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.form .consent { display: flex; align-items: flex-start; gap: 10px; font-size: 12px; color: var(--ink-secondary); }
.form .consent input { width: auto; margin-top: 3px; }
.form .consent a { text-decoration: underline; }
.form-status { font-size: 13px; color: var(--ink-secondary); }
.form-status.ok { color: #1A7A3A; }
.form-status.err { color: #B3261E; }

/* reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
  body { opacity: 1 !important; }
  .hero-name.split .char { opacity: 1 !important; transform: none !important; }
  .hero-eyebrow, .hero-greeting, .hero-role, .hero-tag, .hero-ctas, .hero-scroll { opacity: 1 !important; transform: none !important; }
  .reveal { opacity: 1 !important; transform: none !important; }
  .project-cover-wrap.reveal-clip { clip-path: none !important; }
  .marquee-track, .footer-marquee-track { animation: none !important; }
  .section-divider .glyph { animation: none !important; }
  body { cursor: auto !important; }
  a, button { cursor: pointer !important; }
  .cursor { display: none !important; }
}

@media print {
  .nav, .side-rail, .cursor, .footer-marquee, .mobile-back-top, .hero-scroll, .hero-right-rail, body::after { display: none !important; }
  body { background: white !important; color: black !important; opacity: 1 !important; }
  section { page-break-inside: avoid; padding: var(--space-5) 0 !important; }
  a { color: black !important; text-decoration: underline; }
  .placeholder-card, .project-cover-img-wrap { background: white !important; }
}
`;
}

// ─── shared bits ────────────────────────────────────────────────────────────
function getSideRail(c) {
  const year = new Date().getFullYear();
  return `
<aside class="side-rail" id="side-rail" aria-hidden="true">
  <span>${esc(c.businessName)} ©${year}</span>
  <span>Section <span class="side-rail-current" id="side-rail-current">— Hero</span></span>
</aside>`;
}

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
    <div class="nav-right">
      <nav class="nav-links" aria-label="Primary">
        ${link(c.labels?.navProjects || 'Work', 'work')}
        ${link(c.labels?.navAbout || 'About', 'about')}
        ${link(c.labels?.navServices || 'Services', 'services')}
        ${link(c.labels?.navContact || 'Contact', 'contact')}
      </nav>
      ${c.contactEmail ? `<a href="mailto:${attr(c.contactEmail)}" class="nav-cta" data-cursor="email" data-magnetic aria-label="Email ${attr(firstName)}"><span class="nav-cta-icon" aria-hidden="true">↗</span><span class="nav-cta-text">Email</span></a>` : ''}
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
    <a href="${onHome ? '#work' : '/#work'}"><span class="num">01</span>${esc(c.labels?.navProjects || 'Work')}</a>
    <a href="${onHome ? '#about' : '/#about'}"><span class="num">02</span>${esc(c.labels?.navAbout || 'About')}</a>
    <a href="${onHome ? '#services' : '/#services'}"><span class="num">03</span>${esc(c.labels?.navServices || 'Services')}</a>
    <a href="${onHome ? '#contact' : '/#contact'}"><span class="num">04</span>${esc(c.labels?.navContact || 'Contact')}</a>
    ${c.contactEmail ? `<a href="mailto:${attr(c.contactEmail)}"><span class="num">05</span>Get in touch</a>` : ''}
  </nav>
</div>`;
}

function getFooter(c, options) {
  options = options || {};
  const year = new Date().getFullYear();
  const place = c.contactAddress || (Array.isArray(c.serviceAreas) && c.serviceAreas[0]) || '';
  const onHome = options.onHome;
  const sec = (label, hash) => onHome
    ? `<li><a href="#${hash}">${esc(label)}</a></li>`
    : `<li><a href="/#${hash}">${esc(label)}</a></li>`;

  const marqueeUnit = `<span>Available for new projects</span><span class="footer-marquee-glyph">✻</span>`;
  const marqueeStrip = (marqueeUnit + marqueeUnit + marqueeUnit + marqueeUnit + marqueeUnit + marqueeUnit);

  const socials = [];
  if (c.instagramHandle) socials.push({ label: 'Instagram', href: `https://instagram.com/${c.instagramHandle}` });
  if (c.twitterHandle)   socials.push({ label: 'Twitter',   href: `https://twitter.com/${c.twitterHandle}` });
  if (c.linkedinHandle)  socials.push({ label: 'LinkedIn',  href: `https://linkedin.com/in/${c.linkedinHandle}` });
  if (c.behanceHandle)   socials.push({ label: 'Behance',   href: `https://behance.net/${c.behanceHandle}` });
  if (c.githubHandle)    socials.push({ label: 'GitHub',    href: `https://github.com/${c.githubHandle}` });
  const socialList = socials.length
    ? socials.map((s) => `<li><a href="${attr(s.href)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join('')
    : `<li>—</li>`;

  return `
<footer class="footer">
  <div class="footer-marquee" aria-hidden="true">
    <div class="footer-marquee-track">${marqueeStrip}${marqueeStrip}</div>
  </div>

  <div class="footer-grid">
    <div class="footer-col">
      <div class="footer-eyebrow">Index</div>
      <ul>
        ${sec('Home', 'top')}
        ${sec('Work', 'work')}
        ${sec('About', 'about')}
        ${sec('Services', 'services')}
        ${sec('Contact', 'contact')}
      </ul>
    </div>
    <div class="footer-col">
      <div class="footer-eyebrow">Connect</div>
      <ul>${socialList}</ul>
    </div>
    <div class="footer-col">
      <div class="footer-eyebrow">Contact</div>
      ${c.contactEmail ? `<a class="footer-email-col" href="mailto:${attr(c.contactEmail)}">${esc(c.contactEmail)}</a>` : '<p>—</p>'}
      <p class="footer-availability-line">Available ${esc(quarterLabel())}</p>
    </div>
    <div class="footer-col">
      <div class="footer-eyebrow">Colophon</div>
      <p>Set in <em>Fraunces</em> &amp; Inter.</p>
      ${place ? `<p>Designed in ${esc(place)}.</p>` : ''}
      <p>© ${year} ${esc(c.businessName)}.</p>
    </div>
  </div>

  <div class="footer-bottom">
    <span>${esc(c.businessName)}${c.industry ? ` · ${esc(c.industry)}` : ''}</span>
    <span class="right"><button class="back-to-top" id="back-top">Back to top ↑</button></span>
  </div>
</footer>
<button class="mobile-back-top" id="mobile-back-top" aria-label="Back to top">↑</button>`;
}

function getScripts() {
  return `
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" defer></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js" defer></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/lenis/1.0.42/lenis.min.js" defer></script>
<script>
window.addEventListener('DOMContentLoaded', function () {
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia && (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 767px)').matches || window.matchMedia('(hover: none)').matches);
  var lenis;

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { document.body.classList.add('fonts-loaded'); });
  } else { document.body.classList.add('fonts-loaded'); }

  function initLenis() {
    if (reduceMotion || typeof Lenis === 'undefined') return;
    lenis = new Lenis({ duration: 1.2, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }, smoothWheel: true, smoothTouch: false, touchMultiplier: 2 });
    function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
    if (typeof ScrollTrigger !== 'undefined') lenis.on('scroll', ScrollTrigger.update);
    if (typeof gsap !== 'undefined' && gsap.ticker) {
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    }
  }

  function waitForLibs(cb) {
    var tries = 0;
    (function poll() {
      if ((typeof Lenis !== 'undefined' && typeof gsap !== 'undefined') || tries > 40) { cb(); return; }
      tries++; setTimeout(poll, 50);
    })();
  }

  waitForLibs(function () {
    initLenis();

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
          if (lenis) lenis.scrollTo(t, { offset: -80, duration: 1.5 });
          else t.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    var nav = document.getElementById('nav');
    var mobileBackTop = document.getElementById('mobile-back-top');
    function onScroll() {
      var y = window.scrollY;
      if (nav) { if (y > 80) nav.classList.add('scrolled'); else nav.classList.remove('scrolled'); }
      if (mobileBackTop) { if (y > window.innerHeight) mobileBackTop.classList.add('visible'); else mobileBackTop.classList.remove('visible'); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    var heroName = document.querySelector('.hero-name');
    function fireHeroIn() {
      if (heroName) heroName.classList.add('in');
      ['.hero-eyebrow', '.hero-greeting', '.hero-role', '.hero-tag', '.hero-ctas', '.hero-scroll'].forEach(function (sel) {
        var el = document.querySelector(sel);
        if (el) el.classList.add('in');
      });
    }
    function splitHero() {
      if (!heroName || reduceMotion) { fireHeroIn(); return; }
      var raw = heroName.getAttribute('data-text') || heroName.textContent;
      heroName.innerHTML = '';
      var ci = 0;
      raw.split(' ').forEach(function (word) {
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
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(splitHero);
    else setTimeout(splitHero, 80);

    if (!coarse && !reduceMotion && heroName && typeof gsap !== 'undefined') {
      heroName.addEventListener('mousemove', function (e) {
        var chars = heroName.querySelectorAll('.char');
        var maxDist = 200;
        chars.forEach(function (ch) {
          var r = ch.getBoundingClientRect();
          var dx = e.clientX - (r.left + r.width / 2);
          var dy = e.clientY - (r.top + r.height / 2);
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < maxDist) {
            var force = (1 - dist / maxDist) * 8;
            gsap.to(ch, { y: -force, duration: 0.6, ease: 'expo.out', overwrite: 'auto' });
          } else {
            gsap.to(ch, { y: 0, duration: 0.8, ease: 'expo.out', overwrite: 'auto' });
          }
        });
      });
      heroName.addEventListener('mouseleave', function () {
        gsap.to(heroName.querySelectorAll('.char'), { y: 0, duration: 1, ease: 'elastic.out(1, 0.5)' });
      });
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
      document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });

      var dividerObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) e.target.classList.add('in-view'); else e.target.classList.remove('in-view'); });
      }, { threshold: 0.4 });
      document.querySelectorAll('.section-divider').forEach(function (el) { dividerObs.observe(el); });

      var current = document.getElementById('side-rail-current');
      if (current) {
        var sectionObs = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              var label = e.target.getAttribute('data-rail-label');
              if (label) current.textContent = '— ' + label;
            }
          });
        }, { threshold: 0.4 });
        document.querySelectorAll('[data-rail-label]').forEach(function (el) { sectionObs.observe(el); });
      }

      var clipObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); clipObs.unobserve(e.target); } });
      }, { threshold: 0.2, rootMargin: '0px 0px -60px 0px' });
      document.querySelectorAll('.project-cover-wrap.reveal-clip').forEach(function (el) { clipObs.observe(el); });
    } else {
      document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
    }

    if (!coarse && !reduceMotion) {
      var cursor = document.createElement('div');
      cursor.className = 'cursor';
      cursor.setAttribute('aria-hidden', 'true');
      document.body.appendChild(cursor);
      var cx = 0, cy = 0, tx = 0, ty = 0;
      document.addEventListener('mousemove', function (e) { tx = e.clientX; ty = e.clientY; if (!cursor.classList.contains('ready')) cursor.classList.add('ready'); });
      function tick() { cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18; cursor.style.transform = 'translate(' + cx + 'px, ' + cy + 'px) translate(-50%, -50%)'; requestAnimationFrame(tick); }
      tick();
      var states = ['link', 'view', 'email', 'button', 'text'];
      function clearStates() { states.forEach(function (s) { cursor.classList.remove(s); }); }
      document.querySelectorAll('[data-cursor]').forEach(function (el) {
        var state = el.getAttribute('data-cursor');
        el.addEventListener('mouseenter', function () { clearStates(); cursor.classList.add(state); });
        el.addEventListener('mouseleave', clearStates);
      });
    }

    if (!coarse && !reduceMotion && typeof gsap !== 'undefined') {
      document.querySelectorAll('[data-magnetic]').forEach(function (btn) {
        btn.addEventListener('mousemove', function (e) {
          var r = btn.getBoundingClientRect();
          var dx = e.clientX - r.left - r.width / 2;
          var dy = e.clientY - r.top - r.height / 2;
          gsap.to(btn, { x: dx * 0.3, y: dy * 0.3, boxShadow: (dx * 0.3) + 'px ' + (dy * 0.3) + 'px 24px rgba(10,10,10,0.12)', duration: 0.4, ease: 'power3.out' });
        });
        btn.addEventListener('mouseleave', function () {
          gsap.to(btn, { x: 0, y: 0, boxShadow: '0 0 0 rgba(10,10,10,0)', duration: 0.6, ease: 'elastic.out(1, 0.5)' });
        });
      });
    }

    var emailEl = document.querySelector('.contact-email');
    if (emailEl && !reduceMotion) {
      var orig = emailEl.textContent;
      var scrambleChars = '!<>-_/\\\\[]{}—=+*^?#';
      var scrambling = false;
      emailEl.addEventListener('mouseenter', function () {
        if (scrambling) return;
        scrambling = true;
        var frame = 0; var totalFrames = 18;
        var interval = setInterval(function () {
          frame++;
          var progress = frame / totalFrames;
          emailEl.textContent = orig.split('').map(function (ch, i) {
            if (ch === ' ' || ch === '@' || ch === '.') return ch;
            if (i / orig.length < progress) return ch;
            return scrambleChars.charAt(Math.floor(Math.random() * scrambleChars.length));
          }).join('');
          if (frame >= totalFrames) { clearInterval(interval); emailEl.textContent = orig; scrambling = false; }
        }, 28);
      });
    }

    var localTimeEl = document.getElementById('local-time');
    if (localTimeEl) {
      function updateTime() {
        var d = new Date();
        var h = d.getHours();
        var ampm = h >= 12 ? 'PM' : 'AM';
        var hh = h % 12; if (hh === 0) hh = 12;
        var mm = (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
        localTimeEl.textContent = hh + ':' + mm + ' ' + ampm;
      }
      updateTime();
      setInterval(updateTime, 60000);
    }

    function scrollTop(e) { e.preventDefault(); if (lenis) lenis.scrollTo(0); else window.scrollTo({ top: 0, behavior: 'smooth' }); }
    var backTop = document.getElementById('back-top');
    if (backTop) backTop.addEventListener('click', scrollTop);
    if (mobileBackTop) mobileBackTop.addEventListener('click', scrollTop);
  });

  var burger = document.getElementById('nav-burger');
  var overlay = document.getElementById('nav-overlay');
  var closeBtn = document.getElementById('nav-overlay-close');
  function openMenu() { if (!overlay) return; overlay.classList.add('open'); overlay.setAttribute('aria-hidden', 'false'); if (burger) burger.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; }
  function closeMenu() { if (!overlay) return; overlay.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true'); if (burger) burger.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; }
  if (burger) burger.addEventListener('click', openMenu);
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);
  if (overlay) overlay.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeMenu); });
});
</script>`;
}

function wrap(c, currentPath, body, opts) {
  const banner = renderActivationBanner(c);
  const title = `${c.businessName} — ${c.industry || 'Portfolio'}`;
  const description = c.tagline || c.portfolioAbout || c.aboutText || `${c.businessName} — portfolio`;
  return `<!DOCTYPE html>
<!-- Pixie Portfolio — General v1.1 — generated for ${esc(c.businessName)} -->
<html lang="${esc(c.htmlLang || 'en')}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#FAF8F4">
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(description)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
${getFavicon(c, '#FAF8F4')}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
${getJsonLd(c)}
<style>${getStyles(opts)}</style>
</head>
<body>
${banner}
<a href="#main" class="skip-link">Skip to content</a>
${currentPath === '/' ? getSideRail(c) : ''}
${getNav(c, currentPath)}
<main id="main"><span id="top"></span>
${body}
</main>
${getFooter(c, { onHome: currentPath === '/' })}
${getScripts()}
</body>
</html>`;
}

// ─── home rendering ─────────────────────────────────────────────────────────
function renderProjectPlaceholder(p, idx) {
  const styles = ['numeric', 'editorial', 'geometric', 'colorfield'];
  const style = styles[idx % 4];
  const num = pad2(idx + 1);
  const tags = normalizeSkillsList(p.tools).slice(0, 3);
  const year = p.year || String(new Date().getFullYear());

  if (style === 'numeric') {
    return `
<div class="placeholder-card placeholder-numeric">
  <div class="placeholder-bg-grid" aria-hidden="true"></div>
  <div class="placeholder-num-bg" aria-hidden="true">${esc(num)}</div>
  <div class="placeholder-title">${esc(p.title)}</div>
  ${tags.length ? `<div class="placeholder-meta">${esc(tags.join(' · '))}</div>` : ''}
</div>`;
  }
  if (style === 'editorial') {
    const quote = p.description || 'Case study coming — get in touch for the deck.';
    return `
<div class="placeholder-card placeholder-editorial">
  <div class="placeholder-frame">
    <div>
      <div class="placeholder-eyebrow">Case Study · ${esc(year)}</div>
      <div class="placeholder-title-italic">${esc(p.title)}</div>
      <div class="placeholder-rule"></div>
    </div>
    <div class="placeholder-quote">"${esc(quote)}"</div>
  </div>
</div>`;
  }
  if (style === 'geometric') {
    return `
<div class="placeholder-card placeholder-geometric">
  <svg class="placeholder-shapes" viewBox="0 0 600 450" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <circle class="shape shape-circle" cx="180" cy="180" r="140" fill="#E8DCC4" opacity="0.6"/>
    <rect   class="shape shape-square" x="280" y="80"  width="180" height="180" stroke="#0A0A0A" stroke-width="2" fill="none"/>
    <rect   class="shape shape-rect"   x="320" y="280" width="140" height="60"  fill="#B8935A" opacity="0.85"/>
    <line   class="shape" x1="60" y1="380" x2="540" y2="380" stroke="#0A0A0A" stroke-width="1"/>
  </svg>
  <div class="placeholder-title-bl">${esc(p.title)}</div>
</div>`;
  }
  const initials = projectInitials(p.title);
  return `
<div class="placeholder-card placeholder-colorfield">
  <span class="placeholder-initials" aria-hidden="true">${esc(initials)}</span>
  <div class="placeholder-title-mid">${esc(p.title)}</div>
  ${tags.length ? `<div class="placeholder-meta-bl">${esc(year)} · ${esc(tags.join(' · '))}</div>` : `<div class="placeholder-meta-bl">${esc(year)}</div>`}
</div>`;
}

function renderProject(p, idx, opts) {
  const num = pad2(idx + 1);
  const tags = normalizeSkillsList(p.tools).slice(0, 4);
  const year = p.year || '';
  const flip = idx % 2 === 1 ? ' flip' : '';

  const cover = p.photoUrl
    ? `<div class="project-cover-img-wrap"><div class="project-cover-img" style="background-image: url('${attr(p.photoUrl)}')" role="img" aria-label="${attr(p.title)}"></div>${year ? `<div class="project-year-stamp">${esc(year)}</div>` : ''}</div>`
    : renderProjectPlaceholder(p, idx);

  const eyebrow = [year ? `${esc(year)}` : null, p.role ? esc(p.role) : null].filter(Boolean).join(' · ');

  // Designer variant: render rich case-study meta grid (Client / Role / Deliverables / Outcome)
  let metaBlock = '';
  if (opts.enrichedCaseStudy) {
    const rows = [];
    if (p.client) rows.push({ lbl: 'Client',       val: p.client });
    if (p.role)   rows.push({ lbl: 'Role',         val: p.role });
    if (tags.length) rows.push({ lbl: 'Deliverables', val: tags.join(', ') });
    if (p.outcome) rows.push({ lbl: 'Outcome',      val: p.outcome });
    if (year)      rows.push({ lbl: 'Year',         val: year });
    if (rows.length >= 2) {
      metaBlock = `<div class="project-meta-grid">${rows.map((r) => `<div class="row"><span class="lbl">${esc(r.lbl)}</span><span class="val">${esc(r.val)}</span></div>`).join('')}</div>`;
    }
  }

  return `
<article class="project${flip}">
  <a class="project-cover-wrap reveal-clip" ${p.link ? `href="${attr(p.link)}" target="_blank" rel="noopener"` : 'href="javascript:void(0)" tabindex="-1"'} data-cursor="view" aria-label="${attr(p.title)}">
    ${cover}
  </a>
  <div class="project-info reveal">
    <div class="project-num" aria-hidden="true">${num}</div>
    ${eyebrow ? `<div class="project-meta-eyebrow">${eyebrow}</div>` : ''}
    <h3 class="project-title">${opts.italicizeProjectTitle ? italicAccent(p.title) : esc(p.title)}</h3>
    ${p.description ? `<p class="project-desc">${esc(p.description)}</p>` : ''}
    ${metaBlock}
    ${tags.length ? `<div class="project-tags">${tags.map((t) => `<span class="project-tag">${esc(t)}</span>`).join('')}</div>` : ''}
    ${p.link ? `<a class="project-link" href="${attr(p.link)}" target="_blank" rel="noopener" data-cursor="link">View ${opts.enrichedCaseStudy ? 'case study' : 'project'} <svg viewBox="0 0 14 10" fill="currentColor"><path d="M8.5 0l4.8 5L8.5 10l-.7-.7L11.4 5.7H0v-1.4h11.4L7.8.7z"/></svg></a>` : ''}
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

function generateHomePage(c, opts) {
  const userProjects = Array.isArray(c.projects) && c.projects.length ? c.projects.slice(0, 6) : null;
  const projects = userProjects || defaultPlaceholderProjects();
  const explicitNoServices = Array.isArray(c.services) && normalizeSkillsList(c.services).length === 0;
  const services = explicitNoServices ? [] : defaultServices(c.industry);
  const skills = normalizeSkillsList(c.services);
  const place = c.contactAddress || (Array.isArray(c.serviceAreas) && c.serviceAreas[0]) || null;
  const role = c.industry || 'Maker';
  const tagline = c.tagline || defaultPovTagline(role);
  const yearsNum = c.yearsExperience || 5;
  const firstName = firstNameOf(c.businessName);
  const initials = initialsOf(c.businessName);
  const aboutPhotoUrl = c.aboutPhotoUrl || (c.heroImage && c.heroImage.url) || null;
  const yearsActive = `${new Date().getFullYear() - yearsNum}`;

  const bioText = c.portfolioAbout || c.aboutText || `${firstName} is a ${role.toLowerCase()}${place ? ` based in ${place}` : ''}. ${tagline}`;
  const paragraphs = bioParagraphs(bioText);

  const marqueeBase = skills.length ? skills.slice(0, 8) : (
    /develop|engineer/.test(role.toLowerCase())     ? ['Frontend', 'Backend', 'Systems', 'Performance', 'Design Systems', 'Architecture'] :
    /photo/.test(role.toLowerCase())                ? ['Editorial', 'Brand', 'Portrait', 'Print', 'Direction'] :
    /writ|copy|content|journ/.test(role.toLowerCase()) ? ['Editorial', 'Brand Voice', 'Long-form', 'Strategy', 'Copy'] :
    /illustrat|paint|artist/.test(role.toLowerCase()) ? ['Illustration', 'Editorial', 'Print', 'Type', 'Murals'] :
    ['Brand Identity', 'Web Design', 'Art Direction', 'Editorial', 'Type']
  );
  const marqueeUnit = marqueeBase.map((s) => `<span class="marquee-word">${esc(s)}</span><span class="marquee-glyph">✻</span>`).join('');
  const marqueeStrip = marqueeUnit + marqueeUnit;

  const expertiseItems = (skills.length ? skills.slice(0, 5) : services.slice(0, 4).map((s) => s.title));
  const availabilityItems = ['Open to projects', place ? 'Remote or on-site' : 'Remote', `${quarterLabel()} onwards`];

  const photoBlock = aboutPhotoUrl
    ? `<figure>
        <img class="about-photo" src="${attr(aboutPhotoUrl)}" alt="${attr(firstName + ' — portrait')}" loading="lazy" width="800" height="1000">
        ${place ? `<figcaption class="about-photo-caption">${esc(place)}</figcaption>` : ''}
      </figure>`
    : `<div class="about-signature">
        <span class="eyebrow">${esc(role)}</span>
        <span class="name-display">${esc(firstName)}</span>
        <span class="signature-mark">— ${esc(initials)}.</span>
        <ul class="about-mini-meta">
          ${place ? `<li><span>Based in</span><span>${esc(place)}</span></li>` : ''}
          <li><span>Available</span><span>${esc(quarterLabel())}</span></li>
          <li><span>Working since</span><span>${esc(yearsActive)}</span></li>
        </ul>
      </div>`;

  const showServices = services.length > 0;
  const showProcess = true;

  const totalSections = 1 + 1 + 1 + (showProcess ? 1 : 0) + (showServices ? 1 : 0) + 1;
  const total = pad2(totalSections);
  let secIdx = 1;
  const indicator = () => `<div class="section-indicator"><span class="section-indicator-current">${pad2(secIdx++)}</span><span>/</span><span>${total}</span></div>`;

  const body = `
<section class="hero" data-rail-label="Hero" id="hero">
  <div class="container">
    <div class="hero-eyebrow"><span class="eyebrow">Portfolio · ${new Date().getFullYear()}</span></div>
    <p class="hero-greeting">${italicFirst("Hi, I'm")}</p>
    <h1 class="hero-name" data-text="${attr(c.businessName)}">${esc(c.businessName)}</h1>
    <p class="hero-role">${esc(role)}${place ? ` <span aria-hidden="true">·</span> ${esc(place)}` : ''}</p>
    <p class="hero-tag">${esc(tagline)}</p>
    <div class="hero-ctas">
      ${c.contactEmail ? `<a class="btn btn-primary" href="mailto:${attr(c.contactEmail)}" data-cursor="email" data-magnetic>Get in touch</a>` : ''}
      <a class="btn btn-secondary" href="#work" data-cursor="link">View work <svg viewBox="0 0 14 10" fill="currentColor"><path d="M8.5 0l4.8 5L8.5 10l-.7-.7L11.4 5.7H0v-1.4h11.4L7.8.7z"/></svg></a>
    </div>
  </div>
  <aside class="hero-right-rail" aria-hidden="true">
    <div class="hero-rail-block"><span class="lbl">Status</span><span class="v">Available · ${esc(quarterLabel())}</span></div>
    ${place ? `<div class="hero-rail-block"><span class="lbl">Location</span><span class="v">${esc(place)}</span></div>` : ''}
    <div class="hero-rail-block"><span class="lbl">Local time</span><span class="v live" id="local-time">—</span></div>
  </aside>
  <div class="hero-scroll" aria-hidden="true"><span>Scroll</span><span class="hero-scroll-line"></span></div>
</section>

<section class="manifesto" data-rail-label="Manifesto">
  <div class="container">
    <p class="manifesto-text"><em>I believe</em> good work is <span class="accent">quiet</span>. It earns attention slowly, and keeps it.</p>
    <div class="manifesto-attribution">— ${esc(firstName)}</div>
  </div>
</section>

<section class="marquee" aria-hidden="true">
  <div class="marquee-track">${marqueeStrip}</div>
</section>

<div class="section-divider" aria-hidden="true"><span class="glyph">✻</span></div>

<section class="work" id="work" data-rail-label="Work">
  <div class="container">
    <div class="work-head">
      ${indicator()}
      <span class="eyebrow reveal">Selected Work · ${pad2(projects.length)} ${projects.length === 1 ? 'project' : 'projects'}</span>
      <h2 class="reveal" style="margin-top: var(--space-3)">${italicAccent('Recent work')}</h2>
    </div>
    <div class="work-list">
      ${projects.map((p, i) => renderProject(p, i, opts)).join('')}
    </div>
  </div>
</section>

<div class="section-divider" aria-hidden="true"><span class="glyph">✻</span></div>

<section class="about" id="about" data-rail-label="${esc(c.labels?.navAbout || 'About')}">
  <div class="container about-grid">
    <div class="about-photo-col reveal">${photoBlock}</div>
    <div class="about-text reveal">
      ${indicator()}
      <span class="eyebrow">${esc(c.labels?.navAbout || 'About')}</span>
      ${aboutPhotoUrl ? `<h2 style="margin-top: var(--space-3)">${italicAccent("Hi, I'm " + firstName)}</h2>` : ''}
      ${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
      <div class="about-mini">
        <div class="col"><span class="eyebrow">${esc(c.labels?.pfExpertise || 'Expertise')}</span><ul>${expertiseItems.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
        <div class="col"><span class="eyebrow">${esc(c.labels?.pfAvailability || 'Availability')}</span><ul>${availabilityItems.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
      </div>
    </div>
  </div>
</section>

${showProcess ? `
<div class="section-divider" aria-hidden="true"><span class="glyph">✻</span></div>

<section class="process" id="process" data-rail-label="Process">
  <div class="container">
    <div class="process-head">
      ${indicator()}
      <span class="eyebrow reveal">${esc(c.labels?.secMethod || 'Method')}</span>
      <h2 class="reveal" style="margin-top: var(--space-3)">${italicAccent(c.labels?.secHowIWork || 'How I work')}</h2>
    </div>
    <ol class="process-list">
      ${processSteps(c).map((s, i) => `
        <li class="reveal">
          <span class="process-num">${pad2(i + 1)}</span>
          <h3>${esc(s.title)}</h3>
          <p>${esc(s.desc)}</p>
        </li>`).join('')}
    </ol>
  </div>
</section>` : ''}

${showServices ? `
<div class="section-divider" aria-hidden="true"><span class="glyph">✻</span></div>

<section class="services" id="services" data-rail-label="${esc(c.labels?.navServices || 'Services')}">
  <div class="container">
    <div class="services-head">
      ${indicator()}
      <span class="eyebrow reveal">${esc(c.labels?.secWhatWeDo || 'What I do')}</span>
      <h2 class="reveal" style="margin-top: var(--space-3)">${italicAccent(c.labels?.navServices || 'Services')}</h2>
    </div>
    <div class="services-list">
      ${services.map((s, i) => `
        <div class="service-row reveal">
          <div class="s-num">${pad2(i + 1)} /</div>
          <div class="s-body">
            <div class="s-row"><h3 class="s-title">${esc(s.title)}</h3><span class="s-arrow" aria-hidden="true">→</span></div>
            <p class="s-desc">${esc(s.desc)}</p>
          </div>
        </div>`).join('')}
    </div>
  </div>
</section>` : ''}

<div class="section-divider" aria-hidden="true"><span class="glyph">✻</span></div>

<section class="contact" id="contact" data-rail-label="Contact">
  <div class="container">
    ${indicator()}
    <span class="eyebrow reveal">Let's work together</span>
    <h2 class="reveal" style="margin-top: var(--space-3)">${italicAccent('Have a project in mind?')}</h2>
    ${c.contactEmail ? `<a class="contact-email reveal" href="mailto:${attr(c.contactEmail)}" data-cursor="email" data-magnetic>${esc(c.contactEmail)}</a>` : ''}
    ${renderSocials(c)}
    <div class="contact-availability reveal"><span class="live-dot" aria-hidden="true"></span><span>Available for new projects · ${esc(quarterLabel())}</span></div>
  </div>
</section>`;

  return wrap(c, '/', body, opts);
}

function generateAboutPage(c, opts) {
  const aboutBody = c.portfolioAbout || c.aboutText || `Working in ${c.industry || 'creative practice'} with a focus on craft, clarity, and shipping things that hold up.`;
  const skills = normalizeSkillsList(c.services);
  const yearsLine = c.yearsExperience ? `${c.yearsExperience}+ years` : '';
  const firstName = firstNameOf(c.businessName);
  const place = c.contactAddress || (Array.isArray(c.serviceAreas) && c.serviceAreas[0]) || null;
  const paragraphs = bioParagraphs(aboutBody);

  const body = `
<section class="page-section">
  <div class="container">
    <span class="eyebrow reveal">${esc(c.labels?.navAbout || 'About')}</span>
    <h1 class="page-h1 reveal">${italicAccent("Hi, I'm " + firstName)}</h1>
    <div class="page-body reveal">
      ${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
      ${c.industry ? `<p>${yearsLine ? `${esc(yearsLine)} working in ${esc(c.industry)} — ` : `Currently focused on ${esc(c.industry)} — `}building work that's clear, honest, and useful.</p>` : ''}
      <p>If you're building something that needs care, <a href="/contact">let's talk</a>.</p>
    </div>
    <div class="detail-grid reveal">
      ${skills.length ? `<div><h4>${esc(c.labels?.pfToolkit || 'Toolkit')}</h4><p>${esc(skills.join(' · '))}</p></div>` : ''}
      ${c.contactEmail ? `<div><h4>${esc(c.labels?.pfReachOut || 'Reach out')}</h4><p><a href="mailto:${attr(c.contactEmail)}">${esc(c.contactEmail)}</a></p></div>` : ''}
      ${place ? `<div><h4>${esc(c.labels?.pfBased || 'Based')}</h4><p>${esc(place)}</p></div>` : ''}
      ${c.instagramHandle ? `<div><h4>Elsewhere</h4><p><a href="https://instagram.com/${attr(c.instagramHandle)}" target="_blank" rel="noopener">@${esc(c.instagramHandle)}</a></p></div>` : ''}
    </div>
  </div>
</section>`;
  return wrap(c, '/about', body, opts);
}

function generateContactPage(c, opts) {
  const body = `
<section class="page-section">
  <div class="container">
    <span class="eyebrow reveal">Say hi</span>
    <h1 class="page-h1 reveal">${italicAccent("Let's talk")}</h1>
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
  var form = document.getElementById('cf'); var status = document.getElementById('cf-status'); var btn = document.getElementById('cf-btn');
  if (!form) return;
  form.addEventListener('submit', function(e){
    e.preventDefault();
    var data = new FormData(form);
    if (!data.get('consent')) { status.textContent = 'Please confirm consent first.'; status.className = 'form-status err'; return; }
    btn.disabled = true; status.textContent = 'Sending…'; status.className = 'form-status';
    fetch('${attr(PUBLIC_API_BASE)}/api/leads/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId: '${attr(c.siteId || '')}', name: data.get('name'), email: data.get('email'), message: data.get('message'), consent: !!data.get('consent') }) })
      .then(function(r){return r.json();})
      .then(function(j){ if (j && j.ok) { status.textContent = "Got it — I'll reply soon."; status.className = 'form-status ok'; form.reset(); } else { status.textContent = 'Send failed — try emailing directly.'; status.className = 'form-status err'; btn.disabled = false; } })
      .catch(function(){ status.textContent = 'Network error — try emailing directly.'; status.className = 'form-status err'; btn.disabled = false; });
  });
})();
</script>`;
  return wrap(c, '/contact', body, opts);
}

function generatePrivacyPage(c, opts) {
  const body = `
<section class="page-section">
  <div class="container">
    <span class="eyebrow">Privacy</span>
    <h1 class="page-h1">Privacy</h1>
    <div class="page-body" style="margin-top: var(--space-5)">${generatePrivacyBody(c)}</div>
  </div>
</section>`;
  return wrap(c, '/privacy', body, opts);
}

function generateThankYouPage(c, opts) {
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
  return wrap(c, '/thank-you', body, opts);
}

function generatePages(config, opts) {
  opts = opts || {};
  return {
    '/index.html':           generateHomePage(config, opts),
    '/about/index.html':     generateAboutPage(config, opts),
    '/contact/index.html':   generateContactPage(config, opts),
    '/thank-you/index.html': generateThankYouPage(config, opts),
    '/privacy/index.html':   generatePrivacyPage(config, opts),
  };
}

module.exports = { generatePages };
