// Template router — maps a business industry to the right template module.
//
// Each template module exports generateAllPages(config, { watermark }) that
// returns a map of { '/index.html': '<html>...', ... }.

const { generateHvacPages } = require('./hvac');

const HVAC_KEYWORDS = [
  'hvac',
  'heating',
  'cooling',
  'air conditioning',
  'ac repair',
  'ac installation',
  'furnace',
  'heat pump',
  'hvacr',
];

function isHvac(industry) {
  const s = String(industry || '').toLowerCase();
  return HVAC_KEYWORDS.some((k) => s.includes(k));
}

function pickTemplate(industry) {
  if (isHvac(industry)) return { id: 'hvac', generateAllPages: generateHvacPages };
  return null; // caller falls back to the existing generic generator
}

module.exports = { pickTemplate, isHvac };
