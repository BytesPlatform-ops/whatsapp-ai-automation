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
// Detection mirrors the spec's selectTemplate() logic.

const general      = require('./general');
const designer     = require('./designer');
const photographer = require('./photographer');
const developer    = require('./developer');

function selectTemplate(config) {
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

module.exports = { generatePortfolioPages, selectTemplate };
