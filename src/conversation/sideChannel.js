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
  bookingTool: 'Do you already use a booking tool (Fresha, Booksy, Vagaro, Calendly, etc.) — or should we build you one?',
  salonHours: 'What are your salon\'s opening hours?',
  salonDurations: 'How long does each service take, and what is the price?',
  agentProfile: 'What is your brokerage, years in real estate, and any designations?',
  listingsAsk: 'Do you want to send your listings now, or skip and use placeholder listings?',
  listingsDetails: 'Send your next listing details (address, price, beds/baths/sqft), or reply done.',
  listingsPhotos: 'Send a listing photo as an image, or reply done / skip to use stock photos.',
};

async function classifySideChannelInCollection({ currentField, userText, websiteData = {}, userId }) {
  const raw = String(userText || '').trim();
  // Phase 1 observability — every return path through this function
  // logs its verdict against the turn so the admin "🔍 Trace" panel
  // can show what side-channel decided. Implemented as an inner
  // function that swallows its own errors so observability can never
  // break classification.
  const __sc_start = Date.now();
  const __sc_log = (verdict) => {
    try {
      const { recordClassifierDecision } = require('../db/classifierDecisions');
      recordClassifierDecision({
        classifier: 'classifySideChannelInCollection',
        inputText: raw,
        inputContext: {
          currentField,
          knownName: websiteData.businessName || null,
          knownIndustry: websiteData.industry || null,
          knownServicesCount: Array.isArray(websiteData.services) ? websiteData.services.length : 0,
        },
        output: verdict,
        latencyMs: Date.now() - __sc_start,
        userId,
      }).catch(() => {});
    } catch (_) {}
  };
  if (!raw) { const r = { kind: 'unclear' }; __sc_log(r); return r; }

  const currentQuestion = FIELD_QUESTIONS[currentField] || `(unknown field: ${currentField})`;
  const knownServices = Array.isArray(websiteData.services) ? websiteData.services : [];
  const knownName = websiteData.businessName || null;
  const knownIndustry = websiteData.industry || null;

  const prompt = `The user is in the middle of building a website with us. We just asked them: "${currentQuestion}"
They replied: "${raw.slice(0, 400)}"

Their reply did NOT cleanly answer the current question. Classify what they actually meant. Reply in ANY language is OK — read the meaning, not just keywords. Return ONLY valid JSON.

HARD RULE — anti-"unclear" bias for contact info: if the message contains ANY of (a) the literal word "Address" / "Email" / "Phone" / "Mobile" / "Tel" / "Number" followed by a value, OR (b) an at-sign with text on both sides, OR (c) a run of 6+ digits, OR (d) a street/road/avenue/lane/block/sector/colony/nagar/society keyword followed by a place token — you MUST return contact_update with the matching field set. Do NOT return unclear for these cases. Examples that are ALL contact_update, never unclear:
   - "Address zamzama road karachi" → {"kind":"contact_update","address":"zamzama road karachi","email":null,"phone":null}
   - "Phone 03353279708" → {"kind":"contact_update","phone":"03353279708","email":null,"address":null}
   - "Email is foo@bar.com" → {"kind":"contact_update","email":"foo@bar.com","phone":null,"address":null}
   - "5 jail road, lahore" → {"kind":"contact_update","address":"5 jail road, lahore","email":null,"phone":null}
   - "Block 4 gulshan-e-iqbal" → {"kind":"contact_update","address":"Block 4 gulshan-e-iqbal","email":null,"phone":null}

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

4. **contact_update** — the user is volunteering an email, phone, or street address (when we weren't asking for it). Be generous here: any message that ALMOST looks like contact info should land as contact_update, not unclear. Specifically:
   - Explicit labels: "Address X" / "address: X" / "phone is X" / "email X" / "the address is X" — extract the value, set the matching field.
   - Bare prose with a street/road/colony/sector hint and a place name ("zamzama road karachi", "5 main street, austin", "block 4 gulshan", "23 jail road") — that's an address, set the address field.
   - Phone-shaped digit runs and email-shaped strings always count.
   Shape: {"kind":"contact_update","email":"<email or null>","phone":"<phone or null>","address":"<address or null>"}

5. **question** — the user is asking us a question (not answering ours).
   Shape: {"kind":"question","question":"<short paraphrase>"}

6. **unclear** — none of the above. The reply is genuinely off-topic, confused, or testing.
   Shape: {"kind":"unclear"}

Rules:
- The HARD RULE for contact info above OVERRIDES every other rule below. If the message has an Address/Email/Phone label, an at-sign, a 6+ digit run, or a street/road/block/sector keyword, it IS contact_update and never unclear — even if you're tempted to call it unclear.
- ONLY classify as service_add when the user is genuinely adding to the services list. "We do plumbing" when industry is already Plumbing → unclear, NOT service_add.
- For service_add, return the NEW services only — strip the ones already in the existing list (case-insensitive).
- For name_change / industry_change: only if the user EXPLICITLY signals a change (not just mentions a different word in passing).
- When in doubt between an actionable category (service_add / name_change / industry_change / contact_update / question) and unclear → pick unclear. But contact info always wins per the HARD RULE.

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
    const r = { kind: 'unclear', _reason: 'llm_failed' }; __sc_log(r); return { kind: 'unclear' };
  }

  const m = String(response || '').match(/\{[\s\S]*\}/);
  if (!m) { const r = { kind: 'unclear', _reason: 'no_json' }; __sc_log(r); return { kind: 'unclear' }; }

  let parsed;
  try {
    parsed = JSON.parse(m[0]);
  } catch (err) {
    logger.warn(`[SIDE-CHANNEL] Failed to parse JSON: ${err.message}`);
    const r = { kind: 'unclear', _reason: 'parse_failed' }; __sc_log(r); return { kind: 'unclear' };
  }

  const kind = String(parsed?.kind || '').toLowerCase().trim();
  let result = null;

  if (kind === 'service_add') {
    const arr = Array.isArray(parsed.services) ? parsed.services : [];
    const cleaned = arr
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter((s) => s && s.length >= 2 && s.length < 80);
    // Defensive dedupe vs known list — the LLM is supposed to do this
    // already but we re-check so we never silently add dupes.
    const knownLower = new Set(knownServices.map((s) => String(s).toLowerCase().trim()));
    const fresh = cleaned.filter((s) => !knownLower.has(s.toLowerCase()));
    result = fresh.length === 0 ? { kind: 'unclear' } : { kind: 'service_add', services: fresh };
  } else if (kind === 'name_change') {
    const v = typeof parsed.value === 'string' ? parsed.value.trim() : '';
    result = (!v || v.length < 2 || v.length > 80) ? { kind: 'unclear' } : { kind: 'name_change', value: v };
  } else if (kind === 'industry_change') {
    const v = typeof parsed.value === 'string' ? parsed.value.trim() : '';
    result = (!v || v.length < 2 || v.length > 60) ? { kind: 'unclear' } : { kind: 'industry_change', value: v };
  } else if (kind === 'contact_update') {
    const out = { kind: 'contact_update', email: null, phone: null, address: null };
    if (typeof parsed.email === 'string' && /\S+@\S+\.\S+/.test(parsed.email)) out.email = parsed.email.trim();
    if (typeof parsed.phone === 'string' && /\d/.test(parsed.phone)) out.phone = parsed.phone.trim();
    if (typeof parsed.address === 'string' && parsed.address.trim().length >= 5) out.address = parsed.address.trim();
    result = (!out.email && !out.phone && !out.address) ? { kind: 'unclear' } : out;
  } else if (kind === 'question') {
    const q = typeof parsed.question === 'string' ? parsed.question.trim() : '';
    result = { kind: 'question', question: q || raw.slice(0, 120) };
  } else {
    result = { kind: 'unclear' };
  }

  __sc_log(result);
  return result;
}

module.exports = { classifySideChannelInCollection };
