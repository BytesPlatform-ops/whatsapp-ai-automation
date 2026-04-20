const { sendTextMessage, sendCTAButton } = require('../../messages/sender');
const { logMessage, getConversationHistory } = require('../../db/conversations');
const { generateResponse } = require('../../llm/provider');
const { buildSalesPrompt } = require('../../llm/prompts');
const { formatWhatsApp } = require('../../utils/formatWhatsApp');
const { updateUserMetadata } = require('../../db/users');
const { logger } = require('../../utils/logger');
const { STATES } = require('../states');
const { env } = require('../../config/env');
const { saveLeadSummary } = require('../../db/leadSummaries');
const { buildSummaryContext } = require('../summaryManager');

/**
 * Extract and strip the [LEAD_BRIEF]...[/LEAD_BRIEF] block from the LLM response.
 * Returns { leadBrief: string|null, cleanText: string }
 */
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

  // Detect "not interested" and stop follow-ups (not a closed lead — just opted out of follow-ups)
  const notInterested = /\b(not interested|no thanks|stop messaging|leave me alone|don'?t contact|don'?t message|unsubscribe|stop contacting|i'?m good|no need|pass|not for me)\b/i.test(text);
  if (notInterested && !user.metadata?.followupOptOut) {
    await updateUserMetadata(user.id, { followupOptOut: true });
    await sendTextMessage(
      user.phone_number,
      "No worries at all! I won't follow up further. If you ever change your mind, just send a message and I'll be here. Have a great day!"
    );
    await logMessage(user.id, 'User not interested — follow-ups stopped', 'assistant');
    saveLeadSummary(user, 'opted_out', 'User said not interested — follow-ups stopped').catch(() => {});
    return STATES.SALES_CHAT;
  }

  // Get conversation history (last 40 messages for full context)
  const history = await getConversationHistory(user.id, 40);

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
  let chatbotDemoTrigger = cleanText.includes('[TRIGGER_CHATBOT_DEMO]');
  let adGeneratorTrigger = cleanText.includes('[TRIGGER_AD_GENERATOR]');
  let logoMakerTrigger = cleanText.includes('[TRIGGER_LOGO_MAKER]');
  const seoAuditMatch = cleanText.match(/\[TRIGGER_SEO_AUDIT:\s*(.+?)\]/);
  let bytescartTrigger = cleanText.includes('[TRIGGER_BYTESCART]');

  // Fallback: if the conversation is clearly about ecommerce/online stores and the bot
  // hasn't triggered ByteScart yet, force it. The sales bot should never try to sell
  // paid ecommerce tiers - ByteScart is free and replaces that flow entirely.
  if (!bytescartTrigger && !user.metadata?.bytescartPitched) {
    const fullConv = (cleanText + ' ' + messages.map(m => m.content).join(' ')).toLowerCase();
    const isEcommerceContext = /\b(ecommerce|e-commerce|online store|online shop|shopify|sell online|product catalog|dropship)\b/i.test(fullConv);
    if (isEcommerceContext) {
      bytescartTrigger = true;
      logger.info(`[SALES] Fallback: ByteScart trigger detected for ${user.phone_number}`);
    }
  }

  logger.debug(`[SALES] Trigger check - websiteTag: ${websiteDemoTrigger}, chatbotTag: ${chatbotDemoTrigger}, adTag: ${adGeneratorTrigger}, logoTag: ${logoMakerTrigger}, seoTag: ${!!seoAuditMatch}, websiteTriggered: ${!!user.metadata?.websiteDemoTriggered}, chatbotTriggered: ${!!user.metadata?.chatbotDemoTriggered}, adTriggered: ${!!user.metadata?.adGeneratorTriggered}, logoTriggered: ${!!user.metadata?.logoMakerTriggered}, seoTriggered: ${!!user.metadata?.seoAuditTriggered}`);
  logger.debug(`[SALES] LLM response (first 200): ${cleanText.slice(0, 200)}`);

  const userAgreed = /\b(yes|yeah|sure|ok|okay|go ahead|let'?s do it|proceed|please|yep|yup|absolutely|do it|go for it|sounds good|let'?s go)\b/i.test(text);

  // Check if the FULL conversation is about chatbots
  const fullConversationText = messages.map(m => m.content).join(' ') + ' ' + cleanText;
  const isChatbotContext = /\b(chatbot|chat ?bot|ai assistant|virtual assistant|ai chat)\b/i.test(fullConversationText);

  // CHATBOT DEMO: Two-phase detection.
  // Phase 1: When user agrees to the chatbot demo, mark intent in metadata.
  // Phase 2: When user sends their business name (next message), trigger the flow.
  // This avoids fragile single-message regex matching.
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

  // Website fallback: only if NOT in chatbot context
  const botTalksAboutWebsite = !isChatbotContext && (
    /\b(build|generat|creat|deploy|preview|set.{0,10}up|get.{0,10}started|spin.{0,10}up).{0,30}(website|site|page|landing|preview|for you|right now)\b/i.test(cleanText)
    || /\b(let me|let's|i'll|going to).{0,30}(build|generat|creat|set up|get started|spin up|make).{0,30}(website|site|page|landing)\b/i.test(cleanText)
  );

  logger.debug(`[SALES] Fallback check - isChatbotContext: ${isChatbotContext}, chatbotAgreed: ${!!user.metadata?.chatbotDemoAgreed}, botTalksAboutWebsite: ${botTalksAboutWebsite}, userAgreed: ${userAgreed}`);

  if (
    !websiteDemoTrigger &&
    !user.metadata?.websiteDemoTriggered &&
    !chatbotDemoTrigger &&
    botTalksAboutWebsite &&
    userAgreed
  ) {
    websiteDemoTrigger = true;
    logger.info(`[SALES] Fallback: website demo trigger detected for ${user.phone_number}`);
  }

  // Ad generator fallback: detect ad intent in conversation and trigger when user agrees
  const fullAdConvText = messages.map(m => m.content).join(' ') + ' ' + cleanText + ' ' + text;
  const isAdContext = /\b(marketing\s*ad|social\s*media\s*ad|ad\s*creative|ad\s*design|create\s*ad|design\s*ad|make\s*ad|generate\s*ad|ad\s*image|ad\s*post|insta\s*ad|facebook\s*ad|tiktok\s*ad|ad\s*banade|ad\s*banwana|post\s*banade|make\s*(a|an)\s*ad|want.{0,15}ad|need.{0,15}ad)\b/i.test(fullAdConvText);
  const botOffersAdDemo = /\b(design|generat|creat|build|make|craft|prepar|get).{0,40}(ad|marketing\s*ad|ad\s*image|ad\s*post|creative|ready)\b/i.test(cleanText);

  if (
    !adGeneratorTrigger &&
    !user.metadata?.adGeneratorTriggered &&
    !websiteDemoTrigger &&
    !chatbotDemoTrigger &&
    isAdContext &&
    (botOffersAdDemo || userAgreed)
  ) {
    adGeneratorTrigger = true;
    logger.info(`[SALES] Fallback: ad generator trigger detected for ${user.phone_number}`);
  }

  // Logo maker fallback: detect logo intent in conversation and trigger when user agrees
  const fullLogoConvText = messages.map(m => m.content).join(' ') + ' ' + cleanText + ' ' + text;
  const isLogoContext = /\b(logo|brand\s*mark|brand\s*identity|brand\s*design|design\s*logo|create\s*logo|make\s*logo|logo\s*banade|logo\s*banwana|logo\s*maker|want.{0,15}logo|need.{0,15}logo)\b/i.test(fullLogoConvText);
  const botOffersLogoDemo = /\b(design|generat|creat|build|make|craft|prepar|get|sketch).{0,40}(logo|brand\s*mark|brand\s*identity|concept|ready)\b/i.test(cleanText);

  if (
    !logoMakerTrigger &&
    !user.metadata?.logoMakerTriggered &&
    !websiteDemoTrigger &&
    !chatbotDemoTrigger &&
    !adGeneratorTrigger &&
    isLogoContext &&
    (botOffersLogoDemo || userAgreed)
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

  // Fallback: if the LLM mentions payment/link/pay but forgot the tag, try to extract price info
  if (!paymentMatch && !user.metadata?.lastPaymentLinkId) {
    const botMentionsPayment = /\b(payment|pay now|complete.{0,15}payment|here'?s the link|sending.{0,15}link|lock it in)\b/i.test(cleanText);
    const priceInResponse = cleanText.match(/\$(\d{2,4})\b/);
    const agreedToPrice = /\b(yes|yeah|sure|ok|okay|go ahead|let'?s do it|proceed|absolutely|sounds good|interested|i'?m in|deal|perfect)\b/i.test(text);

    if (botMentionsPayment && priceInResponse && agreedToPrice) {
      const amount = priceInResponse[1];
      // Try to detect service type from conversation
      const convText = (cleanText + ' ' + messages.map(m => m.content).join(' ')).toLowerCase();
      let service = 'website';
      if (/\bseo\b|search engine|google rank/i.test(convText)) service = 'seo';
      else if (/\bsmm\b|social media|instagram|facebook/i.test(convText)) service = 'smm';
      else if (/\bapp\b|mobile app|android|ios/i.test(convText)) service = 'app';
      // Note: ecommerce is intentionally omitted — we redirect ecommerce leads to ByteScart (free).

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

  // Strip all trigger tags from the response
  let responseText = cleanText
    .replace(/\[TRIGGER_WEBSITE_DEMO(?::[^\]]*)?\]/gi, '')
    .replace(/\[TRIGGER_CHATBOT_DEMO\]/g, '')
    .replace(/\[TRIGGER_AD_GENERATOR\]/g, '')
    .replace(/\[TRIGGER_LOGO_MAKER\]/g, '')
    .replace(/\[TRIGGER_SEO_AUDIT:[^\]]*\]/g, '')
    .replace(/\[TRIGGER_BYTESCART\]/g, '')
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

  // Skip sending the LLM text if a demo trigger is about to fire - the handler sends its own message
  const skipLlmResponse = (websiteDemoTrigger && !user.metadata?.websiteDemoTriggered)
    || (chatbotDemoTrigger && !user.metadata?.chatbotDemoTriggered)
    || (adGeneratorTrigger && !user.metadata?.adGeneratorTriggered)
    || (logoMakerTrigger && !user.metadata?.logoMakerTriggered);

  const formatted = formatWhatsApp(textWithoutLink);
  if (formatted && !skipLlmResponse) {
    await sendTextMessage(user.phone_number, formatted);
    await logMessage(user.id, formatted, 'assistant');
  }

  // Send the ByteScart pitch + CTA button for ecommerce leads
  if (bytescartTrigger && !user.metadata?.bytescartPitched) {
    const pitch =
      '🛒 *Want your own online store?*\n\n' +
      'Great news — you can launch one *today* with *ByteScart*, our done-for-you ecommerce platform. And the best part? It\'s *100% FREE* to get started!\n\n' +
      '✨ *What you get — completely free:*\n' +
      '• Free signup — no credit card needed\n' +
      '• List your first few products at zero cost\n' +
      '• Ready-to-sell storefront on mobile & desktop\n' +
      '• Built-in checkout & secure payments\n' +
      '• No coding, no design work — go live in minutes\n\n' +
      'Thousands of sellers have already launched their store with ByteScart. Tap the button below to claim yours 👇';
    await sendCTAButton(
      user.phone_number,
      pitch,
      '🚀 Launch Free Store',
      'https://www.bytescart.ai'
    );
    await logMessage(user.id, 'Sent ByteScart pitch with CTA link (sales bot)', 'assistant');
    await updateUserMetadata(user.id, { bytescartPitched: true });
  }

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
    await sendTextMessage(user.phone_number, followUp);
    await logMessage(user.id, followUp, 'assistant');

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

  // Trigger chatbot demo flow (check BEFORE website to prevent website fallback from stealing chatbot leads)
  if (chatbotDemoTrigger && !user.metadata?.chatbotDemoTriggered) {
    logger.info(`[SALES] Triggering chatbot demo for ${user.phone_number}`);
    await updateUserMetadata(user.id, { chatbotDemoTriggered: true, returnToSales: true });

    // Extract business name: the current message is likely the business name if it's short
    // and not a common word. Also scan recent user messages as fallback.
    const skipWords = /^(yes|yeah|sure|ok|okay|no|hi|hello|hey|i need|i want|chatbot|ai|website|help|please|thanks|thank you)$/i;
    let businessName = null;

    // Check current message first - most likely the business name if the LLM just asked for it
    if (text.length >= 2 && text.length <= 50 && text.split(/\s+/).length <= 6
        && !skipWords.test(text) && !/[?]/.test(text)
        && !/\b(need|want|chatbot|website|bot|help|looking)\b/i.test(text)) {
      businessName = text;
    }

    // Fallback: scan recent user messages
    if (!businessName) {
      const userMessages = messages.filter(m => m.role === 'user');
      for (let i = userMessages.length - 1; i >= 0; i--) {
        const msg = userMessages[i].content.trim();
        if (msg.length >= 2 && msg.length <= 50 && msg.split(/\s+/).length <= 6
            && !skipWords.test(msg) && !/[?]/.test(msg)
            && !/\b(need|want|chatbot|website|bot|help|looking)\b/i.test(msg)) {
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

    // Trusted sources for the business name, in priority order:
    //   1. Structured trigger tag (LLM extracted it from the conversation).
    //   2. Name already stored in metadata from a prior flow.
    // Heuristic message-scanning is gone — it used to pick arbitrary phrases
    // like "do what you think is goo" as business names.
    const businessName =
      websiteDemoBusinessName ||
      user.metadata?.websiteData?.businessName ||
      user.metadata?.adData?.businessName ||
      user.metadata?.logoData?.businessName ||
      user.metadata?.chatbotData?.businessName ||
      null;

    if (!businessName) {
      await sendTextMessage(user.phone_number, "Let's build it! What's your business name?");
      await logMessage(user.id, 'Starting website demo flow', 'assistant');
      return STATES.WEB_COLLECT_NAME;
    }

    // Pre-seed every field we got from the structured trigger so the wizard
    // doesn't re-ask for things the LLM already heard in sales chat.
    const existing = user.metadata?.websiteData || {};
    const websiteData = { ...existing, businessName };
    if (websiteDemoIndustry) websiteData.industry = websiteDemoIndustry;
    if (websiteDemoServices) websiteData.services = websiteDemoServices;
    await updateUserMetadata(user.id, { websiteData });
    user.metadata = { ...(user.metadata || {}), websiteData };

    logger.info(
      `[SALES] Website demo pre-seeded: name="${businessName}", industry="${websiteDemoIndustry || '(ask)'}", services=${
        websiteDemoServices ? `[${websiteDemoServices.join(', ')}]` : '(ask)'
      }`
    );

    const { isSalonIndustry, startSalonFlow } = require('./webDev');

    // Salon industry has a dedicated sub-flow (booking tool / hours / prices).
    // Kick that off instead of proceeding through the generic flow.
    if (websiteDemoIndustry && isSalonIndustry(websiteDemoIndustry)) {
      await sendTextMessage(
        user.phone_number,
        `Awesome — building *${businessName}* (${websiteDemoIndustry}). Quick salon-specific questions coming up.`
      );
      await logMessage(user.id, `Website demo → salon flow (name + industry pre-filled)`, 'assistant');
      return startSalonFlow(user);
    }

    // Pick the right next state based on what's already filled.
    // Order in the wizard: name → industry → services → contact → confirm.
    if (websiteDemoIndustry && websiteDemoServices) {
      await sendTextMessage(
        user.phone_number,
        `Great — building *${businessName}* (${websiteDemoIndustry}, services: ${websiteDemoServices.join(', ')}).\n\nLast thing — what contact info do you want on the site? Email, phone, and/or address.`
      );
      await logMessage(user.id, `Website demo → contact step (name + industry + services pre-filled)`, 'assistant');
      return STATES.WEB_COLLECT_CONTACT;
    }

    if (websiteDemoIndustry) {
      await sendTextMessage(
        user.phone_number,
        `Building *${businessName}* (${websiteDemoIndustry}). What services or products do you offer? List them separated by commas, or just skip.`
      );
      await logMessage(user.id, `Website demo → services step (name + industry pre-filled)`, 'assistant');
      return STATES.WEB_COLLECT_SERVICES;
    }

    await sendTextMessage(
      user.phone_number,
      `Building it for *${businessName}* — what industry are you in? (e.g. tech, healthcare, salon, restaurant)`
    );
    await logMessage(user.id, `Website demo → industry step (name pre-filled)`, 'assistant');
    return STATES.WEB_COLLECT_INDUSTRY;
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
