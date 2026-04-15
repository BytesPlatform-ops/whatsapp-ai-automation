// Template router — maps a business industry to the right template module.
//
// Each template module exports generateAllPages(config, { watermark }) that
// returns a map of { '/index.html': '<html>...', ... }.

const { generateHvacPages } = require('./hvac');
const { generateRealEstatePages } = require('./real-estate');

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

const REAL_ESTATE_KEYWORDS = [
  'real estate',
  'real-estate',
  'realestate',
  'realty',
  'realtor',
  'broker',
  // Word-bounded matches added below, but these substring lookups cover common phrases.
];

function isHvac(industry) {
  const s = String(industry || '').toLowerCase();
  return HVAC_KEYWORDS.some((k) => s.includes(k));
}

function isRealEstate(industry) {
  const s = String(industry || '').toLowerCase();
  if (REAL_ESTATE_KEYWORDS.some((k) => s.includes(k))) return true;
  // Word-bounded checks for ambiguous tokens (so "homepage builder" doesn't match)
  if (/\b(homes?|properties|property|mls|listings?)\b/.test(s) && /\b(sale|sell|buy|agent|listing)\b/.test(s)) return true;
  return false;
}

// Industries that need a city + service-areas collection step. HVAC needs it
// for emergency dispatch; real estate needs it for neighborhood pages.
function needsAreaCollection(industry) {
  return isHvac(industry) || isRealEstate(industry);
}

function pickTemplate(industry) {
  if (isHvac(industry)) return { id: 'hvac', generateAllPages: generateHvacPages };
  if (isRealEstate(industry)) return { id: 'real-estate', generateAllPages: generateRealEstatePages };
  return null; // caller falls back to the existing generic generator
}

module.exports = { pickTemplate, isHvac, isRealEstate, needsAreaCollection };
