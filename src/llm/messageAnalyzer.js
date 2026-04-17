/**
 * messageAnalyzer.js
 * ──────────────────────────────────────────────────────────────────────────
 * Rich message-understanding layer that replaces the legacy binary intent
 * classifier (router.js → classifyIntent → INTENT_CLASSIFIER_PROMPT, which
 * only returned "answer" | "question" | "menu" | "exit").
 *
 * One LLM call returns a structured analysis object the router can use to:
 *   - decide whether to fall through, side-answer, switch flow, escalate
 *   - pre-extract entities (business name, email, phone, URL, etc.) so
 *     handlers don't each have to re-parse the same string
 *   - track sentiment + lead temperature signals
 *   - detect topic switches mid-flow ("actually I want a logo instead")
 *   - flag noise messages ("haha", "ok", 👍) so we can stay silent or
 *     send a tiny ack instead of running heavyweight handler logic
 *
 * Schema returned by analyzeMessage(userMessage, user, lastBotMessage):
 *
 *   {
 *     intent: "answer" | "question" | "objection" | "greeting" |
 *             "gratitude" | "frustration" | "service_switch" |
 *             "farewell" | "noise" | "human_request" | "undo",
 *     sentiment: 1..5,                      // 1=angry, 3=neutral, 5=excited
 *     entities: {
 *       business_name: string | null,
 *       email:         string | null,
 *       phone:         string | null,
 *       industry:      string | null,
 *       url:           string | null,
 *       colors:        string | null,
 *       services:      string | null,
 *       location:      string | null
 *     },
 *     topicSwitch: null | "seo" | "webdev" | "appdev" | "marketing" |
 *                  "adgen" | "logo" | "chatbot" | "scheduling" | "general",
 *     language: "en" | <ISO 639-1 code>,
 *     isNoise: boolean,
 *     summary: string,                      // ≤120 chars, for logs
 *     isDelegation: boolean                 // "whatever you think is best"
 *   }
 *
 * Fast paths (no LLM cost):
 *   1. Button / list reply  → intent:"answer"
 *   2. <4 char yes/no/ok/y/n → intent:"answer"
 *
 * Failure mode: any LLM/parse error returns the safe default
 *   { intent:"answer", sentiment:3, entities:{...all null}, topicSwitch:null,
 *     language:"en", isNoise:false, summary:"", isDelegation:false }
 *
 * NOTE: This module does NOT mutate state or call senders. router.js owns
 * the policy decisions on top of the analysis result.
 * ──────────────────────────────────────────────────────────────────────────
 */

const { generateResponse } = require('./provider');
const { logger } = require('../utils/logger');

// ─── State → "what we're collecting right now" hint ────────────────────────
// Used to seed the LLM with context about what a "real answer" looks like
// for the current step. Keep these short — they go into the system prompt.
const STATE_COLLECTING = {
  // Web dev
  WEB_COLLECT_NAME: 'business name',
  WEB_COLLECT_EMAIL: 'email address',
  WEB_COLLECT_INDUSTRY: 'industry / business type',
  WEB_COLLECT_AREAS: 'primary city + service areas',
  WEB_COLLECT_SERVICES: 'list of services/products offered',
  WEB_COLLECT_COLORS: 'preferred brand colors',
  WEB_COLLECT_LOGO: 'logo image (optional)',
  WEB_COLLECT_CONTACT: 'contact details (phone, address)',
  SALON_BOOKING_TOOL: 'salon booking tool preference',
  SALON_INSTAGRAM: 'Instagram handle (optional)',
  SALON_HOURS: 'business hours',
  SALON_SERVICE_DURATIONS: 'service durations',
  WEB_REVISIONS: 'website revision request OR approval',
  // SEO
  SEO_COLLECT_URL: 'website URL to audit',
  SEO_FOLLOW_UP: 'follow-up question about the SEO audit',
  // App dev
  APP_COLLECT_REQUIREMENTS: 'app idea / requirements',
  // Marketing
  MARKETING_COLLECT_DETAILS: 'business + marketing goals',
  // Scheduling
  SCHEDULE_COLLECT_DATE: 'preferred meeting date',
  SCHEDULE_COLLECT_TIME: 'preferred meeting time',
  // Chatbot SaaS
  CB_COLLECT_NAME: 'business name (for their chatbot)',
  CB_COLLECT_INDUSTRY: 'industry',
  CB_COLLECT_FAQS: 'top customer FAQs (multi-turn until "done")',
  CB_COLLECT_SERVICES: 'services + prices',
  CB_COLLECT_HOURS: 'business hours',
  CB_COLLECT_LOCATION: 'business address',
  // Ad generator
  AD_COLLECT_BUSINESS: 'business name (for the ad)',
  AD_COLLECT_INDUSTRY: 'industry',
  AD_COLLECT_NICHE: 'product/service this ad is for',
  AD_COLLECT_SLOGAN: 'brand slogan (optional)',
  AD_COLLECT_PRICING: 'pricing to display on ad (optional)',
  AD_COLLECT_COLORS: 'brand colors (optional)',
  // Logo maker
  LOGO_COLLECT_BUSINESS: 'business name (for the logo)',
  LOGO_COLLECT_INDUSTRY: 'industry',
  LOGO_COLLECT_DESCRIPTION: 'one-sentence description of the business',
  LOGO_COLLECT_COLORS: 'brand colors (optional)',
  LOGO_COLLECT_SYMBOL: 'symbol idea (optional)',
};

// Default null-entity object — reused for fast paths and safe defaults.
const NULL_ENTITIES = Object.freeze({
  business_name: null,
  email: null,
  phone: null,
  industry: null,
  url: null,
  colors: null,
  services: null,
  location: null,
});

function safeDefault() {
  return {
    intent: 'answer',
    sentiment: 3,
    entities: { ...NULL_ENTITIES },
    topicSwitch: null,
    topicSwitches: [],
    language: 'en',
    isNoise: false,
    isAbusive: false,
    summary: '',
    isDelegation: false,
  };
}

/**
 * Build a one-line summary of what the system already knows about the user.
 * Kept short — only signals the LLM benefits from for context.
 */
function summarizeUserMetadata(user) {
  const m = user?.metadata || {};
  const bits = [];
  if (m.websiteData?.businessName) bits.push(`business=${m.websiteData.businessName}`);
  else if (m.adData?.businessName) bits.push(`business=${m.adData.businessName}`);
  else if (m.logoData?.businessName) bits.push(`business=${m.logoData.businessName}`);
  else if (m.chatbotData?.businessName) bits.push(`business=${m.chatbotData.businessName}`);

  if (m.websiteData?.industry) bits.push(`industry=${m.websiteData.industry}`);
  if (m.leadTemperature) bits.push(`lead=${m.leadTemperature}`);
  if (m.adSource) bits.push(`adSource=${m.adSource}`);

  // Which flow is the user mid-way through?
  const state = String(user?.state || '');
  if (state.startsWith('WEB_') || state.startsWith('SALON_')) bits.push('flow=webdev');
  else if (state.startsWith('SEO_')) bits.push('flow=seo');
  else if (state.startsWith('APP_')) bits.push('flow=appdev');
  else if (state.startsWith('MARKETING_')) bits.push('flow=marketing');
  else if (state.startsWith('AD_')) bits.push('flow=adgen');
  else if (state.startsWith('LOGO_')) bits.push('flow=logo');
  else if (state.startsWith('CB_')) bits.push('flow=chatbot');
  else if (state.startsWith('SCHEDULE_')) bits.push('flow=scheduling');
  else if (state.startsWith('DOMAIN_')) bits.push('flow=domain');

  return bits.length ? bits.join(', ') : 'none';
}

/**
 * Strip ```json … ``` fences and surrounding whitespace so JSON.parse can
 * eat the LLM output even when it ignored the "no markdown" instruction.
 */
function extractJson(raw) {
  if (!raw) return null;
  let s = String(raw).trim();

  // Strip code fences if present
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) s = fenceMatch[1].trim();

  // Otherwise grab the first {...} block
  if (!s.startsWith('{')) {
    const objMatch = s.match(/\{[\s\S]*\}/);
    if (objMatch) s = objMatch[0];
  }
  return s;
}

/**
 * Coerce / validate the parsed object so downstream code can trust the shape.
 */
function normalizeAnalysis(parsed) {
  const def = safeDefault();
  if (!parsed || typeof parsed !== 'object') return def;

  const validIntents = new Set([
    'answer', 'question', 'objection', 'greeting', 'gratitude',
    'frustration', 'service_switch', 'farewell', 'noise',
    'human_request', 'undo',
  ]);
  const validTopics = new Set([
    'seo', 'webdev', 'appdev', 'marketing', 'adgen', 'logo',
    'chatbot', 'scheduling', 'general',
  ]);

  const intent = validIntents.has(parsed.intent) ? parsed.intent : def.intent;

  let sentiment = Number(parsed.sentiment);
  if (!Number.isFinite(sentiment) || sentiment < 1 || sentiment > 5) sentiment = 3;
  sentiment = Math.round(sentiment);

  const ent = parsed.entities && typeof parsed.entities === 'object' ? parsed.entities : {};
  const entities = {
    business_name: ent.business_name || null,
    email: ent.email || null,
    phone: ent.phone || null,
    industry: ent.industry || null,
    url: ent.url || null,
    colors: ent.colors || null,
    services: ent.services || null,
    location: ent.location || null,
  };

  const topicSwitch =
    parsed.topicSwitch && validTopics.has(parsed.topicSwitch) ? parsed.topicSwitch : null;

  // Multi-service: when the user asks for several things at once we want
  // to queue the extras. `topicSwitches` (plural) keeps back-compat with
  // the singular `topicSwitch` while carrying the full list.
  let topicSwitches = [];
  if (Array.isArray(parsed.topicSwitches)) {
    const seen = new Set();
    for (const t of parsed.topicSwitches) {
      if (typeof t === 'string' && validTopics.has(t) && !seen.has(t)) {
        seen.add(t);
        topicSwitches.push(t);
      }
    }
  }
  // Back-compat: if the LLM only filled the singular field, mirror it into
  // the array so downstream code can always read `topicSwitches`.
  if (topicSwitches.length === 0 && topicSwitch) topicSwitches = [topicSwitch];

  const language = typeof parsed.language === 'string' && parsed.language.length <= 8
    ? parsed.language
    : 'en';

  return {
    intent,
    sentiment,
    entities,
    topicSwitch,
    topicSwitches,
    language,
    isNoise: Boolean(parsed.isNoise),
    isAbusive: Boolean(parsed.isAbusive),
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 200) : '',
    isDelegation: Boolean(parsed.isDelegation),
  };
}

function buildSystemPrompt({ state, lastBotMessage, collectingHint, metadataSummary }) {
  const stateLabel = state || 'UNKNOWN';
  const lastAsked = lastBotMessage ? lastBotMessage.slice(0, 400) : '(no prior bot message)';
  const collecting = collectingHint || '(not in a collection step)';

  return `You are a message-understanding layer for a WhatsApp sales/service chatbot named Pixie (digital agency: websites, SEO, app dev, ad design, logos, chatbots, marketing).

Your job: read ONE user message in context and return a structured JSON analysis. You do NOT reply to the user. You only classify.

────────────────────────────────────────────────────────────────────────
CURRENT CONVERSATION CONTEXT
────────────────────────────────────────────────────────────────────────
- User's current state: ${stateLabel}
- What the bot is currently collecting / waiting for: ${collecting}
- The bot's last message (what we just asked): "${lastAsked}"
- What we already know about this user: ${metadataSummary}

────────────────────────────────────────────────────────────────────────
INTENT TAXONOMY (pick exactly one)
────────────────────────────────────────────────────────────────────────
- "answer"          → A genuine reply to what the bot asked. Includes affirmatives
                      (yes/sure/ok/go ahead), "skip"/"none", phone numbers, emails,
                      URLs, business names, OR a delegation like "you decide" /
                      "whatever you think". When in doubt, prefer "answer".
- "question"        → User is asking something instead of answering (about pricing,
                      services, timeline, how it works, etc.).
- "objection"       → Pushback on price/value/trust ("too expensive", "I'll think
                      about it", "found cheaper").
- "greeting"        → Hi / hello / good morning, with no actual answer attached.
- "gratitude"       → Thanks / thank you / appreciate it.
- "frustration"     → Annoyed / impatient / venting ("this is taking too long",
                      "ugh", "you're not getting it").
- "service_switch"  → User wants to abandon current flow and start a different
                      service ("actually I want a logo instead", "forget the
                      website, let's do SEO"). Set topicSwitch accordingly.
- "farewell"        → Bye / goodnight / talk later.
- "noise"           → Filler with no informational content: "haha", "ok", "cool",
                      "lol", "nice", "hmm", lone emojis, "k", "👍". Set isNoise:true.
                      (Note: "skip" / "yes" / "no" are NOT noise — they are answers.)
- "human_request"   → Wants a real person ("talk to a human", "let me talk to
                      someone", "real person please").
- "undo"            → Wants to revert ("go back", "wait undo that", "previous
                      step", "scratch that").

────────────────────────────────────────────────────────────────────────
ENTITIES — extract whenever the message contains them, regardless of intent
────────────────────────────────────────────────────────────────────────
Extract these aggressively. Even casual mentions count — the user is rarely
going to "officially" declare their industry, they will just say "I'm a
plumber" or "we run a bakery" in passing. ALWAYS pull these out.

- business_name : the trade/brand name of the business ("Fresh Cuts",
                  "Milan Foods"). NOT the person's own name.
- industry      : the niche / line of work. Extract from professional
                  self-identification too: "I am a plumber" → "plumber",
                  "we run a small bakery" → "bakery", "I'm a dentist" →
                  "dentist", "I do real estate" → "real estate", "I own
                  a salon" → "salon". 1-3 words, lowercase, no fluff.
- email         : an email address.
- phone         : a phone number (international or local).
- url           : a website URL.
- colors        : brand colors mentioned ("blue and white", "navy + gold").
- services      : services or products offered, comma-separated string
                  ("haircuts, beard trims, hot towel shave").
- location      : the city / address / area mentioned.

Use null for anything not present. Do NOT invent values. Do NOT skip an
entity just because the intent is greeting/objection/question — entity
extraction is independent of intent.

────────────────────────────────────────────────────────────────────────
CRITICAL RULE — collection-state messages are answers first
────────────────────────────────────────────────────────────────────────
When the user is in a collection state, their message is PRIMARILY an
ANSWER to the specific field being collected. Do NOT split the answer
into parts you then redistribute across entity fields. Examples:

- State WEB_COLLECT_NAME: the entire message is almost certainly the
  business name. "Ansh plumber" → business_name:"Ansh plumber" (NOT
  business_name:"Ansh" + industry:"plumber"). "Fresh Cuts Barbershop" →
  business_name:"Fresh Cuts Barbershop" (the trailing industry word is
  part of the trade name, keep it intact).
- State WEB_COLLECT_INDUSTRY: the message is the industry. "plumber" →
  industry:"plumber". Don't second-guess and try to pull business name.
- State WEB_COLLECT_SERVICES: the message is their services list.

Only populate OTHER entity fields if the user clearly volunteered extra
info BEYOND what's being asked — typically marked by a comma, "and",
"also", "btw", a URL, an @email, or a phone-shaped number. e.g.
"Fresh Cuts Barbershop, I'm in Karachi" legitimately carries both a
business name AND a location, because the comma separates them.

────────────────────────────────────────────────────────────────────────
TOPIC SWITCH — which flow(s) they want
────────────────────────────────────────────────────────────────────────
seo | webdev | appdev | marketing | adgen | logo | chatbot | scheduling | general

Populate whenever the user expresses interest in a specific productized
service — it does NOT have to be a "switch" from another flow. Fresh
inquiries count too ("I want a website", "can you make me ads").

  - topicSwitch  → the FIRST / primary service they mentioned, or null if none
  - topicSwitches → the ORDERED list of all distinct services mentioned in
                    this message, e.g. ["webdev","logo","adgen"] for
                    "I want a website and a logo and some ads".

Set intent="service_switch" only when the user is EXPLICITLY changing
course mid-flow ("actually I want a logo instead", "forget the website"),
NOT when they're listing multiple services on an otherwise normal turn
(which should stay intent="answer" with topicSwitches filled).

────────────────────────────────────────────────────────────────────────
SENTIMENT (1-5)
────────────────────────────────────────────────────────────────────────
1 = angry / hostile · 2 = frustrated · 3 = neutral · 4 = positive · 5 = excited / delighted

────────────────────────────────────────────────────────────────────────
LANGUAGE
────────────────────────────────────────────────────────────────────────
ISO 639-1 of the user's message ("en", "es", "ur", "ar", "hi", "fr", ...).
Roman Urdu → "ur". Default "en".

────────────────────────────────────────────────────────────────────────
ABUSE / CONTENT FLAG
────────────────────────────────────────────────────────────────────────
isAbusive:true when the message contains hate speech, sexual harassment,
threats, requests for illegal services (hacking, scams, phishing),
spam, or clearly abusive language directed at the bot or others.
Mild frustration ("this sucks") is NOT abusive — that's intent:frustration.
Only flag truly toxic content.

────────────────────────────────────────────────────────────────────────
DELEGATION FLAG
────────────────────────────────────────────────────────────────────────
isDelegation:true when the user is punting the decision to the bot
("whatever you think", "you decide", "use your best judgment", "figure it out",
"same as before", "you already know"). Entities should remain null in this case.

────────────────────────────────────────────────────────────────────────
FEW-SHOT EXAMPLES
────────────────────────────────────────────────────────────────────────
1) State=WEB_COLLECT_INDUSTRY · Bot asked: "What industry are you in?"
   User: "thanks so much!"
   → {"intent":"gratitude","sentiment":4,"entities":{"business_name":null,"email":null,"phone":null,"industry":null,"url":null,"colors":null,"services":null,"location":null},"topicSwitch":null,"language":"en","isNoise":false,"summary":"user thanking bot mid-flow","isDelegation":false}

2) State=WEB_COLLECT_SERVICES · Bot asked: "What services do you offer?"
   User: "haha"
   → {"intent":"noise","sentiment":3,"entities":{"business_name":null,"email":null,"phone":null,"industry":null,"url":null,"colors":null,"services":null,"location":null},"topicSwitch":null,"language":"en","isNoise":true,"summary":"filler laughter","isDelegation":false}

3) State=WEB_COLLECT_COLORS · Bot asked: "What colors do you want?"
   User: "actually how much does this cost?"
   → {"intent":"question","sentiment":3,"entities":{"business_name":null,"email":null,"phone":null,"industry":null,"url":null,"colors":null,"services":null,"location":null},"topicSwitch":null,"language":"en","isNoise":false,"summary":"asking about price mid-collection","isDelegation":false}

4) State=WEB_COLLECT_INDUSTRY · Bot asked: "What industry are you in?"
   User: "I want a logo instead"
   → {"intent":"service_switch","sentiment":3,"entities":{"business_name":null,"email":null,"phone":null,"industry":null,"url":null,"colors":null,"services":null,"location":null},"topicSwitch":"logo","language":"en","isNoise":false,"summary":"wants to switch to logo flow","isDelegation":false}

5) State=WEB_COLLECT_NAME · Bot asked: "What is your business name?"
   User: "My business is Fresh Cuts, we're a barbershop"
   → {"intent":"answer","sentiment":4,"entities":{"business_name":"Fresh Cuts","email":null,"phone":null,"industry":"barbershop","url":null,"colors":null,"services":null,"location":null},"topicSwitch":null,"language":"en","isNoise":false,"summary":"shared business name + industry","isDelegation":false}

6) State=WEB_GENERATING · Bot asked: "Building your site now..."
   User: "this is taking too long"
   → {"intent":"frustration","sentiment":2,"entities":{"business_name":null,"email":null,"phone":null,"industry":null,"url":null,"colors":null,"services":null,"location":null},"topicSwitch":null,"language":"en","isNoise":false,"summary":"impatient with wait","isDelegation":false}

7) State=SALES_CHAT · Bot asked: "What can I help you with?"
   User: "let me talk to a real person"
   → {"intent":"human_request","sentiment":2,"entities":{"business_name":null,"email":null,"phone":null,"industry":null,"url":null,"colors":null,"services":null,"location":null},"topicSwitch":null,"language":"en","isNoise":false,"summary":"requesting human handoff","isDelegation":false}

8) State=AD_COLLECT_SLOGAN · Bot asked: "Brand slogan (or skip)"
   User: "wait undo that"
   → {"intent":"undo","sentiment":3,"entities":{"business_name":null,"email":null,"phone":null,"industry":null,"url":null,"colors":null,"services":null,"location":null},"topicSwitch":null,"language":"en","isNoise":false,"summary":"wants to undo last step","isDelegation":false}

9) State=WEB_COLLECT_SERVICES · Bot asked: "What services or products do you offer?"
   User: "good morning!"
   → {"intent":"greeting","sentiment":4,"entities":{"business_name":null,"email":null,"phone":null,"industry":null,"url":null,"colors":null,"services":null,"location":null},"topicSwitch":null,"language":"en","isNoise":false,"summary":"greeting mid-flow, no answer","isDelegation":false}

10) State=WEB_COLLECT_COLORS · Bot asked: "What colors do you want?"
    User: "whatever you think is best"
    → {"intent":"answer","sentiment":3,"entities":{"business_name":null,"email":null,"phone":null,"industry":null,"url":null,"colors":null,"services":null,"location":null},"topicSwitch":null,"language":"en","isNoise":false,"summary":"delegated decision to bot","isDelegation":true}

11) State=AD_COLLECT_PRICING · Bot asked: "Any pricing info to display? (or skip)"
    User: "skip"
    → {"intent":"answer","sentiment":3,"entities":{"business_name":null,"email":null,"phone":null,"industry":null,"url":null,"colors":null,"services":null,"location":null},"topicSwitch":null,"language":"en","isNoise":false,"summary":"skipped optional field","isDelegation":false}

12) State=WEB_CONFIRM · Bot asked: "Ready to generate?"
    User: "yes"
    → {"intent":"answer","sentiment":4,"entities":{"business_name":null,"email":null,"phone":null,"industry":null,"url":null,"colors":null,"services":null,"location":null},"topicSwitch":null,"language":"en","isNoise":false,"summary":"affirmative confirmation","isDelegation":false}

13) State=SALES_CHAT · Bot asked: "What's your budget range?"
    User: "too expensive"
    → {"intent":"objection","sentiment":2,"entities":{"business_name":null,"email":null,"phone":null,"industry":null,"url":null,"colors":null,"services":null,"location":null},"topicSwitch":null,"language":"en","isNoise":false,"summary":"price objection","isDelegation":false}

14) State=SALES_CHAT · Bot asked: "What can I help with?"
    User: "Hi I need help with my business online presence"
    → {"intent":"answer","sentiment":4,"entities":{"business_name":null,"email":null,"phone":null,"industry":null,"url":null,"colors":null,"services":null,"location":null},"topicSwitch":null,"language":"en","isNoise":false,"summary":"vague online-presence inquiry","isDelegation":false}

15) State=SEO_COLLECT_URL · Bot asked: "Send your website URL"
    User: "نہیں شکریہ"
    → {"intent":"answer","sentiment":3,"entities":{"business_name":null,"email":null,"phone":null,"industry":null,"url":null,"colors":null,"services":null,"location":null},"topicSwitch":null,"language":"ur","isNoise":false,"summary":"declined politely (Urdu)","isDelegation":false}

16) State=WEB_COLLECT_CONTACT · Bot asked: "Share your email and phone"
    User: "ali@example.com, +92 333 1234567, Karachi"
    → {"intent":"answer","sentiment":3,"entities":{"business_name":null,"email":"ali@example.com","phone":"+92 333 1234567","industry":null,"url":null,"colors":null,"services":null,"location":"Karachi"},"topicSwitch":null,"language":"en","isNoise":false,"summary":"shared full contact details","isDelegation":false}

17) State=SALES_CHAT · Bot asked: "What can I help you with?"
    User: "I am a plumber, I want a website"
    → {"intent":"answer","sentiment":4,"entities":{"business_name":null,"email":null,"phone":null,"industry":"plumber","url":null,"colors":null,"services":null,"location":null},"topicSwitch":"webdev","language":"en","isNoise":false,"summary":"plumber wants a website","isDelegation":false}

18) State=SALES_CHAT · Bot asked: "What's your business about?"
    User: "we run a small bakery in Lahore"
    → {"intent":"answer","sentiment":3,"entities":{"business_name":null,"email":null,"phone":null,"industry":"bakery","url":null,"colors":null,"services":null,"location":"Lahore"},"topicSwitch":null,"language":"en","isNoise":false,"summary":"bakery owner in Lahore","isDelegation":false}

19) State=SALES_CHAT · Bot asked: "What's your business?"
    User: "I'm a dentist and need a new site for my clinic, BrightSmile Dental"
    → {"intent":"answer","sentiment":3,"entities":{"business_name":"BrightSmile Dental","email":null,"phone":null,"industry":"dentist","url":null,"colors":null,"services":null,"location":null},"topicSwitch":null,"language":"en","isNoise":false,"summary":"dentist wants site for BrightSmile Dental","isDelegation":false}

20) State=SALES_CHAT · Bot asked: "Tell me a bit about yourself"
    User: "i do real estate in austin, mostly residential"
    → {"intent":"answer","sentiment":3,"entities":{"business_name":null,"email":null,"phone":null,"industry":"real estate","url":null,"colors":null,"services":"residential real estate","location":"austin"},"topicSwitch":null,"language":"en","isNoise":false,"summary":"residential real-estate agent in Austin","isDelegation":false}

21) State=SALES_CHAT · Bot asked: "What's your business?"
    User: "I run a restaurant called Spice Garden"
    → {"intent":"answer","sentiment":4,"entities":{"business_name":"Spice Garden","email":null,"phone":null,"industry":"restaurant","url":null,"colors":null,"services":null,"location":null},"topicSwitch":null,"language":"en","isNoise":false,"summary":"restaurant owner of Spice Garden","isDelegation":false}

22) State=WEB_COLLECT_NAME · Bot asked: "What's your business name?"
    User: "Ansh plumber"
    → {"intent":"answer","sentiment":3,"entities":{"business_name":"Ansh plumber","email":null,"phone":null,"industry":null,"url":null,"colors":null,"services":null,"location":null},"topicSwitch":null,"language":"en","isNoise":false,"summary":"gave business name","isDelegation":false}

23) State=WEB_COLLECT_NAME · Bot asked: "What's your business name?"
    User: "Fresh Cuts Barbershop, I'm in Karachi"
    → {"intent":"answer","sentiment":4,"entities":{"business_name":"Fresh Cuts Barbershop","email":null,"phone":null,"industry":"barbershop","url":null,"colors":null,"services":null,"location":"Karachi"},"topicSwitch":null,"language":"en","isNoise":false,"summary":"barbershop in Karachi","isDelegation":false}

────────────────────────────────────────────────────────────────────────
RESPONSE FORMAT — STRICT
────────────────────────────────────────────────────────────────────────
Return ONLY a single valid JSON object matching the schema above.
- No markdown.
- No code fences.
- No commentary, no preamble, no trailing text.
- All keys present, even when values are null/false.`;
}

/**
 * Analyze a single user message in the context of the current conversation.
 *
 * @param {string} userMessage  The raw user text (post-transcription if audio).
 * @param {object} user         The user record (must include `state` and optionally `metadata`).
 * @param {string} [lastBotMessage] The bot's most recent outgoing text.
 * @returns {Promise<object>} See module-level schema.
 */
async function analyzeMessage(userMessage, user, lastBotMessage) {
  // ── Fast path 1: button / list reply — no analysis needed ────────────────
  // Callers may pass either the raw text or a synthetic message with payload
  // metadata. We support both shapes by accepting an object too.
  let text = userMessage;
  let payloadHit = false;
  if (userMessage && typeof userMessage === 'object') {
    payloadHit = Boolean(userMessage.buttonId || userMessage.listId || userMessage.payload);
    text = userMessage.text || '';
  }

  if (payloadHit) {
    return safeDefault();
  }

  const t = String(text || '').trim();

  // ── Fast path 2: empty / very short obvious affirmatives & negatives ─────
  if (!t) return safeDefault();
  if (t.length < 4 && /^(y|n|ok|yes|no|k)$/i.test(t)) {
    return safeDefault();
  }

  // ── LLM call ─────────────────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt({
    state: user?.state,
    lastBotMessage: lastBotMessage || '',
    collectingHint: STATE_COLLECTING[user?.state] || '',
    metadataSummary: summarizeUserMetadata(user),
  });

  try {
    const raw = await generateResponse(
      systemPrompt,
      [{ role: 'user', content: t }],
      {
        userId: user?.id,
        operation: 'message_analyzer',
        // This call drives intent, sentiment and entity extraction for the
        // whole router — accuracy matters far more than per-call cost. 4o
        // beats 4o-mini on short-input intent classification and avoids
        // common entity-split failures (e.g. "Ansh plumber" being bisected).
        model: 'gpt-4o',
      }
    );

    const jsonStr = extractJson(raw);
    if (!jsonStr) return safeDefault();

    const parsed = JSON.parse(jsonStr);
    return normalizeAnalysis(parsed);
  } catch (err) {
    logger.warn(`messageAnalyzer failed, using safe default: ${err.message}`);
    return safeDefault();
  }
}

module.exports = {
  analyzeMessage,
  // Exported for tests / future router use:
  STATE_COLLECTING,
  safeDefault,
};
