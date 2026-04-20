// Template router — maps a business industry to the right template module.
//
// Each template module exports generateAllPages(config, { watermark }) that
// returns a map of { '/index.html': '<html>...', ... }.

const { generateHvacPages } = require('./hvac');
const { generateRealEstatePages } = require('./real-estate');

// Substring matches for unambiguous HVAC terms (safe to use `.includes`).
const HVAC_KEYWORDS = [
  'hvac',
  'heating',
  'cooling',
  'air conditioning',
  'air conditioner',
  'furnace',
  'heat pump',
  'hvacr',
  'ventilation',
  'hvac technician',
];

// Word-bounded patterns for AC-anything so "accounting" / "academic" etc.
// never match but "AC service", "AC maintenance", "AC tech", "AC install",
// "AC cleaning" all do. Matches are case-insensitive.
const HVAC_AC_PATTERN =
  /\bac\s+(?:repair|install|installation|service|servicing|services|maintenance|tech|technician|cleaning|fitting|fitment)\b/i;

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
  if (HVAC_KEYWORDS.some((k) => s.includes(k))) return true;
  return HVAC_AC_PATTERN.test(s);
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
