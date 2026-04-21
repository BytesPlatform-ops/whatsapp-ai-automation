// Smart defaults for collection steps where the user delegates the choice to
// the bot ("whatever you think", "you pick", "idk", "default", etc.). Every
// optional collection step in the website flow (salon hours, service
// durations, Instagram handle, booking tool, agent profile, etc.) runs user
// input through `isDelegation` — when it returns true, the step applies a
// sensible default AND announces what was picked so the user knows.
//
// Keeping this in one module means "whatever you think" behaves identically
// at every step — no more stalling on delegation at one step while handling
// it at another.
//
// Two-layer detection:
//   1. `isDelegation(text)` — sync regex, catches common phrasings cheaply.
//   2. `classifyDelegation(text, questionContext)` — async LLM fallback for
//      anything the regex missed. Use at steps where missing a delegation
//      phrase leaves the user stuck in a re-prompt loop.

const { generateResponse } = require('../llm/provider');
const { logger } = require('../utils/logger');

// Single source of truth for delegation/skip phrases. Matches tight so a
// legit service list like "skip-the-dishes" or a business named "Maybe Cafe"
// won't accidentally trigger it — must be the WHOLE message.
// Delegation patterns. Built as a set of alternatives so "i dont have it yet",
// "we don't have one", "not yet", "i havent got one" all work alongside the
// single-word versions. Anchored to the whole message — must match end-to-end,
// so "skip-the-dishes" or "Maybe Cafe" are NOT false positives.
const DELEGATION_RE = new RegExp(
  '^(?:' + [
    // Leading hedge + delegation ("idk you pick", "not sure, you decide", etc.)
    '(?:idk|dunno|not\\s*sure|no\\s*idea)[,\\s]+(?:you\\s*(?:pick|decide|choose|tell\\s*me)|whatever(?:\\s*(?:you\\s*)?(?:think|want|pick|like))?|whatever\\s*works|your\\s*call|up\\s*to\\s*you|surprise\\s*me|skip|default)',
    // "I/we don't have/know/care/want" (optionally followed by one/it/that/any/yet)
    '(?:i|we)?\\s*(?:haven\'?t|havent)\\s*(?:got|had)?(?:\\s+(?:one|it|that|any|yet))*',
    '(?:i|we)?\\s*don\'?t\\s*(?:know|have|care|want)(?:\\s+(?:one|it|that|any|yet))*',
    '(?:i|we)?\\s*dont\\s*(?:know|have|care|want)(?:\\s+(?:one|it|that|any|yet))*',
    // Simple single-phrase delegations
    'skip|default|defaults?|none|no|nah|nope|n\\/?a|na|idk|dunno|not\\s*sure|no\\s*idea|not\\s*yet',
    // "you X" / "your call" / "up to you"
    'you\\s*(?:pick|decide|choose|tell\\s*me)',
    'your\\s*call|up\\s*to\\s*you',
    // "whatever ..."
    'whatever(?:\\s*(?:you\\s*)?(?:think|want|pick|like))?',
    'whatever\\s*works',
    // "anything", "surprise me", "as you like"
    'anything\\s*(?:is\\s*)?(?:fine|ok|okay|goes)?',
    'as\\s*you\\s*like|surprise\\s*me',
  ].join('|') + ')\\s*\\.?$',
  'i'
);

/**
 * Does this user reply mean "I don't want to answer, pick something for me"?
 * Empty strings count as delegation — the user didn't answer either.
 */
function isDelegation(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  return DELEGATION_RE.test(t);
}

// Default when the user delegates SALON_HOURS. Text is the exact phrasing
// shown to the user in the "applied default" announcement, and is the same
// string the hours parser recognizes as the canonical default.
const DEFAULT_SALON_HOURS_LABEL = 'Tue-Sat 9-7, Sun-Mon closed';

// Default per-service duration in minutes when the user delegates
// SALON_SERVICE_DURATIONS. No price is set — the user can add prices later
// from the confirmation summary.
const DEFAULT_SERVICE_DURATION_MIN = 30;

/**
 * Async delegation classifier. Tries the regex first (fast), and if it
 * doesn't match, asks the LLM whether the user's reply means they want the
 * bot to pick / decline / don't have an answer. Use this instead of
 * `isDelegation` alone at steps where the regex will inevitably miss some
 * natural phrasing ("i have no idea about this", "hmm not really sure what
 * you mean", etc.).
 *
 * `questionContext` is the actual question the bot just asked — passed to
 * the LLM so it can reason about the reply in context.
 *
 * Always falls back to `false` on any LLM failure — never blocks the flow.
 */
async function classifyDelegation(text, questionContext) {
  const t = String(text || '').trim();
  if (isDelegation(t)) return true;
  // Long messages are almost certainly real answers, not delegation.
  if (!t || t.length > 120) return false;

  try {
    const prompt = `The bot just asked the user this during a website setup flow:

"${questionContext}"

The user replied: "${t}"

Does the user's reply mean they're delegating the decision to the bot / saying they don't have an answer / telling the bot to pick / saying they're unsure / asking the bot to use a default? Phrases like "idk", "whatever you think", "I don't have one", "I have no idea", "not sure what you mean", "just pick", "you decide", "haven't got one yet" all count as delegation.

Respond with ONLY the single word "yes" or "no".`;

    const response = await generateResponse(
      prompt,
      [{ role: 'user', content: t }],
      { operation: 'delegation_classify' }
    );
    const isYes = /^\s*yes\b/i.test(response);
    if (isYes) logger.debug(`[DELEGATION] LLM classified "${t}" as delegation (question="${questionContext.slice(0, 40)}…")`);
    return isYes;
  } catch (err) {
    logger.warn(`[DELEGATION] LLM classify failed: ${err.message}`);
    return false;
  }
}

module.exports = {
  isDelegation,
  classifyDelegation,
  DEFAULT_SALON_HOURS_LABEL,
  DEFAULT_SERVICE_DURATION_MIN,
};
