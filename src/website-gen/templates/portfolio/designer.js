// Pixie Portfolio — Designer Template
//
// Same engine as the General template, but with:
//   - Confident coral-red accent (#E63946) instead of warm tan
//   - Enriched case-study cards (Client / Role / Deliverables / Outcome /
//     Year meta grid when project data has those fields)
//   - Italic accent on the last word of every project title
//
// Designer audience expects more visual personality than the catch-all
// general template. The override surface is intentionally small — the
// editorial structure (typography, spacing, motion) stays identical.

const general = require('./general');

function generatePages(config) {
  return general.generatePages(config, {
    accent:                   '#E63946',
    accentHover:              '#C12B38',
    accentSoft:               '#FBE4E6',
    enrichedCaseStudy:        true,
    italicizeProjectTitle:    true,
  });
}

module.exports = { generatePages };
