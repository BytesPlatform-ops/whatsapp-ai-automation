const { generateResponse } = require('../llm/provider');
const { logger } = require('../utils/logger');

// Common country/city hints → IANA tz. Kept small on purpose — LLM handles the rest.
const QUICK_TZ = [
  [/ireland|dublin|cork|galway/i, 'Europe/Dublin'],
  [/united kingdom|\buk\b|london|manchester|birmingham|glasgow/i, 'Europe/London'],
  [/france|paris/i, 'Europe/Paris'],
  [/spain|madrid|barcelona/i, 'Europe/Madrid'],
  [/germany|berlin|munich/i, 'Europe/Berlin'],
  [/italy|rome|milan/i, 'Europe/Rome'],
  [/netherlands|amsterdam/i, 'Europe/Amsterdam'],
  [/pakistan|karachi|lahore|islamabad/i, 'Asia/Karachi'],
  [/india|mumbai|delhi|bangalore|chennai/i, 'Asia/Kolkata'],
  [/uae|dubai|abu dhabi/i, 'Asia/Dubai'],
  [/\bny\b|new york|nyc|boston|philadelphia|miami|atlanta/i, 'America/New_York'],
  [/chicago|dallas|houston|minneapolis/i, 'America/Chicago'],
  [/denver|phoenix|salt lake/i, 'America/Denver'],
  [/los angeles|\bla\b|san francisco|seattle|portland/i, 'America/Los_Angeles'],
  [/toronto|ottawa/i, 'America/Toronto'],
  [/vancouver/i, 'America/Vancouver'],
  [/sydney|melbourne|brisbane/i, 'Australia/Sydney'],
  [/singapore/i, 'Asia/Singapore'],
  [/tokyo|japan/i, 'Asia/Tokyo'],
];

function isValidTz(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Infer an IANA timezone from a free-text address.
 * 1) Try a quick regex table (no network).
 * 2) Fall back to LLM asking for an IANA tz only.
 * 3) Default to 'Europe/Dublin' (the primary market per existing code).
 */
async function inferTimezoneFromAddress(address) {
  const text = String(address || '').trim();
  if (!text) return 'Europe/Dublin';

  for (const [re, tz] of QUICK_TZ) {
    if (re.test(text)) return tz;
  }

  try {
    const response = await generateResponse(
      'You return a single IANA timezone identifier and nothing else. No prose, no code blocks.',
      [{ role: 'user', content: `Address: ${text}\nReturn the IANA timezone (e.g. Europe/Dublin).` }]
    );
    const candidate = String(response || '').trim().split(/\s/)[0];
    if (isValidTz(candidate)) return candidate;
    logger.warn(`[TZ] LLM returned invalid tz "${candidate}" for address "${text}"`);
  } catch (err) {
    logger.warn(`[TZ] LLM tz inference failed: ${err.message}`);
  }
  return 'Europe/Dublin';
}

module.exports = { inferTimezoneFromAddress, isValidTz };
