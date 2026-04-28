const { classifyIntent } = require('../llm/intentClassifier');

// Empty / extremely-short text obviously isn't a skip intent in the
// "leave this field blank" sense, and overly-long text is the user
// answering the question rather than skipping. Pre-filtering both ends
// keeps the LLM from being asked obvious questions.
function obviouslyNotSkip(t) {
  if (!t) return true;
  // Field-length answers (>40 chars or 6+ words) are almost certainly
  // a real answer, not a skip phrase.
  if (t.length > 40) return true;
  if (t.split(/\s+/).length > 6) return true;
  return false;
}

/**
 * Detect "skip this optional field" intent — used by wizard handlers
 * (logo / ad generation) on free-text fields like brand colors, slogan,
 * pricing, symbol idea. Catches natural phrasings the old regex missed:
 * "I'll pass", "leave it for now", "no need", "we don't have one yet",
 * "maybe later", etc.
 *
 * Returns false on empty / overly-long input without calling the LLM.
 */
async function isSkipIntent(text) {
  const t = String(text || '').trim();
  if (obviouslyNotSkip(t)) return false;

  const { skip } = await classifyIntent(t, {
    skip: 'User wants to SKIP / LEAVE BLANK / OMIT this optional wizard field. Examples: "skip", "skip it", "skip for now", "no", "nope", "nah", "n/a", "none", "nothing", "pass", "no thanks", "don\'t have one", "we don\'t have any yet", "leave it blank", "I\'ll pass", "maybe later", "not applicable". Match liberally across phrasings and languages. Do NOT match if the user is providing an actual answer (a color, a slogan, a price, etc.) — only when they\'re explicitly opting out of filling this field.',
  }, { operation: 'wizard_skip_intent' });
  return !!skip;
}

/**
 * Detect "use the previously suggested business name" intent — used in
 * the ad / logo flows when a prior conversation surfaced a candidate
 * name (e.g. salesBot → adData.suggestedBusinessName). Catches phrasings
 * like "same", "yes use that one", "go with the previous", "the one we
 * discussed", "yeah continue with it".
 *
 * The suggested name is passed as context so the classifier can tell
 * the difference between "yes [agree to suggested]" and "yes [here's a
 * new name]".
 */
async function isAffirmsSuggestedName(text, suggested) {
  const t = String(text || '').trim();
  if (!t) return false;
  // Long replies (>30 chars or 4+ words) are almost certainly the user
  // typing a new business name, not affirming the suggestion.
  if (t.length > 30 || t.split(/\s+/).length > 4) return false;
  if (!suggested) return false;

  const { affirms } = await classifyIntent(t, {
    affirms: `User is agreeing to USE THE PREVIOUSLY SUGGESTED business name (which is "${suggested}"). Examples: "yes", "yeah", "sure", "ok", "same", "continue", "use it", "that one", "the same one", "go with that", "use the previous", "the one we discussed", in any language. Do NOT match if the user typed a different/new business name (a proper noun that isn\'t "${suggested}").`,
  }, { operation: 'wizard_affirms_suggested' });
  return !!affirms;
}

module.exports = {
  isSkipIntent,
  isAffirmsSuggestedName,
};
