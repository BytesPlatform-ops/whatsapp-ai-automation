/**
 * intentHelpers.js
 *
 * Small, consistent classifiers for the common user replies at collection
 * steps: "yes", "no", "skip", or "please change X". These replace ad-hoc
 * `text === 'yes'` / regex cascades scattered through the handlers.
 *
 * Each function accepts a message object (the same shape handlers receive
 * from the router). When `message.analysis` is present (attached by the
 * messageAnalyzer for free-text turns) we lean on it; otherwise we fall
 * back to raw-text matching so legacy callers and button/list payload
 * messages still work.
 *
 * The message shape each helper expects:
 *   { text?, type?, buttonId?, listId?, analysis?: {
 *       intent, sentiment, entities, topicSwitch, isNoise,
 *       isDelegation, language, summary
 *     } }
 */

// Common affirmative words/phrases — all lowercase, trimmed before compare.
const AFFIRMATIVE_PATTERNS = [
  'y', 'yes', 'yeah', 'yep', 'yup', 'ya',
  'ok', 'okay', 'k', 'kk',
  'sure', 'sounds good', 'looks good', 'all good', 'lgtm',
  'go', 'go ahead', 'go for it', 'do it', 'build it',
  'lets go', "let's go", 'proceed', 'continue', 'confirm', 'confirmed',
  'approved', 'approve', 'perfect', 'great', 'awesome',
  'that works', 'works for me', 'absolutely', 'of course',
  '👍', '✅', '👌', '💯',
];
const AFFIRMATIVE_SET = new Set(AFFIRMATIVE_PATTERNS);
// Loose match for "yes, proceed", "sure build it", etc. — short phrase starts
// with an affirmative token.
const AFFIRMATIVE_PREFIX_RE = /^(y|yes|yeah|yep|yup|ya|ok|okay|sure|proceed|continue|confirm|approved|lgtm|perfect|great|awesome|looks? good|sounds? good|works? for me|that works|all good)\b[\s,.!]*/i;

const NEGATIVE_PATTERNS = [
  'n', 'no', 'nope', 'nah', 'not really', 'negative',
  "don't", "dont", 'never mind', 'nevermind', 'cancel',
  '👎',
];
const NEGATIVE_SET = new Set(NEGATIVE_PATTERNS);

const SKIP_PATTERNS = [
  'skip', 'pass', 'nah', 'no thanks', 'not now', 'not right now',
  'maybe later', 'later', 'leave it', 'next', 'move on', 'next one',
  'whatever', "doesn't matter", 'doesnt matter', 'no matter',
  'you decide', 'your choice', 'you pick', 'up to you',
  'idk', "i don't know", 'i dont know', 'no idea', 'not sure', 'unsure',
  'none', 'nothing', 'n/a', 'na',
  "don't have", "dont have", 'not applicable',
];
const SKIP_SET = new Set(SKIP_PATTERNS);
const SKIP_PHRASE_RE = /\b(skip|pass|no thanks|not now|maybe later|leave it|move on|doesn'?t matter|you decide|your choice|up to you|no idea|not sure|don'?t have|don'?t offer|nothing to (list|offer)|whatever you (think|want|decide|prefer))\b/i;

const CHANGE_PATTERNS = [
  'change', 'update', 'edit', 'fix', 'modify', 'replace',
  'wrong', 'incorrect', 'that\'s wrong', 'thats wrong',
  'actually', 'wait', 'hold on',
  'no the', 'not the', "it's not", 'its not',
  'should be', 'use', 'add', 'remove',
];
const CHANGE_PHRASE_RE = /\b(change|update|edit|fix|modify|replace|wrong|incorrect|actually|wait|should be|shouldn'?t be|use my|use our|add (my|the|our)|remove (my|the)|not the|it'?s not)\b/i;

function rawText(message) {
  if (!message) return '';
  if (typeof message === 'string') return message.trim().toLowerCase();
  return String(message.text || '').trim().toLowerCase();
}

function isAffirmative(message) {
  const t = rawText(message);
  if (!t) return false;

  // Short affirmatives — a single token or tight phrase.
  if (AFFIRMATIVE_SET.has(t)) return true;

  // Sentiment-backed short positive reply ("perfect!", "awesome go for it").
  const analysis = message?.analysis;
  if (analysis && analysis.intent === 'answer' && analysis.sentiment >= 4) {
    const wordCount = t.split(/\s+/).filter(Boolean).length;
    if (wordCount <= 5 && AFFIRMATIVE_PREFIX_RE.test(t)) return true;
  }

  // Affirmative prefix covers "yes, let's build it", "sure go ahead".
  if (AFFIRMATIVE_PREFIX_RE.test(t) && t.split(/\s+/).length <= 6) return true;

  return false;
}

function isNegative(message) {
  const t = rawText(message);
  if (!t) return false;
  if (NEGATIVE_SET.has(t)) return true;
  // Leading negative marker ("no", "nope", "not really", "nah") — accept
  // even when the user adds a short tail, e.g. "nope, we don't have any".
  if (/^(no|nope|nah|not really|don'?t|never mind|nevermind|cancel)\b/i.test(t)
      && t.split(/\s+/).length <= 8) return true;
  return false;
}

function isSkip(message) {
  const t = rawText(message);
  if (!t) return false;

  const analysis = message?.analysis;
  if (analysis?.isDelegation) return true;

  if (SKIP_SET.has(t)) return true;

  // Short phrase skips — don't match "skip the intro" inside a long message
  // as a global skip; only treat skip intent for short replies.
  if (t.split(/\s+/).length <= 6 && SKIP_PHRASE_RE.test(t)) return true;

  return false;
}

function isChangeRequest(message) {
  const t = rawText(message);
  if (!t) return false;
  // Affirmatives are not changes.
  if (isAffirmative(message)) return false;
  if (CHANGE_PHRASE_RE.test(t)) return true;
  return false;
}

module.exports = {
  isAffirmative,
  isNegative,
  isSkip,
  isChangeRequest,
};
