// Interactive reply matcher (Phase 10).
//
// When the bot sends a message with tappable buttons or a list, this
// module remembers what was sent so the next inbound text from that user
// can be matched to a button — even if the user typed "2", "second one",
// "the website one", or the button's title instead of tapping.
//
// The matcher is forgiving by design: users on desktop, older clients,
// forwarded conversations, or just typing preferences shouldn't have to
// phrase things exactly right. We accept:
//   - pure digit ("2")
//   - digit with decoration ("2.", "2)", "#2")
//   - prefix phrases ("option 2", "number 2", "pick 2", "go with 2")
//   - spelled numbers ("two", "the second one", "second option")
//   - exact title ("Build a Website")
//   - substring ("website", "seo")
//   - keyword-match (title keywords overlap with user's words)
//
// Safety: a stored button set is invalidated after TTL, after the user
// replies (whether matched or not — single-use), or when a newer
// interactive message replaces it. Match is only attempted when the
// most recent bot message to this user was actually interactive, so
// bare numeric answers to normal questions ("how many years?" → "5")
// don't get hijacked.

const { logger } = require('../utils/logger');
const { generateResponse } = require('../llm/provider');

const TTL_MS = 30 * 60 * 1000;  // 30 min — after that the user has
                                // probably moved on mentally
const MAX_ENTRIES = 2000;

// Map<phoneKey, { items: [{id, title}], kind: 'buttons'|'list', ts: number }>
const PENDING = new Map();

function keyFor(to) {
  return String(to || '');
}

/**
 * Remember that we just sent an interactive message with these items.
 * `items` is a flat array of `{id, title}`. For list messages, pass the
 * flattened rows (all sections combined).
 *
 * `kind` is 'buttons' or 'list' — used only for telemetry / the outgoing
 * hint text.
 */
function rememberInteractive(to, items, kind = 'buttons') {
  if (!Array.isArray(items) || items.length === 0) return;
  const safeItems = items
    .map((b) => ({
      id: String(b?.id || ''),
      title: String(b?.title || ''),
    }))
    .filter((b) => b.id && b.title);
  if (!safeItems.length) return;
  PENDING.set(keyFor(to), { items: safeItems, kind, ts: Date.now() });

  // Cheap eviction when the map grows past the cap — drop the oldest 20%.
  if (PENDING.size > MAX_ENTRIES) {
    const drop = Math.floor(MAX_ENTRIES * 0.2);
    const keys = Array.from(PENDING.keys()).slice(0, drop);
    for (const k of keys) PENDING.delete(k);
  }
}

function getPending(to) {
  const k = keyFor(to);
  const entry = PENDING.get(k);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    PENDING.delete(k);
    return null;
  }
  return entry;
}

function clearPending(to) {
  PENDING.delete(keyFor(to));
}

/**
 * Build the "Or type 1, 2, 3" hint to append to the outgoing body. Tunes
 * phrasing by the number of items. Returns an empty string for N=1 (no
 * point in telling someone to "type 1").
 */
function buildHintForItems(items) {
  if (!Array.isArray(items) || items.length < 2) return '';
  if (items.length === 2) return '\n\n_Or type 1 or 2._';
  if (items.length === 3) return '\n\n_Or type 1, 2, or 3._';
  if (items.length <= 9) {
    const list = Array.from({ length: items.length - 1 }, (_, i) => i + 1).join(', ');
    return `\n\n_Or type ${list}, or ${items.length}._`;
  }
  return `\n\n_Or type the number (1-${items.length}) to pick._`;
}

// ── Matching ──────────────────────────────────────────────────────────────

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')  // strip punctuation, keep unicode letters/digits
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fast-path regex match — digits and exact title only. Returns the matched
 * item or null. Kept intentionally narrow: everything fuzzy (natural
 * phrasings, typos, extra words) goes to the LLM fallback in matchReply
 * instead of being hand-coded here.
 */
function fastMatch(items, t) {
  // 1. Pure digit: "2"
  if (/^[1-9]\d?$/.test(t)) {
    const n = parseInt(t, 10);
    if (n >= 1 && n <= items.length) return items[n - 1];
  }

  // 2. Digit with simple decoration: "2.", "2)", "#2", "[2]"
  const decorated = t.match(/^[#\[]?\s*([1-9]\d?)\s*[\.\)\]\-:]?\s*$/);
  if (decorated) {
    const n = parseInt(decorated[1], 10);
    if (n >= 1 && n <= items.length) return items[n - 1];
  }

  // 3. Exact normalized title. Any extra words and we fall through to LLM.
  const tNorm = normalize(t);
  if (tNorm) {
    for (const b of items) {
      if (normalize(b.title) === tNorm) return b;
    }
  }

  return null;
}

/**
 * LLM fallback: ask the model which option the user picked. Narrow prompt,
 * strict JSON output, short timeout so a slow provider can't block the
 * router. Returns the matched item or null.
 */
async function llmMatch(items, text, userId) {
  const numbered = items.map((b, i) => `${i + 1}. ${b.title}`).join('\n');
  const prompt = `The user was just shown these options on WhatsApp:
${numbered}

They replied: "${String(text || '').replace(/"/g, '\\"').slice(0, 300)}"

Which option did they pick? Return ONLY JSON: {"pick": <N>|null} where N is the option number (1-${items.length}).
- Return the number if they clearly picked one — digits ("2"), ordinals ("second", "the second one"), the title or a keyword from it ("website", "seo"), natural phrasings ("i'll go with the second", "website one please", "can you do seo").
- Return null if they're asking a question, making small talk, or saying something unrelated to the options.
- If their message is ambiguous or could be two options, return null.
- Do NOT explain. JSON only.`;
  try {
    const raw = await generateResponse(
      prompt,
      [{ role: 'user', content: 'Classify now.' }],
      { userId, operation: 'interactive_reply_match', timeoutMs: 10_000 }
    );
    const m = String(raw || '').match(/\{[\s\S]*?\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const n = Number(parsed?.pick);
    if (!Number.isInteger(n) || n < 1 || n > items.length) return null;
    return items[n - 1];
  } catch (err) {
    logger.warn(`[INTERACTIVE] LLM match failed: ${err.message}`);
    return null;
  }
}

/**
 * Try to match `text` against the buttons most recently sent to `to`.
 *
 * Returns an object describing the outcome:
 *   { kind: 'match', item: {id,title}, total }  — resolved a button
 *   { kind: 'out_of_range', item: null, total } — typed an invalid digit
 *                                                  (e.g. "5" when there
 *                                                  are 3 buttons). The
 *                                                  pending buttons are
 *                                                  NOT cleared so the
 *                                                  user can retry.
 *   { kind: 'off_topic', item: null, total }    — text was something
 *                                                  unrelated; pending
 *                                                  cleared.
 *   { kind: 'nopending', item: null }           — no buttons were waiting
 *                                                  on this user, caller
 *                                                  should treat as normal
 *                                                  free text.
 *
 * Strategy: regex fast-path for digits and exact titles (zero cost), LLM
 * fallback for everything else so natural phrasings ("the second one
 * please", "website one thanks") just work.
 */
async function matchReply(to, text, opts = {}) {
  const entry = getPending(to);
  if (!entry || !entry.items.length) return { kind: 'nopending', item: null };
  const items = entry.items;
  const total = items.length;

  const raw = String(text || '').trim();
  if (!raw) {
    clearPending(to);
    return { kind: 'off_topic', item: null, total };
  }
  const t = raw.toLowerCase();

  // Fast-path: digits and exact title. No LLM cost for "2" / "2." / etc.
  const fast = fastMatch(items, t);
  if (fast) {
    clearPending(to);
    return { kind: 'match', item: fast, total };
  }

  // Pure digit but out of range — the user clearly INTENDED to pick a
  // button, they just typed the wrong number. Don't clear pending: the
  // router will send a "that's only N options" nudge and their next
  // attempt should still match.
  if (/^[#\[]?\s*\d{1,2}\s*[\.\)\]\-:]?\s*$/.test(t)) {
    return { kind: 'out_of_range', item: null, total };
  }

  // Long free-form → off-topic, skip the LLM call.
  if (raw.length > 200) {
    clearPending(to);
    return { kind: 'off_topic', item: null, total };
  }

  const llmItem = await llmMatch(items, raw, opts.userId || null);
  clearPending(to);
  if (llmItem) return { kind: 'match', item: llmItem, total };
  return { kind: 'off_topic', item: null, total };
}

/**
 * Append the digit hint to an outgoing interactive body, but only if the
 * body doesn't already contain a hint (defensive against double-appending
 * if a caller wraps the sender). Intentionally lightweight — we don't
 * try to translate the hint into the user's language; "1", "2", "3"
 * are universal and italic markdown keeps the hint visually quiet.
 */
function maybeAppendHint(bodyText, items) {
  const body = String(bodyText || '');
  // Heuristic: look for "type 1" or "or type" in the body already.
  if (/or\s+type\s+/i.test(body)) return body;
  const hint = buildHintForItems(items);
  if (!hint) return body;
  return body + hint;
}

// Stats helpers for tests and diagnostics
function _size() { return PENDING.size; }
function _getRaw(to) { return PENDING.get(keyFor(to)); }

module.exports = {
  rememberInteractive,
  getPending,
  clearPending,
  matchReply,
  maybeAppendHint,
  _TTL_MS: TTL_MS,
  _size,
  _getRaw,
};
