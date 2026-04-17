/**
 * entityAccumulator.js
 *
 * Central module for the "parameter-chain" pattern from plan.txt 3.1.
 * Sits between messageAnalyzer and the per-flow collection handlers:
 *
 *   1. `hydrateMetadata(user, analysis)` — invoked by the router right
 *      after the analyzer returns. Persists any extracted entities
 *      (business_name, industry, email, phone, services, colors,
 *      location, url) onto user.metadata.extracted* so subsequent
 *      handlers can skip steps whose field already has a value.
 *      First mention wins — we never overwrite an existing value,
 *      because the earliest statement is usually the most accurate.
 *
 *   2. `fillFromMetadata(flow, user)` — seeds the flow-specific data
 *      object (websiteData / adData / logoData / chatbotData) from the
 *      extracted* fields. Handlers call this on entry to auto-fill
 *      anything the user already told us.
 *
 *   3. `nextMissingField(flow, data)` — returns the name of the next
 *      missing *required* field for that flow, or `null` when the data
 *      is complete. Handlers use this to fast-forward past steps.
 *
 * Flows supported: 'webdev', 'adgen', 'logo', 'chatbot'.
 *
 * Design notes:
 * - Entity keys are the analyzer's schema (`business_name`, `industry`,
 *   …). Metadata keys are PascalCase-prefixed (`extractedBusinessName`)
 *   — we map between the two here so no handler needs to know.
 * - We never write empty strings — a field is either populated (truthy
 *   string / non-empty array) or absent.
 * - `hydrateMetadata` is idempotent. Safe to re-invoke.
 */

'use strict';

const { updateUserMetadata } = require('../db/users');
const { logger } = require('../utils/logger');

// ── Entity → extracted* meta-key mapping ─────────────────────────────
const ENTITY_TO_META = Object.freeze({
  business_name: 'extractedBusinessName',
  industry:      'extractedIndustry',
  email:         'extractedEmail',
  phone:         'extractedPhone',
  services:      'extractedServices',
  colors:        'extractedColors',
  location:      'extractedLocation',
  url:           'extractedUrl',
});

// ── Per-flow field spec ──────────────────────────────────────────────
// Each flow declares which extracted* meta keys it consumes and which
// local-data keys they map to. `required` lists the fields that MUST
// be collected before the flow can proceed; anything else is optional
// (covered by smartDefaults where applicable).
const FLOW_SPECS = Object.freeze({
  webdev: {
    dataKey: 'websiteData',
    mappings: [
      { meta: 'extractedBusinessName', local: 'businessName', required: true },
      { meta: 'extractedIndustry',     local: 'industry',     required: true },
      { meta: 'extractedServices',     local: 'services',     required: true, array: true },
      { meta: 'extractedEmail',        local: 'contactEmail', required: false },
      { meta: 'extractedPhone',        local: 'contactPhone', required: false },
      { meta: 'extractedLocation',     local: 'contactAddress', required: false },
      { meta: 'extractedColors',       local: 'colors',       required: false },
    ],
  },
  adgen: {
    dataKey: 'adData',
    mappings: [
      { meta: 'extractedBusinessName', local: 'businessName', required: true },
      { meta: 'extractedIndustry',     local: 'industry',     required: true },
      { meta: 'extractedColors',       local: 'brandColors',  required: false },
    ],
  },
  logo: {
    dataKey: 'logoData',
    mappings: [
      { meta: 'extractedBusinessName', local: 'businessName', required: true },
      { meta: 'extractedIndustry',     local: 'industry',     required: true },
      { meta: 'extractedColors',       local: 'brandColors',  required: false },
    ],
  },
  chatbot: {
    dataKey: 'chatbotData',
    mappings: [
      { meta: 'extractedBusinessName', local: 'businessName', required: true },
      { meta: 'extractedIndustry',     local: 'industry',     required: true },
      { meta: 'extractedServices',     local: 'services',     required: false, array: true },
      { meta: 'extractedLocation',     local: 'location',     required: false },
    ],
  },
});

/**
 * Coerce an entity value into the canonical shape expected by downstream
 * handlers. Strings get trimmed; services stays a string (flow handlers
 * choose when to split on commas) so we don't guess split semantics.
 */
function normaliseValue(v) {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}

/**
 * Persist any newly-extracted entities on to `user.metadata.extracted*`.
 * Never overwrites a previously-populated value — first mention wins.
 *
 * @param {object} user - User record (mutated in-place)
 * @param {object} analysis - messageAnalyzer result
 * @returns {Promise<object>} the updates that were written (possibly empty)
 */
async function hydrateMetadata(user, analysis) {
  if (!analysis || typeof analysis !== 'object') return {};
  const entities = analysis.entities || {};
  const meta = user.metadata || {};

  const updates = {};
  for (const [entityKey, metaKey] of Object.entries(ENTITY_TO_META)) {
    const raw = entities[entityKey];
    const v = normaliseValue(raw);
    if (!v) continue;
    if (meta[metaKey]) continue; // first-mention-wins, don't overwrite
    updates[metaKey] = v;
  }

  if (Object.keys(updates).length === 0) return {};

  await updateUserMetadata(user.id, updates);
  user.metadata = { ...(user.metadata || {}), ...updates };

  // Per-field info log so audits can grep for specific captures.
  for (const [field, value] of Object.entries(updates)) {
    logger.info(`[ACCUMULATOR] ${user.phone_number} stored ${field}="${value}"`);
  }
  return updates;
}

/**
 * Seed a flow-specific data object with anything already in metadata.extracted*.
 * Returns the merged data — handlers should save it back to
 * user.metadata[spec.dataKey] themselves so they control write cadence.
 *
 * @param {'webdev'|'adgen'|'logo'|'chatbot'} flow
 * @param {object} user
 * @returns {{ data: object, filled: string[] }} data is the seeded object;
 *   filled is the list of local field names we just populated (useful
 *   for acks like "Got your services as X" and for logging).
 */
function fillFromMetadata(flow, user) {
  const spec = FLOW_SPECS[flow];
  if (!spec) throw new Error(`entityAccumulator: unknown flow "${flow}"`);

  const meta = user.metadata || {};
  const existing = meta[spec.dataKey] || {};
  const data = { ...existing };
  const filled = [];

  for (const m of spec.mappings) {
    const metaVal = meta[m.meta];
    if (!metaVal) continue;

    // Respect existing non-empty values in the flow-specific data.
    const cur = data[m.local];
    const curNonEmpty =
      Array.isArray(cur) ? cur.length > 0 : Boolean(cur && String(cur).length);
    if (curNonEmpty) continue;

    if (m.array) {
      // Comma / semicolon split — matches the analyzer's services schema.
      const parts = String(metaVal)
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length === 0) continue;
      data[m.local] = parts;
    } else {
      data[m.local] = metaVal;
    }
    filled.push(m.local);
  }

  return { data, filled };
}

/**
 * Return the first required field that is still missing in the given
 * flow data. Returns null when every required field has a value.
 *
 * @param {'webdev'|'adgen'|'logo'|'chatbot'} flow
 * @param {object} data
 * @returns {string|null}
 */
function nextMissingField(flow, data) {
  const spec = FLOW_SPECS[flow];
  if (!spec) throw new Error(`entityAccumulator: unknown flow "${flow}"`);
  const d = data || {};
  for (const m of spec.mappings) {
    if (!m.required) continue;
    const v = d[m.local];
    const hasVal = Array.isArray(v) ? v.length > 0 : Boolean(v && String(v).length);
    if (!hasVal) return m.local;
  }
  return null;
}

module.exports = {
  hydrateMetadata,
  fillFromMetadata,
  nextMissingField,
  ENTITY_TO_META,
  FLOW_SPECS,
};
