const { sendTextMessage, sendCTAButton } = require('../../messages/sender');
const { logMessage, getConversationHistory } = require('../../db/conversations');
const { generateResponse } = require('../../llm/provider');
const { classifyIntent } = require('../../llm/intentClassifier');
const { buildSalesPrompt } = require('../../llm/prompts');
const { formatWhatsApp } = require('../../utils/formatWhatsApp');
const { updateUserMetadata } = require('../../db/users');
const { logger } = require('../../utils/logger');
const { STATES } = require('../states');
const { env } = require('../../config/env');
const { saveLeadSummary } = require('../../db/leadSummaries');
const { buildSummaryContext } = require('../summaryManager');
const { hydrateWebsiteData } = require('../entityAccumulator');
const { localize } = require('../../utils/localizer');
const { isServiceEnabled, findServiceByKey } = require('../../config/services');
const { handoffToHuman } = require('../handoff');

/**
 * Extract and strip the [LEAD_BRIEF]...[/LEAD_BRIEF] block from the LLM response.
 * Returns { leadBrief: string|null, cleanText: string }
 */
/**
 * Build a compact "KNOWN FACTS" block for the sales prompt from whatever
 * entity info we've accumulated into metadata. Injecting this into the
 * system prompt lets the LLM skip re-asking for things the user already
 * said — and trust that the wizard can start with these values pre-filled
 * if they trigger the website demo.
 */
function buildKnownContext(user) {
  const wd = user?.metadata?.websiteData || {};
  const md = user?.metadata || {};
  const entries = [];
  if (wd.businessName) entries.push(`- Business name: ${wd.businessName}`);
  if (wd.industry) entries.push(`- Industry: ${wd.industry}`);
  if (wd.primaryCity) entries.push(`- City: ${wd.primaryCity}`);
  if (Array.isArray(wd.services) && wd.services.length) {
    entries.push(`- Services: ${wd.services.slice(0, 5).join(', ')}`);
  }
  if (wd.contactEmail) entries.push(`- Email: ${wd.contactEmail}`);
  if (wd.contactPhone) entries.push(`- Phone: ${wd.contactPhone}`);
  if (wd.contactAddress) entries.push(`- Address: ${wd.contactAddress}`);

  if (!entries.length && !md.paymentConfirmed) return '';

  // Surface delivered/paid state so the LLM stops re-pitching the same
  // service on a returning post-payment user. Without this, it has been
  // observed responding to a generic returning "hi" with "love it! i'll
  // activate your site now and send the live link..." — a hallucinated
  // flow we don't even run.
  let deliveredBlock = '';
  if (md.paymentConfirmed) {
    const bits = [];
    if (md.lastCompletedProjectType) bits.push(`Project type: ${md.lastCompletedProjectType}`);
    if (md.lastBusinessName) bits.push(`Business: ${md.lastBusinessName}`);
    if (md.paidAt) bits.push(`Paid at: ${md.paidAt}`);
    if (md.lastPaymentAmount) bits.push(`Amount: $${Math.round(md.lastPaymentAmount / 100)}`);
    deliveredBlock = `\n\n---\n\n## ⚠️ PROJECT ALREADY DELIVERED — DO NOT RE-PITCH
This customer has ALREADY paid for and received their project. The site is live, the banner is gone, the work is done.
${bits.map((b) => `- ${b}`).join('\n')}

Hard rules for this turn:
- Do NOT say things like "I'll activate your site now", "I'll send the live link", or any phrasing that implies the project is still being delivered.
- Do NOT ask for any details that would re-trigger the same flow they already completed.
- Do NOT emit [TRIGGER_WEBSITE_DEMO] / [TRIGGER_LOGO_MAKER] / [TRIGGER_AD_GENERATOR] / [TRIGGER_CHATBOT_DEMO] for the SAME service they already paid for.
- DO acknowledge the delivered project briefly if it's natural to do so.
- DO offer a complementary service (logo, ad, SEO audit, chatbot — but NOT the one they already bought) if they seem open to more work.
- DO answer questions or accept tweak requests for the existing project.
---
`;
  }

  if (!entries.length) return deliveredBlock;

  return `\n\n---\n\n## KNOWN FACTS ABOUT THIS CUSTOMER
The user has already shared these details in-conversation. Do NOT re-ask for any of them. Treat them as authoritative for triggering flows:
${entries.join('\n')}

When emitting [TRIGGER_WEBSITE_DEMO], fill the structured tag from these facts so the wizard skips the corresponding steps.
---
${deliveredBlock}`;
}

function extractLeadBrief(text) {
  const match = text.match(/\[LEAD_BRIEF\]([\s\S]*?)\[\/LEAD_BRIEF\]/i);
  if (!match) return { leadBrief: null, cleanText: text };
  const leadBrief = match[1].trim();
  const cleanText = text.replace(/\[LEAD_BRIEF\][\s\S]*?\[\/LEAD_BRIEF\]/i, '').trim();
  return { leadBrief, cleanText };
}

async function handleSalesBot(user, message) {
  const text = (message.text || '').trim();

  if (!text) {
    await sendTextMessage(
      user.phone_number,
      "Hey! I didn't catch that - what can I help you with?"
    );
    return STATES.SALES_CHAT;
  }

  // Un-stick: if websiteDemoTriggered was set in a previous turn but the
  // demo never actually produced a preview (no site deployed), clear the
  // flag so the next trigger attempt can fire. Without this, the LLM
  // sometimes says "Here's your preview!" with no link — the user is
  // trapped because the gate thinks the demo already ran.
  if (user.metadata?.websiteDemoTriggered) {
    try {
      const { getLatestSite } = require('../../db/sites');
      const latest = await getLatestSite(user.id);
      if (!latest || !latest.preview_url) {
        logger.info(`[SALES] websiteDemoTriggered=true but no preview_url for ${user.phone_number} — un-sticking the flag`);
        await updateUserMetadata(user.id, { websiteDemoTriggered: false });
        user.metadata = { ...(user.metadata || {}), websiteDemoTriggered: false };
      }
    } catch (err) {
      logger.warn(`[SALES] Stuck-flag check failed: ${err.message}`);
    }
  }

  // The router already classified the user's message via
  // classifyFeedbackSignals(... { includeSales: true }) and stashed the
  // result on user._classifiedIntents — so we pick up notInterested /
  // agreed without paying for a second LLM round-trip. Defensive fallback
  // for the rare path that bypasses the router (tester accounts, manual
  // invocations) — it self-classifies in that case so behavior is
  // identical, just one call slower.
  let userIntents = user._classifiedIntents;
  if (!userIntents || typeof userIntents.notInterested !== 'boolean') {
    userIntents = await classifyIntent(text, {
      notInterested: 'User is opting out of further contact: wants follow-ups stopped, doesn\'t want to be messaged, or is firmly declining the service ("not interested", "stop messaging", "I\'m good thanks", "no need", "leave me alone", "don\'t contact me", "unsubscribe", "maybe later but stop bugging me"). Do NOT match if the user is just asking on behalf of someone else, declining one specific suggestion while still engaged, or simply unsure.',
      agreed: 'User is affirming or agreeing to proceed with what was just offered or asked. Match liberally: "yes", "yeah", "sure", "ok", "sounds good", "let\'s do it", "I\'m in", "go ahead", "deal", "perfect", "alright", and equivalents in any language including Roman Urdu/Hindi ("haan", "theek hai", "chalo"). Do NOT match plain greetings or unrelated answers.',
    }, { userId: user.id, operation: 'sales_user_intent' });
  }

  if (userIntents.notInterested && !user.metadata?.followupOptOut) {
    await updateUserMetadata(user.id, { followupOptOut: true });
    await sendTextMessage(
      user.phone_number,
      "No worries at all! I won't follow up further. If you ever change your mind, just send a message and I'll be here. Have a great day!"
    );
    await logMessage(user.id, 'User not interested — follow-ups stopped', 'assistant');
    saveLeadSummary(user, 'opted_out', 'User said not interested — follow-ups stopped').catch(() => {});
    return STATES.SALES_CHAT;
  }

  // Extract any website-relevant entities the user just dropped into sales
  // chat (business name, industry, city, email, phone, address, services).
  // Storing them here means the website-demo trigger can pre-fill the wizard
  // without having to re-ask the user for things they already said, and the
  // LLM itself gets told about them via buildKnownContext below so it stops
  // asking "what's your business called?" when the user already said it.
  try {
    const { updatedUser, captured } = await hydrateWebsiteData(user, text);
    if (captured.length) {
      logger.info(`[SALES] Hydrated from sales-chat message: ${captured.join(', ')}`);
      user = updatedUser;
    }
  } catch (err) {
    logger.warn(`[SALES] Entity hydration failed: ${err.message}`);
  }

  // Get conversation history (last 40 messages for full context).
  // Pass afterTimestamp so /reset gives a clean slate — pre-reset
  // messages stay in the DB for admin but are invisible to the LLM.
  const history = await getConversationHistory(user.id, 40, {
    afterTimestamp: user.metadata?.lastResetAt || null,
  });

  // First message ever - let the LLM generate the greeting so it matches
  // the user's language and tone from their very first message.
  // (No hardcoded English greeting - the system prompt instructs the LLM
  // on how to greet based on ad source and user language.)

  const messages = history.map((h) => ({
    role: h.role,
    content: h.message_text,
  }));

  // Add the current user message
  messages.push({ role: 'user', content: text });

  // Determine ad source from user metadata (set externally via UTM / ad tracking)
  const adSource = user.metadata?.adSource || 'generic';

  let systemPrompt = buildSalesPrompt(env.calendlyUrl, env.portfolio, adSource);
  systemPrompt += buildSummaryContext(user);
  systemPrompt += buildKnownContext(user);

  // If we just ran an SEO audit, inject the findings so the bot can pitch based on real data
  const seoAnalysis = user.metadata?.lastSeoAnalysis;
  if (seoAnalysis) {
    systemPrompt += `\n\n---\n\n## SEO AUDIT CONTEXT\n\nYou just ran a live SEO audit on the client's website (${user.metadata.lastSeoUrl || 'their site'}). The full report has been sent as a PDF. Here are the findings:\n\n${seoAnalysis.slice(0, 2000)}\n\n**Use these specific findings to pitch the right SEO package.** Reference their actual issues - don't be generic. Show them exactly what's broken and how the package you're recommending fixes it. This is your strongest closer - you have real data, use it.`;
  }

  let rawResponse;
  try {
    rawResponse = await generateResponse(systemPrompt, messages, {
      userId: user.id,
      operation: 'sales_chat',
    });
  } catch (error) {
    logger.error('Sales bot LLM error:', error);
    await sendTextMessage(
      user.phone_number,
      "Sorry, something went wrong on my end. Give me a moment and try again."
    );
    return STATES.SALES_CHAT;
  }

  // Extract lead brief if qualification is complete
  const { leadBrief, cleanText } = extractLeadBrief(rawResponse);

  if (leadBrief && !user.metadata?.leadBriefSent) {
    logger.info(`[LEAD BRIEF] ${user.phone_number}:\n${leadBrief}`);
    // Extract lead temperature from the brief
    const tempMatch = leadBrief.match(/Lead temperature:\s*(HOT|WARM|COLD)/i);
    const leadTemperature = tempMatch ? tempMatch[1].toUpperCase() : 'WARM';
    // Extract closing technique if mentioned
    const closeMatch = leadBrief.match(/Closing technique used:\s*(.+)/i);
    const closingTechnique = closeMatch ? closeMatch[1].trim() : null;
    // Persist in metadata so we only log it once
    await updateUserMetadata(user.id, {
      leadBriefSent: true,
      leadBrief,
      leadTemperature,
      ...(closingTechnique && closingTechnique !== 'N/A' ? { closingTechnique } : {}),
    });
  }

  // Check for trigger tags before sending the response.
  // Website trigger supports three forms:
  //   1. Bare:       [TRIGGER_WEBSITE_DEMO]
  //   2. Plain name: [TRIGGER_WEBSITE_DEMO: BytesMobile]
  //   3. Structured: [TRIGGER_WEBSITE_DEMO: name="X"; industry="Y"; services="A, B"]
  // The structured form lets the wizard skip steps the LLM already heard
  // answers for, so the user isn't asked again for things they already said.
  const websiteDemoMatch = cleanText.match(/\[TRIGGER_WEBSITE_DEMO(?::\s*([^\]]*))?\]/i);
  let websiteDemoTrigger = !!websiteDemoMatch;
  let websiteDemoBusinessName = null;
  let websiteDemoIndustry = null;
  let websiteDemoServices = null;
  if (websiteDemoMatch && websiteDemoMatch[1]) {
    const payload = websiteDemoMatch[1].trim();
    const isStructured = /[;=]/.test(payload);
    const clean = (v) => {
      const x = String(v || '').trim().replace(/^["']|["']$/g, '').trim();
      return x && !/^unknown$/i.test(x) ? x : null;
    };
    if (isStructured) {
      for (const pair of payload.split(/;\s*/)) {
        const eq = pair.indexOf('=');
        if (eq < 0) continue;
        const key = pair.slice(0, eq).trim().toLowerCase();
        const val = clean(pair.slice(eq + 1));
        if (!val) continue;
        if (key === 'name' || key === 'business') {
          if (val.length <= 60) websiteDemoBusinessName = val;
        } else if (key === 'industry' || key === 'niche') {
          if (val.length <= 40) websiteDemoIndustry = val;
        } else if (key === 'services' || key === 'service') {
          websiteDemoServices = val
            .split(/\s*,\s*|\s+(?:and|&)\s+/i)
            .map((s) => s.trim())
            .filter(Boolean);
          if (!websiteDemoServices.length) websiteDemoServices = null;
        }
      }
    } else {
      const name = clean(payload);
      if (name && name.length <= 60) websiteDemoBusinessName = name;
    }
  }
  // Strip generic industry-echo services ("plumbing services" when industry
  // is "Plumbing"). The LLM that emits the trigger tag often restates the
  // user's vague answer verbatim, which blocks the trade template's
  // default-services list from kicking in downstream. This mirrors the
  // same filter in entityAccumulator.extractWebsiteFields for the
  // extractor path — without it, the salesBot path skips that safety net.
  if (Array.isArray(websiteDemoServices) && websiteDemoServices.length > 0) {
    const industryWord = String(websiteDemoIndustry || '').trim().toLowerCase();
    if (industryWord) {
      const stripSuffix = (s) => String(s || '').toLowerCase()
        .replace(/\s+(services?|work|stuff|things)\s*$/i, '')
        .trim();
      const allEcho = websiteDemoServices.every((s) => {
        const normalized = stripSuffix(s);
        return (
          normalized === '' ||
          normalized === industryWord ||
          industryWord.includes(normalized) ||
          normalized.includes(industryWord)
        );
      });
      if (allEcho) {
        logger.info(`[SALES] Dropping generic services echo ${JSON.stringify(websiteDemoServices)} for industry "${industryWord}" — trade defaults will fill in`);
        websiteDemoServices = null;
      }
    }
  }
  let chatbotDemoTrigger = cleanText.includes('[TRIGGER_CHATBOT_DEMO]');
  let adGeneratorTrigger = cleanText.includes('[TRIGGER_AD_GENERATOR]');
  let logoMakerTrigger = cleanText.includes('[TRIGGER_LOGO_MAKER]');
  const seoAuditMatch = cleanText.match(/\[TRIGGER_SEO_AUDIT:\s*(.+?)\]/);
  // New handoff trigger — emitted by the LLM when the user asks for a
  // service this chat doesn't currently handle. Payload is a free-form
  // service label ("chatbot", "SEO audit", "ad design", etc.).
  const humanHandoffMatch = cleanText.match(/\[TRIGGER_HUMAN_HANDOFF:\s*([^\]]+)\]/i);

  // Stitch the recent conversation + bot reply into one snippet so the
  // topic classifier sees both sides. We trim to the last few turns —
  // older history rarely changes the topic and just adds tokens.
  const recentConv = messages.slice(-8).map((m) => `${m.role}: ${m.content}`).join('\n');
  const conversationSnippet = `${recentConv}\nassistant: ${cleanText}`;

  // Two parallel classifier calls:
  //   - botSpeech: what is the bot's latest reply offering / committing to?
  //   - convTopic: what is the conversation as a whole about?
  // Splitting them keeps each prompt focused. The user-intent call already
  // ran earlier (userIntents.agreed is the LLM-classified equivalent of
  // the old `userAgreed` regex).
  const [botSpeech, convTopic] = await Promise.all([
    classifyIntent(cleanText, {
      offersWebsite: 'The bot is OFFERING (not yet committing) to build, generate, create, deploy, set up, or spin up a website / site / landing page / preview for the user — phrasings like "want me to build you one?", "I can spin up a preview", "happy to put together a site". Set to false if the bot has already committed or claimed it\'s done.',
      commitsToWebsite: 'The bot has already COMMITTED to or CLAIMED to be building/finishing a website preview without waiting for further confirmation. Examples: "building your preview now", "I\'ll spin one up", "let me put together a preview", "here\'s your preview", "the site is ready/built/live". This is the hard-commit hallucination case where the bot acts like the demo is already running.',
      offersAdDemo: 'The bot is offering to design, generate, create, build, make, craft, or prepare a marketing ad, ad creative, ad image, ad post, or social-media ad for the user.',
      offersLogoDemo: 'The bot is offering to design, generate, create, build, sketch, or prepare a logo, brand mark, brand identity, or brand concept for the user.',
      mentionsPayment: 'The bot is sending or about to send a payment link, asking the user to pay now, complete payment, lock it in, or saying "here\'s the link" in a payment context.',
    }, { userId: user.id, operation: 'sales_bot_speech' }),

    classifyIntent(conversationSnippet, {
      aboutChatbot: 'The conversation is centered on a chatbot, AI assistant, virtual assistant, or AI chat being built for the user\'s business.',
      aboutAds: 'The conversation is centered on creating marketing ads, ad creatives, ad images, ad posts, or social-media ads (Instagram/Facebook/TikTok ads, "ad banade", "post banade", etc.).',
      aboutLogo: 'The conversation is centered on designing a logo, brand mark, or brand identity ("logo banade", "logo maker", etc.).',
    }, { userId: user.id, operation: 'sales_conv_topic' }),
  ]);

  logger.debug(`[SALES] Trigger check - websiteTag: ${websiteDemoTrigger}, chatbotTag: ${chatbotDemoTrigger}, adTag: ${adGeneratorTrigger}, logoTag: ${logoMakerTrigger}, seoTag: ${!!seoAuditMatch}, websiteTriggered: ${!!user.metadata?.websiteDemoTriggered}, chatbotTriggered: ${!!user.metadata?.chatbotDemoTriggered}, adTriggered: ${!!user.metadata?.adGeneratorTriggered}, logoTriggered: ${!!user.metadata?.logoMakerTriggered}, seoTriggered: ${!!user.metadata?.seoAuditTriggered}`);
  logger.debug(`[SALES] LLM response (first 200): ${cleanText.slice(0, 200)}`);

  const userAgreed = userIntents.agreed;
  const isChatbotContext = convTopic.aboutChatbot;

  // CHATBOT DEMO: Two-phase detection.
  // Phase 1: When user agrees to the chatbot demo, mark intent in metadata.
  // Phase 2: When user sends their business name (next message), trigger the flow.
  if (!chatbotDemoTrigger && !user.metadata?.chatbotDemoTriggered && isChatbotContext) {
    if (user.metadata?.chatbotDemoAgreed) {
      // Phase 2: User already agreed, this message is likely their business name - trigger now
      chatbotDemoTrigger = true;
      logger.info(`[SALES] Chatbot demo trigger: user previously agreed, triggering on business name`);
    } else if (userAgreed) {
      // Phase 1: User just agreed - mark it, let the LLM ask for business name
      await updateUserMetadata(user.id, { chatbotDemoAgreed: true });
      logger.info(`[SALES] Chatbot demo: user agreed, will trigger on next message`);
    }
  }

  // Website fallback (two-gate, matching the old regex pair):
  //   Gate A — bot OFFERED a website AND the user agreed.
  //   Gate B — bot COMMITTED/CLAIMED a preview is happening (no agreement needed —
  //            the bot already locked in, otherwise the user stalls staring at
  //            a "preview" that was never actually generated).
  // Skipped entirely if the conversation is about a chatbot, to avoid stealing
  // chatbot leads.
  const botTalksAboutWebsite = !isChatbotContext && botSpeech.offersWebsite;
  const botCommittedWebsite = !isChatbotContext && botSpeech.commitsToWebsite;

  logger.debug(`[SALES] Fallback check - isChatbotContext: ${isChatbotContext}, chatbotAgreed: ${!!user.metadata?.chatbotDemoAgreed}, botOffersWebsite: ${botTalksAboutWebsite}, botCommittedWebsite: ${botCommittedWebsite}, userAgreed: ${userAgreed}`);

  if (
    !websiteDemoTrigger &&
    !user.metadata?.websiteDemoTriggered &&
    !chatbotDemoTrigger &&
    ((botTalksAboutWebsite && userAgreed) || botCommittedWebsite)
  ) {
    websiteDemoTrigger = true;
    if (botCommittedWebsite) {
      logger.info(`[SALES] Hard-commit fallback: LLM promised/claimed a preview without emitting trigger tag`);
    } else {
      logger.info(`[SALES] Fallback: website demo trigger detected for ${user.phone_number}`);
    }
  }

  // Ad generator fallback: bot offered an ad demo OR user agreed in an ad-context conversation.
  if (
    !adGeneratorTrigger &&
    !user.metadata?.adGeneratorTriggered &&
    !websiteDemoTrigger &&
    !chatbotDemoTrigger &&
    convTopic.aboutAds &&
    (botSpeech.offersAdDemo || userAgreed)
  ) {
    adGeneratorTrigger = true;
    logger.info(`[SALES] Fallback: ad generator trigger detected for ${user.phone_number}`);
  }

  // Logo maker fallback: bot offered a logo demo OR user agreed in a logo-context conversation.
  if (
    !logoMakerTrigger &&
    !user.metadata?.logoMakerTriggered &&
    !websiteDemoTrigger &&
    !chatbotDemoTrigger &&
    !adGeneratorTrigger &&
    convTopic.aboutLogo &&
    (botSpeech.offersLogoDemo || userAgreed)
  ) {
    logoMakerTrigger = true;
    logger.info(`[SALES] Fallback: logo maker trigger detected for ${user.phone_number}`);
  }

  // Fallback: if the user sent a URL and conversation is about SEO but LLM forgot the tag
  let seoAuditFallbackUrl = null;
  const userHasUrl = /https?:\/\/[^\s]+/i.test(text);
  const responseHasSeoKeyword = /\b(seo|audit|analyz|rank|google)\b/i.test(rawResponse);
  logger.debug(`[SALES] SEO fallback check - userHasUrl: ${userHasUrl}, responseHasSeoKeyword: ${responseHasSeoKeyword}, seoTriggered: ${!!user.metadata?.seoAuditTriggered}`);

  if (
    !seoAuditMatch &&
    !user.metadata?.seoAuditTriggered &&
    responseHasSeoKeyword &&
    userHasUrl
  ) {
    const urlMatch = text.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      seoAuditFallbackUrl = urlMatch[0];
      logger.info(`Fallback: SEO audit trigger detected for ${user.phone_number}: ${seoAuditFallbackUrl}`);
    }
  }

  // Check for payment trigger tag
  let paymentMatch = cleanText.match(/\[SEND_PAYMENT:\s*amount=(\d+),\s*service=(\w+),\s*tier=(\w+),\s*description=([^\]]+)\]/i);

  // Fallback: if the LLM mentions payment/link/pay but forgot the tag, try to extract price info.
  // botSpeech.mentionsPayment + userIntents.agreed reuse the classifier results above.
  // Price extraction stays as a regex — "$<digits>" is a structured token, not natural language.
  if (!paymentMatch && !user.metadata?.lastPaymentLinkId) {
    const priceInResponse = cleanText.match(/\$(\d{2,4})\b/);

    if (botSpeech.mentionsPayment && priceInResponse && userIntents.agreed) {
      const amount = priceInResponse[1];
      // Try to detect service type from conversation
      const convText = (cleanText + ' ' + messages.map(m => m.content).join(' ')).toLowerCase();
      let service = 'website';
      if (/\bseo\b|search engine|google rank/i.test(convText)) service = 'seo';
      else if (/\bsmm\b|social media|instagram|facebook/i.test(convText)) service = 'smm';
      else if (/\bapp\b|mobile app|android|ios/i.test(convText)) service = 'app';

      // Detect tier from amount
      let tier = 'custom';
      const amt = parseInt(amount);
      if (amt <= 200) tier = 'floor';
      else if (amt <= 300) tier = 'starter';
      else if (amt <= 500) tier = 'mid';
      else if (amt <= 800) tier = 'pro';
      else tier = 'premium';

      const desc = `${service} ${tier} package`;
      paymentMatch = [null, amount, service, tier, desc];
      logger.info(`[SALES] Fallback: payment trigger detected - $${amount} for ${service} (${tier})`);
    }
  }

  logger.debug(`[SALES] Payment check - tagMatch: ${!!paymentMatch}, stripeKey: ${!!env.stripe.secretKey}, alreadySent: ${!!user.metadata?.lastPaymentLinkId}`);

  // Resolve which non-website service (if any) the LLM is signalling for
  // handoff. Two paths:
  //   1. Explicit [TRIGGER_HUMAN_HANDOFF: <label>] — the new first-class
  //      mechanism the prompt instructs the LLM to use.
  //   2. Legacy [TRIGGER_CHATBOT_DEMO] / [TRIGGER_AD_GENERATOR] /
  //      [TRIGGER_LOGO_MAKER] / [TRIGGER_SEO_AUDIT: ...] — the LLM may
  //      still emit these from older context. If the corresponding
  //      service is currently DISABLED via src/config/services.js, route
  //      to handoff instead of running the (now-deprecated) flow. If the
  //      service ever gets re-enabled, these triggers fire the original
  //      flow again with no further code changes needed.
  let handoffServiceKey = null;
  let handoffServiceLabel = null;
  if (humanHandoffMatch) {
    handoffServiceLabel = (humanHandoffMatch[1] || '').trim() || 'service';
  } else if (chatbotDemoTrigger && !isServiceEnabled('chatbot')) {
    handoffServiceKey = 'chatbot';
  } else if (adGeneratorTrigger && !isServiceEnabled('ads')) {
    handoffServiceKey = 'ads';
  } else if (logoMakerTrigger && !isServiceEnabled('logo')) {
    handoffServiceKey = 'logo';
  } else if (seoAuditMatch && !isServiceEnabled('seo')) {
    handoffServiceKey = 'seo';
  }
  // Drop any non-website demo triggers whose service is currently
  // disabled — handoff handles them, the flow itself shouldn't fire.
  if (chatbotDemoTrigger && !isServiceEnabled('chatbot')) chatbotDemoTrigger = false;
  if (adGeneratorTrigger && !isServiceEnabled('ads')) adGeneratorTrigger = false;
  if (logoMakerTrigger && !isServiceEnabled('logo')) logoMakerTrigger = false;
  // seoAuditMatch is a const (used later); we'll gate the SEO trigger
  // path on isServiceEnabled('seo') at the call site below instead.

  // Strip all trigger tags from the response
  let responseText = cleanText
    .replace(/\[TRIGGER_WEBSITE_DEMO(?::[^\]]*)?\]/gi, '')
    .replace(/\[TRIGGER_CHATBOT_DEMO\]/g, '')
    .replace(/\[TRIGGER_AD_GENERATOR\]/g, '')
    .replace(/\[TRIGGER_LOGO_MAKER\]/g, '')
    .replace(/\[TRIGGER_SEO_AUDIT:[^\]]*\]/g, '')
    .replace(/\[TRIGGER_HUMAN_HANDOFF:[^\]]*\]/gi, '')
    .replace(/\[SEND_PAYMENT:[^\]]*\]/g, '')
    .trim();

  // Strip the Calendly URL from the text - we'll send it as a tappable CTA button instead
  const calendlyUrl = env.calendlyUrl;
  const hasCalendlyLink = responseText.includes(calendlyUrl);
  let textWithoutLink = responseText;
  if (hasCalendlyLink) {
    const escapedUrl = calendlyUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Strip markdown links wrapping the Calendly URL: [any text](URL)
    textWithoutLink = textWithoutLink.replace(new RegExp(`\\[([^\\]]*)\\]\\(${escapedUrl}\\)`, 'g'), '');
    // Strip any remaining bare Calendly URLs
    textWithoutLink = textWithoutLink.replace(new RegExp(escapedUrl, 'g'), '');
    // Clean up trailing colons and whitespace
    textWithoutLink = textWithoutLink.replace(/:\s*$/, '').trim();
  }

  // Skip sending the LLM text if a demo trigger or handoff is about to
  // fire — the handler / handoff helper sends its own message. Website
  // demo + handoff is the mixed-intent case: website wins this turn,
  // handoff is queued via pendingHandoffServices below; we still skip
  // the LLM text because the website-demo handler sends its own copy.
  const handoffWillFire = !!(handoffServiceKey || handoffServiceLabel);
  const skipLlmResponse = (websiteDemoTrigger && !user.metadata?.websiteDemoTriggered)
    || (chatbotDemoTrigger && !user.metadata?.chatbotDemoTriggered)
    || (adGeneratorTrigger && !user.metadata?.adGeneratorTriggered)
    || (logoMakerTrigger && !user.metadata?.logoMakerTriggered)
    || handoffWillFire;

  const formatted = formatWhatsApp(textWithoutLink);
  if (formatted && !skipLlmResponse) {
    // sendTextMessage auto-logs via autoLogOutbound (sender.js) — calling
    // logMessage here would create a duplicate conversations row that
    // surfaces as a visible duplicate in the admin transcript and as
    // duplicated history in subsequent LLM calls.
    await sendTextMessage(user.phone_number, formatted);
  }

  // Negative-sentiment nudge — when the user's message reads as
  // frustrated ("this is annoying", "ugh", "are you serious", etc.),
  // append a one-time feedback channel pointer so they can vent
  // structured-ly instead of trailing off into silent abandonment.
  // Gated on `feedbackNudgedAt` so we don't repeat it every turn the
  // user is venting; one nudge per user per project lifecycle is
  // enough to plant the keyword. Skipped for testers (their feedback
  // doesn't get logged anyway) and humanTakeover (operator is driving).
  try {
    const { detectFrustratedPhrasing, isTester } = require('../../feedback/feedback');
    const alreadyNudged = !!user.metadata?.feedbackNudgedAt;
    // Gate the (now async) frustration check behind the cheap synchronous
    // conditions first — no point paying for a classifier call if we'd
    // skip the nudge anyway because the user is a tester / already nudged
    // / on humanTakeover.
    const eligibleForNudge =
      !skipLlmResponse &&
      !alreadyNudged &&
      !isTester(user) &&
      !user.metadata?.humanTakeover;
    if (eligibleForNudge && (await detectFrustratedPhrasing(text || ''))) {
      const nudge = "_btw — if you wanna flag what's bugging you so the team sees it, just type *feedback* and i'll capture a note._";
      await sendTextMessage(user.phone_number, nudge);
      await updateUserMetadata(user.id, { feedbackNudgedAt: new Date().toISOString() });
      user.metadata = { ...(user.metadata || {}), feedbackNudgedAt: new Date().toISOString() };
      logger.info(`[FEEDBACK] Frustration nudge sent to ${user.phone_number}`);
    }
  } catch (err) {
    logger.warn(`[FEEDBACK] Frustration-nudge hook failed: ${err.message}`);
  }

  // GDPR / first-contact disclosure DISABLED for now — to be re-enabled
  // later once the privacy policy copy and timing are finalized. The
  // /privacy page itself (src/privacy/routes.js) and the env config
  // (env.privacy.*) stay in place; only the WhatsApp-side notice send
  // is removed. To bring it back: restore the shouldSendPrivacyNotice /
  // shouldSilentlyMarkAsDisclosed gating block above and the
  // sendTextMessage block here.

  // Send the Calendly link as a clickable CTA button so it actually works on WhatsApp
  if (hasCalendlyLink) {
    await sendCTAButton(
      user.phone_number,
      'Tap below to pick a time 👇',
      '📅 Book a Call',
      calendlyUrl
    );
    await logMessage(user.id, 'Sent Calendly booking link', 'assistant');

    // Immediately follow up with an anticipation message so the user isn't
    // left in silence after tapping the link. The Calendly webhook will still
    // fire a separate "meeting booked" confirmation once they actually book,
    // but this bridges the gap — especially useful if the webhook isn't set
    // up or the invitee email/phone doesn't match their WhatsApp profile.
    const followUp =
      "Once you pick a time you'll get a confirmation email from Calendly with all the details. " +
      "I'll also ping you here the moment it's booked. Looking forward to it! 🤝";
    // sendTextMessage auto-logs (sender.js); avoid duplicate row.
    await sendTextMessage(user.phone_number, followUp);

    // Mark lead as closed - stop follow-up sequences
    await updateUserMetadata(user.id, { leadClosed: true });
    saveLeadSummary(user, 'meeting_booked', 'Calendly booking link sent').catch(() => {});
  }

  // Send payment link if the LLM triggered it
  if (paymentMatch && env.stripe.secretKey) {
    const [, amountStr, serviceType, tier, description] = paymentMatch;
    const amount = parseInt(amountStr, 10);

    try {
      const { createPaymentLink } = require('../../payments/stripe');
      const result = await createPaymentLink({
        userId: user.id,
        phoneNumber: user.phone_number,
        amount,
        serviceType,
        packageTier: tier,
        description: description.trim(),
        customerName: user.name || '',
      });

      await sendCTAButton(
        user.phone_number,
        `Tap below to complete your payment of $${amount}`,
        '💳 Pay Now',
        result.url
      );
      await logMessage(user.id, `Payment link sent: $${amount} for ${serviceType} (${tier})`, 'assistant');
      await updateUserMetadata(user.id, {
        lastPaymentLinkId: result.linkId,
        lastPaymentDbId: result.paymentId,
        lastPaymentAmount: amount,
        leadClosed: true,
      });
      saveLeadSummary(user, 'paid', `Payment link sent: $${amount} for ${serviceType} (${tier})`).catch(() => {});
      logger.info(`[SALES] Payment link sent to ${user.phone_number}: $${amount} for ${serviceType}`);
    } catch (error) {
      logger.error('[SALES] Failed to create payment link:', error.message);
      // Don't block the conversation - just log the error
    }
  }

  // ── HUMAN HANDOFF (non-website services) ─────────────────────────────
  // Two paths:
  //   (a) Mixed-intent — website demo is ALSO firing this turn. Don't
  //       interrupt the website flow; just stash a pendingHandoffServices
  //       note on the user so admin sees the secondary request, and the
  //       admin email goes out so the team knows to follow up about the
  //       extra service after the website is delivered.
  //   (b) Pure handoff — no website demo this turn. Run the full handoff:
  //       send the user-facing English message, set humanTakeover=true,
  //       fire the admin email.
  if (handoffWillFire) {
    const willFireWebsite = websiteDemoTrigger && !user.metadata?.websiteDemoTriggered;
    if (willFireWebsite) {
      const note = handoffServiceKey || handoffServiceLabel || 'service';
      const existing = Array.isArray(user.metadata?.pendingHandoffServices)
        ? user.metadata.pendingHandoffServices
        : [];
      const merged = existing.includes(note) ? existing : [...existing, note];
      try {
        await updateUserMetadata(user.id, { pendingHandoffServices: merged });
        if (user.metadata) user.metadata.pendingHandoffServices = merged;
      } catch (err) {
        logger.warn(`[HANDOFF] Failed to persist pendingHandoffServices: ${err.message}`);
      }
      // Fire the admin email so the team gets notified about the extra
      // service even though we're letting the website flow continue.
      try {
        const { sendHandoffNotification } = require('../../notifications/email');
        await sendHandoffNotification({
          userPhone: user.phone_number,
          userName: user.name || null,
          channel: user.channel || 'whatsapp',
          userId: user.id,
          serviceKey: handoffServiceKey || null,
          serviceLabel: handoffServiceLabel || (findServiceByKey(handoffServiceKey)?.shortLabel) || 'service',
          reason: 'mixed_intent_with_website',
        });
      } catch (err) {
        logger.warn(`[HANDOFF] Mixed-intent admin notify failed: ${err.message}`);
      }
      logger.info(
        `[HANDOFF] Mixed-intent: website demo firing this turn, queued handoff for "${note}" (admin notified).`
      );
      // Fall through — website demo block below runs as normal.
    } else {
      // Pure handoff — silence the bot and let the admin take over.
      return handoffToHuman(user, {
        serviceKey: handoffServiceKey || null,
        serviceLabel: handoffServiceLabel || null,
        reason: 'service_not_chat_handled',
      });
    }
  }

  // Trigger chatbot demo flow (check BEFORE website to prevent website fallback from stealing chatbot leads)
  if (chatbotDemoTrigger && !user.metadata?.chatbotDemoTriggered) {
    logger.info(`[SALES] Triggering chatbot demo for ${user.phone_number}`);
    await updateUserMetadata(user.id, { chatbotDemoTriggered: true, returnToSales: true });

    // Extract business name: the current message is likely the business name if it's short
    // and not a common word. Also scan recent user messages as fallback.
    const skipWords = /^(yes|yeah|sure|ok|okay|no|hi|hello|hey|i need|i want|chatbot|ai|website|help|please|thanks|thank you)$/i;
    // Reject question-shaped inputs — "Which payment link" / "What about X"
    // / "How does it work" / "Can you explain" etc. are user confusion,
    // not business names. Without this guard we'd end up naming the
    // chatbot after the user's question.
    const questionStarterRx = /^(what|which|why|how|where|when|who|does|do|can|could|is|are|was|were|will|would|should|did|may|might|shall|whats|hows|whos)\b/i;
    const looksLikeQuestion = (s) => questionStarterRx.test(s) || /[?]/.test(s);
    let businessName = null;

    // Check current message first - most likely the business name if the LLM just asked for it
    if (text.length >= 2 && text.length <= 50 && text.split(/\s+/).length <= 6
        && !skipWords.test(text) && !looksLikeQuestion(text)
        && !/\b(need|want|chatbot|website|bot|help|looking|payment|link)\b/i.test(text)) {
      businessName = text;
    }

    // Fallback: scan recent user messages
    if (!businessName) {
      const userMessages = messages.filter(m => m.role === 'user');
      for (let i = userMessages.length - 1; i >= 0; i--) {
        const msg = userMessages[i].content.trim();
        if (msg.length >= 2 && msg.length <= 50 && msg.split(/\s+/).length <= 6
            && !skipWords.test(msg) && !looksLikeQuestion(msg)
            && !/\b(need|want|chatbot|website|bot|help|looking|payment|link)\b/i.test(msg)) {
          businessName = msg;
          break;
        }
      }
    }

    if (businessName) {
      await updateUserMetadata(user.id, {
        chatbotData: { businessName },
      });
      await sendTextMessage(
        user.phone_number,
        `Got it, building a chatbot for *${businessName}*! What industry are you in? (e.g., restaurant, dental, salon, real estate, etc.)`
      );
      await logMessage(user.id, `Chatbot demo: business name pre-filled as "${businessName}"`, 'assistant');
      return STATES.CB_COLLECT_INDUSTRY;
    }

    await sendTextMessage(
      user.phone_number,
      "Let's build it - what's your business name?"
    );
    await logMessage(user.id, 'Starting chatbot demo flow from sales', 'assistant');
    return STATES.CB_COLLECT_NAME;
  }

  // Trigger website demo flow
  if (websiteDemoTrigger && !user.metadata?.websiteDemoTriggered) {
    logger.info(`[SALES] Triggering website demo for ${user.phone_number}`);
    await updateUserMetadata(user.id, { websiteDemoTriggered: true, returnToSales: true });

    const { createSite } = require('../../db/sites');
    const site = await createSite(user.id, 'business-starter');
    await updateUserMetadata(user.id, { currentSiteId: site.id });

    // Resolve each field in priority order:
    //   1. Structured trigger tag (LLM just extracted it from conversation).
    //   2. metadata.websiteData.* (hydrated from prior sales-chat turns).
    //   3. Other flow metadata (adData / logoData / chatbotData) for name only.
    //   4. LLM rescue — pull the name out of recent conversation. Catches
    //      the case where the user gave a short business name ("Noman ki
    //      dukaan") that didn't trip hydrate's looksRich gate, AND the LLM
    //      triggered the demo without filling the name in the tag.
    // Heuristic message-scanning is gone — it used to pick arbitrary phrases
    // like "do what you think is goo" as business names.
    const wd = user.metadata?.websiteData || {};

    let businessName =
      websiteDemoBusinessName ||
      wd.businessName ||
      user.metadata?.adData?.businessName ||
      user.metadata?.logoData?.businessName ||
      user.metadata?.chatbotData?.businessName ||
      null;

    const industry = websiteDemoIndustry || wd.industry || null;

    const services =
      (websiteDemoServices && websiteDemoServices.length ? websiteDemoServices : null) ||
      (Array.isArray(wd.services) && wd.services.length ? wd.services : null);

    // Rescue: one cheap LLM call to pull the business name out of recent
    // turns before giving up and re-asking. The user almost always said it
    // earlier; we just couldn't cheaply regex it out.
    if (!businessName) {
      try {
        const convo = messages
          .slice(-10)
          .map((m) => `${m.role}: ${m.content}`)
          .join('\n');
        const rescue = await generateResponse(
          `Extract the business name the user mentioned in this short conversation. Return ONLY the business name as plain text — no quotes, no punctuation, no "the business name is". If the user has NOT mentioned a business name yet, return exactly: unknown.\n\n${convo}`,
          [{ role: 'user', content: '[extract business name]' }],
          { userId: user.id, operation: 'webdev_trigger_name_rescue' }
        );
        const clean = (rescue || '').trim().replace(/^["']|["']$/g, '');
        if (clean && clean.length > 1 && clean.length < 60 && !/^unknown$/i.test(clean)) {
          businessName = clean;
          logger.info(`[SALES] Rescued business name from conversation: "${businessName}"`);
        }
      } catch (err) {
        logger.warn(`[SALES] Business-name rescue failed: ${err.message}`);
      }
    }

    if (!businessName) {
      await sendTextMessage(
        user.phone_number,
        await localize("Let's build it! What's your business name?", user, text)
      );
      await logMessage(user.id, 'Starting website demo flow', 'assistant');
      return STATES.WEB_COLLECT_NAME;
    }

    // Pre-seed every field we resolved so the wizard doesn't re-ask for
    // things the LLM already heard.
    const websiteData = { ...wd, businessName };
    if (industry) websiteData.industry = industry;
    if (services) websiteData.services = services;
    await updateUserMetadata(user.id, { websiteData });
    user.metadata = { ...(user.metadata || {}), websiteData };

    const hasContact = !!(websiteData.contactEmail || websiteData.contactPhone || websiteData.contactAddress);

    logger.info(
      `[SALES] Website demo pre-seeded: name="${businessName}", industry="${industry || '(ask)'}", services=${
        services ? `[${services.join(', ')}]` : '(ask)'
      }, hasContact=${hasContact}`
    );

    const {
      isSalonIndustry,
      startSalonFlow,
      showConfirmSummary,
      nextMissingWebDevState,
      questionForState,
    } = require('./webDev');

    // Salon industry has its own sub-flow (booking tool / hours / prices /
    // instagram) that isn't covered by nextMissingWebDevState's generic
    // ladder. Route to startSalonFlow so those questions get asked.
    if (industry && isSalonIndustry(industry)) {
      // Services must be collected BEFORE entering the salon sub-flow.
      // The salon flow's hours step assumes a services list exists, and
      // when missing it silently skips SALON_SERVICE_DURATIONS via
      // finishSalonFlow — shipping a salon site with no services page.
      // The normal ladder (handleCollectServices) calls startSalonFlow
      // itself once services are saved, so detouring through
      // WEB_COLLECT_SERVICES here is the same path users take when they
      // answer industry first and services next.
      const haveServices = Array.isArray(services) && services.length > 0;
      if (!haveServices) {
        await sendTextMessage(
          user.phone_number,
          await localize(
            `Nice, *${businessName}* — let's get you set up. First, what services do you offer? List them separated by commas (e.g. *waxing, facials, nails, haircuts*).`,
            user,
            text
          )
        );
        await logMessage(
          user.id,
          'Website demo → salon flow (need services first; deferred startSalonFlow)',
          'assistant'
        );
        return STATES.WEB_COLLECT_SERVICES;
      }
      await sendTextMessage(
        user.phone_number,
        await localize(
          `Nice, let's get *${businessName}* set up. Just a couple more things to personalize your site.`,
          user,
          text
        )
      );
      await logMessage(user.id, `Website demo → salon flow (name + industry pre-filled)`, 'assistant');
      return startSalonFlow(user);
    }

    // Ask the wizard what field is actually missing next. This handles the
    // per-industry nuances automatically — HVAC needs primaryCity + service
    // areas, real-estate needs agent profile + listings, generic needs
    // services + contact — all without salesBot having to know.
    const nextState = nextMissingWebDevState(websiteData, user.metadata || {});

    // Nothing left to collect → straight to the confirmation summary.
    if (nextState === STATES.WEB_CONFIRM) {
      await sendTextMessage(
        user.phone_number,
        await localize(
          `Perfect, I've got everything I need for *${businessName}*. Pulling up the summary.`,
          user,
          text
        )
      );
      await logMessage(user.id, `Website demo → confirm (all pre-filled from sales chat)`, 'assistant');
      return showConfirmSummary(user);
    }

    // Build an ack that lists what we already captured so the user sees
    // the question in context, then send the next question for the state
    // the wizard wants us to land on.
    const ackParts = [];
    if (industry) ackParts.push(industry);
    if (services && services.length) {
      ackParts.push(`services: ${services.slice(0, 4).join(', ')}${services.length > 4 ? '…' : ''}`);
    }
    if (hasContact) ackParts.push('contact saved');
    const contextLine = ackParts.length
      ? `Building *${businessName}* (${ackParts.join(', ')}).`
      : `Building it for *${businessName}*.`;

    const question = questionForState(nextState, websiteData);
    const outgoing = `${contextLine}\n\n${question}`;
    await sendTextMessage(user.phone_number, await localize(outgoing, user, text));
    await logMessage(
      user.id,
      `Website demo → ${nextState} (pre-filled: name${industry ? ', industry' : ''}${services ? ', services' : ''}${hasContact ? ', contact' : ''})`,
      'assistant'
    );
    return nextState;
  }

  // Trigger ad generator flow
  if (adGeneratorTrigger && !user.metadata?.adGeneratorTriggered) {
    logger.info(`[SALES] Triggering ad generator for ${user.phone_number}`);
    await updateUserMetadata(user.id, { adGeneratorTriggered: true, returnToSales: true });

    // Look for a previously-used business name from any other flow as a SUGGESTION only.
    // Do NOT auto-fill — ask the user to confirm or override, since they may be designing
    // for a different brand than last time.
    const lastUsedName = user.metadata?.adData?.businessName
      || user.metadata?.logoData?.businessName
      || user.metadata?.websiteData?.businessName
      || user.metadata?.chatbotData?.businessName
      || null;

    const { updateUserState } = require('../../db/users');

    // Always start at AD_COLLECT_BUSINESS — the handler will check for `suggestedBusinessName`
    // in metadata and treat short confirmations like "yes/same/sure" as approval.
    await updateUserMetadata(user.id, {
      adData: {
        businessName: null,
        suggestedBusinessName: lastUsedName, // hint for the handler
        industry: null,
        niche: null,
        productType: null,
        slogan: null,
        pricing: null,
        brandColors: null,
        imageBase64: null,
        ideas: null,
        selectedIdeaIndex: null,
      },
    });
    await updateUserState(user.id, STATES.AD_COLLECT_BUSINESS);

    if (lastUsedName) {
      await sendTextMessage(
        user.phone_number,
        `🎨 Let's design your marketing ad!\n\n*Which business is this ad for?*\n\n_Last time you worked with me on **${lastUsedName}** — reply *same* to design for that brand again, or just type a different business name._`
      );
      await logMessage(user.id, `Ad generator: asked for business confirmation (suggested: "${lastUsedName}")`, 'assistant');
    } else {
      await sendTextMessage(
        user.phone_number,
        "🎨 Let's design your marketing ad!\n\nWhat's your *business name*?"
      );
      await logMessage(user.id, 'Starting ad generator flow from sales', 'assistant');
    }

    return STATES.AD_COLLECT_BUSINESS;
  }

  // Trigger logo maker flow
  if (logoMakerTrigger && !user.metadata?.logoMakerTriggered) {
    logger.info(`[SALES] Triggering logo maker for ${user.phone_number}`);
    await updateUserMetadata(user.id, { logoMakerTriggered: true, returnToSales: true });

    // Look for a previously-used business name from any other flow as a SUGGESTION only.
    // Do NOT auto-fill — ask the user to confirm or override, since they may be designing
    // for a different brand than last time.
    const lastUsedName = user.metadata?.logoData?.businessName
      || user.metadata?.adData?.businessName
      || user.metadata?.websiteData?.businessName
      || user.metadata?.chatbotData?.businessName
      || null;

    const { updateUserState } = require('../../db/users');

    // Always start at LOGO_COLLECT_BUSINESS — the handler will check for `suggestedBusinessName`
    // in metadata and treat short confirmations like "yes/same/sure" as approval.
    await updateUserMetadata(user.id, {
      logoData: {
        businessName: null,
        suggestedBusinessName: lastUsedName, // hint for the handler
        industry: null,
        description: null,
        style: null,
        brandColors: null,
        symbolIdea: null,
        background: null,
        ideas: null,
        selectedIdeaIndex: null,
      },
    });
    await updateUserState(user.id, STATES.LOGO_COLLECT_BUSINESS);

    if (lastUsedName) {
      await sendTextMessage(
        user.phone_number,
        `✨ Let's design your logo!\n\n*Which business is this logo for?*\n\n_Last time you worked with me on **${lastUsedName}** — reply *same* to design for that brand again, or just type a different business name._\n\n_(This will be the actual text on your logo)_`
      );
      await logMessage(user.id, `Logo maker: asked for business confirmation (suggested: "${lastUsedName}")`, 'assistant');
    } else {
      await sendTextMessage(
        user.phone_number,
        "✨ Let's design your logo! What's your *business name*?\n\n_(This will be the actual text on your logo, so spell it exactly as you want it to appear)_"
      );
      await logMessage(user.id, 'Starting logo maker flow from sales', 'assistant');
    }

    return STATES.LOGO_COLLECT_BUSINESS;
  }

  // Trigger SEO audit flow
  const seoUrl = seoAuditMatch ? seoAuditMatch[1].trim() : seoAuditFallbackUrl;
  if (seoUrl && !user.metadata?.seoAuditTriggered) {
    // SEO disabled → handoff. (The earlier handoff block already catches
    // an explicit [TRIGGER_SEO_AUDIT] tag; this guards the fallback path
    // where we infer SEO intent from a bare URL + SEO keyword in the
    // bot's own reply.)
    if (!isServiceEnabled('seo')) {
      return handoffToHuman(user, { serviceKey: 'seo', reason: 'service_not_chat_handled' });
    }
    const url = seoUrl;
    logger.info(`Triggering SEO audit for ${user.phone_number}: ${url}`);
    await updateUserMetadata(user.id, { seoAuditTriggered: true, returnToSales: true });

    // Set user state so the SEO handler processes it correctly
    const { updateUserState } = require('../../db/users');
    await updateUserState(user.id, STATES.SEO_COLLECT_URL);
    user = { ...user, state: STATES.SEO_COLLECT_URL };

    // Feed the URL directly into the SEO handler
    const { handleSeoAudit } = require('./seoAudit');
    return handleSeoAudit(user, { ...message, text: url, type: 'text' });
  }

  return STATES.SALES_CHAT;
}

module.exports = { handleSalesBot };
