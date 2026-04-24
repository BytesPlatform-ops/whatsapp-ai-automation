// Template router — maps a business industry to the right template module.
//
// Each template module exports generateAllPages(config, { watermark }) that
// returns a map of { '/index.html': '<html>...', ... }.

const { generateHvacPages } = require('./hvac');
const { generateRealEstatePages } = require('./real-estate');

// ── Trade detection ────────────────────────────────────────────────────────
// The HVAC template is used for ALL home-services businesses that share its
// shape: emergency dispatch, service areas, services list, phone-forward
// layout. Each trade below gets its own keyword list + word-bounded pattern
// so we can distinguish them inside the template and show trade-appropriate
// copy. isHvac() returns true for ANY of these trades; resolveTrade() names
// which one for the per-trade copy lookup.

// HVAC is the template default and lives separately because it's also the
// fallback when nothing else matches.
const HVAC_KEYWORDS = [
  'hvac', 'heating', 'cooling', 'air conditioning', 'air conditioner',
  'furnace', 'heat pump', 'hvacr', 'ventilation', 'hvac technician',
];
const HVAC_AC_PATTERN =
  /\bac\s+(?:repair|install|installation|service|servicing|services|maintenance|tech|technician|cleaning|fitting|fitment)\b/i;

// Shared verb list reused across trade patterns — keeps the regexes readable
// and the behavior consistent across trades.
const VERBS = '(?:repair|install|installation|service|servicing|services|replacement|replace|upgrade|upgrading|fix|fixing|cleaning|clean|detection|detect|removal|remove|trimming|trim|pruning|prune|rekey|rekeying|unclog|unclogging|extraction|extract|mitigation|mitigate|restoration|restore|treatment|treat|inspection|inspect|grinding|grind)';

function nounVerbPattern(nounList) {
  // Accepts both orderings (noun-first "leak repair" AND verb-first "fix
  // leaky pipes") with an optional adjective between verb and noun.
  return new RegExp(
    `\\b${nounList}\\s+${VERBS}\\b|\\b${VERBS}\\s+(?:\\w+\\s+)?${nounList}\\b`,
    'i'
  );
}

// Each trade: { id, keywords (substrings), pattern (word-bounded) }.
// Order matters — first match in resolveTrade() wins. Put the most
// specific / unambiguous trades first.
const TRADES = [
  {
    id: 'plumbing',
    keywords: ['plumbing', 'plumber', 'water heater', 're-pipe', 'repipe', 'drain cleaning', 'sewer line'],
    pattern: nounVerbPattern('(?:leak(?:y|s|ing|age)?|pipes?|drains?|toilets?|faucets?|sewers?|sump\\s*pumps?)'),
  },
  {
    id: 'electrical',
    keywords: ['electrician', 'electrical contractor', 'electrical contracting', 'electrical service', 'electrical work', 'electric contractor', 'panel upgrade', 'wiring service', 'ev charger', 'ev charging'],
    pattern: nounVerbPattern('(?:outlets?|circuits?|breakers?|wiring|(?:electrical|breaker)\\s+panels?|switches?|light\\s+fixtures?|rewires?|rewiring|generators?|ev\\s+chargers?)'),
  },
  {
    id: 'roofing',
    keywords: ['roofing', 'roofer', 'roof repair', 'roof installation', 'roof replacement', 're-roof', 'reroof', 'roof leak', 'roof inspection'],
    pattern: nounVerbPattern('(?:roofs?|shingles?|roof\\s+tiles?|gutters?|downspouts?|flashing)'),
  },
  {
    id: 'appliance',
    keywords: ['appliance repair', 'appliance service', 'appliance technician'],
    pattern: nounVerbPattern('(?:fridges?|refrigerators?|washers?|washing\\s+machines?|dryers?|dishwashers?|ovens?|ranges?|stoves?|microwaves?|freezers?|garbage\\s+disposals?)'),
  },
  {
    id: 'garage-door',
    keywords: ['garage door', 'garage-door', 'garage door opener', 'garage door spring'],
    pattern: /\bgarage\s+doors?\s+(?:repair|install|installation|service|servicing|replacement|replace|fix|fixing|opener|spring)\b/i,
  },
  {
    id: 'locksmith',
    keywords: ['locksmith', 'lockout service', 'rekey', 'rekeying', 'emergency lockout', 'lock change'],
    pattern: nounVerbPattern('(?:locks?|deadbolts?|door\\s+locks?|house\\s+keys?)'),
  },
  {
    id: 'pest-control',
    keywords: ['pest control', 'exterminator', 'exterminating', 'pest management', 'pest extermination', 'termite treatment', 'bed bug treatment'],
    pattern: /\b(?:rodent|mice|rats?|roach(?:es)?|cockroach(?:es)?|termites?|ants?|bees?|wasps?|hornets?|bedbugs?|bed\s+bugs?|spiders?|pests?|vermin)\s+(?:control|extermination|removal|treatment|inspection|infestation)\b/i,
  },
  {
    id: 'water-damage',
    keywords: ['water damage', 'flood restoration', 'flood cleanup', 'water restoration', 'mold remediation', 'mold removal', 'water extraction', 'water mitigation'],
    pattern: /\b(?:water|flood(?:ing)?|mold|sewage)\s+(?:damage|restoration|cleanup|extraction|remediation|removal|mitigation|drying|dry\s+out)\b/i,
  },
  {
    id: 'tree-service',
    keywords: ['tree service', 'tree removal', 'tree trimming', 'arborist', 'tree care', 'tree cutting', 'stump removal', 'stump grinding'],
    pattern: /\b(?:trees?\s+(?:removal|remove|trimming|trim|cutting|cut|service|pruning|prune|care)|stump\s+(?:removal|grinding|grind))\b/i,
  },
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
  if (HVAC_KEYWORDS.some((k) => s.includes(k))) return true;
  if (HVAC_AC_PATTERN.test(s)) return true;
  // Every other trade in TRADES folds into the HVAC bucket because they
  // share the template shape (emergency dispatch, service areas, services
  // list). The trade-specific copy branches inside the template — see
  // resolveTrade() below.
  for (const t of TRADES) {
    if (t.keywords.some((k) => s.includes(k))) return true;
    if (t.pattern.test(s)) return true;
  }
  return false;
}

// Inside the HVAC template, pick the wording variant. Returns the TRADES
// entry id for a match ('plumbing', 'electrical', 'roofing', etc.) or
// 'hvac' when nothing else matches. HVAC is the fallback so industries
// that look vaguely trades-y but don't match any specific trade still get
// reasonable copy.
function resolveTrade(industry) {
  const s = String(industry || '').toLowerCase();
  for (const t of TRADES) {
    if (t.keywords.some((k) => s.includes(k))) return t.id;
    if (t.pattern.test(s)) return t.id;
  }
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
