// Pixie Portfolio — Template Router
//
// Industries flow into one of four templates based on keyword detection
// against the user's industry + services strings:
//
//   photographer  — wedding/portrait/event/family/commercial photographers
//   developer     — software engineers / web devs / freelance devs (checked
//                   BEFORE designer to handle "ux designer engineer" hybrids)
//   designer      — brand/UX/UI/graphic/visual/art-direction designers
//   general       — catch-all (writers, freelancers, illustrators, etc.)
//
// The user can also pick a NICHE explicitly (WhatsApp Flow dropdown or the
// chat niche question). When present that wins — selectTemplate honors
// config.portfolioTemplate / config.portfolioNiche before falling back to the
// keyword heuristic (which still serves the preview script + legacy callers
// that pass no niche).

const general      = require('./general');
const designer     = require('./designer');
const photographer = require('./photographer');
const developer    = require('./developer');

const VALID_TEMPLATES = ['photographer', 'developer', 'designer', 'general'];

// Niche id (from the Flow dropdown / chat classifier) → sub-template id.
// Keys cover the canonical ids plus common synonyms so a slightly different
// label still resolves deterministically.
const NICHE_TO_TEMPLATE = {
  photographer: 'photographer',
  photography: 'photographer',
  photo: 'photographer',
  videographer: 'photographer',
  filmmaker: 'photographer',
  designer: 'designer',
  design: 'designer',
  creative: 'designer',
  brand: 'designer',
  developer: 'developer',
  development: 'developer',
  engineer: 'developer',
  programmer: 'developer',
  writer: 'general',
  writing: 'general',
  copywriter: 'general',
  other: 'general',
  general: 'general',
};

// Map a user-chosen niche to one of the four sub-template ids, or null when
// it doesn't resolve (caller then falls back to keyword detection).
function resolvePortfolioTemplate(niche) {
  const key = String(niche || '').trim().toLowerCase();
  if (!key) return null;
  if (VALID_TEMPLATES.includes(key)) return key;
  return NICHE_TO_TEMPLATE[key] || null;
}

function selectTemplate(config) {
  // Explicit niche/template wins — set from the WhatsApp Flow dropdown or the
  // chat niche question.
  const explicit = (config.portfolioTemplate && VALID_TEMPLATES.includes(config.portfolioTemplate))
    ? config.portfolioTemplate
    : resolvePortfolioTemplate(config.portfolioNiche);
  if (explicit) return explicit;

  const industry = String(config.industry || '');
  const services = Array.isArray(config.services)
    ? config.services.map((s) => (typeof s === 'string' ? s : (s && (s.title || s.name)) || '')).join(' ')
    : '';
  const text = `${industry} ${services}`.toLowerCase();

  if (/photograph|\bphoto\b|wedding|portrait|videograph|filmmaker/.test(text)) return 'photographer';
  if (/develop|engineer|coder|programmer|backend|frontend|full.?stack|\bswe\b|\bsde\b|software/.test(text)) return 'developer';
  if (/design|brand|\bux\b|\bui\b|visual|art.?direct|creative.?direct|illustrat/.test(text)) return 'designer';
  return 'general';
}

function generatePortfolioPages(config) {
  const id = selectTemplate(config);
  switch (id) {
    case 'photographer': return photographer.generatePages(config);
    case 'developer':    return developer.generatePages(config);
    case 'designer':     return designer.generatePages(config);
    default:             return general.generatePages(config);
  }
}

module.exports = { generatePortfolioPages, selectTemplate, resolvePortfolioTemplate, NICHE_TO_TEMPLATE };
