/**
 * progressIndicator.js
 *
 * Short "Step N of M" markers so users know where they are in a flow.
 * Every collection handler can call `progressMarker(flow, data)` and
 * append the returned string to its outgoing prompt.
 *
 * Example output:
 *   "(step 3 of 5)"
 *   "(almost done — 1 more)"
 *   "" when there's no meaningful progress to report.
 */

'use strict';

const { FLOW_SPECS } = require('./entityAccumulator');

// Total required-field counts per flow. These mirror FLOW_SPECS in
// entityAccumulator.js but treat only the fields that actually gate the
// flow's progress. Optional fields aren't counted toward the denominator
// because the user doesn't "see" them as required steps.
function countFilled(flow, data) {
  const spec = FLOW_SPECS[flow];
  if (!spec || !data) return { filled: 0, total: 0 };
  let filled = 0;
  let total = 0;
  for (const m of spec.mappings) {
    if (!m.required) continue;
    total++;
    const v = data[m.local];
    const hasVal = Array.isArray(v) ? v.length > 0 : Boolean(v && String(v).length);
    if (hasVal) filled++;
  }
  return { filled, total };
}

/**
 * Return a short progress marker string for the given flow data.
 *
 * @param {'webdev'|'adgen'|'logo'|'chatbot'} flow
 * @param {object} data - flow-specific data (e.g. websiteData)
 * @returns {string} marker text, possibly empty
 */
function progressMarker(flow, data) {
  const { filled, total } = countFilled(flow, data);
  if (total === 0) return '';
  // Which step are we ABOUT to answer — i.e. current prompt is for step
  // (filled + 1).
  const step = Math.min(filled + 1, total);
  if (step > total) return ''; // all done
  if (step === total) return `_(last step)_`;
  const remaining = total - filled;
  if (remaining === 1) return `_(almost done — 1 more)_`;
  return `_(step ${step} of ${total})_`;
}

/**
 * Append a progress marker to a given message text, with a spacer.
 */
function withProgress(message, flow, data) {
  const marker = progressMarker(flow, data);
  if (!marker) return message;
  return `${message}\n\n${marker}`;
}

module.exports = {
  progressMarker,
  withProgress,
  countFilled,
};
