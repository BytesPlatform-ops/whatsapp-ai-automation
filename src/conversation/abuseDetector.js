// Abuse detection (Phase 13).
//
// Classifies an incoming message into one of eight categories so the
// router can short-circuit before the normal flow runs:
//
//   hate            — slurs, targeted hate speech
//   threats         — threats of violence toward people / property
//   phishing        — impersonation / social engineering
//   hacking         — unauthorized security work, breaking into accounts
//   illegal         — CSAM, drug sales, fraud, weapons, trafficking
//   nsfw_declined   — adult entertainment, cannabis, gambling
//                     (legal but outside our service scope)
//   gray_area       — MLM lead gen, crypto "opportunities",
//                     diet-pill dropshipping — route to meeting booking
//                     for a custom conversation instead of the normal flow
//   clean           — everything else (normal routing applies)
//
// LLM-first classifier with a cheap regex fast-path for the most
// obvious slur-shaped inputs. The regex path exists only so clearly
// abusive messages never sit through an LLM round-trip — it NEVER
// overrides a clean verdict, only flags when confident.

const { generateResponse } = require('../llm/provider');
const { logger } = require('../utils/logger');

const HARD_CATEGORIES = new Set(['hate', 'threats', 'phishing', 'hacking', 'illegal']);
const ALL_CATEGORIES = new Set([
  'hate', 'threats', 'phishing', 'hacking', 'illegal',
  'nsfw_declined', 'gray_area', 'clean',
]);

/**
 * Regex fast-path that catches the clearest hate/threat patterns without
 * an LLM call. Narrow on purpose — false positives here silence the
 * whole conversation, so we only flag things no reasonable message
 * would contain. Anything subtler goes to the LLM.
 */
function regexFastPath(raw) {
  const text = String(raw || '').toLowerCase();

  // Explicit violence threats with targeting ("i will kill you", "i'll shoot").
  if (/\b(i\s*(?:will|'ll|am\s*gonna|'m\s*gonna|will)\s+(?:kill|shoot|stab|beat|harm|hurt)\s+(?:you|him|her|them|u)|kill\s+yourself|go\s+die)\b/i.test(text)) {
    return 'threats';
  }
  // Explicit unauthorized-hacking asks.
  if (/\b(help\s+me\s+(?:hack|crack|break\s+into)|how\s+do\s+i\s+(?:hack|crack)|brute[\s-]?force\s+(?:login|password|account))\b/i.test(text)) {
    return 'hacking';
  }
  // Explicit impersonation/phishing.
  if (/\b(phishing|clone\s+(?:of|a)\s+(?:chase|bank|paypal|amazon|apple|microsoft)|fake\s+(?:login|bank)\s+page|steal\s+(?:passwords|credentials|credit\s*cards?))\b/i.test(text)) {
    return 'phishing';
  }
  return null;
}

/**
 * Classify a message. Returns one of:
 *   hate | threats | phishing | hacking | illegal | nsfw_declined | gray_area | clean
 *
 * Cheap pre-filters:
 *   - Empty / very short messages default to 'clean'.
 *   - Button / list replies bypass the check entirely (caller should
 *     not invoke classifyAbuse for those).
 *
 * On LLM failure: returns 'clean' so a flaky API never silences a
 * legitimate user. False negatives are preferable to false positives
 * for this check.
 */
async function classifyAbuse(text, userId) {
  const raw = String(text || '').trim();
  if (!raw || raw.length < 3) return 'clean';

  // Regex fast-path — only promote to abusive categories, never demote.
  const fast = regexFastPath(raw);
  if (fast) return fast;

  const prompt = `You are a content-safety classifier for a small-business services chatbot (Pixie). It builds websites, runs SEO audits, makes logos, designs marketing ads, and deploys AI chatbots. Classify the user's message into EXACTLY ONE category:

Categories:
- "hate": slurs or targeted hate speech against a group (race, religion, gender, orientation, disability).
- "threats": credible threats of violence toward a specific person or property ("i'll kill him", "burn their store down").
- "phishing": asks for work that enables identity theft / impersonation of another brand ("build a site that looks like Chase Bank's login", "clone paypal checkout").
- "hacking": unauthorized security/attack assistance ("help me break into X's account", "crack this hash", "bypass 2FA"). Legitimate security work (pen-test WITH consent, their own site) is NOT this category.
- "illegal": CSAM, explicit drug-trafficking setup, weapons dealing, human trafficking, clear fraud templates.
- "nsfw_declined": explicit adult entertainment, cannabis retail, online gambling — legal in some places but outside our service scope.
- "gray_area": MLM / network marketing lead-capture, crypto "opportunity" pitches, diet-pill dropshipping, miracle-cure supplements. Not illegal, but risky enough to need a human consultation before we commit.
- "clean": anything else. Normal small-business requests, product questions, complaints, confusion — ALL "clean".

Rules:
- When in doubt, return "clean". Most messages are clean.
- A business name or industry that contains a spicy word is NOT automatically a category. "Hasnain Plumbing" → clean. "We run a cannabis dispensary" → nsfw_declined. "We sell crypto trading signals" → gray_area.
- Don't over-classify complaints, profanity, frustration as hate. "this is fucking frustrating" → clean. "Go kill yourself" → threats.
- The user is the business owner. They're describing THEIR business or asking for help. Tone-interpret accordingly.

User message: "${raw.replace(/"/g, '\\"').slice(0, 500)}"

Return ONLY one word from the list above. No quotes, no explanation.`;

  try {
    const resp = await generateResponse(
      prompt,
      [{ role: 'user', content: 'Classify now.' }],
      { userId, operation: 'abuse_classify', timeoutMs: 8_000, model: 'gpt-5.4-nano' }
    );
    const cleaned = String(resp || '').trim().toLowerCase().replace(/[^a-z_]/g, '');
    if (ALL_CATEGORIES.has(cleaned)) return cleaned;
    return 'clean';
  } catch (err) {
    logger.warn(`[ABUSE] LLM classify failed for user ${userId}: ${err.message}`);
    return 'clean';
  }
}

module.exports = {
  classifyAbuse,
  HARD_CATEGORIES,
  ALL_CATEGORIES,
};
