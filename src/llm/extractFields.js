const OpenAI = require('openai');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { costOf } = require('./pricing');
const { recordUsage } = require('../db/llmUsage');

// Same model as classifyIntent — cheap, fast, plenty for structured field
// extraction from short WhatsApp messages.
const MODEL = 'gpt-5-nano';

// Mirrors classifyIntent: a single inbound message often runs multiple
// extraction passes against the same text. LRU cache keyed on text + schema
// shape lets duplicate calls reuse the first answer.
const CACHE_MAX = 500;
const cache = new Map();
function cacheKey(text, schema, contextHash) {
  const keys = Object.keys(schema).sort().join('|');
  return `${contextHash}::${keys}::${text}`;
}
function cacheGet(key) {
  if (!cache.has(key)) return null;
  const v = cache.get(key);
  cache.delete(key);
  cache.set(key, v);
  return v;
}
function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, value);
}

let client = null;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: env.llm.openaiApiKey });
  return client;
}

// Coerce one raw value off a JSON response into the schema-declared type.
// Returns undefined if coercion fails — caller drops undefined fields so the
// final result map only contains successful extractions.
function coerce(value, type) {
  if (value == null) return undefined;
  switch (type) {
    case 'string': {
      if (typeof value !== 'string') return undefined;
      const t = value.trim();
      return t.length ? t : undefined;
    }
    case 'integer': {
      const n = typeof value === 'number' ? value : parseFloat(value);
      if (!Number.isFinite(n)) return undefined;
      return Math.round(n);
    }
    case 'number': {
      const n = typeof value === 'number' ? value : parseFloat(value);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return /^(true|yes|y|1)$/i.test(value.trim());
      return !!value;
    }
    case 'array': {
      if (Array.isArray(value)) return value;
      return undefined;
    }
    default:
      return value;
  }
}

/**
 * Extract structured fields from free-form text using an LLM.
 *
 * @param {string} text - Text to extract from (typically a user reply).
 * @param {Object<string, Object>} schema - Map of field name → spec:
 *   {
 *     type: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'enum',
 *     description: 'plain-English description with examples',
 *     values?: string[]   // required for type 'enum'
 *   }
 *   The description is what the LLM sees — be specific (include example
 *   transformations like '"$525k" → 525000') because that's what drives
 *   accuracy.
 * @param {Object} [opts]
 * @param {string} [opts.context] - Short preceding-turn context for
 *   disambiguation (e.g. the bot's last question).
 * @param {string} [opts.userId] - For usage logging.
 * @param {string} [opts.operation] - Tag for usage analytics
 *   ('webdev_listing_extract', etc.).
 * @returns {Promise<Object>} - Map of field name → coerced value. Fields the
 *   LLM couldn't extract (or returned null for) are omitted, so callers can
 *   safely do `if (out.price)` without first checking for null. On any
 *   failure (timeout, non-JSON response, OpenAI error) returns `{}`.
 */
async function extractFields(text, schema, opts = {}) {
  const fieldKeys = Object.keys(schema || {});
  const safeText = String(text || '').trim();

  if (!safeText || !fieldKeys.length) return {};

  const contextHash = opts.context ? String(opts.context).slice(0, 200) : '';
  const key = cacheKey(safeText, schema, contextHash);
  const cached = cacheGet(key);
  if (cached) {
    logger.info('[EXTRACT]', {
      operation: opts.operation || 'extract_fields',
      userId: opts.userId,
      result: cached,
      extracted: Object.keys(cached),
      textPreview: safeText.slice(0, 120),
      textLen: safeText.length,
      durationMs: 0,
      cached: true,
    });
    return cached;
  }

  // Build the field list for the prompt. Each line spells out type and any
  // enum constraint so the model doesn't have to infer the contract from
  // the description alone.
  const fieldList = fieldKeys
    .map((k) => {
      const spec = schema[k] || {};
      const type = spec.type || 'string';
      const enumPart = type === 'enum' && Array.isArray(spec.values)
        ? ` (one of: ${spec.values.map((v) => `"${v}"`).join(', ')})`
        : '';
      return `- "${k}" (${type}${enumPart}): ${spec.description || ''}`;
    })
    .join('\n');

  const systemPrompt = `You are a structured-data extractor. You receive a piece of text and a list of named fields. For each field, extract the value if you can confidently identify it. Return ONLY a JSON object mapping field name → value. No prose, no explanation.

Rules:
- Only include a field if you can extract it confidently. NEVER guess. If unsure, omit the field (or set it to null).
- Be liberal about phrasing, slang, typos, and mixed languages (Roman Urdu, Spanglish, etc.). Match by meaning, not exact keywords.
- Respect the declared type. integer/number must be numeric (not a string). enum values must match exactly one of the allowed values.
- Apply the example transformations in field descriptions (e.g. "$525k → 525000").

Output format: a JSON object with some or all of these keys:
${fieldKeys.map((k) => `  "${k}"`).join(',\n')}`;

  const userPrompt = opts.context
    ? `Fields to extract:\n${fieldList}\n\nContext (preceding turn):\n${opts.context}\n\nText to extract from:\n${safeText}`
    : `Fields to extract:\n${fieldList}\n\nText to extract from:\n${safeText}`;

  const start = Date.now();
  try {
    const openai = getClient();
    const response = await Promise.race([
      openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: 512,
        reasoning_effort: 'minimal',
        response_format: { type: 'json_object' },
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('extract-fields timeout')), 8000)
      ),
    ]);

    const raw = response.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      logger.warn(`[extractFields] non-JSON response, returning empty: ${raw.slice(0, 100)}`);
      cacheSet(key, {});
      return {};
    }

    // Coerce each requested field. Drop anything that fails type coercion or
    // (for enums) doesn't match the allowed values. The result map only
    // contains keys the LLM successfully extracted.
    const result = {};
    for (const k of fieldKeys) {
      const spec = schema[k] || {};
      const type = spec.type || 'string';
      if (type === 'enum') {
        const v = parsed[k];
        if (typeof v !== 'string') continue;
        const trimmed = v.trim();
        const allowed = Array.isArray(spec.values) ? spec.values : [];
        const hit = allowed.find((a) => a.toLowerCase() === trimmed.toLowerCase());
        if (hit) result[k] = hit;
        continue;
      }
      const coerced = coerce(parsed[k], type);
      if (coerced !== undefined) result[k] = coerced;
    }

    const promptTokens = response.usage?.prompt_tokens || 0;
    const cachedInputTokens = response.usage?.prompt_tokens_details?.cached_tokens || 0;
    const durationMs = Date.now() - start;
    recordUsage({
      userId: opts.userId,
      operation: opts.operation || 'extract_fields',
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
        cachedInputTokens,
        0
      ),
      durationMs,
    });

    // Structured decision log mirroring [INTENT] in classifyIntent — one
    // line per extraction so the on-call can grep "what did we pull out of
    // this message?". `extracted` is the list of field keys actually
    // returned; `result` has the values.
    logger.info('[EXTRACT]', {
      operation: opts.operation || 'extract_fields',
      userId: opts.userId,
      result,
      extracted: Object.keys(result),
      textPreview: safeText.slice(0, 120),
      textLen: safeText.length,
      durationMs,
      cached: false,
    });

    cacheSet(key, result);
    return result;
  } catch (err) {
    logger.warn(`[extractFields] failed (op=${opts.operation || 'extract_fields'}): ${err.message}`);
    return {};
  }
}

module.exports = { extractFields };
