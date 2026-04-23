const { sendTextMessage, sendWithMenuButton, sendCTAButton, sendInteractiveButtons } = require('../../messages/sender');
const { logMessage } = require('../../db/conversations');
const { updateUserMetadata } = require('../../db/users');
const { STATES } = require('../states');
const { logger } = require('../../utils/logger');
const { createClient } = require('../../chatbot/db/clients');
const { generateUniqueSlug } = require('../../chatbot/services/slug-generator');
const { env } = require('../../config/env');
const { generateResponse } = require('../../llm/provider');

// Base URL for demo/chat pages
const BASE_URL = env.chatbot.baseUrl;

async function handleChatbotService(user, message) {
  switch (user.state) {
    case STATES.CB_COLLECT_NAME:
      return handleCollectName(user, message);
    case STATES.CB_COLLECT_INDUSTRY:
      return handleCollectIndustry(user, message);
    case STATES.CB_COLLECT_FAQS:
      return handleCollectFaqs(user, message);
    case STATES.CB_COLLECT_SERVICES:
      return handleCollectServices(user, message);
    case STATES.CB_COLLECT_HOURS:
      return handleCollectHours(user, message);
    case STATES.CB_COLLECT_LOCATION:
      return handleCollectLocation(user, message);
    case STATES.CB_GENERATING:
      return handleGenerating(user, message);
    case STATES.CB_DEMO_SENT:
      return handleDemoSent(user, message);
    case STATES.CB_FOLLOW_UP:
      return handleFollowUp(user, message);
    default:
      return STATES.CB_COLLECT_NAME;
  }
}

// Step 1: Collect business name
async function handleCollectName(user, message) {
  const text = (message.text || '').trim();
  if (!text || text.length < 2) {
    await sendWithMenuButton(user.phone_number, "What's your business name?");
    return STATES.CB_COLLECT_NAME;
  }

  // Try to infer industry from the name. When the name contains a trade
  // word ("Noman Plumbing" → "Plumbing"), skip the industry question.
  const { inferIndustryFromBusinessName } = require('../entityAccumulator');
  const inferredIndustry = await inferIndustryFromBusinessName(text, user.id);

  const chatbotData = { businessName: text };
  if (inferredIndustry) chatbotData.industry = inferredIndustry;
  await updateUserMetadata(user.id, { chatbotData });

  if (inferredIndustry) {
    await sendWithMenuButton(
      user.phone_number,
      `Got it — *${text}* · _${inferredIndustry}_ 👍\n\n` +
        "What are the top questions your customers usually ask? Send them one per message, then type *done* when you're finished."
    );
    await logMessage(user.id, `Chatbot flow: name="${text}", inferred industry="${inferredIndustry}"`, 'assistant');
    return STATES.CB_COLLECT_FAQS;
  }

  await sendWithMenuButton(
    user.phone_number,
    `Got it, *${text}*! What industry are you in? (e.g., restaurant, dental clinic, salon, real estate, gym, etc.)`
  );
  await logMessage(user.id, `Chatbot flow: business name = "${text}"`, 'assistant');
  return STATES.CB_COLLECT_INDUSTRY;
}

// Step 2: Collect industry
async function handleCollectIndustry(user, message) {
  const text = (message.text || '').trim();
  if (!text) {
    await sendWithMenuButton(user.phone_number, 'What industry is your business in?');
    return STATES.CB_COLLECT_INDUSTRY;
  }

  const existing = user.metadata?.chatbotData || {};
  await updateUserMetadata(user.id, {
    chatbotData: { ...existing, industry: text },
  });

  await sendWithMenuButton(
    user.phone_number,
    "What are the top questions your customers usually ask? Send them one per message, then type *done* when you're finished."
  );
  await logMessage(user.id, `Chatbot flow: industry = "${text}"`, 'assistant');
  return STATES.CB_COLLECT_FAQS;
}

/**
 * Split a user-typed message into individual FAQ questions. Handles
 * many input styles: comma-separated, newline-separated, numbered
 * lists, "A and B and C", multiple question marks, prose like "they
 * ask about X, Y, and Z". Returns the array of normalized questions.
 *
 * Cheap heuristic pre-filter skips the LLM on clearly-single inputs
 * ("how much does it cost?") so the common case stays fast.
 */
async function splitFaqQuestions(text, userId) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  // Fast path: looks like a single question — no multi-question signals.
  // "and" appearing 2+ times suggests a list ("they ask about X and Y and Z").
  const questionMarkCount = (raw.match(/\?/g) || []).length;
  const hasNewlines = /\n/.test(raw);
  const hasNumberedList = /^\s*\d+[.)]\s/m.test(raw);
  const hasSemicolon = /;/.test(raw);
  const hasComma = /,/.test(raw);
  const andCount = (raw.match(/\band\b/gi) || []).length;
  const looksLikeList = hasComma || andCount >= 2;
  const isShortAndSingle =
    raw.length < 80 &&
    questionMarkCount <= 1 &&
    !hasNewlines &&
    !hasNumberedList &&
    !hasSemicolon &&
    !looksLikeList;
  if (isShortAndSingle) return [raw.replace(/\s+/g, ' ').trim()];

  const prompt = `A small-business owner is setting up an AI chatbot. They were asked "What are the top questions your customers usually ask?" and sent this message, which may contain ONE question or MULTIPLE questions in any format (comma-separated, numbered list, newlines, "A and B", or prose like "they ask about X and Y").

Extract each DISTINCT customer question. Normalize to a clear, customer-facing question form ending with "?". Drop filler ("they ask about", "like", "such as", "basically", "things like"). Keep topic-equivalent phrasings merged into one.

User message:
"""${raw.slice(0, 1000)}"""

Return ONLY a JSON array of question strings, like:
["How much does it cost?", "What are your hours?", "Do you accept credit cards?"]

If the message contains no real customer question (e.g. greeting, meta comment), return [].`;

  try {
    const resp = await generateResponse(
      prompt,
      [{ role: 'user', content: 'Split the questions now.' }],
      { userId, operation: 'faq_split', timeoutMs: 10_000 }
    );
    const m = String(resp || '').match(/\[[\s\S]*?\]/);
    if (!m) return [raw];
    const parsed = JSON.parse(m[0]);
    if (!Array.isArray(parsed)) return [raw];
    const cleaned = parsed
      .filter((q) => typeof q === 'string')
      .map((q) => q.trim())
      .filter((q) => q.length >= 3 && q.length < 300);
    return cleaned.length > 0 ? cleaned : [raw];
  } catch (err) {
    logger.warn(`[CB-FAQS] split failed, falling back to single: ${err.message}`);
    return [raw];
  }
}

// Step 3: Collect FAQs (multi-message or multi-question-per-message)
async function handleCollectFaqs(user, message) {
  const text = (message.text || '').trim();
  if (!text) {
    await sendWithMenuButton(user.phone_number, 'Send me a common customer question, or type *done* to move on.');
    return STATES.CB_COLLECT_FAQS;
  }

  const existing = user.metadata?.chatbotData || {};
  const faqs = existing.faqs || [];

  // "Done" detection — exact word, common variants, or short phrase with
  // "done" as the only content word.
  const lower = text.toLowerCase().trim();
  const isDone = /^(done|that'?s (it|all)|no more|thats all|nothing else|im done|i'?m done|no thanks|that is all|all done|finish|finished)$/i.test(lower);

  if (isDone) {
    if (faqs.length === 0) {
      await sendWithMenuButton(user.phone_number, "Please share at least one common question your customers ask before typing *done*.");
      return STATES.CB_COLLECT_FAQS;
    }

    await sendWithMenuButton(
      user.phone_number,
      `Got ${faqs.length} question${faqs.length > 1 ? 's' : ''}! Now, what services do you offer with their prices? (A brief list is fine, e.g., "Teeth cleaning - $100, Whitening - $250")`
    );
    await logMessage(user.id, `Chatbot flow: collected ${faqs.length} FAQs`, 'assistant');
    return STATES.CB_COLLECT_SERVICES;
  }

  // LLM-split: one message can carry 1 or many questions. Signal-gated so
  // a clearly-single question skips the LLM call.
  const questions = await splitFaqQuestions(text, user.id);
  if (questions.length === 0) {
    await sendWithMenuButton(user.phone_number, "Didn't catch a customer question there. Send one (or several), or type *done* to continue.");
    return STATES.CB_COLLECT_FAQS;
  }

  for (const q of questions) {
    faqs.push({ question: q, answer: '' });
  }
  await updateUserMetadata(user.id, {
    chatbotData: { ...existing, faqs },
  });

  const count = faqs.length;
  const ackLine = questions.length === 1
    ? `Got it! (${count} so far)`
    : `Added ${questions.length} questions — ${count} total.`;
  await sendTextMessage(
    user.phone_number,
    `${ackLine} Send another, or type *done* to continue.`
  );
  await logMessage(user.id, `Chatbot flow: +${questions.length} FAQs (total ${count})`, 'assistant');
  return STATES.CB_COLLECT_FAQS;
}

// Step 4: Collect services
async function handleCollectServices(user, message) {
  const text = (message.text || '').trim();
  if (!text) {
    await sendWithMenuButton(user.phone_number, 'What services do you offer? A brief list with prices is perfect.');
    return STATES.CB_COLLECT_SERVICES;
  }

  const existing = user.metadata?.chatbotData || {};

  // Parse services from text - try to extract name/price pairs
  const services = [];
  const lines = text.split(/[,\n]+/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const priceMatch = line.match(/[\-–:]\s*\$?([\d,.]+)/);
    if (priceMatch) {
      const name = line.slice(0, line.indexOf(priceMatch[0])).trim();
      services.push({ name: name || line, description: '', price: `$${priceMatch[1]}` });
    } else {
      services.push({ name: line, description: '', price: '' });
    }
  }

  await updateUserMetadata(user.id, {
    chatbotData: { ...existing, services },
  });

  await sendWithMenuButton(
    user.phone_number,
    "What are your business hours? (e.g., Mon-Fri 9am-6pm, Sat 10am-2pm)"
  );
  await logMessage(user.id, `Chatbot flow: collected ${services.length} services`, 'assistant');
  return STATES.CB_COLLECT_HOURS;
}

// Step 5: Collect hours
async function handleCollectHours(user, message) {
  const text = (message.text || '').trim();
  if (!text) {
    await sendWithMenuButton(user.phone_number, 'What are your business hours?');
    return STATES.CB_COLLECT_HOURS;
  }

  const existing = user.metadata?.chatbotData || {};
  await updateUserMetadata(user.id, {
    chatbotData: { ...existing, hours: text },
  });

  await sendWithMenuButton(
    user.phone_number,
    "Last one - what's your business address/location?"
  );
  await logMessage(user.id, `Chatbot flow: hours = "${text}"`, 'assistant');
  return STATES.CB_COLLECT_LOCATION;
}

// Step 6: Collect location, then generate demo
async function handleCollectLocation(user, message) {
  const text = (message.text || '').trim();
  if (!text) {
    await sendWithMenuButton(user.phone_number, "What's your business address or location?");
    return STATES.CB_COLLECT_LOCATION;
  }

  const existing = user.metadata?.chatbotData || {};
  await updateUserMetadata(user.id, {
    chatbotData: { ...existing, location: text, phone: user.phone_number },
  });

  await sendTextMessage(user.phone_number, 'Awesome, I have everything I need! Generating your chatbot demo now...');
  await logMessage(user.id, `Chatbot flow: location = "${text}". Generating demo...`, 'assistant');

  // Generate the demo
  try {
    const chatbotData = { ...existing, location: text, phone: user.phone_number };
    const slug = await generateUniqueSlug(chatbotData.businessName);

    const client = await createClient({
      client_id: slug,
      business_name: chatbotData.businessName,
      industry: chatbotData.industry || null,
      owner_name: user.name || null,
      owner_phone: user.phone_number,
      chatbot_data: {
        description: `${chatbotData.businessName} is a ${chatbotData.industry || 'local'} business.`,
        services: chatbotData.services || [],
        faqs: chatbotData.faqs || [],
        hours: chatbotData.hours || '',
        location: chatbotData.location || '',
        phone: user.phone_number,
        custom_instructions: '',
      },
      status: 'demo',
    });

    const demoUrl = `${BASE_URL}/demo/${slug}`;

    await updateUserMetadata(user.id, {
      chatbotData: { ...chatbotData, slug, clientId: client.client_id },
    });

    await sendTextMessage(
      user.phone_number,
      `Your chatbot is ready! Try it out - ask it anything your customers would ask:`
    );
    await sendCTAButton(
      user.phone_number,
      'Tap below to test your AI chatbot',
      'Try Your Chatbot',
      demoUrl
    );
    await sendTextMessage(
      user.phone_number,
      'Share it with your team too! When you\'re ready to make it permanent, just let me know.'
    );
    await logMessage(user.id, `Chatbot demo created: ${demoUrl}`, 'assistant');

    // Schedule follow-up reminder
    await updateUserMetadata(user.id, {
      chatbotDemoSentAt: new Date().toISOString(),
    });

    return STATES.CB_DEMO_SENT;
  } catch (error) {
    logger.error('[CHATBOT-FLOW] Demo generation failed:', error.message);
    await sendTextMessage(
      user.phone_number,
      'Sorry, something went wrong while generating your demo. Let me try again - just type "retry" or we can go back to the menu.'
    );
    return STATES.CB_GENERATING;
  }
}

// Retry handler for failed generation
async function handleGenerating(user, message) {
  const text = (message.text || '').trim().toLowerCase();
  if (text === 'retry') {
    return handleCollectLocation(user, { ...message, text: user.metadata?.chatbotData?.location || 'N/A' });
  }
  // If they want to bail, they can use /menu
  await sendWithMenuButton(user.phone_number, 'Type "retry" to try generating your demo again, or tap the menu button.');
  return STATES.CB_GENERATING;
}

// After demo is sent - wait for feedback
async function handleDemoSent(user, message) {
  const text = (message.text || '').trim().toLowerCase();
  const buttonId = message.buttonId || '';

  // Check if they want to proceed
  const wantsToProceed = buttonId === 'cb_proceed' ||
    /\b(yes|yeah|ready|proceed|activate|trial|start|sign up|interested|let'?s go|i want|go ahead)\b/i.test(text);

  if (wantsToProceed) {
    return activateTrial(user);
  }

  // They might be asking about the chatbot or giving feedback
  // Send follow-up info if it's been a while
  await sendInteractiveButtons(
    user.phone_number,
    "How's the chatbot looking? Pretty cool, right? Here's what it can do on a paid plan:\n\n" +
    "*Starter ($97/mo)* - Up to 500 conversations/mo, widget embed, lead capture\n" +
    "*Growth ($249/mo)* - Unlimited conversations, priority support, advanced analytics\n" +
    "*Premium ($599/mo)* - Everything + custom integrations, dedicated account manager\n\n" +
    "All plans start with a *7-day free trial* - no payment needed to start!",
    [
      { id: 'cb_proceed', title: 'Start Free Trial' },
      { id: 'menu_main', title: 'Back to Menu' },
    ]
  );
  await logMessage(user.id, 'Showed chatbot pricing tiers', 'assistant');
  return STATES.CB_FOLLOW_UP;
}

// Follow-up after pricing shown
async function handleFollowUp(user, message) {
  const buttonId = message.buttonId || '';
  const text = (message.text || '').trim().toLowerCase();

  const wantsToProceed = buttonId === 'cb_proceed' ||
    /\b(yes|yeah|ready|proceed|starter|growth|premium|trial|start|sign up|interested|go ahead)\b/i.test(text);

  if (wantsToProceed) {
    return activateTrial(user);
  }

  // If they're asking questions, hand off to sales bot
  if (user.metadata?.returnToSales || text.length > 20) {
    await updateUserMetadata(user.id, { returnToSales: false });
    return STATES.SALES_CHAT;
  }

  await sendWithMenuButton(
    user.phone_number,
    "No worries! The demo link stays active if you want to share it around. Just message us whenever you're ready to start your free trial!"
  );

  // Phase 12: user passed on the trial but the chatbot demo pass is
  // done — advance to the next queued service if there is one.
  const { maybeStartNextQueuedService } = require('../serviceQueue');
  const nextState = await maybeStartNextQueuedService(user);
  if (nextState) return nextState;

  return STATES.SALES_CHAT;
}

// Activate trial for the user
async function activateTrial(user) {
  const chatbotData = user.metadata?.chatbotData || {};
  const slug = chatbotData.slug;

  if (!slug) {
    await sendTextMessage(user.phone_number, "Hmm, I can't find your demo. Let's set it up again - what's your business name?");
    return STATES.CB_COLLECT_NAME;
  }

  try {
    const { updateClient } = require('../../chatbot/db/clients');
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);

    await updateClient(slug, {
      status: 'trial',
      trial_ends_at: trialEnd.toISOString(),
    });

    const chatUrl = `${BASE_URL}/chat/${slug}`;
    const embedCode = `<script src="${BASE_URL}/widget.js" data-client-id="${slug}"></script>`;

    await sendTextMessage(
      user.phone_number,
      "Your 7-day free trial is activated! Here's your chatbot - two ways to use it:"
    );

    // Send standalone link
    await sendCTAButton(
      user.phone_number,
      '1. *Standalone link* - share this anywhere (Instagram bio, Google Business, business cards):',
      'Your Chat Link',
      chatUrl
    );

    // Send embed code
    await sendTextMessage(
      user.phone_number,
      `2. *Website embed* - paste this code in your website's HTML before </body>:\n\n\`${embedCode}\``
    );

    await sendTextMessage(
      user.phone_number,
      "That's it! Your chatbot is live. I'll send you a report at the end of the trial showing how many conversations and leads it captured."
    );

    await logMessage(user.id, `Chatbot trial activated for ${slug}`, 'assistant');

    await updateUserMetadata(user.id, {
      chatbotTrialActivated: true,
      chatbotSlug: slug,
      chatbotTrialEndsAt: trialEnd.toISOString(),
    });

    // Phase 15: record completion so future sessions recognize the user.
    try {
      const { markProjectCompleted } = require('../returnVisitor');
      await markProjectCompleted(user, { type: 'chatbot', businessName: chatbotData.businessName });
    } catch (err) {
      logger.warn(`[CHATBOT-FLOW] markProjectCompleted failed: ${err.message}`);
    }

    // Phase 12: chatbot is now fully set up — advance the queue if there's
    // another service waiting. Otherwise drop to sales chat as before.
    const { maybeStartNextQueuedService } = require('../serviceQueue');
    const nextState = await maybeStartNextQueuedService(user);
    if (nextState) return nextState;

    return STATES.SALES_CHAT;
  } catch (error) {
    logger.error('[CHATBOT-FLOW] Trial activation failed:', error.message);
    await sendTextMessage(user.phone_number, "Something went wrong activating your trial. Let me have someone from the team help - they'll reach out shortly!");
    return STATES.SALES_CHAT;
  }
}

/**
 * Cross-flow entry (Phase 11). Pre-fills businessName, industry, and
 * services from the shared websiteData pool (populated by the webdev
 * flow) and jumps straight to the first collection state that still
 * needs input. When everything shared is already known, skips straight
 * to the chatbot-specific FAQ ask.
 *
 * Called from serviceSelection.js on the svc_chatbot branch so the user
 * doesn't re-type name/industry/services they already gave to webdev.
 */
async function startChatbotFlow(user) {
  const { getSharedBusinessContext } = require('../entityAccumulator');
  const shared = getSharedBusinessContext(user);

  // Pre-fill chatbotData with the shared fields. Keep existing FAQs /
  // hours / location untouched — those are chatbot-specific and the
  // user may have partially filled them on a previous pass.
  const existing = user.metadata?.chatbotData || {};
  const seeded = { ...existing };
  if (shared.businessName && !seeded.businessName) seeded.businessName = shared.businessName;
  if (shared.industry && !seeded.industry) seeded.industry = shared.industry;
  if (Array.isArray(shared.services) && shared.services.length > 0 && (!seeded.services || !seeded.services.length)) {
    // Store the services list as a single string so it renders naturally
    // in the chatbot config — handleCollectServices stores free text.
    seeded.services = shared.services.join(', ');
  }
  await updateUserMetadata(user.id, { chatbotData: seeded });
  user.metadata = { ...(user.metadata || {}), chatbotData: seeded };

  const hasName = !!seeded.businessName;
  const hasIndustry = !!seeded.industry;
  const hasServices = !!seeded.services;

  const ctxLines = [];
  if (hasName) ctxLines.push(`*${seeded.businessName}*`);
  if (hasIndustry) ctxLines.push(`_${seeded.industry}_`);
  const carriedNote = ctxLines.length ? `\n\nUsing what I have from earlier: ${ctxLines.join(' · ')}.` : '';

  if (!hasName) {
    await sendWithMenuButton(
      user.phone_number,
      '🤖 *AI Chatbot for Your Business*\n\n' +
        "Let's build you a 24/7 AI assistant that answers customer questions and captures leads.\n\n" +
        "First, what's your *business name*?"
    );
    await logMessage(user.id, 'Started chatbot flow', 'assistant');
    return STATES.CB_COLLECT_NAME;
  }

  if (!hasIndustry) {
    await sendWithMenuButton(
      user.phone_number,
      `🤖 *AI Chatbot for Your Business*${carriedNote}\n\n` +
        `What *industry* is your business in? (e.g. restaurant, dental clinic, salon, real estate, gym)`
    );
    await logMessage(user.id, `Started chatbot flow with prefilled name=${seeded.businessName}`, 'assistant');
    return STATES.CB_COLLECT_INDUSTRY;
  }

  // Name + industry present. Even with services pre-filled, FAQs are
  // chatbot-specific and always need to be collected — so jump to
  // FAQs regardless of services state.
  const servicesNote = hasServices
    ? ` I've got your service list too, so we can skip that.`
    : '';
  await sendWithMenuButton(
    user.phone_number,
    `🤖 *AI Chatbot for Your Business*${carriedNote}${servicesNote}\n\n` +
      "What are the top questions your customers usually ask? Send them one per message, then type *done* when you're finished."
  );
  await logMessage(user.id, `Started chatbot flow with prefilled name=${seeded.businessName}, industry=${seeded.industry}, services=${hasServices}`, 'assistant');
  return STATES.CB_COLLECT_FAQS;
}

module.exports = { handleChatbotService, startChatbotFlow };
