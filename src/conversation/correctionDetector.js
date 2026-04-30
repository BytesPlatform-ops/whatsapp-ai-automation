// Cross-state correction detector.
//
// Catches mid-flow corrections like "wait, the email is X" or "actually
// the business name is Y" while the user is on a different question
// (e.g. SALON_HOURS). Without this, every collection handler fed the
// correction text into its own extractor and either failed silently or
// corrupted data.
//
// Runs as one gpt-5.4-nano call gated to text-only turns in collection
// states. Started in parallel with the abuse + intent classifiers in
// router.js so the latency cost is bounded by max(three) instead of
// summed sequentially.

const OpenAI = require('openai');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { recordUsage } = require('../db/llmUsage');
const { costOf } = require('../llm/pricing');

let client = null;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: env.llm.openaiApiKey });
  return client;
}

const MODEL = 'gpt-5.4-nano';

// Fields the detector is allowed to return. Each maps to a human label
// used in the prompt. Only "scalar / list" fields are correctable here —
// complex fields (weeklyHours, salonServices, bookingMode) need their
// own parsing path and are intentionally excluded so we don't corrupt
// structured data with raw text.
const CORRECTABLE_FIELDS = {
  businessName: 'business name',
  industry: 'industry / niche',
  contactEmail: 'email address',
  contactPhone: 'phone number',
  contactAddress: 'physical / mailing address',
  primaryCity: 'primary city',
  services: 'services list',
  serviceAreas: 'service areas / neighborhoods',
};

// State -> fields the active handler is currently asking the user to
// answer. The detector MUST return null for these so the regular handler
// gets the user's reply through its own (more careful) parser.
const ACTIVE_FIELDS_BY_STATE = {
  WEB_COLLECT_NAME: ['businessName'],
  WEB_COLLECT_EMAIL: ['contactEmail'],
  WEB_COLLECT_INDUSTRY: ['industry'],
  WEB_COLLECT_AREAS: ['primaryCity', 'serviceAreas'],
  WEB_COLLECT_SERVICES: ['services'],
  WEB_COLLECT_CONTACT: ['contactEmail', 'contactPhone', 'contactAddress'],
};

const FIELD_NAMES = Object.keys(CORRECTABLE_FIELDS);

/**
 * @param {{text: string, currentState: string, websiteData: object, userId?: string}} args
 * @returns {Promise<{field: string, value: string} | null>}
 */
async function detectCorrection({ text, currentState, websiteData, userId }) {
  const t = String(text || '').trim();
  // Bare confirmations / single tokens can't carry a correction. Skip
  // the LLM call entirely on those.
  if (t.length < 8) return null;

  const activeFields = ACTIVE_FIELDS_BY_STATE[currentState] || [];

  const knownLines = Object.entries(websiteData || {})
    .filter(([k, v]) => v != null && v !== '' && FIELD_NAMES.includes(k))
    .map(([k, v]) => {
      const display = Array.isArray(v) ? v.join(', ') : String(v);
      return `  - ${k}: ${display.slice(0, 80)}`;
    })
    .join('\n');

  const fieldList = FIELD_NAMES.map((f) => `  - ${f} (${CORRECTABLE_FIELDS[f]})`).join('\n');

  const activeBlock = activeFields.length
    ? `Currently being asked about (DO NOT return these — the regular handler is responsible): ${activeFields.join(', ')}`
    : `No specific field is being asked right now.`;

  const knownBlock = knownLines
    ? `Fields already collected:\n${knownLines}`
    : `No fields have been collected yet.`;

  const systemPrompt = `You decide whether a user's WhatsApp message is CORRECTING a previously-answered field about their business website, vs. just answering the current question or making smalltalk.

Allowed field names you may return:
${fieldList}

${activeBlock}

${knownBlock}

Rules:
- Return {"field": "<name>", "op": "replace|add|remove", "value": "<new value or items to add/remove>"} ONLY when the user is clearly correcting / updating a field they answered earlier. The user's intent across languages is what matters; read the meaning, not just keywords.
- "op" semantics:
  - "replace" (DEFAULT): user is overwriting the existing value with a new one. Use this for scalar fields (businessName / industry / contactEmail / contactPhone / contactAddress / primaryCity) and for list fields when the user is supplying a complete new list.
  - "add": ONLY for list fields (services / serviceAreas), when the user is APPENDING to the existing list. Phrasings like "add X", "we also do Y", "include Z too", "X is also part of what we offer". Return ONLY the new items in "value" (comma-separated) — do not include the existing items.
  - "remove": ONLY for list fields (services / serviceAreas), when the user is REMOVING items from the existing list. Phrasings like "remove X", "drop Y", "we don't do Z anymore", "take W off", "scrap V". Return ONLY the items to remove in "value" (comma-separated) — and ONLY items that ACTUALLY exist in the current list shown above (case-insensitive match). If the user names something not in the list, return {"field": null, ...}.
- If the corrected field is in the "Currently being asked about" list above, return {"field": null, "op": null, "value": null} — the regular handler will pick it up.
- If the user is just answering the current question (even with phrases like "actually" or "wait"), return {"field": null, "op": null, "value": null}.
- If the message is a question, smalltalk, off-topic, or ambiguous, return {"field": null, "op": null, "value": null}.
- For services / serviceAreas, return the comma-separated raw text in "value" — the caller will split & normalize.
- Never invent field names. Never return any field outside the allowed list above.

Output ONLY valid JSON: {"field": "...", "op": "...", "value": "..."} or {"field": null, "op": null, "value": null}`;

  const start = Date.now();
  try {
    const openai = getClient();
    const response = await Promise.race([
      openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: t },
        ],
        max_completion_tokens: 150,
        reasoning_effort: 'none',
        response_format: { type: 'json_object' },
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('correction-detect timeout')), 6000)
      ),
    ]);

    const raw = response.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      logger.warn(`[CORRECTION] non-JSON response: ${raw.slice(0, 100)}`);
      return null;
    }

    const promptTokens = response.usage?.prompt_tokens || 0;
    const cachedInputTokens = response.usage?.prompt_tokens_details?.cached_tokens || 0;
    recordUsage({
      userId,
      operation: 'correction_detect',
      provider: 'openai',
      model: MODEL,
      inputTokens: Math.max(0, promptTokens - cachedInputTokens),
      outputTokens: response.usage?.completion_tokens || 0,
      cachedInputTokens,
      cacheWriteTokens: 0,
      costUsd: costOf(
        MODEL,
        Math.max(0, promptTokens - cachedInputTokens),
        response.usage?.completion_tokens || 0,
        cachedInputTokens
      ),
      durationMs: Date.now() - start,
    });

    if (!parsed.field || !FIELD_NAMES.includes(parsed.field)) return null;
    if (activeFields.includes(parsed.field)) return null;
    if (parsed.value == null || String(parsed.value).trim() === '') return null;

    // Validate op. Default to 'replace' (preserves prior behavior for
    // scalar fields). 'add' / 'remove' are only meaningful for list
    // fields — collapse to 'replace' on scalars so callers don't have to
    // re-check.
    const opRaw = String(parsed.op || 'replace').toLowerCase().trim();
    const isList = parsed.field === 'services' || parsed.field === 'serviceAreas';
    const op = isList && (opRaw === 'add' || opRaw === 'remove') ? opRaw : 'replace';

    return { field: parsed.field, op, value: String(parsed.value).trim() };
  } catch (err) {
    logger.warn(`[CORRECTION] detect failed: ${err.message}`);
    return null;
  }
}

module.exports = { detectCorrection, CORRECTABLE_FIELDS };
