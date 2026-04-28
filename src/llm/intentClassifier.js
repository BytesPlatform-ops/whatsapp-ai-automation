const OpenAI = require('openai');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { costOf } = require('./pricing');
const { recordUsage } = require('../db/llmUsage');

// gpt-5-nano is the cheapest tier ($0.05 / $0.40 per M tokens) and is
// plenty for boolean-only intent classification. Using a heavier model
// here would burn budget for no accuracy gain.
const MODEL = 'gpt-5-nano';

// Intent checks fire in tight clusters (a single inbound WhatsApp message
// often runs 5+ checks against the same `text`). Caching by text +
// sorted-intent-keys lets duplicate checks within the same handler
// invocation reuse the first answer instead of round-tripping again.
const CACHE_MAX = 500;
const cache = new Map();
function cacheKey(text, intents, contextHash) {
  const keys = Object.keys(intents).sort().join('|');
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

/**
 * Classify a piece of text against a set of named yes/no intents.
 *
 * @param {string} text - Text to classify (a user reply, an LLM response, or
 *   a stitched-together conversation snippet).
 * @param {Object<string, string>} intents - Map of intent name → plain-English
 *   definition. The model returns one boolean per key. Definitions should be
 *   precise: "User is agreeing or saying yes" beats "yes intent".
 * @param {Object} [opts]
 * @param {string} [opts.context] - Optional extra context (e.g. the previous
 *   bot message) to help disambiguate. Kept short — this is not full history.
 * @param {string} [opts.userId] - For usage logging.
 * @param {string} [opts.operation] - Tag for usage analytics ('sales_user_intent', etc.).
 * @param {Object<string, boolean>} [opts.fallback] - Returned if the call
 *   fails. Default: every intent → false (safe fail-closed for opt-outs etc.).
 * @returns {Promise<Object<string, boolean>>}
 */
async function classifyIntent(text, intents, opts = {}) {
  const intentKeys = Object.keys(intents || {});
  const safeText = String(text || '').trim();

  // Empty / no-intents → trivially false. Saves a call when the regex
  // we're replacing was guarded by `if (text)` at the call site.
  if (!safeText || !intentKeys.length) {
    return Object.fromEntries(intentKeys.map((k) => [k, false]));
  }

  const fallback = opts.fallback || Object.fromEntries(intentKeys.map((k) => [k, false]));
  const contextHash = opts.context ? String(opts.context).slice(0, 200) : '';
  const key = cacheKey(safeText, intents, contextHash);
  const cached = cacheGet(key);
  if (cached) return cached;

  const intentList = intentKeys
    .map((k) => `- "${k}": ${intents[k]}`)
    .join('\n');

  const systemPrompt = `You are an intent classifier. You receive a piece of text and a list of named intents. For each intent, decide whether it applies to the text. Return ONLY a JSON object mapping intent name → boolean. No prose, no explanation.

Rules:
- Be liberal about phrasing: "sounds great", "let's do it", "I'm in", "go ahead" all count as agreement. Don't require exact words.
- Match by meaning, not keywords. Slight typos, slang, mixed languages (Roman Urdu, Spanglish, etc.) and indirect phrasings should still match the right intent.
- If the text is ambiguous or doesn't clearly fit an intent, set that intent to false.
- Multiple intents can be true at once.

Output format: a single JSON object with exactly these keys:
${intentKeys.map((k) => `  "${k}": boolean`).join(',\n')}`;

  const userPrompt = opts.context
    ? `Intents to classify:\n${intentList}\n\nContext (preceding turn):\n${opts.context}\n\nText to classify:\n${safeText}`
    : `Intents to classify:\n${intentList}\n\nText to classify:\n${safeText}`;

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
        max_completion_tokens: 256,
        reasoning_effort: 'minimal',
        response_format: { type: 'json_object' },
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('intent-classifier timeout')), 8000)
      ),
    ]);

    const raw = response.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      logger.warn(`[intentClassifier] non-JSON response, falling back: ${raw.slice(0, 100)}`);
      cacheSet(key, fallback);
      return fallback;
    }

    // Coerce: every requested key must come out as a boolean. Missing →
    // false. Truthy non-bools → true. Defending against the model dropping
    // a key or returning "yes"/"no" strings.
    const result = {};
    for (const k of intentKeys) {
      const v = parsed[k];
      if (typeof v === 'boolean') result[k] = v;
      else if (typeof v === 'string') result[k] = /^(true|yes|y|1)$/i.test(v.trim());
      else result[k] = !!v;
    }

    const promptTokens = response.usage?.prompt_tokens || 0;
    const cachedInputTokens = response.usage?.prompt_tokens_details?.cached_tokens || 0;
    recordUsage({
      userId: opts.userId,
      operation: opts.operation || 'intent_classifier',
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
      durationMs: Date.now() - start,
    });

    cacheSet(key, result);
    return result;
  } catch (err) {
    logger.warn(`[intentClassifier] failed (op=${opts.operation || 'intent_classifier'}): ${err.message}`);
    return fallback;
  }
}

module.exports = { classifyIntent };
