// Pixie Portfolio — Developer Template (v2 — premium engineering aesthetic)
//
// Inspired by Stripe, Linear, Vercel, Raycast docs. Stays restrained — no
// magnetic hover, no cursor-follow glow — but adds dark/light theme toggle,
// terminal hero snippet, project category filter tabs, vertical timeline
// experience, refined type scale + ambient section gradients.
//
// The v1 thesis is preserved: restraint signals competence; devs distrust
// portfolios that look "designed-y." Everything added here is something
// devs use every day (terminals, syntax highlighting, mono metadata), not
// pure decoration.
//
// Signature is unchanged: generatePages(config) — same routes returned, so
// the upstream router (./index.js) and deployer don't need any changes.

const {
  PUBLIC_API_BASE, renderActivationBanner, consentField, generatePrivacyBody,
  esc, attr, pad2, normalizeSkillsList,
  firstNameOf,
  quarterLabel, bioParagraphs,
  getJsonLd, getFavicon,
} = require('./_shared');

// ─── content fallbacks ──────────────────────────────────────────────────────
function defaultPlaceholderProjects() {
  return [
    { title: 'pixie-replay',  description: 'Behavioral regression test runner for an LLM-driven state machine. Replays real chat fixtures against the full pipeline.', role: 'Author', year: '2025', link: '', tools: ['Node', 'Supabase', 'Jest'], photoUrl: null },
    { title: 'auth-nullable', description: 'TypeScript ESLint rule + codemod to surface unsafely-cast nullable user objects across a 200k-LOC monorepo.', role: 'Maintainer', year: '2024', link: '', tools: ['TypeScript', 'ESLint', 'AST'], photoUrl: null },
    { title: 'cloud-router',  description: 'Tiny request-router that picks regional egress per traffic class. Used in a production CDN.', role: 'Contributor', year: '2024', link: '', tools: ['Go', 'gRPC'], photoUrl: null },
  ];
}

function defaultExperience() {
  const yr = new Date().getFullYear();
  return [
    { period: `${yr - 2} — present`,  role: 'Senior Software Engineer', company: 'Independent',   summary: 'Building developer tools and platform infrastructure for early-stage teams. Recent: design systems, observability pipelines, on-prem migrations.' },
    { period: `${yr - 5} — ${yr - 2}`, role: 'Software Engineer',        company: 'Previous role', summary: 'Shipped core product features across the stack — frontend, services, and the deploy pipeline.' },
    { period: `${yr - 7} — ${yr - 5}`, role: 'Engineer (early career)',  company: 'First job',     summary: 'Learned the trade. Wrote a lot of CRUD. Got better.' },
  ];
}

function defaultSkillCategories() {
  return [
    { title: 'Languages',      items: ['TypeScript', 'Python', 'Go', 'SQL'] },
    { title: 'Frameworks',     items: ['Next.js · React', 'Node · Express', 'FastAPI'] },
    { title: 'Infrastructure', items: ['AWS · GCP', 'Docker · Kubernetes', 'Terraform'] },
    { title: 'Databases',      items: ['Postgres · MySQL', 'Redis', 'ClickHouse'] },
  ];
}

// Bucket a flat, user-supplied skills list (from the intake "skills & tools"
// field → c.services) into the same 4 named categories the default set uses,
// so the skills grid reflects the real stack instead of placeholders. Anything
// we can't classify lands in a "Tools" catch-all. Empty categories are dropped.
// Falls back to the defaults when the user gave us nothing.
const SKILL_BUCKETS = [
  { title: 'Languages', re: /^(java\s?script|js|type\s?script|ts|python|py|golang|go|rust|java|c\+\+|c#|c\b|ruby|php|swift|kotlin|scala|sql|html|css|dart|elixir|r|perl|haskell|lua|bash|shell)$/i },
  { title: 'Frameworks', re: /(react|next|vue|nuxt|angular|svelte|solid|node|express|nest|django|flask|fastapi|rails|sinatra|spring|laravel|symfony|\.net|dotnet|tailwind|bootstrap|redux|graphql|apollo|jquery|remix|astro|qwik|flutter|react native)/i },
  { title: 'Infrastructure', re: /(aws|gcp|azure|docker|kubernetes|k8s|terraform|ansible|nginx|apache|jenkins|github actions|gitlab ci|circleci|cloudflare|vercel|netlify|heroku|serverless|lambda|linux|ubuntu|nix|pulumi|helm|istio)/i },
  { title: 'Databases', re: /(postgres|postgresql|mysql|mariadb|mongo|mongodb|redis|sqlite|dynamo|dynamodb|clickhouse|elastic|elasticsearch|cassandra|supabase|firebase|firestore|snowflake|bigquery|neo4j|cockroach|prisma)/i },
];
function categorizeSkills(services) {
  const items = normalizeSkillsList(services).filter(Boolean).slice(0, 24);
  if (!items.length) return defaultSkillCategories();
  const buckets = { Languages: [], Frameworks: [], Infrastructure: [], Databases: [], Tools: [] };
  for (const s of items) {
    const hit = SKILL_BUCKETS.find((b) => b.re.test(String(s).trim()));
    buckets[hit ? hit.title : 'Tools'].push(s);
  }
  const out = ['Languages', 'Frameworks', 'Infrastructure', 'Databases', 'Tools']
    .filter((t) => buckets[t].length)
    .map((t) => ({ title: t, items: buckets[t] }));
  // A single bucket reads as a flat dump — relabel it to a neutral "Stack" so
  // it doesn't look like a mis-categorization.
  if (out.length === 1) out[0].title = 'Stack';
  return out.length ? out : defaultSkillCategories();
}

// ─── project categorization for filter tabs ─────────────────────────────────
// Pixie projects rarely carry an explicit category field; infer from title
// + description + tools so the filter tabs work for tester data and the
// LLM-hallucinated fallbacks both. Categories chosen to match the audience:
// senior eng / recruiter scanning for OSS, infra, AI, tooling work.
function inferCategory(p) {
  if (p && typeof p.category === 'string' && p.category) {
    const c = p.category.toLowerCase();
    if (/(ai|ml|llm)/.test(c)) return 'ai';
    if (/(infra|cloud|devops|platform)/.test(c)) return 'infrastructure';
    if (/(tool|cli|lint|codemod)/.test(c)) return 'tools';
    if (/(oss|open.?source)/.test(c)) return 'oss';
  }
  const tools = normalizeSkillsList(p && p.tools).join(' ').toLowerCase();
  const title = String((p && p.title) || '').toLowerCase();
  const desc  = String((p && p.description) || '').toLowerCase();
  const text  = `${title} ${desc} ${tools}`;
  if (/\b(ai|ml|llm|gpt|claude|openai|embedding|langchain|vector|model|prompt)\b/.test(text)) return 'ai';
  if (/\b(docker|kubernetes|k8s|terraform|aws|gcp|azure|cdn|router|cluster|deploy|infra|grpc|kafka|microservice)\b/.test(text)) return 'infrastructure';
  if (/\b(cli|eslint|codemod|ast|lint|formatter|migration|tooling|sdk|library|plugin)\b/.test(text)) return 'tools';
  return 'oss';
}

const CATEGORY_LABELS = {
  oss:            'Open Source',
  infrastructure: 'Infrastructure',
  ai:             'AI',
  tools:          'Tools',
};

// ─── hero terminal snippet ──────────────────────────────────────────────────
// Builds a small ~/about.ts file from the user's actual profile. Falls back
// gracefully when a field is missing — empty lines are dropped, not blanked.
function buildHeroSnippet(c) {
  const stack = normalizeSkillsList(c.services).slice(0, 4);
  const focus = c.currentFocus || null;
  const role  = c.industry || 'Software Engineer';
  const place = c.contactAddress || (Array.isArray(c.serviceAreas) && c.serviceAreas[0]) || null;
  const q     = quarterLabel();

  const lines = [
    { kw: 'const', vr: 'engineer', op: ' = {' },
    { pad: '  ', pr: 'name',    st: c.businessName },
    { pad: '  ', pr: 'role',    st: role },
  ];
  if (focus) lines.push({ pad: '  ', pr: 'building', st: focus });
  if (stack.length) {
    lines.push({ pad: '  ', pr: 'stack',  arr: stack });
  }
  if (place) lines.push({ pad: '  ', pr: 'location', st: place });
  lines.push({ pad: '  ', pr: 'available', st: q });
  lines.push({ raw: '};' });
  return lines;
}

function renderHeroSnippet(c) {
  const lines = buildHeroSnippet(c);
  return lines.map((line, i) => {
    const ln = pad2(i + 1);
    let body;
    if (line.raw) {
      body = `<span class="ln">${ln}</span><span class="tk">${esc(line.raw)}</span>`;
    } else if (line.kw) {
      body = `<span class="ln">${ln}</span><span class="kw">${esc(line.kw)}</span> <span class="vr">${esc(line.vr)}</span><span class="tk">${esc(line.op)}</span>`;
    } else {
      const pad = line.pad || '';
      if (line.arr) {
        const items = line.arr.map((s) => `<span class="st">'${esc(s)}'</span>`).join('<span class="tk">, </span>');
        body = `<span class="ln">${ln}</span>${pad}<span class="pr">${esc(line.pr)}</span><span class="tk">: [</span>${items}<span class="tk">],</span>`;
      } else {
        body = `<span class="ln">${ln}</span>${pad}<span class="pr">${esc(line.pr)}</span><span class="tk">: </span><span class="st">'${esc(line.st)}'</span><span class="tk">,</span>`;
      }
    }
    // wrap in .term-line so JS can stagger reveal each line ("typing" effect)
    return `<span class="term-line">${body}</span>`;
  }).join('');
}

// ─── styles ─────────────────────────────────────────────────────────────────
function getStyles() {
  return `
:root {
  /* ─ light tokens (default) ─ */
  --bg-primary:    #FAFAF9;
  --bg-surface:    #FFFFFF;
  --bg-elevated:   #F4F4F2;
  --bg-code:       #F1F1EF;

  --ink-primary:   #0A0A0A;
  --ink-secondary: #525252;
  --ink-tertiary:  #8E8E93;
  --ink-inverse:   #FAFAF9;

  --accent:        #4F46E5;
  --accent-hover:  #4338CA;
  --accent-soft:   rgba(99, 102, 241, 0.12);
  --accent-glow:   rgba(99, 102, 241, 0.10);
  --accent-grad:   linear-gradient(135deg, #4F46E5 0%, #7C3AED 50%, #EC4899 100%);
  --accent-2:      #EC4899;
  --accent-3:      #06B6D4;
  --accent-violet: #7C3AED;

  --secondary:     #10B981;
  --secondary-soft: rgba(16, 185, 129, 0.14);

  --line:          rgba(10, 10, 10, 0.08);
  --line-strong:   rgba(10, 10, 10, 0.16);

  --shadow-sm: 0 1px 2px rgba(10, 10, 10, 0.04);
  --shadow-md: 0 4px 12px rgba(10, 10, 10, 0.06), 0 1px 3px rgba(10, 10, 10, 0.04);
  --shadow-lg: 0 18px 40px rgba(10, 10, 10, 0.08), 0 4px 12px rgba(10, 10, 10, 0.04);

  --grid-line: rgba(10, 10, 10, 0.04);

  --space-1: 4px;   --space-2: 8px;    --space-3: 16px;  --space-4: 24px;
  --space-5: 32px;  --space-6: 48px;   --space-7: 64px;  --space-8: 96px;
  --space-9: 128px;

  --ease-out:   cubic-bezier(0.22, 1, 0.36, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --dur-fast:   200ms;
  --dur-base:   400ms;
  --dur-slow:   600ms;

  --font-display: 'Inter', system-ui, -apple-system, sans-serif;
  --font-body:    'Inter', system-ui, -apple-system, sans-serif;
  --font-mono:    'JetBrains Mono', 'SF Mono', Menlo, monospace;
}

[data-theme="dark"] {
  /* ─ dark tokens — deep charcoal, not pure black ─ */
  --bg-primary:    #0B0B0E;
  --bg-surface:    #131318;
  --bg-elevated:   #1A1A20;
  --bg-code:       #15151A;

  --ink-primary:   #F5F5F7;
  --ink-secondary: #A6A6AE;
  --ink-tertiary:  #6E6E76;
  --ink-inverse:   #0A0A0A;

  --accent:        #818CF8;
  --accent-hover:  #A5B4FC;
  --accent-soft:   rgba(129, 140, 248, 0.16);
  --accent-glow:   rgba(129, 140, 248, 0.14);
  --accent-grad:   linear-gradient(135deg, #818CF8 0%, #A78BFA 50%, #F472B6 100%);
  --accent-2:      #F472B6;
  --accent-3:      #22D3EE;
  --accent-violet: #A78BFA;

  --secondary:     #34D399;
  --secondary-soft: rgba(52, 211, 153, 0.14);

  --line:          rgba(245, 245, 247, 0.08);
  --line-strong:   rgba(245, 245, 247, 0.18);

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 18px 40px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.3);

  --grid-line: rgba(245, 245, 247, 0.04);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }

/* ─── custom cursor — small dot + trailing ring ─── */
.cursor-dot,
.cursor-ring {
  position: fixed; top: 0; left: 0;
  pointer-events: none;
  z-index: 9999;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 200ms var(--ease-out);
  will-change: transform;
}
.cursor-on .cursor-dot,
.cursor-on .cursor-ring { opacity: 1; }
.cursor-dot {
  width: 6px; height: 6px;
  background: #FFFFFF;
  mix-blend-mode: difference;
  margin: -3px 0 0 -3px;
}
.cursor-ring {
  width: 36px; height: 36px;
  border: 1.5px solid var(--accent);
  margin: -18px 0 0 -18px;
  background: transparent;
  transition: width 280ms var(--ease-spring), height 280ms var(--ease-spring), margin 280ms var(--ease-spring), border-color 200ms var(--ease-out), background 220ms var(--ease-out), opacity 200ms var(--ease-out);
}
.cursor-ring.is-hovering {
  width: 64px; height: 64px;
  margin: -32px 0 0 -32px;
  background: var(--accent-soft);
  border-color: var(--accent-violet);
}
.cursor-ring.is-down {
  width: 28px; height: 28px;
  margin: -14px 0 0 -14px;
  background: var(--accent-soft);
}
.cursor-ring.is-hidden { opacity: 0 !important; }
/* Hide native cursor only when custom cursor is active. Inputs still get
   the text caret since selecting text needs the system cursor visible. */
.cursor-on, .cursor-on * { cursor: none !important; }
.cursor-on input,
.cursor-on textarea,
.cursor-on [contenteditable="true"] { cursor: text !important; }
@media (hover: none), (pointer: coarse) {
  .cursor-dot, .cursor-ring { display: none !important; }
  .cursor-on, .cursor-on * { cursor: auto !important; }
}

/* ─── scroll progress bar (visible scroll-tied animation) ─── */
.scroll-progress {
  position: fixed; top: 0; left: 0;
  height: 2px;
  width: 0%;
  background: linear-gradient(90deg, var(--accent) 0%, var(--accent-violet) 35%, var(--accent-2) 70%, var(--accent-3) 100%);
  z-index: 200;
  pointer-events: none;
  box-shadow: 0 0 10px var(--accent-glow);
  transition: width 80ms linear;
}

/* ─── subtle film grain — always alive, very low opacity ─── */
body::after {
  content: '';
  position: fixed;
  inset: -50%;
  pointer-events: none;
  z-index: 150;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.92' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E");
  opacity: 0.045;
  mix-blend-mode: overlay;
  animation: grainShift 8s steps(8) infinite;
}
[data-theme="dark"] body::after { opacity: 0.08; mix-blend-mode: screen; }
@keyframes grainShift {
  0%   { transform: translate(0, 0); }
  10%  { transform: translate(-3%, -2%); }
  20%  { transform: translate(2%, 3%); }
  30%  { transform: translate(-2%, 2%); }
  40%  { transform: translate(3%, -3%); }
  50%  { transform: translate(-3%, 1%); }
  60%  { transform: translate(2%, -2%); }
  70%  { transform: translate(-2%, 3%); }
  80%  { transform: translate(3%, 2%); }
  90%  { transform: translate(-1%, -3%); }
  100% { transform: translate(0, 0); }
}

/* ─── marquee tech ribbon — "billboard" strip, dark in both themes ─── */
.marquee-strip {
  position: relative;
  overflow: hidden;
  padding: clamp(28px, 4vw, 44px) 0;
  background: #08080C;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.20), 0 -8px 32px rgba(0, 0, 0, 0.10);
}
/* glowing accent edge lines at top + bottom of the strip */
.marquee-strip::before,
.marquee-strip::after {
  content: '';
  position: absolute; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, var(--accent) 25%, var(--accent-violet) 50%, var(--accent-2) 75%, transparent 100%);
  box-shadow: 0 0 12px var(--accent), 0 0 4px var(--accent-violet);
  opacity: 0.85;
  pointer-events: none;
}
.marquee-strip::before { top: 0; }
.marquee-strip::after  { bottom: 0; }
/* moving sheen across the whole strip */
.marquee-strip > .marquee-sheen {
  position: absolute; inset: 0;
  background: linear-gradient(100deg, transparent 35%, rgba(129, 140, 248, 0.12) 50%, transparent 65%);
  background-size: 250% 100%;
  background-repeat: no-repeat;
  background-position: 200% 0;
  animation: stripSheen 6s linear infinite;
  pointer-events: none;
  z-index: 1;
}
@keyframes stripSheen {
  0%   { background-position: 200% 0; }
  100% { background-position: -100% 0; }
}
.marquee-strip > .marquee-track-wrap {
  position: relative;
  z-index: 2;
  mask-image: linear-gradient(90deg, transparent, black 7%, black 93%, transparent);
  -webkit-mask-image: linear-gradient(90deg, transparent, black 7%, black 93%, transparent);
  overflow: hidden;
}
.marquee-track {
  display: flex;
  width: max-content;
  animation: marquee 32s linear infinite;
  will-change: transform;
}
.marquee-strip:hover .marquee-track { animation-play-state: paused; }
.marquee-list {
  display: inline-flex;
  align-items: center;
  gap: var(--space-6);
  padding-right: var(--space-6);
  font-family: var(--font-mono);
  font-size: clamp(22px, 2.6vw, 32px);
  font-weight: 500;
  color: #F5F5F7;
  letter-spacing: -0.01em;
}
.marquee-item {
  white-space: nowrap;
  text-shadow:
    0 0 24px rgba(129, 140, 248, 0.35),
    0 0 4px rgba(129, 140, 248, 0.20);
  transition: color var(--dur-fast) var(--ease-out), text-shadow var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-spring);
}
.marquee-item:hover {
  color: #F472B6;
  text-shadow:
    0 0 32px rgba(244, 114, 182, 0.65),
    0 0 12px rgba(244, 114, 182, 0.45);
  transform: scale(1.06);
}
.marquee-dot {
  display: inline-block;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--accent-grad);
  flex-shrink: 0;
  box-shadow: 0 0 14px rgba(129, 140, 248, 0.65), 0 0 4px rgba(167, 139, 250, 0.45);
  animation: dotPulse 2.4s ease-in-out infinite;
}
.marquee-list .marquee-dot:nth-child(4n+2) { animation-delay: -0.6s; }
.marquee-list .marquee-dot:nth-child(4n+3) { animation-delay: -1.2s; }
.marquee-list .marquee-dot:nth-child(4n+4) { animation-delay: -1.8s; }
@keyframes dotPulse {
  0%, 100% {
    box-shadow: 0 0 8px rgba(129, 140, 248, 0.50), 0 0 2px rgba(167, 139, 250, 0.35);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 20px rgba(244, 114, 182, 0.75), 0 0 6px rgba(129, 140, 248, 0.60);
    transform: scale(1.15);
  }
}
@keyframes marquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
body {
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.7;
  color: var(--ink-primary);
  background: var(--bg-primary);
  font-weight: 400;
  overflow-x: hidden;
  transition: background-color var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out);
}
::selection { background: var(--accent-soft); color: var(--ink-primary); }
a { color: inherit; text-decoration: none; transition: color var(--dur-fast) var(--ease-out); }
img { max-width: 100%; display: block; }
button { font: inherit; cursor: pointer; border: 0; background: transparent; color: inherit; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 4px; }

h1, h2, h3, h4 {
  font-family: var(--font-display);
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.025em;
  color: var(--ink-primary);
}

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
  max-width: 1120px; margin: 0 auto;
  padding: 0 var(--space-6);
}
@media (max-width: 767px) { .container { padding: 0 var(--space-4); } }

.section-eyebrow {
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 500;
  color: var(--accent);
  letter-spacing: 0;
  text-transform: lowercase;
  margin-bottom: var(--space-3);
  display: inline-flex; align-items: center; gap: 8px;
}
.section-eyebrow::before {
  content: ''; display: inline-block;
  width: 22px; height: 1px;
  background: var(--accent);
  opacity: 0.6;
  transform-origin: left center;
  transform: scaleX(0);
  transition: transform 600ms var(--ease-out) 150ms;
}
.reveal.in .section-eyebrow::before,
.hero-copy .section-eyebrow::before { transform: scaleX(1); }

section { padding: var(--space-8) 0; position: relative; }
@media (max-width: 767px) { section { padding: var(--space-7) 0; } }

/* ─── nav ─────────────────────────────────────────────────────────────── */
.nav {
  position: sticky; top: 0; z-index: 50;
  background: color-mix(in srgb, var(--bg-primary) 85%, transparent);
  backdrop-filter: saturate(180%) blur(14px); -webkit-backdrop-filter: saturate(180%) blur(14px);
  border-bottom: 1px solid transparent;
  transition: border-bottom-color var(--dur-base) var(--ease-out), background var(--dur-base) var(--ease-out);
}
.nav.scrolled { border-bottom-color: var(--line); }
.nav-inner {
  max-width: 1120px; margin: 0 auto;
  padding: 16px var(--space-6);
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-4);
}
@media (max-width: 767px) { .nav-inner { padding: 12px var(--space-4); } }

.nav-mark {
  font-family: var(--font-mono);
  font-size: 14px; font-weight: 500;
  color: var(--ink-primary);
  display: inline-flex; align-items: baseline;
}
.nav-mark::before { content: '/'; color: var(--accent); margin-right: 4px; }
.nav-links { display: flex; align-items: center; gap: var(--space-5); font-size: 14px; font-weight: 500; }
.nav-links a {
  color: var(--ink-secondary);
  position: relative;
  padding: 4px 0;
}
.nav-links a::after {
  content: '';
  position: absolute; left: 0; right: 0; bottom: 0;
  height: 1px; background: var(--accent);
  transform-origin: left center;
  transform: scaleX(0);
  transition: transform var(--dur-base) var(--ease-out);
}
.nav-links a:hover, .nav-links a.active { color: var(--ink-primary); }
.nav-links a:hover::after, .nav-links a.active::after { transform: scaleX(1); }
.nav-links a.cta {
  font-family: var(--font-mono);
  color: var(--accent);
}
.nav-links a.cta:hover { color: var(--accent-hover); }
.nav-links a.cta::after { background: var(--accent-hover); }

.nav-tools { display: inline-flex; align-items: center; gap: 10px; }

.theme-toggle {
  width: 36px; height: 36px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink-secondary);
  background: transparent;
  transition: color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-spring);
}
.theme-toggle:hover { color: var(--ink-primary); border-color: var(--line-strong); background: var(--bg-elevated); }
.theme-toggle:hover svg { transform: rotate(-18deg); }
.theme-toggle:active { transform: scale(0.94); }
.theme-toggle.flip svg { animation: themeFlip 500ms var(--ease-spring); }
.theme-toggle svg { width: 16px; height: 16px; transition: transform 400ms var(--ease-spring); }
@keyframes themeFlip { 0% { transform: rotate(0); } 100% { transform: rotate(180deg); } }
.theme-icon-moon { display: none; }
[data-theme="dark"] .theme-icon-sun { display: none; }
[data-theme="dark"] .theme-icon-moon { display: inline-block; }

.nav-burger {
  display: none;
  width: 36px; height: 36px;
  align-items: center; justify-content: center;
  flex-direction: column; gap: 4px;
  border: 1px solid var(--line);
  border-radius: 8px;
  transition: border-color var(--dur-fast) var(--ease-out);
}
.nav-burger:hover { border-color: var(--line-strong); }
.nav-burger span { display: block; width: 16px; height: 1.5px; background: var(--ink-primary); }
@media (max-width: 767px) { .nav-links { display: none; } .nav-burger { display: inline-flex; } }

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
.nav-overlay-close { font-family: var(--font-mono); font-size: 14px; padding: 8px 12px; min-height: 44px; display: inline-flex; align-items: center; }
.nav-overlay-links { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: var(--space-4); }
.nav-overlay-links a {
  font-family: var(--font-display);
  font-size: 28px; font-weight: 600;
  letter-spacing: -0.02em;
  padding: 12px 0;
}

/* ─── hero ────────────────────────────────────────────────────────────── */
.hero {
  position: relative;
  padding-top: var(--space-9);
  padding-bottom: var(--space-9);
  overflow: hidden;
}
.hero::after {
  /* very-subtle dot/grid texture */
  content: '';
  position: absolute; inset: 0;
  background-image:
    linear-gradient(to right, var(--grid-line) 1px, transparent 1px),
    linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: linear-gradient(to bottom, black 0%, transparent 85%);
  -webkit-mask-image: linear-gradient(to bottom, black 0%, transparent 85%);
  pointer-events: none;
  z-index: 0;
}
.hero > .container { position: relative; z-index: 2; }

/* ─── drifting gradient orbs (replaces static gradient backdrop) ─── */
.hero-orbs {
  position: absolute; inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}
.hero-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(72px);
  will-change: transform;
}
.hero-orb--indigo {
  width: 600px; height: 600px;
  background: radial-gradient(circle, var(--accent) 0%, transparent 65%);
  top: -200px; left: -180px;
  opacity: 0.70;
  animation: orb1 18s ease-in-out infinite;
}
.hero-orb--violet {
  width: 500px; height: 500px;
  background: radial-gradient(circle, var(--accent-violet) 0%, transparent 65%);
  top: -100px; right: -160px;
  opacity: 0.62;
  animation: orb2 22s ease-in-out infinite;
}
.hero-orb--pink {
  width: 420px; height: 420px;
  background: radial-gradient(circle, var(--accent-2) 0%, transparent 65%);
  bottom: -180px; left: 40%;
  opacity: 0.50;
  animation: orb3 26s ease-in-out infinite;
}
.hero-orb--cyan {
  width: 360px; height: 360px;
  background: radial-gradient(circle, var(--accent-3) 0%, transparent 65%);
  top: 35%; left: -80px;
  opacity: 0.44;
  animation: orb4 32s ease-in-out infinite;
}
[data-theme="dark"] .hero-orb--indigo { opacity: 0.55; }
[data-theme="dark"] .hero-orb--violet { opacity: 0.50; }
[data-theme="dark"] .hero-orb--pink   { opacity: 0.42; }
[data-theme="dark"] .hero-orb--cyan   { opacity: 0.38; }
@keyframes orb1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%      { transform: translate(140px, 100px) scale(1.15); }
  66%      { transform: translate(-80px, 160px) scale(0.92); }
}
@keyframes orb2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50%      { transform: translate(-160px, 120px) scale(1.20); }
}
@keyframes orb3 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50%      { transform: translate(100px, -140px) scale(1.10); }
}
@keyframes orb4 {
  0%, 100% { transform: translate(0, 0); }
  50%      { transform: translate(180px, 60px); }
}

.hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  gap: var(--space-7);
  align-items: center;
}
@media (max-width: 1023px) { .hero-grid { grid-template-columns: 1fr; gap: var(--space-6); } }

.status-pill {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  padding: 6px 12px 6px 10px;
  border-radius: 999px;
  background: var(--secondary-soft);
  color: var(--ink-primary);
  border: 1px solid color-mix(in srgb, var(--secondary) 30%, transparent);
  margin-bottom: var(--space-4);
}
.status-pill .live-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--secondary);
  box-shadow: 0 0 0 3px var(--secondary-soft);
  animation: livePulse 2.4s var(--ease-out) infinite;
}
@keyframes livePulse {
  0%   { box-shadow: 0 0 0 0 var(--secondary-soft); }
  70%  { box-shadow: 0 0 0 8px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

.hero-eyebrow {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--accent);
  margin-bottom: var(--space-2);
  letter-spacing: 0;
}
.hero-name {
  font-family: var(--font-display);
  font-size: clamp(44px, 7vw, 84px);
  font-weight: 600;
  line-height: 1.02;
  letter-spacing: -0.035em;
  color: var(--ink-primary);
  margin-bottom: var(--space-4);
}
.hero-name .hero-name-accent {
  background-image: linear-gradient(90deg, #4F46E5 0%, #7C3AED 20%, #EC4899 40%, #06B6D4 60%, #7C3AED 80%, #4F46E5 100%);
  background-size: 300% 100%;
  background-position: 0% 50%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: nameGradient 5.5s ease-in-out infinite;
}
[data-theme="dark"] .hero-name .hero-name-accent {
  background-image: linear-gradient(90deg, #818CF8 0%, #A78BFA 20%, #F472B6 40%, #22D3EE 60%, #A78BFA 80%, #818CF8 100%);
}
@keyframes nameGradient {
  0%, 100% { background-position: 0% 50%; }
  50%      { background-position: 100% 50%; }
}
.hero-bio {
  font-size: clamp(17px, 1.7vw, 21px);
  line-height: 1.55;
  color: var(--ink-primary);
  max-width: 56ch;
  margin-bottom: var(--space-3);
}
.hero-bio-secondary {
  font-size: clamp(15px, 1.4vw, 17px);
  line-height: 1.6;
  color: var(--ink-secondary);
  max-width: 56ch;
  margin-bottom: var(--space-5);
}
.hero-meta {
  display: flex; flex-wrap: wrap; gap: var(--space-5);
  margin-bottom: var(--space-5);
  padding: var(--space-4) 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.hero-meta-item { display: flex; flex-direction: column; gap: 4px; }
.hero-meta-label {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--ink-tertiary);
  letter-spacing: 0;
}
.hero-meta-value {
  font-family: var(--font-body);
  font-size: 14.5px; font-weight: 500;
  color: var(--ink-primary);
}

.hero-cta { display: flex; gap: var(--space-3); flex-wrap: wrap; align-items: center; }
.btn {
  position: relative;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 22px;
  font-family: var(--font-body);
  font-size: 14px; font-weight: 500;
  border-radius: 8px;
  min-height: 42px;
  transform: translateY(0);
  transition: background-color var(--dur-base) var(--ease-out), background-position 700ms var(--ease-out), border-color var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out), transform 220ms var(--ease-spring), box-shadow var(--dur-base) var(--ease-out);
}
.btn:hover  { transform: translateY(-3px) scale(1.02); }
.btn:active { transform: translateY(1px) scale(0.99); transition-duration: 80ms; }

.btn-primary {
  background-color: var(--ink-primary);
  /* sheen lives in bg-image so it sits between bg-color and content
     without any z-index gymnastics. Bg-size 220% means the sheen sweeps
     from off-right (pos 100%) to off-left (pos -100%) on hover. */
  background-image: linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.40) 50%, transparent 70%);
  background-size: 220% 100%;
  background-position: 100% 0;
  background-repeat: no-repeat;
  color: var(--bg-primary);
  font-family: var(--font-mono);
  box-shadow: 0 1px 0 rgba(255,255,255,0.10) inset, var(--shadow-md);
}
.btn-primary:hover {
  background-color: var(--accent);
  background-position: -100% 0;
  color: #fff;
  box-shadow: 0 0 0 1px var(--accent), 0 18px 48px var(--accent-glow), 0 8px 18px rgba(59, 130, 246, 0.30);
}

.btn-secondary {
  background: var(--bg-surface);
  color: var(--ink-primary);
  border: 1px solid var(--line-strong);
}
.btn-secondary:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
  box-shadow: 0 0 0 1px var(--accent-soft), 0 14px 32px var(--accent-glow);
}

@media (max-width: 767px) {
  .hero { padding-top: var(--space-7); padding-bottom: var(--space-7); }
  .hero-meta { flex-direction: column; gap: var(--space-3); }
  .hero-cta { width: 100%; }
  .hero-cta .btn { width: 100%; justify-content: center; }
}

/* ─── terminal snippet ────────────────────────────────────────────────── */
.hero-terminal {
  position: relative;
  background: #0F0F11;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: var(--shadow-lg), 0 0 0 1px rgba(255, 255, 255, 0.02) inset;
  transform: perspective(1400px) rotateY(-1.5deg) rotateX(2deg);
  transition: transform var(--dur-slow) var(--ease-out);
}
.hero-terminal:hover { transform: perspective(1400px) rotateY(0) rotateX(0); }
.hero-terminal::before {
  /* subtle inner glow ring on the dark surface */
  content: '';
  position: absolute; inset: 0; border-radius: 12px;
  background: radial-gradient(ellipse 60% 40% at 50% 0%, rgba(96, 165, 250, 0.10), transparent 70%);
  pointer-events: none;
}
.terminal-header {
  display: flex; align-items: center;
  padding: 11px 14px;
  background: rgba(255, 255, 255, 0.025);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  position: relative;
}
.terminal-controls { display: inline-flex; gap: 7px; }
.terminal-control { width: 11px; height: 11px; border-radius: 50%; background: #525252; display: block; }
.terminal-control--close { background: #FF5F57; }
.terminal-control--min   { background: #FFBD2E; }
.terminal-control--max   { background: #28C840; }
.terminal-title {
  font-family: var(--font-mono);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  position: absolute; left: 50%; transform: translateX(-50%);
  letter-spacing: 0;
}
.terminal-body {
  margin: 0;
  padding: 22px 24px 26px;
  font-family: var(--font-mono);
  font-size: 13.5px;
  line-height: 1.85;
  color: #E5E5E7;
  overflow-x: auto;
  white-space: pre;
  position: relative;
}
.terminal-body .term-line {
  display: block;
  white-space: pre;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 300ms var(--ease-out), transform 300ms var(--ease-out);
}
.terminal-body .term-line.typed { opacity: 1; transform: translateY(0); }
.terminal-body .ln { color: rgba(255, 255, 255, 0.22); margin-right: 18px; user-select: none; display: inline-block; min-width: 1.5ch; text-align: right; }
.terminal-body .kw { color: #C792EA; }
.terminal-body .vr { color: #FFCB6B; }
.terminal-body .pr { color: #82AAFF; }
.terminal-body .st { color: #C3E88D; }
.terminal-body .nm { color: #F78C6C; }
.terminal-body .cm { color: #546E7A; font-style: italic; }
.terminal-body .tk { color: #B6B6BC; }
.terminal-cursor {
  display: inline-block;
  width: 7px; height: 1.05em;
  vertical-align: text-bottom;
  background: var(--accent);
  margin-left: 4px;
  animation: termBlink 1.05s steps(2) infinite;
}
@keyframes termBlink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }

/* ─── stats strip ─────────────────────────────────────────────────────── */
.stats { padding: var(--space-6) 0 var(--space-7); }
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-5);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  padding: var(--space-6) 0;
}
@media (max-width: 767px) { .stats-grid { grid-template-columns: 1fr; gap: var(--space-4); padding: var(--space-5) 0; } }
.stat-item {
  text-align: center;
  padding: var(--space-4) var(--space-3);
  border-radius: 12px;
  position: relative;
  transition: transform 400ms var(--ease-spring), background 400ms var(--ease-out), box-shadow 400ms var(--ease-out);
  cursor: default;
}
.stat-item:hover {
  transform: translateY(-6px);
  background: var(--bg-surface);
  box-shadow: 0 12px 32px var(--accent-glow), 0 4px 12px rgba(0, 0, 0, 0.04);
}
[data-theme="dark"] .stat-item:hover {
  box-shadow: 0 12px 32px var(--accent-glow), 0 4px 12px rgba(0, 0, 0, 0.35);
}
.stat-num {
  font-family: var(--font-display);
  font-size: clamp(44px, 7vw, 80px);
  font-weight: 600;
  letter-spacing: -0.035em;
  line-height: 1;
  background-image: linear-gradient(135deg, #4F46E5 0%, #7C3AED 35%, #EC4899 70%, #06B6D4 100%);
  background-size: 200% 100%;
  background-position: 0% 50%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-feature-settings: "tnum" 1, "lnum" 1;
  margin-bottom: var(--space-2);
  display: inline-block;
  animation: statGradient 8s ease-in-out infinite;
  transition: transform 400ms var(--ease-spring);
}
.stat-item:hover .stat-num { transform: scale(1.06); }
[data-theme="dark"] .stat-num {
  background-image: linear-gradient(135deg, #818CF8 0%, #A78BFA 35%, #F472B6 70%, #22D3EE 100%);
}
@keyframes statGradient {
  0%, 100% { background-position: 0% 50%; }
  50%      { background-position: 100% 50%; }
}
.stat-suffix {
  font-size: 0.65em;
  background: inherit;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  margin-left: 2px;
}
.stat-label {
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--ink-tertiary);
  letter-spacing: 0;
  text-transform: lowercase;
}

/* ─── section heads ───────────────────────────────────────────────────── */
.section-head { margin-bottom: var(--space-6); display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }
.section-head h2 {
  font-size: clamp(32px, 4.5vw, 56px);
  letter-spacing: -0.035em;
  background-image: linear-gradient(95deg, var(--ink-primary) 0%, var(--ink-primary) 45%, var(--accent) 65%, var(--accent-violet) 80%, var(--accent-2) 100%);
  background-size: 200% 100%;
  background-position: 0% 50%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: h2Gradient 10s ease-in-out infinite;
}
@keyframes h2Gradient {
  0%, 100% { background-position: 0% 50%; }
  50%      { background-position: 100% 50%; }
}
.section-head-meta { font-family: var(--font-mono); font-size: 12.5px; color: var(--ink-tertiary); letter-spacing: 0; }

/* ─── projects ────────────────────────────────────────────────────────── */
.filter-tabs {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin-bottom: var(--space-5);
  padding: 5px;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: 10px;
  width: fit-content;
}
.filter-tab {
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 500;
  color: var(--ink-secondary);
  padding: 7px 14px;
  border-radius: 7px;
  transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
  letter-spacing: 0;
}
.filter-tab:hover { color: var(--ink-primary); }
.filter-tab.is-active {
  color: #FFFFFF;
  background-image: var(--accent-grad);
  box-shadow: 0 4px 16px var(--accent-glow), 0 1px 0 rgba(255, 255, 255, 0.12) inset;
  animation: filterPop 320ms var(--ease-spring);
}
@keyframes filterPop {
  0%   { transform: scale(0.92); }
  60%  { transform: scale(1.04); }
  100% { transform: scale(1); }
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
}
@media (max-width: 767px) { .projects-grid { grid-template-columns: 1fr; } }

.project-card {
  position: relative;
  padding: var(--space-5);
  background: var(--bg-surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  transition: transform var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out), background var(--dur-base) var(--ease-out);
  display: flex; flex-direction: column;
  min-height: 240px;
  overflow: hidden;
  isolation: isolate;
}
/* Shimmer sweep on hover — sits ABOVE bg but below content */
.project-card::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(135deg, transparent 35%, rgba(124, 58, 237, 0.10) 50%, transparent 65%);
  background-size: 250% 250%;
  background-position: 200% 200%;
  pointer-events: none;
  opacity: 0;
  z-index: 0;
  transition: opacity 200ms var(--ease-out), background-position 1100ms var(--ease-out);
}
.project-card:hover::after {
  opacity: 1;
  background-position: -100% -100%;
}
[data-theme="dark"] .project-card::after {
  background: linear-gradient(135deg, transparent 35%, rgba(244, 114, 182, 0.12) 50%, transparent 65%);
}
.project-card > * { position: relative; z-index: 1; }

/* Cursor-tracked spotlight — soft violet radial gradient that follows the
   mouse position while hovering. --mx/--my are set by JS on mousemove.
   This is the Linear/Vercel-card "premium polish" trick. */
.card-spotlight {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: radial-gradient(
    520px circle at var(--mx, 50%) var(--my, 50%),
    rgba(124, 58, 237, 0.22) 0%,
    rgba(99, 102, 241, 0.10) 22%,
    transparent 55%
  );
  opacity: 0;
  z-index: 0;
  transition: opacity 250ms var(--ease-out);
}
.project-card:hover .card-spotlight { opacity: 1; }
[data-theme="dark"] .card-spotlight {
  background: radial-gradient(
    520px circle at var(--mx, 50%) var(--my, 50%),
    rgba(167, 139, 250, 0.28) 0%,
    rgba(129, 140, 248, 0.14) 22%,
    transparent 55%
  );
}

/* Tech badges nudge up in sequence when the card is hovered */
.project-card .tech-badge { transition-property: border-color, color, background, transform, box-shadow; }
.project-card:hover .project-tech .tech-badge { transform: translateY(-3px); }
.project-card:hover .project-tech .tech-badge:nth-child(1) { transition-delay: 0ms; }
.project-card:hover .project-tech .tech-badge:nth-child(2) { transition-delay: 40ms; }
.project-card:hover .project-tech .tech-badge:nth-child(3) { transition-delay: 80ms; }
.project-card:hover .project-tech .tech-badge:nth-child(4) { transition-delay: 120ms; }
.project-card:hover .project-tech .tech-badge:nth-child(5) { transition-delay: 160ms; }
.project-card:hover .project-tech .tech-badge:nth-child(6) { transition-delay: 200ms; }

/* Description softens on hover so the metadata and links pop more */
.project-card .project-description { transition: color var(--dur-base) var(--ease-out), opacity var(--dur-base) var(--ease-out); }
.project-card:hover .project-description { opacity: 0.78; }

/* Arrow span inside project links — nudges diagonally on hover */
.project-links a { display: inline-flex; align-items: center; gap: 4px; }
.project-links a .arrow { display: inline-block; transition: transform 300ms var(--ease-spring); }
.project-card:hover .project-links a .arrow { transform: translate(2px, -2px); }
.project-links a:hover .arrow { transform: translate(5px, -5px); }
.project-card:hover .project-links a { color: var(--accent-violet); }
.project-card::before {
  /* gradient border bloom on hover */
  content: '';
  position: absolute; inset: -1px;
  border-radius: 13px;
  padding: 1px;
  background: var(--accent-grad);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  opacity: 0;
  transition: opacity var(--dur-base) var(--ease-out);
  pointer-events: none;
}
.projects-grid { perspective: 1400px; }
.project-card:hover {
  transform: translateY(-14px) scale(1.022) rotateX(4deg) rotateY(-3deg);
  box-shadow:
    0 40px 80px rgba(10, 10, 10, 0.18),
    0 16px 32px rgba(10, 10, 10, 0.10),
    0 0 0 1px rgba(124, 58, 237, 0.10),
    0 0 60px var(--accent-glow);
  border-color: transparent;
}
[data-theme="dark"] .project-card:hover {
  box-shadow:
    0 40px 80px rgba(0, 0, 0, 0.65),
    0 16px 32px rgba(0, 0, 0, 0.40),
    0 0 0 1px rgba(167, 139, 250, 0.20),
    0 0 80px var(--accent-glow);
}
.project-card:hover::before { opacity: 1; }

.project-card-header {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
  flex-wrap: wrap;
}
.project-num {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-tertiary);
  letter-spacing: 0;
}
.project-title {
  font-family: var(--font-display);
  font-size: clamp(19px, 1.8vw, 24px);
  font-weight: 600;
  letter-spacing: -0.02em;
  flex: 1;
  margin-top: 4px;
}
.project-category-tag {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-tertiary);
  letter-spacing: 0;
  padding: 3px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--bg-elevated);
}
.project-description {
  font-size: 14.5px;
  line-height: 1.65;
  color: var(--ink-secondary);
  margin-bottom: var(--space-4);
  max-width: 50ch;
  flex: 1;
}
.project-tech {
  display: flex; flex-wrap: wrap;
  gap: 6px;
  margin-bottom: var(--space-4);
}
.tech-badge {
  font-family: var(--font-mono);
  font-size: 11.5px; font-weight: 500;
  padding: 4px 9px;
  border-radius: 5px;
  background: var(--bg-code);
  color: var(--ink-primary);
  border: 1px solid var(--line);
  transform: translateY(0);
  transition: border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), transform 220ms var(--ease-spring), box-shadow var(--dur-fast) var(--ease-out);
}
.tech-badge:hover {
  border-color: var(--accent); color: var(--accent); background: var(--accent-soft);
  transform: translateY(-1.5px) scale(1.04);
  box-shadow: 0 4px 12px var(--accent-glow);
}
.project-footer {
  display: flex; justify-content: space-between; align-items: center;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--line);
  flex-wrap: wrap;
}
.project-meta-row {
  display: flex; gap: var(--space-3);
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--ink-tertiary);
  letter-spacing: 0;
}
.project-meta-row .sep { opacity: 0.6; }
.project-links { display: flex; gap: var(--space-3); }
.project-links a {
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--accent);
  position: relative;
  padding-bottom: 1px;
}
.project-links a::after {
  content: '';
  position: absolute; left: 0; right: 0; bottom: -1px;
  height: 1px; background: currentColor;
  transform: scaleX(0); transform-origin: left;
  transition: transform var(--dur-fast) var(--ease-out);
}
.project-links a:hover { color: var(--accent-hover); }
.project-links a:hover::after { transform: scaleX(1); }

/* ─── github ──────────────────────────────────────────────────────────── */
.github-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-6);
  padding: var(--space-5) 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
@media (max-width: 640px) { .github-stats { grid-template-columns: 1fr; } }
.github-stat .stat-number {
  font-family: var(--font-display);
  font-size: clamp(32px, 4vw, 48px);
  font-weight: 600;
  letter-spacing: -0.025em;
  font-feature-settings: "lnum" 1, "tnum" 1;
}
.github-stat .stat-label {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-tertiary);
  letter-spacing: 0;
  margin-top: 4px;
}

.pinned-repos {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}
@media (max-width: 640px) { .pinned-repos { grid-template-columns: 1fr; } }
.repo-card {
  padding: var(--space-4);
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-surface);
  position: relative;
  isolation: isolate;
  transition: border-color var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out);
}
/* gradient border bloom on hover (same pattern as project card) */
.repo-card::before {
  content: '';
  position: absolute; inset: 0;
  border-radius: 10px;
  padding: 1px;
  background: var(--accent-grad);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  opacity: 0;
  transition: opacity var(--dur-base) var(--ease-out);
  pointer-events: none;
}
.repo-card:hover {
  border-color: transparent;
  transform: translateY(-6px) scale(1.012);
  box-shadow: 0 24px 48px var(--accent-glow), 0 8px 16px rgba(0, 0, 0, 0.08);
}
.repo-card:hover::before { opacity: 0.95; }
.repo-card .lang-dot {
  display: inline-block;
  font-size: 14px;
  vertical-align: -1px;
  animation: langDotPulse 2.8s ease-in-out infinite;
  transition: transform var(--dur-fast) var(--ease-spring);
}
.repo-card:hover .lang-dot { transform: scale(1.4); }
@keyframes langDotPulse {
  0%, 100% { opacity: 1;   transform: scale(1); }
  50%      { opacity: 0.7; transform: scale(1.2); }
}
.repo-meta span { transition: color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-spring); }
.repo-card:hover .repo-meta span:first-child { color: var(--accent-2); transform: translateY(-1px); }
.repo-card:hover .repo-meta span:nth-child(2) { color: var(--accent); }
.repo-card:hover .repo-name { color: var(--accent-violet); }
.repo-card header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-2); }
.repo-name {
  font-family: var(--font-mono);
  font-size: 14.5px; font-weight: 500;
  color: var(--accent);
}
.repo-language {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--ink-tertiary);
  letter-spacing: 0;
}
.repo-language .lang-dot { margin-right: 4px; }
.repo-description {
  font-size: 13.5px;
  color: var(--ink-secondary);
  line-height: 1.6;
  margin-bottom: var(--space-3);
  max-width: 50ch;
}
.repo-meta {
  display: flex; gap: var(--space-3);
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--ink-tertiary);
  letter-spacing: 0;
}

.link-primary {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-mono);
  font-size: 13.5px;
  color: var(--accent);
  border-bottom: 1px solid transparent;
  transition: color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), gap var(--dur-fast) var(--ease-out);
}
.link-primary:hover { color: var(--accent-hover); border-bottom-color: var(--accent-hover); gap: 10px; }

/* ─── experience timeline ─────────────────────────────────────────────── */
.experience-list {
  list-style: none;
  position: relative;
  padding-left: var(--space-5);
}
.experience-list::before {
  content: '';
  position: absolute;
  top: 12px; bottom: 12px;
  left: 5px;
  width: 2px;
  background: linear-gradient(to bottom, var(--accent) 0%, var(--accent-violet) 35%, var(--accent-2) 70%, transparent 100%);
  transform: scaleY(0);
  transform-origin: top center;
  transition: transform 1.6s var(--ease-out) 200ms;
  box-shadow: 0 0 12px var(--accent-glow);
}
.experience-list.in::before { transform: scaleY(1); }
.experience-item {
  position: relative;
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: var(--space-5);
  padding: var(--space-4) 0 var(--space-5);
  align-items: start;
  transition: transform 400ms var(--ease-spring);
}
.experience-item + .experience-item { border-top: 1px solid var(--line); }
/* Override the global .reveal translateY for timeline items — slide in from left */
.experience-list .experience-item.reveal { opacity: 0; transform: translate3d(-36px, 0, 0); transition: opacity 700ms var(--ease-out), transform 700ms var(--ease-out); }
.experience-list .experience-item.reveal.in { opacity: 1; transform: translate3d(0, 0, 0); }
.experience-item:hover { transform: translate3d(10px, 0, 0); }
.experience-item::before {
  content: '';
  position: absolute;
  left: calc(var(--space-5) * -1 + 1px);
  top: 26px;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--bg-primary);
  border: 2px solid var(--accent);
  box-shadow: 0 0 0 4px var(--bg-primary), 0 0 12px var(--accent-glow);
  transition: transform 400ms var(--ease-spring), background 400ms var(--ease-out), box-shadow 400ms var(--ease-out), border-color 400ms var(--ease-out);
  z-index: 2;
}
.experience-item::after {
  /* aura ring that emanates on hover */
  content: '';
  position: absolute;
  left: calc(var(--space-5) * -1 - 3px);
  top: 22px;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: var(--accent-grad);
  opacity: 0;
  filter: blur(8px);
  transition: opacity 400ms var(--ease-out), transform 400ms var(--ease-spring);
  pointer-events: none;
}
.experience-item:hover::before {
  background: var(--accent);
  border-color: var(--accent-2);
  transform: scale(1.5);
  box-shadow: 0 0 0 5px var(--bg-primary), 0 0 24px var(--accent), 0 0 48px var(--accent-violet);
}
.experience-item:hover::after { opacity: 0.6; transform: scale(1.4); }
@media (max-width: 767px) {
  .experience-list { padding-left: var(--space-4); }
  .experience-item { grid-template-columns: 1fr; gap: var(--space-2); }
  .experience-item::before { left: calc(var(--space-4) * -1 + 1px); top: 22px; }
}
.experience-period {
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--ink-tertiary);
  letter-spacing: 0;
  padding-top: 4px;
}
.experience-detail h3 {
  font-family: var(--font-display);
  font-size: 19px; font-weight: 600;
  letter-spacing: -0.015em;
  margin-bottom: 2px;
}
.experience-company {
  display: inline-block;
  font-family: var(--font-body);
  font-size: 14px; font-weight: 500;
  color: var(--accent);
  margin-bottom: var(--space-2);
}
.experience-company:hover { color: var(--accent-hover); }
.experience-summary {
  font-size: 14.5px;
  line-height: 1.65;
  color: var(--ink-secondary);
  max-width: 68ch;
}

/* ─── skills grid ─────────────────────────────────────────────────────── */
.skills-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
}
@media (max-width: 1023px) { .skills-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px)  { .skills-grid { grid-template-columns: 1fr; } }
.skills-category {
  padding: var(--space-5) var(--space-4);
  background: var(--bg-surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  position: relative;
  overflow: hidden;
  transition: border-color var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out), background var(--dur-base) var(--ease-out);
}
/* gradient top-line that draws in on hover */
.skills-category::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0;
  height: 2px;
  background: var(--accent-grad);
  transform: scaleX(0); transform-origin: left center;
  transition: transform 500ms var(--ease-out);
}
.skills-category::after {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 60% 80% at 0% 0%, var(--accent-glow), transparent 60%);
  opacity: 0;
  transition: opacity 400ms var(--ease-out);
  pointer-events: none;
}
.skills-category:hover {
  border-color: transparent;
  transform: translateY(-6px);
  box-shadow: 0 18px 36px var(--accent-glow), 0 4px 12px rgba(0, 0, 0, 0.04);
}
.skills-category:hover::before { transform: scaleX(1); }
.skills-category:hover::after { opacity: 1; }
.skills-category > * { position: relative; z-index: 1; }
.skills-category-title {
  font-family: var(--font-mono);
  font-size: 12.5px; font-weight: 500;
  color: var(--accent);
  letter-spacing: 0;
  text-transform: lowercase;
  margin-bottom: var(--space-3);
  display: inline-flex; align-items: center; gap: 6px;
}
.skills-category-title::before { content: '#'; opacity: 0.6; }
.skills-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.skills-pill {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--ink-primary);
  border: 1px solid transparent;
  transform: translateY(0);
  transition: border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), transform 220ms var(--ease-spring), box-shadow var(--dur-fast) var(--ease-out);
}
.skills-pill:hover {
  border-color: var(--accent); color: var(--accent); background: var(--accent-soft);
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 6px 14px var(--accent-glow);
}

/* ─── contact / cta box ───────────────────────────────────────────────── */
.contact { padding: var(--space-9) 0; }
.contact-cta {
  position: relative;
  padding: clamp(40px, 6vw, 72px) clamp(28px, 5vw, 64px);
  background:
    radial-gradient(ellipse 60% 60% at 50% 0%, var(--accent-glow), transparent 70%),
    radial-gradient(ellipse 40% 40% at 100% 100%, var(--secondary-soft), transparent 70%),
    var(--bg-surface);
  border-radius: 18px;
  overflow: hidden;
  text-align: center;
  box-shadow: var(--shadow-md);
  isolation: isolate;
}
/* Rotating conic-gradient halo around the CTA box */
.contact-cta::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 20px;
  padding: 2px;
  background: conic-gradient(from 0deg, var(--accent), var(--accent-violet), var(--accent-2), var(--accent-3), var(--accent));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  opacity: 0.55;
  animation: ctaSpin 14s linear infinite;
  z-index: -1;
}
@keyframes ctaSpin { to { transform: rotate(360deg); } }
.contact-cta > * { position: relative; z-index: 1; }
.contact-cta .section-eyebrow { margin-bottom: var(--space-3); }
.contact-cta h2 {
  font-size: clamp(30px, 4.5vw, 52px);
  margin-bottom: var(--space-3);
  letter-spacing: -0.03em;
}
.contact-body {
  font-size: 16px;
  color: var(--ink-secondary);
  max-width: 50ch;
  margin: 0 auto var(--space-5);
  line-height: 1.6;
}
.contact-email {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: clamp(18px, 2.5vw, 24px);
  font-weight: 500;
  color: var(--ink-primary);
  padding: 14px 24px;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: 12px;
  margin-bottom: var(--space-5);
  transition: color var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out), background var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-spring), box-shadow var(--dur-base) var(--ease-out);
  cursor: pointer;
}
.contact-email:hover {
  color: var(--accent-violet);
  border-color: transparent;
  background: var(--bg-surface);
  transform: translateY(-4px) scale(1.04);
  box-shadow: 0 0 0 1px var(--accent), 0 18px 40px var(--accent-glow), 0 6px 16px rgba(0, 0, 0, 0.06);
}
.contact-meta {
  display: flex; justify-content: center; flex-wrap: wrap;
  gap: var(--space-5);
  margin-bottom: var(--space-5);
}
.contact-meta-item { display: flex; flex-direction: column; gap: 2px; align-items: center; }
.contact-meta-label {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-tertiary);
  letter-spacing: 0;
}
.status-indicator {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ink-primary);
}
.status-indicator .live-dot {
  display: inline-block;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--secondary);
  margin-right: 6px;
  vertical-align: middle;
}
.contact-socials { display: flex; justify-content: center; gap: var(--space-4); flex-wrap: wrap; font-size: 14px; }
.contact-socials a {
  color: var(--ink-secondary);
  font-family: var(--font-mono);
  position: relative;
  padding-bottom: 2px;
}
.contact-socials a::after {
  content: '';
  position: absolute; left: 0; right: 0; bottom: 0;
  height: 1px; background: var(--accent);
  transform-origin: left; transform: scaleX(0);
  transition: transform var(--dur-fast) var(--ease-out);
}
.contact-socials a:hover { color: var(--accent); }
.contact-socials a:hover::after { transform: scaleX(1); }

.copy-toast {
  position: fixed;
  bottom: 24px; left: 50%;
  transform: translateX(-50%) translateY(20px);
  background: var(--ink-primary);
  color: var(--bg-primary);
  padding: 10px 18px;
  border-radius: 8px;
  font-family: var(--font-mono);
  font-size: 13px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out);
  z-index: 90;
  box-shadow: var(--shadow-lg);
}
.copy-toast.visible { opacity: 1; transform: translateX(-50%) translateY(0); }

/* ─── footer ──────────────────────────────────────────────────────────── */
.footer {
  border-top: 1px solid var(--line);
  padding: var(--space-5) 0;
  background: var(--bg-primary);
}
.footer-row {
  display: flex; justify-content: space-between; align-items: center;
  flex-wrap: wrap; gap: var(--space-3);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-tertiary);
  letter-spacing: 0;
}
.footer-row a { color: var(--accent); transition: color var(--dur-fast) var(--ease-out); }
.footer-row a:hover { color: var(--accent-hover); }

/* ─── reveal ──────────────────────────────────────────────────────────── */
.reveal { opacity: 0; transform: translateY(14px); transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out); }
.reveal.in { opacity: 1; transform: translateY(0); }

/* Stagger project cards as they enter view — index-based delay. */
.projects-grid .project-card.reveal { transition-duration: 700ms; }
.projects-grid .project-card.reveal:nth-child(2) { transition-delay: 130ms; }
.projects-grid .project-card.reveal:nth-child(3) { transition-delay: 260ms; }
.projects-grid .project-card.reveal:nth-child(4) { transition-delay: 390ms; }
.projects-grid .project-card.reveal:nth-child(5) { transition-delay: 520ms; }
.projects-grid .project-card.reveal:nth-child(6) { transition-delay: 650ms; }

/* Pinned repos stagger */
.pinned-repos .repo-card { animation: fadeUp 600ms var(--ease-out) both; }
.pinned-repos .repo-card:nth-child(2) { animation-delay: 80ms; }
.pinned-repos .repo-card:nth-child(3) { animation-delay: 160ms; }
.pinned-repos .repo-card:nth-child(4) { animation-delay: 240ms; }

/* Hero copy: staggered fade-in on page load (above-the-fold, runs without IO). */
.hero-copy > * { animation: heroFade 900ms var(--ease-out) both; }
.hero-copy > *:nth-child(1) { animation-delay:    0ms; }
.hero-copy > *:nth-child(2) { animation-delay:  140ms; }
.hero-copy > *:nth-child(3) { animation-delay:  280ms; }
.hero-copy > *:nth-child(4) { animation-delay:  420ms; }
.hero-copy > *:nth-child(5) { animation-delay:  560ms; }
.hero-copy > *:nth-child(6) { animation-delay:  700ms; }
.hero-copy > *:nth-child(7) { animation-delay:  840ms; }
.hero-copy > *:nth-child(8) { animation-delay:  980ms; }
.hero-terminal { animation: heroFade 1000ms var(--ease-out) 300ms both; }
@keyframes heroFade { from { opacity: 0; transform: translateY(32px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeUp  { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }

/* ─── slim about/contact/privacy ──────────────────────────────────────── */
.page-section { padding: var(--space-9) 0; }
.page-h1 { font-size: clamp(36px, 5vw, 56px); font-weight: 600; letter-spacing: -0.025em; margin-bottom: var(--space-5); max-width: 16ch; }
.page-body { max-width: 60ch; font-size: 16px; line-height: 1.7; color: var(--ink-secondary); }
.page-body p { margin-bottom: var(--space-3); color: var(--ink-primary); }
.page-body p a { color: var(--accent); border-bottom: 1px solid var(--accent); padding-bottom: 1px; }
.page-body p a:hover { color: var(--accent-hover); border-bottom-color: var(--accent-hover); }

/* ─── reduced motion / print ─────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  .reveal { opacity: 1 !important; transform: none !important; }
  .hero-terminal { transform: none !important; }
}
/* ─── flashy v3: constellation · magnetic · live tilt ─────────────────── */
.hero-particles {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  z-index: 1;
  pointer-events: none;
  opacity: 0;
  transition: opacity 1000ms var(--ease-out) 250ms;
}
.hero-particles.lit { opacity: 1; }
/* snappy transform while live-tilting, smooth for every other property */
.project-card.tilting {
  transition: transform 90ms ease-out,
              border-color var(--dur-base) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out),
              background var(--dur-base) var(--ease-out);
  will-change: transform;
}
[data-magnetic] { will-change: transform; }
@media (prefers-reduced-motion: reduce) {
  .hero-particles { display: none !important; }
}

@media print {
  .hero-particles { display: none !important; }
  .nav, .nav-overlay, .copy-toast, .theme-toggle, .filter-tabs { display: none !important; }
  body { background: white !important; color: black !important; }
  section { page-break-inside: avoid; padding: 24px 0 !important; }
  .project-card, .skills-category, .contact-cta, .repo-card { break-inside: avoid; box-shadow: none !important; border-color: #ddd !important; }
}
`;
}

// ─── shared bits ────────────────────────────────────────────────────────────
function getNav(c, currentPath) {
  const onHome = currentPath === '/';
  const link = (label, hash, cls) => onHome
    ? `<a href="#${hash}" ${cls ? `class="${cls}"` : ''}>${esc(label)}</a>`
    : `<a href="/#${hash}" ${cls ? `class="${cls}"` : ''}>${esc(label)}</a>`;
  const firstName = firstNameOf(c.businessName);
  const themeToggle = `
    <button class="theme-toggle" id="theme-toggle" aria-label="Toggle color theme" type="button">
      <svg class="theme-icon-sun" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
      </svg>
      <svg class="theme-icon-moon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    </button>`;
  return `
<header class="nav" id="nav">
  <div class="nav-inner">
    <a class="nav-mark" href="/">${esc(firstName.toLowerCase())}</a>
    <nav class="nav-links" aria-label="Primary">
      ${link((c.labels?.navProjects || 'projects').toLowerCase(), 'projects')}
      ${link('experience', 'experience')}
      ${link('skills', 'skills')}
      ${link((c.labels?.navContact || 'contact').toLowerCase(), 'contact')}
      ${c.contactEmail ? `<a href="mailto:${attr(c.contactEmail)}" class="cta">${esc(c.contactEmail)}</a>` : ''}
    </nav>
    <div class="nav-tools">
      ${themeToggle}
      <button class="nav-burger" id="nav-burger" aria-label="Open menu" aria-expanded="false" type="button"><span></span><span></span></button>
    </div>
  </div>
</header>
<div class="nav-overlay" id="nav-overlay" aria-hidden="true">
  <div class="nav-overlay-top">
    <span class="nav-mark">${esc(firstName.toLowerCase())}</span>
    <button class="nav-overlay-close" id="nav-overlay-close" aria-label="Close menu" type="button">close</button>
  </div>
  <nav class="nav-overlay-links" aria-label="Mobile">
    <a href="${onHome ? '#projects' : '/#projects'}">${esc((c.labels?.navProjects || 'projects').toLowerCase())}</a>
    <a href="${onHome ? '#experience' : '/#experience'}">experience</a>
    <a href="${onHome ? '#skills' : '/#skills'}">skills</a>
    <a href="${onHome ? '#contact' : '/#contact'}">${esc((c.labels?.navContact || 'contact').toLowerCase())}</a>
  </nav>
</div>`;
}

function getFooter(c) {
  const year = new Date().getFullYear();
  const hosting = c.hosting || 'Netlify';
  return `
<footer class="footer">
  <div class="container">
    <div class="footer-row">
      <span>© ${year} ${esc(c.businessName)}</span>
      <span>Built with HTML, CSS, JS · Hosted on ${esc(hosting)}</span>
      ${c.githubHandle ? `<a href="https://github.com/${attr(c.githubHandle)}" target="_blank" rel="noopener">view source ↗</a>` : ''}
    </div>
  </div>
</footer>`;
}

// Inline theme bootstrap — must run BEFORE styles paint to avoid FOUC.
function getThemeBootstrap() {
  return `<script>(function(){try{var t=localStorage.getItem('theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(_){document.documentElement.setAttribute('data-theme','light');}})();</script>`;
}

function getScripts() {
  return `
<script src="https://cdnjs.cloudflare.com/ajax/libs/lenis/1.0.42/lenis.min.js" defer></script>
<script>
window.addEventListener('DOMContentLoaded', function () {
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lenis;
  function initLenis() {
    if (reduceMotion || typeof Lenis === 'undefined') return;
    // Buttery scroll: lerp 0.055 + quintic ease = long, floaty inertia. Wheel
    // multiplier slightly below 1 so a flick coasts further without jolting.
    lenis = new Lenis({
      duration: 2.0,
      easing: function (t) { return 1 - Math.pow(1 - t, 5); },
      smoothWheel: true,
      wheelMultiplier: 0.8,
      touchMultiplier: 1.5,
      lerp: 0.055,
    });
    function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
  }
  setTimeout(initLenis, 80);

  // ─── custom cursor (dot tracks exactly, ring lerps for trail) ────────────
  var isCoarse = window.matchMedia && (window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches);
  if (!isCoarse) {
    var dot  = document.createElement('div'); dot.className  = 'cursor-dot';  dot.setAttribute('aria-hidden', 'true');
    var ring = document.createElement('div'); ring.className = 'cursor-ring'; ring.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dot);
    document.body.appendChild(ring);

    var mx = window.innerWidth / 2, my = window.innerHeight / 2;
    var rx = mx, ry = my;
    var dotX = mx, dotY = my;

    document.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      dotX = mx; dotY = my;
      dot.style.transform = 'translate3d(' + dotX + 'px, ' + dotY + 'px, 0)';
    }, { passive: true });

    function cursorLoop() {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      ring.style.transform = 'translate3d(' + rx + 'px, ' + ry + 'px, 0)';
      requestAnimationFrame(cursorLoop);
    }
    requestAnimationFrame(cursorLoop);

    // Hover state — ring grows over anything interactive
    var hoverSel = 'a, button, [role="button"], .project-card, .repo-card, .tech-badge, .skills-pill, .filter-tab, .contact-email, .theme-toggle, .nav-mark, .nav-burger, .marquee-item';
    document.querySelectorAll(hoverSel).forEach(function (el) {
      el.addEventListener('mouseenter', function () { ring.classList.add('is-hovering'); });
      el.addEventListener('mouseleave', function () { ring.classList.remove('is-hovering'); });
    });

    // Press feedback
    document.addEventListener('mousedown', function () { ring.classList.add('is-down'); });
    document.addEventListener('mouseup',   function () { ring.classList.remove('is-down'); });

    // Fade out when cursor leaves window
    document.addEventListener('mouseleave', function () { ring.classList.add('is-hidden'); dot.classList.add('is-hidden'); });
    document.addEventListener('mouseenter', function () { ring.classList.remove('is-hidden'); dot.classList.remove('is-hidden'); });

    document.documentElement.classList.add('cursor-on');
  }

  // Scroll progress bar — width tracks scroll position
  var progressEl = document.getElementById('scroll-progress');
  function updateProgress() {
    if (!progressEl) return;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var pct = max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0;
    progressEl.style.width = pct + '%';
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();

  // Scroll parallax — translate the orbs container slower than scroll so the
  // orbs linger as the user scrolls past the hero. Done on the wrapper so we
  // don't fight the per-orb keyframe drift.
  var orbsWrap = document.querySelector('.hero-orbs');
  if (orbsWrap && !reduceMotion) {
    var pTicking = false;
    function updateOrbs() {
      orbsWrap.style.transform = 'translate3d(0, ' + (window.scrollY * 0.35) + 'px, 0)';
      pTicking = false;
    }
    window.addEventListener('scroll', function () {
      if (!pTicking) { requestAnimationFrame(updateOrbs); pTicking = true; }
    }, { passive: true });
    updateOrbs();
  }

  // Smooth anchor scroll
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
        if (lenis) lenis.scrollTo(t, { offset: -64, duration: 1.8 });
        else t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Nav border on scroll
  var nav = document.getElementById('nav');
  function onScroll() { if (!nav) return; if (window.scrollY > 40) nav.classList.add('scrolled'); else nav.classList.remove('scrolled'); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Terminal "typewriter": reveal lines top-to-bottom
  var termLines = document.querySelectorAll('.terminal-body .term-line');
  if (termLines.length) {
    if (reduceMotion) {
      termLines.forEach(function (el) { el.classList.add('typed'); });
    } else {
      termLines.forEach(function (el, i) {
        setTimeout(function () { el.classList.add('typed'); }, 700 + i * 130);
      });
    }
  }

  // Stat counters — count up from 0 when scrolled into view
  function animateCount(el, target, duration) {
    var start = performance.now();
    function tick(now) {
      var t = Math.min(1, (now - start) / duration);
      var ease = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * ease).toString();
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = target.toString();
    }
    requestAnimationFrame(tick);
  }
  var statNums = document.querySelectorAll('.stat-num[data-count]');
  if (statNums.length && 'IntersectionObserver' in window) {
    var statsIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          var target = parseInt(e.target.getAttribute('data-count'), 10) || 0;
          if (reduceMotion) e.target.textContent = target.toString();
          else animateCount(e.target, target, 1600);
          statsIO.unobserve(e.target);
        }
      });
    }, { threshold: 0.4 });
    statNums.forEach(function (el) { statsIO.observe(el); });
  }

  // Scroll-reveal
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
  }

  // Email copy-to-clipboard
  var emailEls = document.querySelectorAll('.contact-email');
  if (emailEls.length && navigator.clipboard) {
    var toast = document.createElement('div');
    toast.className = 'copy-toast';
    toast.textContent = 'email copied';
    document.body.appendChild(toast);
    emailEls.forEach(function (emailEl) {
      emailEl.addEventListener('click', function (e) {
        e.preventDefault();
        var email = emailEl.getAttribute('data-email') || emailEl.textContent.trim();
        navigator.clipboard.writeText(email).then(function () {
          toast.classList.add('visible');
          setTimeout(function () { toast.classList.remove('visible'); }, 1800);
        }).catch(function () { window.location.href = 'mailto:' + email; });
      });
    });
  }

  // Mobile menu
  var burger = document.getElementById('nav-burger');
  var overlay = document.getElementById('nav-overlay');
  var closeBtn = document.getElementById('nav-overlay-close');
  function openMenu()  { if (!overlay) return; overlay.classList.add('open'); overlay.setAttribute('aria-hidden', 'false'); if (burger) burger.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; }
  function closeMenu() { if (!overlay) return; overlay.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true'); if (burger) burger.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; }
  if (burger) burger.addEventListener('click', openMenu);
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);
  if (overlay) overlay.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeMenu); });

  // Theme toggle (animated icon flip on click)
  var themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (_) {}
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', next === 'dark' ? '#0B0B0E' : '#FAFAF9');
      themeBtn.classList.remove('flip');
      // force reflow so re-adding restarts the keyframe even on rapid double-clicks
      void themeBtn.offsetWidth;
      themeBtn.classList.add('flip');
      setTimeout(function () { themeBtn.classList.remove('flip'); }, 520);
    });
  }

  // Project card spotlight — track cursor pos inside each card and set CSS
  // custom props so the radial-gradient spotlight follows it. Throttled via
  // rAF to keep mousemove cheap.
  document.querySelectorAll('.project-card').forEach(function (card) {
    var rafPending = false;
    var lastX = 0, lastY = 0;
    function apply() {
      var rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', (lastX - rect.left) + 'px');
      card.style.setProperty('--my', (lastY - rect.top) + 'px');
      rafPending = false;
    }
    card.addEventListener('mousemove', function (e) {
      lastX = e.clientX; lastY = e.clientY;
      if (!rafPending) { requestAnimationFrame(apply); rafPending = true; }
    }, { passive: true });
  });

  // Project filter tabs
  var tabs = document.querySelectorAll('.filter-tab');
  var cards = document.querySelectorAll('.project-card[data-category]');
  if (tabs.length && cards.length) {
    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var filter = btn.getAttribute('data-filter') || 'all';
        tabs.forEach(function (b) { b.classList.toggle('is-active', b === btn); b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
        cards.forEach(function (card) {
          var match = filter === 'all' || card.getAttribute('data-category') === filter;
          card.style.display = match ? '' : 'none';
        });
      });
    });
  }

  // ─── flashy v3: constellation · scramble · magnetic · live tilt ────────

  // (1) Hero particle constellation — drifting nodes that link to neighbours
  //     and reach toward the cursor. Pauses when the hero scrolls off-screen.
  (function () {
    var canvas = document.querySelector('.hero-particles');
    var hero = document.getElementById('hero');
    if (!canvas || !hero || reduceMotion || isCoarse) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, pts = [], cmx = -9999, cmy = -9999, running = true;
    var LINK2 = 124 * 124, CUR2 = 168 * 168;
    function build() {
      var r = hero.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.max(28, Math.min(92, Math.floor(W / 16)));
      pts = [];
      for (var i = 0; i < n; i++) {
        pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.32, vy: (Math.random() - 0.5) * 0.32 });
      }
    }
    function palette() {
      return document.documentElement.getAttribute('data-theme') === 'dark'
        ? { dot: '167,139,250', line: '129,140,248' }
        : { dot: '99,102,241', line: '124,58,237' };
    }
    function frame() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      var c = palette(), i, p;
      for (i = 0; i < pts.length; i++) {
        p = pts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) { p.x = 0; p.vx *= -1; } else if (p.x > W) { p.x = W; p.vx *= -1; }
        if (p.y < 0) { p.y = 0; p.vy *= -1; } else if (p.y > H) { p.y = H; p.vy *= -1; }
        var dxm = cmx - p.x, dym = cmy - p.y, dm = dxm * dxm + dym * dym;
        if (dm < CUR2 && dm > 1) { var dd = Math.sqrt(dm), f = (1 - dm / CUR2) * 0.9; p.x += dxm / dd * f; p.y += dym / dd * f; }
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, 6.2832);
        ctx.fillStyle = 'rgba(' + c.dot + ',0.6)'; ctx.fill();
      }
      for (i = 0; i < pts.length; i++) {
        var pa = pts[i];
        for (var b = i + 1; b < pts.length; b++) {
          var pb = pts[b], dx = pa.x - pb.x, dy = pa.y - pb.y, d2 = dx * dx + dy * dy;
          if (d2 < LINK2) {
            ctx.strokeStyle = 'rgba(' + c.line + ',' + ((1 - d2 / LINK2) * 0.22).toFixed(3) + ')';
            ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
          }
        }
        var mdx = pa.x - cmx, mdy = pa.y - cmy, md2 = mdx * mdx + mdy * mdy;
        if (md2 < CUR2) {
          ctx.strokeStyle = 'rgba(' + c.line + ',' + ((1 - md2 / CUR2) * 0.33).toFixed(3) + ')';
          ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(cmx, cmy); ctx.stroke();
        }
      }
      requestAnimationFrame(frame);
    }
    document.addEventListener('mousemove', function (e) {
      var r = hero.getBoundingClientRect();
      cmx = e.clientX - r.left; cmy = e.clientY - r.top;
    }, { passive: true });
    document.addEventListener('mouseleave', function () { cmx = -9999; cmy = -9999; });
    window.addEventListener('resize', build);
    build();
    requestAnimationFrame(function () { canvas.classList.add('lit'); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (ents) {
        var vis = ents[0].isIntersecting;
        if (vis && !running) { running = true; requestAnimationFrame(frame); }
        else if (!vis) { running = false; }
      }, { threshold: 0 }).observe(hero);
    }
    requestAnimationFrame(frame);
  })();

  // (2) Decode/scramble text — hero name only, on load.
  (function () {
    if (reduceMotion) return;
    var GLYPH = '!<>-_\\/[]{}=+*^?#01';
    function scramble(el) {
      if (el.dataset.scrambled) return;
      el.dataset.scrambled = '1';
      var finalText = el.dataset.text || el.textContent;
      el.dataset.text = finalText;
      var len = finalText.length, dur = Math.min(1400, 420 + len * 40), t0 = performance.now();
      (function step(now) {
        var p = Math.min(1, (now - t0) / dur), out = '', i, ch, cp;
        for (i = 0; i < len; i++) {
          ch = finalText[i];
          if (ch === ' ') { out += ' '; continue; }
          cp = (p - (i / len) * 0.55) / 0.45;
          if (cp >= 1) out += ch;
          else if (cp <= 0) out += GLYPH[(Math.random() * GLYPH.length) | 0];
          else out += Math.random() < 0.6 ? GLYPH[(Math.random() * GLYPH.length) | 0] : ch;
        }
        el.textContent = out;
        if (p < 1) requestAnimationFrame(step); else el.textContent = finalText;
      })(t0);
    }
    var heroNameEls = document.querySelectorAll('.hero-name [data-scramble]');
    setTimeout(function () { heroNameEls.forEach(scramble); }, 360);
  })();

  // (3) Magnetic pull on key CTAs — element drifts toward cursor, springs back.
  if (!reduceMotion && !isCoarse) {
    document.querySelectorAll('[data-magnetic]').forEach(function (el) {
      var s = parseFloat(el.getAttribute('data-magnetic')) || 0.35;
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = 'translate(' + (dx * s).toFixed(1) + 'px,' + (dy * s).toFixed(1) + 'px)';
      });
      el.addEventListener('mouseleave', function () { el.style.transform = ''; });
    });
  }

  // (4) Hero terminal — live 3D tilt that tracks the cursor.
  (function () {
    var term = document.querySelector('.hero-terminal');
    if (!term || reduceMotion || isCoarse) return;
    term.addEventListener('mousemove', function (e) {
      var r = term.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      term.style.transition = 'transform 100ms ease-out';
      term.style.transform = 'perspective(1400px) rotateY(' + (px * 7).toFixed(2) + 'deg) rotateX(' + (-py * 7).toFixed(2) + 'deg)';
    });
    term.addEventListener('mouseleave', function () { term.style.transition = ''; term.style.transform = ''; });
  })();

  // (5) Project cards — live cursor-tracked 3D tilt (keeps the hover lift).
  if (!reduceMotion && !isCoarse) {
    document.querySelectorAll('.project-card').forEach(function (card) {
      var raf = false, lx = 0, ly = 0;
      function apply() {
        var r = card.getBoundingClientRect();
        var px = (lx - r.left) / r.width - 0.5;
        var py = (ly - r.top) / r.height - 0.5;
        card.style.transform = 'translateY(-14px) scale(1.022) rotateX(' + (-py * 9).toFixed(2) + 'deg) rotateY(' + (px * 11).toFixed(2) + 'deg)';
        raf = false;
      }
      card.addEventListener('mouseenter', function () { card.classList.add('tilting'); });
      card.addEventListener('mousemove', function (e) {
        lx = e.clientX; ly = e.clientY;
        if (!raf) { requestAnimationFrame(apply); raf = true; }
      }, { passive: true });
      card.addEventListener('mouseleave', function () { card.classList.remove('tilting'); card.style.transform = ''; });
    });
  }
});
</script>`;
}

function wrap(c, currentPath, body) {
  const banner = renderActivationBanner(c);
  const title = `${c.businessName} — ${c.industry || 'Software Engineer'}`;
  const description = c.tagline || c.portfolioAbout || c.aboutText || `${c.businessName} — software engineer`;
  return `<!DOCTYPE html>
<!-- Pixie Portfolio — Developer v2 — generated for ${esc(c.businessName)} -->
<html lang="${esc(c.htmlLang || 'en')}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#FAFAF9">
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(description)}">
<meta property="og:type" content="website">
${getFavicon(c, '#FAFAF9')}
${getThemeBootstrap()}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
${getJsonLd(c)}
<style>${getStyles()}</style>
</head>
<body>
${banner}
<a href="#main" class="skip-link">Skip to content</a>
<div class="scroll-progress" id="scroll-progress" aria-hidden="true"></div>
${getNav(c, currentPath)}
<main id="main">
${body}
</main>
${getFooter(c)}
${getScripts()}
</body>
</html>`;
}

// ─── home ───────────────────────────────────────────────────────────────────
function renderProject(p, idx) {
  const num = `[${pad2(idx + 1)}]`;
  const techs = normalizeSkillsList(p.tools).slice(0, 6);
  const meta = [p.year, p.role].filter(Boolean);
  const links = [];
  if (p.link) links.push({ label: 'demo', href: p.link });
  if (p.codeUrl || p.repoUrl) links.push({ label: 'code', href: p.codeUrl || p.repoUrl });
  const cat = inferCategory(p);
  const catLabel = CATEGORY_LABELS[cat] || 'Open Source';
  return `
<article class="project-card reveal" data-category="${attr(cat)}">
  <div class="card-spotlight" aria-hidden="true"></div>
  <div class="project-card-header">
    <span class="project-num">${esc(num)}</span>
    <h3 class="project-title">${esc(p.title)}</h3>
    <span class="project-category-tag">${esc(catLabel)}</span>
  </div>
  ${p.description ? `<p class="project-description">${esc(p.description)}</p>` : ''}
  ${techs.length ? `<div class="project-tech">${techs.map((t) => `<span class="tech-badge">${esc(t)}</span>`).join('')}</div>` : ''}
  <div class="project-footer">
    ${meta.length ? `<div class="project-meta-row">${meta.map((m, i) => `${i > 0 ? '<span class="sep">·</span>' : ''}<span>${esc(m)}</span>`).join('')}</div>` : '<span></span>'}
    ${links.length ? `<div class="project-links">${links.map((l) => `<a href="${attr(l.href)}" target="_blank" rel="noopener"><span>${esc(l.label)}</span><span class="arrow" aria-hidden="true">↗</span></a>`).join('')}</div>` : ''}
  </div>
</article>`;
}

function pickRepoLanguage(idx) {
  const langs = [
    { name: 'TypeScript', color: '#3178C6' },
    { name: 'Python',     color: '#3776AB' },
    { name: 'Go',         color: '#00ADD8' },
    { name: 'Rust',       color: '#DEA584' },
  ];
  return langs[idx % langs.length];
}

function renderFilterTabs(activeCategories) {
  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'oss', label: CATEGORY_LABELS.oss },
    { key: 'infrastructure', label: CATEGORY_LABELS.infrastructure },
    { key: 'ai', label: CATEGORY_LABELS.ai },
    { key: 'tools', label: CATEGORY_LABELS.tools },
  ].filter((t) => t.key === 'all' || activeCategories.has(t.key));

  if (tabs.length <= 1) return ''; // hide if only "All" with no other categories
  return `
<div class="filter-tabs reveal" role="tablist" aria-label="Filter projects">
  ${tabs.map((t, i) => `<button type="button" class="filter-tab${i === 0 ? ' is-active' : ''}" data-filter="${attr(t.key)}" aria-pressed="${i === 0 ? 'true' : 'false'}">${esc(t.label)}</button>`).join('')}
</div>`;
}

function generateHomePage(c) {
  const userProjects = Array.isArray(c.projects) && c.projects.length ? c.projects.slice(0, 6) : null;
  const projects = userProjects || defaultPlaceholderProjects();
  const place = c.contactAddress || (Array.isArray(c.serviceAreas) && c.serviceAreas[0]) || null;
  const role = c.industry || 'Software Engineer';
  const firstName = firstNameOf(c.businessName);
  const tagline = c.tagline || "Building software that doesn't draw attention to itself.";
  const aboutBody = c.portfolioAbout || c.aboutText || tagline;
  const bioLines = bioParagraphs(aboutBody);
  const bio1 = bioLines[0] || tagline;
  const bio2 = bioLines[1] || (place ? `Based in ${place}.` : '');

  const skillCategories = (Array.isArray(c.services) && c.services.length)
    ? categorizeSkills(c.services)
    : defaultSkillCategories();
  const experience = (Array.isArray(c.experience) && c.experience.length ? c.experience : defaultExperience());

  const githubHandle   = c.githubHandle   || null;
  const linkedinHandle = c.linkedinHandle || null;
  const twitterHandle  = c.twitterHandle  || null;

  const githubUrl   = githubHandle   ? `https://github.com/${githubHandle}` : null;
  const linkedinUrl = linkedinHandle ? `https://linkedin.com/in/${linkedinHandle}` : null;
  const twitterUrl  = twitterHandle  ? `https://twitter.com/${twitterHandle}` : null;

  const activeCategories = new Set(projects.map(inferCategory));

  // Pinned repos: derive from projects that have repoUrl/codeUrl.
  const pinned = projects.slice(0, 4).map((p, i) => ({
    name: p.title.toLowerCase().replace(/\s+/g, '-'),
    description: p.description || 'A small library / tool — see code for details.',
    language: pickRepoLanguage(i),
    stars: p.stars || '—',
    forks: p.forks || '—',
    updated: p.year || `${new Date().getFullYear()}`,
    url: p.codeUrl || p.repoUrl || p.link || (githubUrl || '#'),
  }));

  const heroSnippet = renderHeroSnippet(c);

  // Marquee tech ribbon — flatten user services + skill categories, dedupe.
  // Duplicate the list inside the track so the CSS transform: -50% loops seamlessly.
  const ribbonSource = Array.from(new Set([
    ...normalizeSkillsList(c.services),
    ...skillCategories.reduce((acc, cat) => acc.concat(cat.items), []),
  ])).filter(Boolean).slice(0, 14);
  const ribbonItems = ribbonSource.length ? ribbonSource : ['TypeScript', 'React', 'Node.js', 'Python', 'Go', 'Postgres', 'Redis', 'Docker', 'Kubernetes', 'AWS'];
  const ribbonList = ribbonItems
    .map((t) => `<span class="marquee-item">${esc(t)}</span><span class="marquee-dot" aria-hidden="true"></span>`)
    .join('');

  // Split name: first word in default ink, last word in accent gradient.
  const nameParts = String(c.businessName || '').trim().split(/\s+/);
  const nameHtml = nameParts.length > 1
    ? `<span class="hero-name-lead" data-scramble>${esc(nameParts.slice(0, -1).join(' '))}</span> <span class="hero-name-accent" data-scramble>${esc(nameParts[nameParts.length - 1])}</span>`
    : `<span class="hero-name-accent" data-scramble>${esc(c.businessName || firstName)}</span>`;

  const body = `
<section class="hero" id="hero">
  <div class="hero-orbs" aria-hidden="true">
    <span class="hero-orb hero-orb--indigo"></span>
    <span class="hero-orb hero-orb--violet"></span>
    <span class="hero-orb hero-orb--pink"></span>
    <span class="hero-orb hero-orb--cyan"></span>
  </div>
  <canvas class="hero-particles" aria-hidden="true"></canvas>
  <div class="container">
    <div class="hero-grid">
      <div class="hero-copy">
        <span class="status-pill"><span class="live-dot" aria-hidden="true"></span>Available · ${esc(quarterLabel())}</span>
        <div class="hero-eyebrow">// ${esc(role.toLowerCase())}</div>
        <h1 class="hero-name">${nameHtml}</h1>
        <p class="hero-bio">${esc(bio1)}</p>
        ${bio2 ? `<p class="hero-bio-secondary">${esc(bio2)}</p>` : ''}
        <div class="hero-meta">
          ${c.currentFocus ? `<div class="hero-meta-item"><span class="hero-meta-label">currently</span><span class="hero-meta-value">${esc(c.currentFocus)}</span></div>` : ''}
          ${place ? `<div class="hero-meta-item"><span class="hero-meta-label">based in</span><span class="hero-meta-value">${esc(place)}</span></div>` : ''}
          ${c.timezone ? `<div class="hero-meta-item"><span class="hero-meta-label">timezone</span><span class="hero-meta-value">${esc(c.timezone)}</span></div>` : ''}
        </div>
        <div class="hero-cta">
          ${c.contactEmail ? `<a class="btn btn-primary" data-magnetic="0.4" href="mailto:${attr(c.contactEmail)}">${esc(c.contactEmail)}</a>` : ''}
          ${githubUrl ? `<a class="btn btn-secondary" data-magnetic="0.4" href="${attr(githubUrl)}" target="_blank" rel="noopener">GitHub ↗</a>` : ''}
          ${linkedinUrl ? `<a class="btn btn-secondary" data-magnetic="0.4" href="${attr(linkedinUrl)}" target="_blank" rel="noopener">LinkedIn ↗</a>` : ''}
        </div>
      </div>
      <div class="hero-terminal reveal" aria-hidden="true">
        <div class="terminal-header">
          <div class="terminal-controls">
            <span class="terminal-control terminal-control--close"></span>
            <span class="terminal-control terminal-control--min"></span>
            <span class="terminal-control terminal-control--max"></span>
          </div>
          <div class="terminal-title">~/about.ts</div>
        </div>
        <pre class="terminal-body"><code>${heroSnippet}<span class="terminal-cursor"></span></code></pre>
      </div>
    </div>
  </div>
</section>

<div class="marquee-strip" aria-hidden="true">
  <div class="marquee-sheen"></div>
  <div class="marquee-track-wrap">
    <div class="marquee-track">
      <div class="marquee-list">${ribbonList}</div>
      <div class="marquee-list">${ribbonList}</div>
    </div>
  </div>
</div>

<section class="stats" id="stats">
  <div class="container">
    <div class="stats-grid reveal">
      <div class="stat-item">
        <div class="stat-num" data-count="${esc(String(c.yearsExperience || experience.length))}">0</div>
        <div class="stat-label">years building</div>
      </div>
      <div class="stat-item">
        <div class="stat-num" data-count="${esc(String(projects.length))}">0</div>
        <div class="stat-label">projects shipped</div>
      </div>
      <div class="stat-item">
        <div class="stat-num" data-count="${esc(String(Math.max(normalizeSkillsList(c.services).length, skillCategories.reduce((n, cat) => n + cat.items.length, 0))))}">0</div>
        <div class="stat-label">technologies</div>
      </div>
    </div>
  </div>
</section>

<section class="projects" id="projects">
  <div class="container">
    <div class="section-head reveal">
      <div>
        <span class="section-eyebrow">selected projects</span>
        <h2>Things I've built</h2>
      </div>
      <span class="section-head-meta">${pad2(projects.length)} shipped</span>
    </div>
    ${renderFilterTabs(activeCategories)}
    <div class="projects-grid">
      ${projects.map((p, i) => renderProject(p, i)).join('')}
    </div>
  </div>
</section>

${githubHandle ? `
<section class="github" id="github">
  <div class="container">
    <div class="section-head reveal">
      <div>
        <span class="section-eyebrow">open source</span>
        <h2>Things I work on in public</h2>
      </div>
    </div>
    <div class="pinned-repos reveal">
      ${pinned.map((r) => `
        <a class="repo-card" href="${attr(r.url)}" target="_blank" rel="noopener">
          <header>
            <span class="repo-name">${esc(r.name)}</span>
            <span class="repo-language"><span class="lang-dot" style="color:${r.language.color}">●</span>${esc(r.language.name)}</span>
          </header>
          <p class="repo-description">${esc(r.description)}</p>
          <footer class="repo-meta">
            <span>★ ${esc(r.stars)}</span>
            <span>⑂ ${esc(r.forks)}</span>
            <span>${esc(r.updated)}</span>
          </footer>
        </a>`).join('')}
    </div>
    <a class="link-primary" href="${attr(githubUrl)}" target="_blank" rel="noopener">View full GitHub profile →</a>
  </div>
</section>` : ''}

<section class="experience" id="experience">
  <div class="container">
    <div class="section-head reveal">
      <div>
        <span class="section-eyebrow">experience</span>
        <h2>Where I've worked</h2>
      </div>
    </div>
    <ul class="experience-list reveal">
      ${experience.map((x) => `
        <li class="experience-item reveal">
          <div class="experience-period">${esc(x.period)}</div>
          <div class="experience-detail">
            <h3>${esc(x.role)}</h3>
            ${x.companyUrl ? `<a class="experience-company" href="${attr(x.companyUrl)}" target="_blank" rel="noopener">${esc(x.company)}</a>` : `<span class="experience-company">${esc(x.company)}</span>`}
            <p class="experience-summary">${esc(x.summary)}</p>
          </div>
        </li>`).join('')}
    </ul>
  </div>
</section>

<section class="skills" id="skills">
  <div class="container">
    <div class="section-head reveal">
      <div>
        <span class="section-eyebrow">skills</span>
        <h2>Technical stack</h2>
      </div>
    </div>
    <div class="skills-grid reveal">
      ${skillCategories.map((cat) => `
        <div class="skills-category">
          <h3 class="skills-category-title">${esc(cat.title)}</h3>
          <div class="skills-pills">${cat.items.map((it) => `<span class="skills-pill">${esc(it)}</span>`).join('')}</div>
        </div>`).join('')}
    </div>
  </div>
</section>

<section class="contact" id="contact">
  <div class="container">
    <div class="contact-cta reveal">
      <span class="section-eyebrow">get in touch</span>
      <h2>Want to work together?</h2>
      <p class="contact-body">The best way to reach me is email. I respond within 24 hours.</p>
      ${c.contactEmail ? `<a class="contact-email" href="mailto:${attr(c.contactEmail)}" data-email="${attr(c.contactEmail)}">${esc(c.contactEmail)}</a>` : ''}
      <div class="contact-meta">
        <div class="contact-meta-item">
          <span class="contact-meta-label">// status</span>
          <span class="status-indicator"><span class="live-dot" aria-hidden="true"></span>Available · ${esc(quarterLabel())}</span>
        </div>
        ${c.timezone ? `<div class="contact-meta-item"><span class="contact-meta-label">// timezone</span><span class="status-indicator">${esc(c.timezone)}</span></div>` : ''}
      </div>
      <div class="contact-socials">
        ${githubUrl ? `<a href="${attr(githubUrl)}" target="_blank" rel="noopener">GitHub</a>` : ''}
        ${linkedinUrl ? `<a href="${attr(linkedinUrl)}" target="_blank" rel="noopener">LinkedIn</a>` : ''}
        ${twitterUrl ? `<a href="${attr(twitterUrl)}" target="_blank" rel="noopener">Twitter</a>` : ''}
      </div>
    </div>
  </div>
</section>`;

  return wrap(c, '/', body);
}

// ─── slim pages ─────────────────────────────────────────────────────────────
function generateAboutPage(c) {
  const aboutBody = c.portfolioAbout || c.aboutText || `Software engineer working on developer tools and platform infrastructure.`;
  const firstName = firstNameOf(c.businessName);
  const paragraphs = bioParagraphs(aboutBody);
  const body = `
<section class="page-section">
  <div class="container">
    <span class="section-eyebrow">about</span>
    <h1 class="page-h1">${esc(firstName)}</h1>
    <div class="page-body">
      ${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
      <p>For inquiries, <a href="/contact">get in touch</a>.</p>
    </div>
  </div>
</section>`;
  return wrap(c, '/about', body);
}

function generateContactPage(c) {
  const body = `
<section class="page-section">
  <div class="container">
    <span class="section-eyebrow">contact</span>
    <h1 class="page-h1">Get in touch</h1>
    <div class="page-body">
      <p>Email is the fastest way to reach me — I respond within 24 hours.</p>
      ${c.contactEmail ? `<p><a href="mailto:${attr(c.contactEmail)}">${esc(c.contactEmail)}</a></p>` : ''}
      ${c.contactPhone ? `<p><a href="tel:${attr(c.contactPhone)}">${esc(c.contactPhone)}</a></p>` : ''}
      ${c.githubHandle ? `<p><a href="https://github.com/${attr(c.githubHandle)}" target="_blank" rel="noopener">github.com/${esc(c.githubHandle)}</a></p>` : ''}
    </div>
  </div>
</section>`;
  return wrap(c, '/contact', body);
}

function generatePrivacyPage(c) {
  const body = `
<section class="page-section">
  <div class="container">
    <span class="section-eyebrow">privacy</span>
    <h1 class="page-h1">Privacy</h1>
    <div class="page-body" style="margin-top: 32px">${generatePrivacyBody(c)}</div>
  </div>
</section>`;
  return wrap(c, '/privacy', body);
}

function generateThankYouPage(c) {
  const firstName = firstNameOf(c.businessName);
  const body = `
<section class="page-section">
  <div class="container">
    <span class="section-eyebrow">200 OK</span>
    <h1 class="page-h1">Got your message</h1>
    <div class="page-body" style="margin-top: 24px">
      <p>I'll reply within 24 hours. — ${esc(firstName)}</p>
      <p><a href="/">← back home</a></p>
    </div>
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
