// Template router — maps a business industry to the right template module.
//
// Each template module exports generateAllPages(config, { watermark }) that
// returns a map of { '/index.html': '<html>...', ... }.
//
// NOTE ON NAMING: the template id stays "hvac" for backward-compat (DB
// records, deployer branches, existing sites), but semantically this is
// the "local service contractor" template. It serves any trade whose
// business shape is emergency-first + click-to-call + service areas +
// LocalBusiness schema: HVAC, plumbers, electricians, handymen, roofers,
// locksmiths, pest control, garage-door techs, etc.

const { generateHvacPages } = require('./hvac');

// Keywords that trigger the local-service-contractor template ("hvac").
// Kept as a single flat list for simple substring matching; order doesn't
// matter. Add new trades here as they come up.
const HVAC_KEYWORDS = [
  // HVAC proper
  'hvac', 'heating', 'cooling', 'air conditioning',
  'ac repair', 'ac installation', 'furnace', 'heat pump', 'hvacr',
  // Plumbing + water / gas
  'plumber', 'plumbing', 'drain', 'pipe', 'sewer', 'sewage',
  'boiler', 'water heater', 'water line', 'gas line', 'rooter', 'septic',
  // Electrical
  'electrician', 'electrical', 'wiring',
  // Roofing / exterior
  'roofing', 'roofer', 'gutter',
  // Handyman / general contractors
  'handyman', 'contractor', 'general contractor',
  // Security / access
  'locksmith', 'garage door',
  // Pest / critters
  'pest control', 'exterminator', 'termite',
  // Appliance / cleaning / washing
  'appliance repair', 'carpet cleaning', 'cleaning service',
  'pressure washing', 'power washing',
  // Outdoor / landscape
  'landscaping', 'landscaper', 'lawn care', 'tree service',
  'fencing', 'paving', 'concrete',
  // Automotive roadside
  'towing',
];

function isHvac(industry) {
  const s = String(industry || '').toLowerCase();
  return HVAC_KEYWORDS.some((k) => s.includes(k));
}

// Semantic alias — prefer this name at new call sites. Internal template id
// stays 'hvac' to avoid churn across DB rows, deployer branches, and sites
// already deployed under that label.
const isHvacOrLocalService = isHvac;

function pickTemplate(industry) {
  if (isHvac(industry)) return { id: 'hvac', generateAllPages: generateHvacPages };
  return null; // caller falls back to the existing generic generator
}

module.exports = { pickTemplate, isHvac, isHvacOrLocalService, HVAC_KEYWORDS };
