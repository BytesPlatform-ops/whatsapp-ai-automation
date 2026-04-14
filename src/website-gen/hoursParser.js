const { generateResponse } = require('../llm/provider');
const { logger } = require('../utils/logger');

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Default: Tue-Sat 9-7, Sun-Mon closed. Used when the user skips or parsing fails.
const DEFAULT_WEEKLY_HOURS = {
  mon: [],
  tue: [{ open: '09:00', close: '19:00' }],
  wed: [{ open: '09:00', close: '19:00' }],
  thu: [{ open: '09:00', close: '19:00' }],
  fri: [{ open: '09:00', close: '19:00' }],
  sat: [{ open: '09:00', close: '19:00' }],
  sun: [],
};

function isHHMM(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/**
 * Validate the shape { mon:[{open,close}], ... }. Returns a cleaned copy or null.
 */
function validateHours(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const out = {};
  for (const d of DAYS) {
    const windows = obj[d];
    if (!Array.isArray(windows)) return null;
    const clean = [];
    for (const w of windows) {
      if (!w || !isHHMM(w.open) || !isHHMM(w.close)) return null;
      if (w.open >= w.close) return null;
      clean.push({ open: w.open, close: w.close });
    }
    out[d] = clean;
  }
  return out;
}

/**
 * Parse a free-text hours description into { mon:[{open,close}], ... }.
 * Returns { hours, usedDefault: boolean }.
 */
async function parseWeeklyHours(text) {
  const input = String(text || '').trim();
  if (!input || /^(skip|default|idk|dunno|not sure)$/i.test(input)) {
    return { hours: { ...DEFAULT_WEEKLY_HOURS }, usedDefault: true };
  }

  const systemPrompt =
    'You convert a salon\'s opening-hours description into strict JSON. Output ONLY the JSON object, no prose. ' +
    'Shape: {"mon":[{"open":"HH:MM","close":"HH:MM"}], ...} with keys mon,tue,wed,thu,fri,sat,sun. ' +
    'Use 24h HH:MM. If a day is closed, use an empty array. If split shifts (e.g. 9-12 and 14-18), include both windows. ' +
    'If the input is ambiguous or missing, omit nothing — infer a reasonable weekly schedule from the intent.';

  try {
    const response = await generateResponse(systemPrompt, [
      { role: 'user', content: input },
    ]);
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, response];
    const parsed = JSON.parse(jsonMatch[1]);
    const clean = validateHours(parsed);
    if (clean) return { hours: clean, usedDefault: false };
    logger.warn('[HOURS] Validation failed for LLM output, using default');
  } catch (err) {
    logger.warn(`[HOURS] Parse failed: ${err.message}`);
  }
  return { hours: { ...DEFAULT_WEEKLY_HOURS }, usedDefault: true };
}

function formatHoursForDisplay(hours) {
  const labels = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  return DAYS.map((d) => {
    const ws = hours[d] || [];
    if (ws.length === 0) return `${labels[d]}: Closed`;
    return `${labels[d]}: ${ws.map((w) => `${w.open}–${w.close}`).join(', ')}`;
  }).join('\n');
}

module.exports = { parseWeeklyHours, validateHours, formatHoursForDisplay, DEFAULT_WEEKLY_HOURS, DAYS };
