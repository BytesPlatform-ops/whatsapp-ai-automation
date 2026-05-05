// Phase 3 — consolidated per-turn intent classifier.
//
// Replaces three separate router-pipeline classifier calls with ONE:
//   1. classifyUndoOrKeep      (undoStack.js)
//   2. classifyIntent          (router.js, INTENT_CLASSIFIER_PROMPT)
//   3. correctionDetector      (correctionDetector.js)
//
// Why consolidate: each of those classifiers fires on the SAME inbound
// user message, each ~95% accurate, mounting a 0.95^3 ≈ 86% pipeline
// accuracy ceiling — and worse, when their verdicts conflict (e.g.
// undo says "undo" while correction says "name change"), the FIRST one
// to fire steals the message and the user's actual intent gets lost.
//
// Single classifier = single source of truth = no inter-classifier
// conflicts. The unified verdict shape lets the router dispatch the
// same way it always did (intent === 'question' / 'menu' / 'undo' /
// 'correction' branches), just from one LLM call instead of three.
//
// What's NOT consolidated here (different concerns):
//   - classifyFeedbackSignals (notInterested / frustrated / helpEscape) — those
//     are about the user's emotional state, orthogonal to intent
//   - botSpeech / convTopic in salesBot — those classify the bot's
//     own reply, not the user's input
//   - tryApplySideChannel — runs INSIDE state handlers when the
//     state-specific extractor returns unclear; layered safety net
//   - extractIndustry / extractServices — entity extractors, not
//     intent classifiers

const OpenAI = require('openai');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { recordUsage } = require('../db/llmUsage');
const { costOf } = require('../llm/pricing');
const { isDelegation } = require('../config/smartDefaults');

let client = null;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: env.llm.openaiApiKey });
  return client;
}

const MODEL = 'gpt-5.4-nano';
const TIMEOUT_MS = 8000;

// Fields the correction branch is allowed to return. Mirrors
// CORRECTABLE_FIELDS in correctionDetector.js (kept in sync because
// the consolidated classifier supersedes it). Complex / structured
// fields (weeklyHours, salonServices, bookingMode) are intentionally
// excluded — they need their own parsing path, not a free-text edit.
const CORRECTABLE_FIELDS = [
  'businessName',
  'industry',
  'contactEmail',
  'contactPhone',
  'contactAddress',
  'primaryCity',
  'services',
  'serviceAreas',
];

// State -> the field(s) the active handler is currently asking about.
// When the user supplies a value for ONE of these fields, that's a
// regular 'answer' — NOT a 'correction'. The correction branch is for
// edits to fields collected upstream.
const ACTIVE_FIELDS_BY_STATE = {
  WEB_COLLECT_NAME: ['businessName'],
  WEB_COLLECT_EMAIL: ['contactEmail'],
  WEB_COLLECT_INDUSTRY: ['industry'],
  WEB_COLLECT_AREAS: ['primaryCity', 'serviceAreas'],
  WEB_COLLECT_SERVICES: ['services'],
  WEB_COLLECT_CONTACT: ['contactEmail', 'contactPhone', 'contactAddress'],
};

// Empty / blank verdict shape used for short-circuits and fallbacks.
function emptyVerdict() {
  return {
    primary: 'unclear',
    correction: null,
    menuTarget: null,
    agreed: false,
    notInterested: false,
    frustrated: false,
    helpEscape: false,
    // diagnostic
    source: 'fallback',
    confidence: 0,
  };
}

/**
 * Try cheap, deterministic format detectors before paying for an LLM
 * call. These are FORMAT checks (does the input LOOK like an email?
 * does it match the literal word "skip"?), not intent guesses — so they
 * don't violate the no-regex-for-intent principle. Anything ambiguous
 * (e.g. multi-word reply, prose) falls through to the LLM.
 *
 * Returns a verdict if a fast-path matched, or null to fall through.
 */
function tryFastPath(text, { undoPending } = {}) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;

  // Punctuation-only is confusion → question (so the bot answers vs
  // re-prompting silently).
  if (/^[?!.,;]+$/.test(t)) {
    return { ...emptyVerdict(), primary: 'question', source: 'fastpath_punctuation', confidence: 0.95 };
  }

  // Single-word skip / yes / no / etc. — unambiguous answers.
  if (/^(skip|none|no|nope|nah|n\/?a|na|next|continue|done|same|y|n)$/.test(t)) {
    if (t === 'skip' || t === 'none' || t === 'n/a' || t === 'na') {
      return { ...emptyVerdict(), primary: 'skip', source: 'fastpath_skip', confidence: 0.99 };
    }
    return { ...emptyVerdict(), primary: 'answer', source: 'fastpath_short', confidence: 0.99 };
  }

  // "keep" only meaningful when undoPending — at any other time it's an answer.
  if (/^(keep|fine|leave it|same|as is|nvm|no change)$/i.test(t)) {
    if (undoPending) return { ...emptyVerdict(), primary: 'keep', source: 'fastpath_keep', confidence: 0.95 };
    return { ...emptyVerdict(), primary: 'answer', source: 'fastpath_short', confidence: 0.95 };
  }

  // Phone-number-shaped — definitely an answer (only matches when input
  // is essentially digits + separators, no prose).
  if (/^[\d\s\-+().]{6,}$/.test(t)) {
    return { ...emptyVerdict(), primary: 'answer', source: 'fastpath_phone_shape', confidence: 0.95 };
  }

  // Email-shaped — STRICT whole-message match only. We deliberately
  // do NOT fast-path inputs like "the email is X@Y.Z" / "wait the
  // phone was X" — those are field-edit phrasings that need the LLM
  // to detect cross-field corrections. Whole-message bare emails are
  // unambiguously an answer to the email question.
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(t)) {
    return { ...emptyVerdict(), primary: 'answer', source: 'fastpath_email_shape', confidence: 0.95 };
  }

  // Very short replies (< 4 chars, single token) — almost always answers.
  if (t.length < 4 && !/\s/.test(t)) {
    return { ...emptyVerdict(), primary: 'answer', source: 'fastpath_tiny', confidence: 0.85 };
  }

  // Delegation phrasings ("you decide", "surprise me", "idk", "whatever") —
  // the existing isDelegation check from smartDefaults captures these
  // language-agnostically, but it's a curated KEYWORD list rather than
  // an LLM call. Treating them as answers fast lets handlers apply
  // sensible defaults without burning LLM budget.
  if (isDelegation(t)) {
    return { ...emptyVerdict(), primary: 'answer', source: 'fastpath_delegation', confidence: 0.90 };
  }

  return null; // fall through to LLM
}

/**
 * The main consolidated classifier.
 *
 * @param {Object} ctx
 * @param {string} ctx.text             - User's inbound message (raw)
 * @param {string} ctx.currentState     - user.state
 * @param {string} [ctx.currentQuestion]- Human-readable question the bot was asking (from STATE_QUESTION map)
 * @param {string} [ctx.recentContext]  - Last 1-2 bot turns of conversation for echo/switch disambiguation
 * @param {Object} [ctx.knownFields]    - websiteData snapshot (for correction validation)
 * @param {boolean}[ctx.undoPending]    - True if user is at a popped-back state ("change or keep it?" prompt active)
 * @param {string} [ctx.userId]
 * @returns {Promise<Verdict>}          - { primary, correction, menuTarget, agreed, notInterested, frustrated, helpEscape, source, confidence }
 */
async function classifyTurnIntent({
  text,
  currentState,
  currentQuestion,
  recentContext,
  knownFields,
  undoPending = false,
  userId,
}) {
  const safeText = String(text || '').trim();
  if (!safeText) return { ...emptyVerdict(), source: 'empty_text' };

  // Long messages (service lists, addresses, descriptions) are virtually
  // always 'answer' — no realistic skip / undo / keep is 80+ chars.
  if (safeText.length > 200) {
    return { ...emptyVerdict(), primary: 'answer', source: 'fastpath_long_msg', confidence: 0.85 };
  }

  // 1. Try fast-path format detectors (deterministic, no LLM cost)
  const fast = tryFastPath(safeText, { undoPending });
  if (fast) {
    // Fire-and-forget log of the fast-path decision so the trace shows it
    try {
      const { recordClassifierDecision } = require('../db/classifierDecisions');
      recordClassifierDecision({
        classifier: 'classifyTurnIntent',
        inputText: safeText,
        inputContext: { currentState, undoPending, fastPath: true },
        output: fast,
        latencyMs: 0,
        userId,
      }).catch(() => {});
    } catch (_) {}
    return fast;
  }

  // 2. LLM call for the rest
  const activeFields = ACTIVE_FIELDS_BY_STATE[currentState] || [];
  const knownLines = Object.entries(knownFields || {})
    .filter(([k, v]) => v != null && v !== '' && CORRECTABLE_FIELDS.includes(k))
    .map(([k, v]) => {
      const display = Array.isArray(v) ? v.join(', ') : String(v);
      return `  - ${k}: ${display.slice(0, 80)}`;
    })
    .join('\n');

  const undoClause = undoPending
    ? `**Undo IS pending.** The bot just popped back one step and asked "change it or keep it?". The user's reply is most likely either "keep" (or any equivalent) OR a NEW VALUE for the popped-back field.`
    : `**Undo is NOT pending.** Do NOT classify "keep" as the primary intent — there's nothing to keep.`;

  const correctionRules = `
**"correction" branch — when to use:**
The user is editing a SPECIFIC FIELD they answered earlier, AND supplies a specific value. Examples:
- "actually the business name is X" → field=businessName, op=replace, value="X"
- "change the name to Y" → field=businessName, op=replace, value="Y"
- "the email is foo@bar.com" → field=contactEmail, op=replace, value="foo@bar.com"
- "we also do drain cleaning" → field=services, op=add, value="drain cleaning"
- "remove pipe repair from services" → field=services, op=remove, value="pipe repair"
- "wait the contact number was X" → field=contactPhone, op=replace, value="X"

**op semantics:**
- "replace" — DEFAULT. User overwrites with a new value. Use for scalar fields and full-list replacements.
- "add" — ONLY for list fields (services / serviceAreas). User is APPENDING. Phrases: "add X", "we also do Y", "include Z too".
- "remove" — ONLY for list fields. User is removing items. Phrases: "remove X", "drop Y", "we don't do Z anymore". The item being removed MUST already exist in the known list (case-insensitive match) — if it doesn't, this isn't a valid correction; classify as "unclear" or "answer" depending on context.

**Active-field guard (CRITICAL):**
If the field the user is editing is in the "currently being asked" list (active fields: ${JSON.stringify(activeFields)}), this is just an "answer" — NOT a "correction". The state handler will collect it via its own parser. Only classify as "correction" when editing a field collected UPSTREAM.

**Allowed correction fields:** ${CORRECTABLE_FIELDS.join(', ')}. Never invent field names.`;

  const recentBlock = recentContext
    ? `\n\nRECENT CONVERSATION (for echo/switch disambiguation):\n${String(recentContext).slice(0, 600)}`
    : '';

  const knownBlock = knownLines
    ? `\n\nFields already collected (for correction validation):\n${knownLines}`
    : '\n\nNo fields collected yet.';

  const systemPrompt = `You are an intent classifier for a website-building chatbot. The user is mid-conversation; we asked them a question and they replied with a free-text message. Decide what they MEANT.

CURRENT STATE: ${currentState || 'unknown'}
CURRENT QUESTION: "${currentQuestion || '(unknown)'}"
${undoClause}${recentBlock}${knownBlock}

USER MESSAGE: "${safeText}"

Classify into ONE primary intent:

1. **"answer"** — user is genuinely answering the current question. Including delegation ("you decide", "idk you pick", "whatever you think"), affirmations of an offered action, and replies that supply a value for a field in the active-fields list.

2. **"skip"** — user wants to skip the current question. Phrases (any language): "skip", "skip it", "skip this", "skip krdo", "rehne do", "abhi nahi", "baad mein", "saltar". SKIP IS FORWARD MOTION. NEVER classify "skip" as undo.

3. **"undo"** — user wants to NAVIGATE BACK ONE STEP without supplying a value. Phrases: "wait go back", "previous step", "back up", "let's revisit". NEVER classify a message containing a SPECIFIC VALUE as undo (that's "correction"). NEVER classify a "skip" or "keep" as undo.

4. **"keep"** — ${undoPending ? 'VALID. User wants to leave the previously-stored answer as-is. Phrases: "keep", "same", "leave it", "fine", "as is", "I already told you", "use what I gave", "use the previous one", "don\'t make me repeat", "you already have it".' : 'NOT VALID right now (no undo pending). Do not return "keep".'}

5. **"correction"** — user is editing a SPECIFIC FIELD they answered earlier with a specific value. See correction rules below.${correctionRules}

6. **"question"** — user is asking US a question (not answering ours). Phrases: "what services do you offer?", "are you a bot?", "how does this work?", "why should I give you my business name?". CRITICAL: frustration-tinged questions ("are you dumb?", "I said what services do you provide") are STILL questions — answer them. Single "?" is a question.

7. **"objection"** — user pushing back on price/value/trust/process. Phrases: "too expensive", "I'll just use Wix", "not worth it", "I'll think about it", "burned by agencies before", "ChatGPT can do this". Only when they're rejecting the value/price/trust, not skipping a single field.

8. **"menu"** — user EXPLICITLY switching services. REQUIRES a switch signal ("instead", "actually", "wait", "forget", "scrap", "drop this", "nevermind") AND a different service name. Mere mention of a service-related word in a business name or service description is NOT menu (e.g. "Hasnain Plumbing" as a business name is "answer", not "menu"). Or an explicit advance-the-queue phrase: "skip this, what's next", "do the rest".

9. **"exit"** — user wants to stop entirely. Phrases: "actually forget it", "cancel everything", "nevermind, leave it".

10. **"unclear"** — none of the above. Genuinely off-topic, gibberish, or ambiguous.

ORTHOGONAL FLAGS — set these INDEPENDENTLY of the primary, based on the message:
- "agreed": user is affirming or saying yes ("yeah", "sure", "sounds good", "let's do it", "haan", "theek hai", "chalo"). Also true for affirmative answers to specific yes/no offers.
- "notInterested": user is opting out of further contact ("not interested", "stop messaging", "leave me alone", "unsubscribe", "I'm good thanks").
- "frustrated": user is venting frustration ("ugh", "are you serious", "this is annoying", "are you dumb?", "pagal ho").
- "helpEscape": user is asking for a real human ("talk to a person", "real human", "manager", "I want to speak to someone").

OUTPUT FORMAT — return ONLY valid JSON, no commentary:
{
  "primary": "answer" | "skip" | "undo" | "keep" | "correction" | "question" | "objection" | "menu" | "exit" | "unclear",
  "correction": null | { "field": "...", "op": "replace"|"add"|"remove", "value": "..." },
  "menuTarget": null | "svc_webdev" | "svc_seo" | "svc_chatbot" | "svc_logo" | "svc_adgen" | "svc_marketing" | "svc_appdev",
  "agreed": false,
  "notInterested": false,
  "frustrated": false,
  "helpEscape": false
}

Output ONLY the JSON object. No prose.`;

  const start = Date.now();
  let parsed = null;
  try {
    const openai = getClient();
    const response = await Promise.race([
      openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: safeText },
        ],
        max_completion_tokens: 200,
        reasoning_effort: 'none',
        response_format: { type: 'json_object' },
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('turn-classify timeout')), TIMEOUT_MS)
      ),
    ]);

    const raw = response.choices?.[0]?.message?.content || '{}';
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      logger.warn(`[TURN-CLASSIFIER] non-JSON response: ${raw.slice(0, 100)}`);
    }

    const promptTokens = response.usage?.prompt_tokens || 0;
    const cachedInputTokens = response.usage?.prompt_tokens_details?.cached_tokens || 0;
    recordUsage({
      userId,
      operation: 'turn_intent_classifier',
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
  } catch (err) {
    logger.warn(`[TURN-CLASSIFIER] LLM failed: ${err.message}`);
  }

  // Coerce + validate the parsed verdict
  const verdict = coerceVerdict(parsed, { activeFields, knownFields });
  verdict.source = parsed ? 'llm' : 'llm_failed';

  // Fire-and-forget trace log
  try {
    const { recordClassifierDecision } = require('../db/classifierDecisions');
    recordClassifierDecision({
      classifier: 'classifyTurnIntent',
      inputText: safeText,
      inputContext: { currentState, undoPending, activeFields, knownFieldsCount: Object.keys(knownFields || {}).length },
      output: verdict,
      latencyMs: Date.now() - start,
      userId,
    }).catch(() => {});
  } catch (_) {}

  return verdict;
}

/**
 * Coerce raw LLM output into a strict Verdict shape, defending against
 * missing fields, wrong types, hallucinated field names, etc.
 */
function coerceVerdict(parsed, { activeFields = [], knownFields = {} } = {}) {
  const v = emptyVerdict();
  if (!parsed || typeof parsed !== 'object') {
    v.primary = 'answer';  // Safe default: assume the user is answering
    v.confidence = 0.3;
    return v;
  }

  const allowedPrimary = new Set([
    'answer', 'skip', 'undo', 'keep', 'correction',
    'question', 'objection', 'menu', 'exit', 'unclear',
  ]);
  const primary = String(parsed.primary || '').toLowerCase().trim();
  v.primary = allowedPrimary.has(primary) ? primary : 'answer';

  // correction payload — sanity check field, op, value
  if (v.primary === 'correction' && parsed.correction && typeof parsed.correction === 'object') {
    const field = String(parsed.correction.field || '').trim();
    const opRaw = String(parsed.correction.op || 'replace').toLowerCase().trim();
    const value = String(parsed.correction.value || '').trim();

    if (!CORRECTABLE_FIELDS.includes(field)) {
      // Hallucinated field — collapse to answer
      v.primary = 'answer';
    } else if (activeFields.includes(field)) {
      // User is editing the field we're CURRENTLY asking about — that's
      // just an answer, not a correction.
      v.primary = 'answer';
    } else if (!value) {
      v.primary = 'unclear';
    } else {
      const isList = field === 'services' || field === 'serviceAreas';
      const op = isList && (opRaw === 'add' || opRaw === 'remove') ? opRaw : 'replace';
      // Defensive removal validation: only allow remove when the items
      // actually exist in the known list (case-insensitive).
      if (op === 'remove') {
        const known = Array.isArray(knownFields?.[field])
          ? knownFields[field].map((s) => String(s).toLowerCase().trim())
          : [];
        const items = value.split(/\s*,\s*|\s+(?:and|&)\s+/i).map((s) => s.trim()).filter(Boolean);
        const matched = items.filter((s) => known.includes(s.toLowerCase()));
        if (matched.length === 0) {
          // Nothing actually present to remove — treat as unclear.
          v.primary = 'unclear';
        } else {
          v.correction = { field, op: 'remove', value: matched.join(', ') };
        }
      } else if (op === 'add') {
        v.correction = { field, op: 'add', value };
      } else {
        v.correction = { field, op: 'replace', value };
      }
    }
  }

  // menu payload
  if (v.primary === 'menu') {
    const target = parsed.menuTarget && String(parsed.menuTarget).toLowerCase().trim();
    const allowed = new Set(['svc_webdev', 'svc_seo', 'svc_chatbot', 'svc_logo', 'svc_adgen', 'svc_marketing', 'svc_appdev', 'svc_general', 'svc_info']);
    v.menuTarget = target && allowed.has(target) ? target : null;
  }

  v.agreed = !!parsed.agreed;
  v.notInterested = !!parsed.notInterested;
  v.frustrated = !!parsed.frustrated;
  v.helpEscape = !!parsed.helpEscape;
  v.confidence = 0.85;

  return v;
}

module.exports = { classifyTurnIntent, CORRECTABLE_FIELDS, ACTIVE_FIELDS_BY_STATE };
