const { sendTextMessage, sendInteractiveButtons, sendWithMenuButton } = require('../../messages/sender');
const { logMessage, getConversationHistory } = require('../../db/conversations');
const { generateResponse } = require('../../llm/provider');
const { GENERAL_CHAT_PROMPT } = require('../../llm/prompts');
const { formatWhatsApp } = require('../../utils/formatWhatsApp');
const { STATES } = require('../states');
const { buildSummaryContext } = require('../summaryManager');
const { classifyDelegation } = require('../../config/smartDefaults');
const { logger } = require('../../utils/logger');

async function handleAppDev(user, message) {
  switch (user.state) {
    case STATES.APP_COLLECT_REQUIREMENTS:
      return handleCollectRequirements(user, message);
    case STATES.APP_PROPOSAL:
    case STATES.APP_FOLLOW_UP:
      return handleFollowUp(user, message);
    default:
      return STATES.APP_COLLECT_REQUIREMENTS;
  }
}

async function handleCollectRequirements(user, message) {
  const requirements = (message.text || '').trim();

  if (!requirements || requirements.length < 10) {
    await sendWithMenuButton(
      user.phone_number,
      'Please tell me more about your app idea. Include:\n\n' +
        '• What problem does it solve?\n' +
        '• Who is the target audience?\n' +
        '• Key features you need\n' +
        '• Platform (iOS, Android, Web, or all?)'
    );
    return STATES.APP_COLLECT_REQUIREMENTS;
  }

  // Bail when the user explicitly says they don't have an idea / want
  // us to make one up. Without this guard the LLM happily produces a
  // generic recap with placeholders like "[create accounts]" — promises
  // we can't keep, made up from nothing. Catches "i don't have one",
  // "no idea", "surprise me", "you tell me", any-language equivalents.
  let userHasNoIdea = false;
  if (requirements.length <= 80) {
    try {
      userHasNoIdea = await classifyDelegation(
        requirements,
        'Tell me about your app idea — what does it do and who is it for?'
      );
    } catch (err) {
      logger.warn(`[APPDEV] classifyDelegation threw: ${err.message}`);
    }
  }
  if (userHasNoIdea) {
    await sendWithMenuButton(
      user.phone_number,
      "No problem — app projects start with a real idea, even a rough one. " +
        "When you're ready, message me back with what problem you're solving or who it's for, and we'll go from there.\n\n" +
        "Or if you came in for something else (a website, a logo, an SEO audit), just tell me and I'll switch you over."
    );
    return STATES.APP_COLLECT_REQUIREMENTS;
  }

  // Use LLM to generate a proposal summary
  const systemPrompt =
    GENERAL_CHAT_PROMPT +
    '\n\nThe user has described an app idea. Provide a brief, professional response that:\n' +
    '1. Summarizes their requirements back to them — using ONLY what they actually said. Do NOT invent details, placeholders like [create accounts] / [perform the main action], or generic features they did not mention.\n' +
    '2. Suggests a recommended tech stack\n' +
    '3. Outlines a rough project phases (3-4 phases)\n' +
    '4. Mentions that you\'ll prepare a detailed proposal with timeline and pricing\n\n' +
    'If the user did not give enough detail to summarise (no problem statement, no audience, no features), DO NOT fabricate one — instead say you need a few specifics and ask one focused follow-up question.\n' +
    'Keep it concise for WhatsApp (under 1000 characters).';

  const response = await generateResponse(systemPrompt, [
    { role: 'user', content: requirements },
  ], { userId: user.id, operation: 'appdev_proposal' });

  // sendTextMessage already auto-logs the outbound via autoLogOutbound
  // in src/messages/sender.js — calling logMessage again here would
  // create a duplicate row in the conversations table that surfaces
  // as a visible duplicate in the admin transcript view AND as
  // duplicated history in subsequent LLM calls.
  await sendTextMessage(user.phone_number, formatWhatsApp(response));

  await sendInteractiveButtons(user.phone_number, 'Would you like to proceed?', [
    { id: 'app_proceed', title: '✅ Get Full Proposal' },
    { id: 'app_question', title: '❓ Ask a Question' },
    { id: 'back_menu', title: '📋 Back to Menu' },
  ]);

  return STATES.APP_FOLLOW_UP;
}

async function handleFollowUp(user, message) {
  const buttonId = message.buttonId || '';

  if (buttonId === 'app_proceed') {
    await sendTextMessage(
      user.phone_number,
      '📋 *Proposal Request Noted!*\n\n' +
        'Our development team will prepare a detailed proposal including:\n' +
        '• Technical architecture\n' +
        '• Development timeline\n' +
        '• Milestone deliverables\n' +
        '• Pricing breakdown\n\n' +
        'Someone will reach out within 24 hours. Is there anything else you\'d like to know?'
    );
    // sendTextMessage auto-logs the outbound; the explicit logMessage
    // below is an INTERNAL marker (different text) used by the admin
    // dashboard to flag this user as a hot lead, not a duplicate of
    // the user-facing message.
    await logMessage(user.id, 'User wants full app proposal', 'assistant');
    return STATES.APP_FOLLOW_UP;
  }

  if (buttonId === 'back_menu') {
    const { handleWelcome } = require('./welcome');
    return handleWelcome(user, message);
  }

  // Handle follow-up questions with LLM. Pass afterTimestamp so
  // /reset keeps pre-reset messages out of the LLM context.
  const history = await getConversationHistory(user.id, 20, {
    afterTimestamp: user.metadata?.lastResetAt || null,
  });
  const messages = history.map((h) => ({
    role: h.role,
    content: h.message_text,
  }));

  // Scoped prompt — the prior version was just GENERAL_CHAT_PROMPT plus
  // "this user is interested in app development", which let the LLM
  // happily role-play an entire fake builder flow ("service-only vs
  // service+staff", "payment method", "buffer time") that no real code
  // path executes. The hard rules below pin the LLM to either: (a)
  // answering questions about the app proposal, (b) routing back to
  // a real flow via the trigger tags the salesBot uses, or (c)
  // saying it'll get a human to follow up.
  const followUpPrompt =
    GENERAL_CHAT_PROMPT +
    '\n\n## CONTEXT — APP DEV FOLLOW-UP\n' +
    'The user just asked for an app proposal. They\'re now in follow-up mode. Our dev team will reach out within 24 hours with a detailed proposal — that part is handled by humans, not by you.\n\n' +
    '## HARD RULES — DO NOT BREAK THESE\n' +
    '1. DO NOT invent product details, feature lists, sub-flows, payment options, staff settings, hours pickers, buffer times, or any other "configuration questions" that pretend to be a real builder flow. We have no live builder for apps in chat — anything you spec gets handed to a human.\n' +
    '2. DO NOT generate fake recaps or proposals beyond what the user actually said. If they didn\'t give specifics, ask ONE focused follow-up question and stop.\n' +
    '3. If the user mentions they actually wanted a different service (a website, a logo, marketing ads, an SEO audit, a chatbot), ROUTE THEM BACK by emitting the matching trigger tag at the END of your reply. Available tags: [TRIGGER_WEBSITE_DEMO], [TRIGGER_LOGO_MAKER], [TRIGGER_AD_GENERATOR], [TRIGGER_SEO_AUDIT: their_url_or_skip], [TRIGGER_CHATBOT_DEMO]. Example: user says "actually I just wanted a website for my salon" → reply briefly acknowledging and end with [TRIGGER_WEBSITE_DEMO]. Do NOT role-play building it yourself — emit the tag and let the real handler take over.\n' +
    '4. Earlier conversation context matters: if the conversation history shows the user previously asked for a SALON website with a built-in booking system, treat any "i wanted a website" / "make the booking system" as a confirmation to switch back, and emit [TRIGGER_WEBSITE_DEMO].\n' +
    '5. If the user says goodbye ("bye", "tata", "thanks", "ttyl"), reply with a short friendly sign-off — do NOT redirect them to the menu.\n\n' +
    'Keep replies short (under 400 chars when possible).' +
    buildSummaryContext(user);

  const response = await generateResponse(
    followUpPrompt,
    messages,
    { userId: user.id, operation: 'appdev_followup' }
  );

  // The salesBot's [TRIGGER_*] system already lives in the router's
  // generic flow — but this handler doesn't go through it. Detect
  // [TRIGGER_WEBSITE_DEMO] inline so the user gets routed cleanly
  // instead of seeing the literal tag in their reply.
  const websiteTrigger = /\[TRIGGER_WEBSITE_DEMO(?::\s*([^\]]*))?\]/i.exec(response);
  if (websiteTrigger) {
    const cleanReply = response.replace(/\[TRIGGER_WEBSITE_DEMO[^\]]*\]/gi, '').trim();
    if (cleanReply) {
      await sendTextMessage(user.phone_number, cleanReply);
    }
    // Hand off to the salesBot's website-demo entry so the user lands
    // back in the real webdev flow with their salon context preserved.
    try {
      const { startWebdevFlow } = require('./webDev');
      return await startWebdevFlow(user);
    } catch (err) {
      logger.warn(`[APPDEV] Could not route to startWebdevFlow: ${err.message}`);
      const { handleWelcome } = require('./welcome');
      return handleWelcome(user, message);
    }
  }

  // sendTextMessage already auto-logs the outbound; no explicit
  // logMessage needed (that was the source of duplicate-message rows
  // showing up in the admin transcript).
  await sendTextMessage(user.phone_number, response);

  return STATES.APP_FOLLOW_UP;
}

module.exports = { handleAppDev };
