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

// Plumbing substring matches. Plumbing shares the HVAC template (same
// shape: trades business, emergency dispatch, service areas) so isHvac()
// returns true for both — the template then calls resolveTrade() to know
// whether to say "plumbing" or "HVAC" in page copy. Keep this list
// conservative; ambiguous single words live in PLUMBING_PATTERN below.
const PLUMBING_KEYWORDS = [
  'plumbing',
  'plumber',
  'water heater',
  're-pipe',
  'repipe',
  'drain cleaning',
  'sewer line',
];

// Word-bounded patterns for AC-anything so "accounting" / "academic" etc.
// never match but "AC service", "AC maintenance", "AC tech", "AC install",
// "AC cleaning" all do. Matches are case-insensitive.
const HVAC_AC_PATTERN =
  /\bac\s+(?:repair|install|installation|service|servicing|services|maintenance|tech|technician|cleaning|fitting|fitment)\b/i;

// Plumbing service phrases. We accept both orderings:
//   noun-first: "leak repair", "pipe install", "drain cleaning"
//   verb-first: "fix leaky pipes", "clean drains", "repair toilets"
// The noun list covers singular and plural + -y/-ing forms ("leaky", "leaking").
// Word boundaries on both sides keep "pipeline", "drainage", "accounting"
// etc. from matching.
const PLUMBING_NOUN = '(?:leak(?:y|s|ing|age)?|pipes?|drains?|toilets?|faucets?|sewers?|sump\\s*pumps?)';
const PLUMBING_VERB = '(?:repair|install|installation|service|servicing|services|replacement|replace|fix|fixing|cleaning|detection|unclog|unclogging|clean|detect)';
const PLUMBING_PATTERN = new RegExp(
  // noun first, optionally followed by &/and + another noun ("leaks and drains")
  `\\b${PLUMBING_NOUN}\\s+${PLUMBING_VERB}\\b|` +
  // verb first, optionally an adjective between ("fix leaky pipes")
  `\\b${PLUMBING_VERB}\\s+(?:\\w+\\s+)?${PLUMBING_NOUN}\\b`,
  'i'
);

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
  if (HVAC_AC_PATTERN.test(s)) return true;
  // Plumbing folds into the HVAC bucket because both use the same template
  // (trades, emergency dispatch, service areas). The trade-specific copy
  // branches inside the template — see resolveTrade() below.
  if (PLUMBING_KEYWORDS.some((k) => s.includes(k))) return true;
  if (PLUMBING_PATTERN.test(s)) return true;
  return false;
}

// Inside the HVAC template, decide which wording variant to use: 'hvac'
// (default — heating/cooling copy) or 'plumbing' (leaks, drains, water
// heaters). Any industry that isHvac() but doesn't look like plumbing
// falls through to 'hvac'.
function resolveTrade(industry) {
  const s = String(industry || '').toLowerCase();
  if (PLUMBING_KEYWORDS.some((k) => s.includes(k))) return 'plumbing';
  if (PLUMBING_PATTERN.test(s)) return 'plumbing';
  return 'hvac';
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

module.exports = { pickTemplate, isHvac, isRealEstate, needsAreaCollection, resolveTrade };
