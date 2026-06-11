// Portfolio sub-type registry — SINGLE source of truth for the sales
// sample-demo system (which preview URL + screenshot Pixie shows when a user
// wants a portfolio site).
//
// Why this exists: "portfolio" is not one industry. A developer, a designer,
// a photographer and a writer all want very different-looking sites, so each
// sub-type has its own example demo. Before this registry, portfolio had no
// sample at all and fell back to the coffee-shop `generic` demo.
//
// SCOPE — this only affects the SALES sample/preview shown in chat. It does
// NOT touch the website BUILD flow, which keys on `industryKey === 'portfolio'`
// (see src/website-gen/templates/index.js isPortfolio + resumeIntake.js).
// classifyIndustry() still returns the single bucket `portfolio`; the build
// uses one portfolio template regardless of sub-type. Sub-typing the built
// site is a separate, bigger change and intentionally out of scope here.
//
// TO ACTIVATE A NEW SUB-TYPE (e.g. designer):
//   1. Deploy its preview (scratch/<name>-portfolio-preview) to `previewUrl`.
//   2. Host its screenshot at `screenshotUrl`.
//   3. Flip `live: true` below.
// The sales prompt (buildSalesPrompt) and the URL/screenshot resolvers all
// read this list, so that one flag is the only change needed — no prompt or
// map edits. Non-live sub-types fall back to the default live demo so we
// never emit a dead link.

const PORTFOLIO_SUBTYPES = [
  {
    key: 'developer',
    label: 'developer / software engineer / "in tech"',
    matches: 'developer, software engineer, programmer, coder, full-stack, backend, frontend, devops, data/ML, "in tech", "tech field"',
    // scratch/dev-portfolio-preview — Alex Rivera, Full-Stack Engineer
    previewUrl: 'https://alexrivera.pixiebot.co',
    screenshotUrl: 'https://pixiebot.co/portfolio-developer.png',
    live: true,
  },
  {
    key: 'designer',
    label: 'designer (brand / UX / graphic / product)',
    matches: 'designer, UX, UI, graphic designer, brand designer, product designer, art director',
    // scratch/designer-portfolio-preview — Eleanor, Brand & UX Designer
    previewUrl: 'https://eleanor.pixiebot.co',
    screenshotUrl: 'https://pixiebot.co/portfolio-designer.png',
    live: true,
  },
  {
    key: 'photographer',
    label: 'photographer / videographer',
    matches: 'photographer, photography, photo, videographer, filmmaker',
    // scratch/photographer-preview — Hana Lee, Wedding & Portrait Photographer
    previewUrl: 'https://hana.pixiebot.co',
    screenshotUrl: 'https://pixiebot.co/portfolio-photographer.png',
    live: false,
  },
  {
    key: 'writer',
    label: 'writer / creative freelancer / consultant',
    matches: 'writer, copywriter, author, content creator, creative freelancer, consultant',
    // scratch/general-portfolio-preview — Daniel Okafor, Writer & Creative Freelancer
    previewUrl: 'https://danielokafor.pixiebot.co',
    screenshotUrl: 'https://pixiebot.co/portfolio-writer.png',
    live: false,
  },
];

function liveSubtypes() {
  return PORTFOLIO_SUBTYPES.filter((s) => s.live);
}

// The demo shown when the sub-type is unknown or not yet live. First live
// sub-type wins (developer today); hard-falls back to the first entry so the
// resolver is never empty even if someone flips every `live` to false.
function defaultPortfolioDemo() {
  return liveSubtypes()[0] || PORTFOLIO_SUBTYPES[0];
}

// Resolve any portfolio industry token — `portfolio`, `portfolio_developer`,
// or a bare sub-type like `developer` — to a demo object. Unknown or non-live
// sub-types degrade to the default live demo (never a dead link).
function resolvePortfolioDemo(token) {
  const sub = String(token || '').toLowerCase().replace(/^portfolio[_-]?/, '');
  if (!sub) return defaultPortfolioDemo();
  const hit = PORTFOLIO_SUBTYPES.find((s) => s.key === sub && s.live);
  return hit || defaultPortfolioDemo();
}

function isPortfolioToken(token) {
  const t = String(token || '').toLowerCase();
  return t === 'portfolio' || t.startsWith('portfolio_');
}

const hostOf = (url) => String(url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- Sales-prompt fragments (read by buildSalesPrompt) ------------------
// All derived from the live sub-types so the prompt and the resolvers can
// never drift out of sync.

// Pipe-joined enum tokens for the `industry=<...>` placeholder, e.g.
// "portfolio_developer". Bare `portfolio` is always also accepted.
function portfolioEnumTokens() {
  return liveSubtypes().map((s) => `portfolio_${s.key}`).join('|');
}

// One bullet per live sub-type for the Stage-2 industry-mapping list.
function portfolioMappingBullets() {
  return liveSubtypes()
    .map((s) => `    - \`portfolio_${s.key}\` → ${s.label}: ${s.matches}. Share ${hostOf(s.previewUrl)}.`)
    .join('\n');
}

// One line per live sub-type for the "our example sites" list.
function portfolioExampleLines() {
  return liveSubtypes()
    .map((s) => `- ${cap(s.key)} portfolio — \`${s.previewUrl}\` → tag industry=\`portfolio_${s.key}\` (${s.matches})`)
    .join('\n');
}

module.exports = {
  PORTFOLIO_SUBTYPES,
  liveSubtypes,
  defaultPortfolioDemo,
  resolvePortfolioDemo,
  isPortfolioToken,
  portfolioEnumTokens,
  portfolioMappingBullets,
  portfolioExampleLines,
};
