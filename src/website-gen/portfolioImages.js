// Portfolio project image fetcher — Pexels, with per-niche query pools so the
// work grid is filled with relevant photos instead of typographic placeholders
// when the user hasn't uploaded their own. Mirrors realEstateListingImages.js:
// same runPool concurrency, same searchPhotos/mapPhotoToResult plumbing, and
// it SKIPS any project that already has a user-supplied photoUrl.
//
// IMPORTANT: portfolio templates read `project.photoUrl` as a bare URL STRING
// (e.g. background-image: url('...')), unlike real-estate listings which read
// an `image` object. So we assign the mapped `.url`, not the mapped object.

const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { searchPhotos, mapPhotoToResult } = require('./pexelsClient');
const { generateResponse } = require('../llm/provider');

const CONCURRENCY = 4;
const PER_FETCH_TIMEOUT_MS = 7000;

// Round-robin query pools per resolved sub-template. Picked by index so N
// cards on one page don't all get near-identical photos.
const NICHE_POOL = {
  photographer: [
    'wedding photography', 'portrait photography', 'engagement photo session',
    'family photoshoot', 'editorial fashion photography', 'documentary photography',
    'lifestyle brand photoshoot', 'event photography',
  ],
  designer: [
    'brand identity design', 'graphic design studio', 'product design mockup',
    'typography poster', 'ui ux design screen', 'art direction moodboard',
    'editorial layout design', 'packaging design',
  ],
  developer: [
    'software dashboard ui', 'code on screen', 'developer workspace',
    'data visualization screen', 'terminal code dark', 'server room technology',
    'mobile app interface', 'circuit board macro',
  ],
  general: [
    'creative workspace', 'open notebook writing', 'editorial magazine spread',
    'desk with coffee laptop', 'library books reading', 'minimal studio workspace',
    'creative desk flatlay', 'modern office natural light',
  ],
};

// Role/keyword → sharper query for the photographer niche, where the project's
// `role` (Wedding / Portrait / Commercial …) is a strong visual signal.
const PHOTOGRAPHER_ROLE_QUERY = [
  [/wedding/i, 'wedding photography'],
  [/portrait/i, 'portrait photography'],
  [/engage/i, 'engagement photo session'],
  [/family|maternity/i, 'family photoshoot'],
  [/commercial|brand|product/i, 'editorial brand photoshoot'],
  [/event/i, 'event photography'],
  [/travel|landscape/i, 'landscape photography'],
];

function buildProjectQuery(project, template, index) {
  // An explicit per-card query (e.g. from the LLM specialty seeder, tuned to
  // what the photographer actually shoots) always wins over the generic pool.
  const explicit = project && typeof project.imageQuery === 'string' && project.imageQuery.trim();
  if (explicit) return explicit.trim().slice(0, 80);
  const tpl = NICHE_POOL[template] ? template : 'general';
  const pool = NICHE_POOL[tpl];
  if (tpl === 'photographer') {
    const role = String((project && (project.role || (Array.isArray(project.tools) && project.tools[0]))) || '');
    for (const [re, q] of PHOTOGRAPHER_ROLE_QUERY) {
      if (re.test(role)) return q;
    }
  }
  return pool[index % pool.length];
}

async function fetchOne(query) {
  const results = await searchPhotos(query, {
    orientation: 'landscape',
    perPage: 8,
    timeout: PER_FETCH_TIMEOUT_MS,
    logTag: 'PORTFOLIO-IMG',
  });
  if (!results || !results.length) return null;
  // Pick from top 4 so the same query gives variety across calls/cards.
  const pick = results[Math.floor(Math.random() * Math.min(4, results.length))];
  return mapPhotoToResult(pick, { width: 1200, quality: 80 });
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function pull() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, pull);
  await Promise.all(workers);
  return results;
}

/**
 * Attach a niche-appropriate Pexels photo URL to every project that lacks one.
 * Projects that already have a user-supplied `photoUrl` are left untouched.
 * Never throws — a per-card miss just leaves photoUrl null and the template
 * renders its typographic placeholder.
 *
 * @param {Array<object>} projects
 * @param {object} [opts]
 * @param {string} [opts.template] resolved sub-template id (photographer|designer|developer|general)
 */
async function attachPortfolioImages(projects, opts = {}) {
  if (!env.pexels?.apiKey || !Array.isArray(projects) || !projects.length) return projects || [];
  const template = NICHE_POOL[opts.template] ? opts.template : 'general';
  const missingIdx = projects
    .map((p, i) => (p && p.photoUrl ? -1 : i))
    .filter((i) => i >= 0);
  if (!missingIdx.length) {
    logger.info(`[PORTFOLIO-IMG] All ${projects.length} projects have photos — no Pexels fetch`);
    return projects;
  }
  const queries = missingIdx.map((i) => buildProjectQuery(projects[i], template, i));
  logger.info(`[PORTFOLIO-IMG] Fetching ${queries.length} project images (template=${template}, ${projects.length - queries.length} already have photos)`);
  const images = await runPool(queries, CONCURRENCY, (q) => fetchOne(q));
  const hits = images.filter(Boolean).length;
  logger.info(`[PORTFOLIO-IMG] Got ${hits}/${queries.length} project images`);
  return projects.map((p, i) => {
    const slot = missingIdx.indexOf(i);
    if (slot >= 0 && images[slot] && images[slot].url) return { ...p, photoUrl: images[slot].url };
    return p;
  });
}

// Niche-appropriate, real-looking placeholder projects so the work grid has
// cards to show (and to attach auto-images to) when the user supplied none.
// Kept here rather than the templates because the template defaults run AFTER
// image enrichment and so could never receive photos.
const SEED_PROJECTS = {
  photographer: [
    { title: 'Maya & Owen', role: 'Wedding', year: '2024', link: '', tools: ['Wedding'], photoUrl: null, description: 'A late-summer wedding in the foothills.' },
    { title: 'Sara at Home', role: 'Portrait', year: '2024', link: '', tools: ['Portrait'], photoUrl: null, description: 'A quiet morning portrait session.' },
    { title: 'Field Kitchen Launch', role: 'Commercial', year: '2024', link: '', tools: ['Brand'], photoUrl: null, description: 'Lifestyle imagery for a farm-to-table launch.' },
    { title: 'The Robinsons', role: 'Family', year: '2023', link: '', tools: ['Family'], photoUrl: null, description: 'Three generations on the family farm.' },
    { title: 'June + Daisy', role: 'Engagement', year: '2024', link: '', tools: ['Engagement'], photoUrl: null, description: 'Sunset hour at the lake.' },
    { title: 'Cara — Personal Brand', role: 'Commercial', year: '2024', link: '', tools: ['Brand'], photoUrl: null, description: 'Editorial brand session for a coach.' },
  ],
  designer: [
    { title: 'BrandX Rebrand', role: 'Lead Designer', year: '2024', link: '', tools: ['Brand Identity', 'Web Design'], photoUrl: null, description: 'Took the visual identity from corporate to bold — full system from logo to product.' },
    { title: 'DashFlow', role: 'UX Lead', year: '2023', link: '', tools: ['Figma', 'Design System'], photoUrl: null, description: 'Redesigned a finance dashboard from the data architecture up.' },
    { title: 'Hello Studio', role: 'Brand Designer', year: '2023', link: '', tools: ['Identity', 'Type'], photoUrl: null, description: 'Identity for a creative studio — logotype, type system, motion.' },
    { title: 'Postcard', role: 'Designer', year: '2022', link: '', tools: ['Webflow'], photoUrl: null, description: 'Typography-first editorial site for a writer.' },
  ],
  developer: [
    { title: 'pixie-replay', role: 'Author', year: '2025', link: '', tools: ['Node', 'Supabase', 'Jest'], photoUrl: null, description: 'Behavioral regression test runner for an LLM-driven state machine.' },
    { title: 'auth-nullable', role: 'Maintainer', year: '2024', link: '', tools: ['TypeScript', 'ESLint'], photoUrl: null, description: 'Codemod surfacing unsafely-cast nullable user objects across a 200k-LOC monorepo.' },
    { title: 'cloud-router', role: 'Contributor', year: '2024', link: '', tools: ['Go', 'gRPC'], photoUrl: null, description: 'Request-router that picks regional egress per traffic class, used in a production CDN.' },
  ],
  general: [
    { title: 'After the Algorithm', role: 'Author', year: '2024', link: '', tools: ['Long-form'], photoUrl: null, description: 'A 6,000-word feature on community-led content moderation.' },
    { title: 'Voice Guide', role: 'Lead Writer', year: '2023', link: '', tools: ['Strategy', 'Voice'], photoUrl: null, description: 'Voice-and-tone system + writing playbook used by 40+ writers.' },
    { title: 'On Quiet Software', role: 'Author', year: '2023', link: '', tools: ['Editorial'], photoUrl: null, description: 'Personal essay on tools that disappear. Picked up by Hacker News.' },
  ],
};

// Return a fresh copy of niche-appropriate placeholder projects.
function seedPlaceholderProjects(template) {
  const tpl = SEED_PROJECTS[template] ? template : 'general';
  return SEED_PROJECTS[tpl].map((p) => ({ ...p, tools: [...(p.tools || [])] }));
}

// ── LLM-driven, specialty-matched work grid ─────────────────────────────────
// When a photographer uploads no photos, the fixed SEED_PROJECTS spread shows a
// generic mix (wedding + portrait + commercial + family…) regardless of what
// they actually shoot. This reads their own words (bio / services) and asks the
// LLM for a grid that matches their specialty — e.g. a wedding photographer gets
// wedding/engagement cards, each with a precise Pexels query. Any failure (no
// signal, bad JSON, LLM error) falls back to the fixed seeds, so the grid is
// never empty.
const WORKGRID_SYSTEM = `You plan the "selected work" grid for a photographer's portfolio site.

Given what the photographer says they do (their bio and/or service list), output a JSON array of 6 realistic past-work cards that match THEIR actual specialty — not a generic spread. If they only shoot weddings, every card is a wedding. If they do two things (e.g. weddings + newborns), weight toward the dominant one and let one or two cards cover the other. If their focus is unclear, cover the most likely shoot types for that kind of photographer.

Each card is an object:
- "title": a short, real-sounding project/client name (e.g. "Maya & Owen", "The Reyes Family", "Bloom Studio Launch"). No quotes inside.
- "role": the shoot type as a 1-2 word label (e.g. "Wedding", "Newborn", "Portrait", "Brand", "Event", "Maternity", "Product", "Food", "Real Estate").
- "year": "2023", "2024" or "2025".
- "description": one concrete sentence about the shoot.
- "imageQuery": 2-4 concrete keywords describing ONE photographable subject for a stock-photo search (nouns + adjectives, no abstract words, NO commas). Keep it short — long queries return no results. e.g. "outdoor wedding ceremony", "newborn baby studio", "maternity portrait", "restaurant food plating", "real estate interior". Never "photography business" or "professional".

Return ONLY the JSON array — no prose, no code fences.`;

function cleanWorkCard(card) {
  if (!card || typeof card !== 'object') return null;
  const title = String(card.title || '').trim().slice(0, 60);
  const role = String(card.role || '').trim().slice(0, 24) || 'Photography';
  if (!title) return null;
  const year = /^(20\d{2})$/.test(String(card.year || '').trim()) ? String(card.year).trim() : '2024';
  // Keep only the first clause and cap length — Pexels returns few/no results
  // for long multi-phrase queries, which would drop the card to a text placeholder.
  const imageQuery = String(card.imageQuery || '').split(/[,;]/)[0].trim().slice(0, 50);
  return {
    title,
    role,
    year,
    link: '',
    tools: [role],
    photoUrl: null,
    description: String(card.description || '').trim().slice(0, 160),
    imageQuery,
  };
}

/**
 * Build a specialty-matched work grid for a photographer with no uploaded work.
 * Falls back to the fixed seedPlaceholderProjects on any failure or weak signal.
 *
 * @param {object} opts
 * @param {string} opts.template   resolved sub-template id
 * @param {string} [opts.businessName]
 * @param {string} [opts.aboutText] the photographer's bio (their words)
 * @param {string[]} [opts.services]
 * @param {string} [opts.niche]
 * @param {string} [opts.userId]
 */
async function seedSpecialtyProjects(opts = {}) {
  const { template, businessName, aboutText, services, niche, userId } = opts;
  const fallback = () => seedPlaceholderProjects(template);
  // Only photographer grids are specialty-shaped today; other niches keep the
  // fixed seeds (their grids are project-based, not shoot-type-based).
  if (template !== 'photographer') return fallback();
  const signal = [
    aboutText,
    Array.isArray(services) && services.length ? `Services: ${services.join(', ')}` : '',
    niche && niche !== 'photographer' ? `Niche: ${niche}` : '',
  ].filter(Boolean).join('\n').trim();
  // No bio / services → nothing to tailor to; keep the generic spread (a true
  // generalist is better served by variety than by a guessed specialty).
  if (!signal) return fallback();

  try {
    const userPrompt = `Photographer: ${businessName || 'a photographer'}\n${signal}\n\nReturn the 6-card JSON array now.`;
    const resp = await generateResponse(
      WORKGRID_SYSTEM,
      [{ role: 'user', content: userPrompt }],
      { userId, operation: 'portfolio_workgrid' }
    );
    const jsonMatch = resp.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, resp];
    const parsed = JSON.parse(jsonMatch[1]);
    const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.cards) ? parsed.cards : []);
    const clean = arr.map(cleanWorkCard).filter(Boolean).slice(0, 6);
    if (clean.length >= 3) {
      logger.info(`[PORTFOLIO-IMG] LLM work grid: ${clean.length} specialty cards (${clean.map((c) => c.role).join(', ')})`);
      return clean;
    }
    logger.warn(`[PORTFOLIO-IMG] LLM work grid too thin (${clean.length} cards) — using fixed seeds`);
    return fallback();
  } catch (err) {
    logger.warn(`[PORTFOLIO-IMG] LLM work grid failed: ${err.message} — using fixed seeds`);
    return fallback();
  }
}

module.exports = { attachPortfolioImages, seedPlaceholderProjects, seedSpecialtyProjects, buildProjectQuery };
