// Side-channel intent classifier for collection states.
//
// Problem this solves:
// The bot is mid-flow asking the user for field X (e.g. "which city are
// you based in?") — but the user replies with content that's actually
// about field Y ("we also do AC selling" — a service add, not a city).
// Without this helper, the state-specific extractor returns "unclear"
// and the bot falls back to a re-ask, ignoring the user's real intent.
//
// What this does:
// One LLM call classifies what the user actually meant. The handler can
// then apply the side-channel update (append the service, change the
// business name, etc.) and re-ask the original question naturally.
//
// Result shape (one of):
//   { kind: 'service_add',    services: [string] }
//   { kind: 'name_change',    value: string }
//   { kind: 'industry_change', value: string }
//   { kind: 'contact_update', email: string|null, phone: string|null, address: string|null }
//   { kind: 'question',       question: string }
//   { kind: 'unclear' }
//
// Use it AFTER your state-specific extractor concludes the message isn't
// a clean answer to the current question. Don't run it on every turn —
// it's a fallback classifier, not a primary one.

const { generateResponse } = require('../llm/provider');
const { logger } = require('../utils/logger');

// Human-readable labels for each collection field. Used in the prompt so
// the LLM understands what the bot was trying to collect.
const FIELD_QUESTIONS = {
  primaryCity: 'Which city are you based in, and which areas do you serve?',
  serviceAreas: 'Which areas / neighborhoods do you serve?',
  businessName: 'What is your business called?',
  industry: 'What industry are you in?',
  services: 'What services or products do you offer?',
  contactEmail: 'What is your email address?',
  contactPhone: 'What is your phone number?',
  contactAddress: 'What is your business address?',
  logo: 'Do you have a logo to upload?',
  colors: 'Any preferred colors / brand palette?',
};

async function classifySideChannelInCollection({ currentField, userText, websiteData = {}, userId }) {
  const raw = String(userText || '').trim();
  if (!raw) return { kind: 'unclear' };

  const currentQuestion = FIELD_QUESTIONS[currentField] || `(unknown field: ${currentField})`;
  const knownServices = Array.isArray(websiteData.services) ? websiteData.services : [];
  const knownName = websiteData.businessName || null;
  const knownIndustry = websiteData.industry || null;

  const prompt = `The user is in the middle of building a website with us. We just asked them: "${currentQuestion}"
They replied: "${raw.slice(0, 400)}"

Their reply did NOT cleanly answer the current question. Classify what they actually meant. Reply in ANY language is OK — read the meaning, not just keywords. Return ONLY valid JSON.

CONTEXT (do not re-add fields the user already gave):
- Business name: ${knownName ? `"${knownName}"` : 'unknown'}
- Industry: ${knownIndustry ? `"${knownIndustry}"` : 'unknown'}
- Existing services list: ${knownServices.length ? JSON.stringify(knownServices) : '(empty)'}

Possible classifications:

1. **service_add** — the user is naming ONE OR MORE services they ALSO offer (in addition to the existing list). Phrasing varies across languages — focus on intent, not keywords. The user is saying "we also do X" / "we also offer Y" / "X is something we provide too". Return ONLY genuinely new services — if they're echoing services already in the existing list, do NOT classify as service_add.
   Shape: {"kind":"service_add","services":["<new service 1>","<new service 2>"]}

2. **name_change** — user wants to update the business name. Phrases like "actually it's called X", "name should be X", "change name to X".
   Shape: {"kind":"name_change","value":"<new name>"}

3. **industry_change** — user wants to update the industry / niche.
   Shape: {"kind":"industry_change","value":"<new industry>"}

4. **contact_update** — the user is volunteering an email, phone, or street address (when we weren't asking for it).
   Shape: {"kind":"contact_update","email":"<email or null>","phone":"<phone or null>","address":"<address or null>"}

5. **question** — the user is asking us a question (not answering ours).
   Shape: {"kind":"question","question":"<short paraphrase>"}

6. **unclear** — none of the above. The reply is genuinely off-topic, confused, or testing.
   Shape: {"kind":"unclear"}

Rules:
- ONLY classify as service_add when the user is genuinely adding to the services list. "We do plumbing" when industry is already Plumbing → unclear, NOT service_add.
- For service_add, return the NEW services only — strip the ones already in the existing list (case-insensitive).
- For name_change / industry_change: only if the user EXPLICITLY signals a change (not just mentions a different word in passing).
- When in doubt → unclear. Don't guess.

Return ONLY the JSON object, nothing else.`;

  let response;
  try {
    response = await generateResponse(
      prompt,
      [{ role: 'user', content: 'Classify the side-channel intent now.' }],
      { userId, operation: 'side_channel_classify', timeoutMs: 10_000 }
    );
  } catch (err) {
    logger.warn(`[SIDE-CHANNEL] LLM call failed: ${err.message}`);
    return { kind: 'unclear' };
  }

  const m = String(response || '').match(/\{[\s\S]*\}/);
  if (!m) return { kind: 'unclear' };

  let parsed;
  try {
    parsed = JSON.parse(m[0]);
  } catch (err) {
    logger.warn(`[SIDE-CHANNEL] Failed to parse JSON: ${err.message}`);
    return { kind: 'unclear' };
  }

  const kind = String(parsed?.kind || '').toLowerCase().trim();

  if (kind === 'service_add') {
    const arr = Array.isArray(parsed.services) ? parsed.services : [];
    const cleaned = arr
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter((s) => s && s.length >= 2 && s.length < 80);
    // Defensive dedupe vs known list — the LLM is supposed to do this
    // already but we re-check so we never silently add dupes.
    const knownLower = new Set(knownServices.map((s) => String(s).toLowerCase().trim()));
    const fresh = cleaned.filter((s) => !knownLower.has(s.toLowerCase()));
    if (fresh.length === 0) return { kind: 'unclear' };
    return { kind: 'service_add', services: fresh };
  }

  if (kind === 'name_change') {
    const v = typeof parsed.value === 'string' ? parsed.value.trim() : '';
    if (!v || v.length < 2 || v.length > 80) return { kind: 'unclear' };
    return { kind: 'name_change', value: v };
  }

  if (kind === 'industry_change') {
    const v = typeof parsed.value === 'string' ? parsed.value.trim() : '';
    if (!v || v.length < 2 || v.length > 60) return { kind: 'unclear' };
    return { kind: 'industry_change', value: v };
  }

  if (kind === 'contact_update') {
    const out = { kind: 'contact_update', email: null, phone: null, address: null };
    if (typeof parsed.email === 'string' && /\S+@\S+\.\S+/.test(parsed.email)) out.email = parsed.email.trim();
    if (typeof parsed.phone === 'string' && /\d/.test(parsed.phone)) out.phone = parsed.phone.trim();
    if (typeof parsed.address === 'string' && parsed.address.trim().length >= 5) out.address = parsed.address.trim();
    if (!out.email && !out.phone && !out.address) return { kind: 'unclear' };
    return out;
  }

  if (kind === 'question') {
    const q = typeof parsed.question === 'string' ? parsed.question.trim() : '';
    return { kind: 'question', question: q || raw.slice(0, 120) };
  }

  return { kind: 'unclear' };
}

module.exports = { classifySideChannelInCollection };
