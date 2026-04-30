const { generateResponse } = require('../llm/provider');
const { logger } = require('../utils/logger');
const { isDelegation } = require('../config/smartDefaults');

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
  // Any delegation phrase (skip / default / whatever you think / you pick /
  // idk / up to you / etc.) maps to the standard salon hours default.
  if (isDelegation(input)) {
    return { hours: { ...DEFAULT_WEEKLY_HOURS }, usedDefault: true };
  }

  // Guard against non-answer inputs leaking past the intent classifier.
  // Pure punctuation ("?", "??", "...") and very-short tokens can't be
  // valid hours — fall back to the default rather than burning an LLM
  // call AND risking the model returning an all-empty schedule that
  // validates clean and silently writes "everything closed" to the site.
  if (input.length < 4 || /^[?!.,;\s]+$/.test(input)) {
    logger.warn(`[HOURS] Rejecting non-answer input, using default. Input: "${input.slice(0, 40)}"`);
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
    if (clean) {
      // An all-empty schedule means the LLM couldn't extract any time
      // information from the input (typical when the user sent something
      // off-topic or unparseable). Treat as a parse failure and fall back
      // to the default — claiming "Got it: every day closed" would be a
      // silent data-corruption bug.
      const allEmpty = DAYS.every((d) => clean[d].length === 0);
      if (allEmpty) {
        logger.warn(`[HOURS] LLM returned all-days-closed for input — likely a non-answer, using default. Input: "${input.slice(0, 80)}"`);
        return { hours: { ...DEFAULT_WEEKLY_HOURS }, usedDefault: true };
      }
      return { hours: clean, usedDefault: false };
    }
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
