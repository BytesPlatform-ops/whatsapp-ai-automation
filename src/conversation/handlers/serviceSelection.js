const {
  sendInteractiveButtons,
  sendInteractiveList,
  sendWithMenuButton,
} = require('../../messages/sender');
const { logMessage } = require('../../db/conversations');
const { STATES } = require('../states');
const {
  enabledServices,
  isServiceEnabled,
  findServiceByMenuButton,
} = require('../../config/services');
const { handoffToHuman } = require('../handoff');
const { logger } = require('../../utils/logger');

// Build the menu buttons dynamically from enabled services + always-on
// "Talk to a human" + "FAQ" entries. WhatsApp interactive buttons cap at
// 3 — currently we have just 1 enabled service so this fits, but if more
// services get re-enabled later we automatically fall back to the
// interactive list (handled in sendMainMenu).
function buildMainMenuButtons() {
  const enabled = enabledServices();
  const buttons = enabled.map((s) => ({
    id: s.menuButtonId,
    title: `${s.emoji} ${s.label}`,
  }));
  buttons.push({ id: 'svc_general', title: '💬 Talk to sales' });
  buttons.push({ id: 'svc_info', title: '❓ FAQ' });
  return buttons;
}

// Send the main menu. Called from the /menu command path in the router
// so the user sees a proper greeting instead of the "hmm, didn't catch
// that" preface that the default case uses for truly unrecognized input.
// Also reusable if any other handler wants to bounce the user back to
// the menu cleanly.
async function sendMainMenu(user) {
  const buttons = buildMainMenuButtons();
  // WhatsApp interactive buttons support up to 3. If we ever re-enable
  // enough services that we exceed that, render the interactive list
  // instead so nothing gets dropped.
  if (buttons.length <= 3) {
    await sendInteractiveButtons(
      user.phone_number,
      "Here's what I can help with — pick one to get started:",
      buttons
    );
  } else {
    await sendInteractiveList(
      user.phone_number,
      "Here's what I can help with — pick one to get started:",
      'View Options',
      [
        {
          title: 'Options',
          rows: buttons.map((b) => ({ id: b.id, title: b.title })),
        },
      ]
    );
  }
  await logMessage(user.id, 'Showed main menu', 'assistant', 'interactive');
  return STATES.SERVICE_SELECTION;
}

async function handleServiceSelection(user, message) {
  const buttonId = message.buttonId || message.listId || '';
  const text = (message.text || '').toLowerCase().trim();

  // Resolve which service the user picked / typed:
  //   1. Button tap → trust the buttonId.
  //   2. Free-text → regex-first, LLM-rescue fallback.
  let svcId = buttonId || matchServiceFromText(text);
  if (!svcId && text) {
    svcId = await pickServiceFromSwitch(text, user.id);
  }

  // Always-on entries (FAQ + talk-to-human) regardless of which services
  // are enabled — no need to gate them through the catalogue.
  if (svcId === 'svc_info') {
    await sendWithMenuButton(
      user.phone_number,
      '❓ *FAQ & Support*\n\nHi! I\'m Pixie. Ask me anything about how the website-build flow works, pricing, timelines, or our process.'
    );
    await logMessage(user.id, 'Entering informative/FAQ chat', 'assistant');
    return STATES.INFORMATIVE_CHAT;
  }
  if (svcId === 'svc_general') {
    await sendWithMenuButton(
      user.phone_number,
      "💬 Sure! I'm Pixie. What can I help you with?"
    );
    await logMessage(user.id, 'Entering sales chat', 'assistant');
    return STATES.SALES_CHAT;
  }

  // Catalogue-backed routing: if the picked service is currently enabled,
  // dispatch to its starter. If it's a known but disabled service, hand
  // off to a human. If we couldn't identify a service at all, re-show the
  // menu.
  const svc = svcId ? findServiceByMenuButton(svcId) : null;
  if (svc) {
    if (isServiceEnabled(svc.key)) {
      // Currently the only enabled flow with a starter is webdev. As more
      // services come back online, add their starters to this dispatch.
      if (svc.key === 'website') {
        const { startWebdevFlow } = require('./webDev');
        return startWebdevFlow(user);
      }
      // Defensive fallback — service is in the enabled set but no starter
      // is wired here yet. Treat as handoff so the user isn't stuck.
      logger.warn(`[SERVICE-SELECTION] No starter wired for enabled service "${svc.key}" — falling back to handoff`);
      return handoffToHuman(user, { serviceKey: svc.key, reason: 'no_starter_wired' });
    }
    // Known but disabled — straight to handoff.
    return handoffToHuman(user, { serviceKey: svc.key, reason: 'service_not_chat_handled' });
  }

  // Couldn't map the input to any service. Re-show the menu with a
  // tone-appropriate preface.
  const isQuestion =
    /\?$/.test(text) ||
    /^(what|whats|which|how|hows|when|whens|where|wheres|why|whys|does|do|can|could|should|would|is|are|will|who|whos|tell)\b/i.test(text);
  const preface = isQuestion
    ? "good question — here's what I can help with directly:"
    : "hmm, didn't catch that. Here's what I can help with:";
  const buttons = buildMainMenuButtons();
  if (buttons.length <= 3) {
    await sendInteractiveButtons(user.phone_number, preface, buttons);
  } else {
    await sendInteractiveList(
      user.phone_number,
      preface,
      'View Options',
      [{ title: 'Options', rows: buttons.map((b) => ({ id: b.id, title: b.title })) }]
    );
  }
  await logMessage(user.id, 'Re-showing service selection', 'assistant', 'interactive');
  return STATES.SERVICE_SELECTION;
}

/**
 * Try to match a service from free-text input.
 */
function matchServiceFromText(text) {
  if (/\b(seo|audit|analyz|analys)\b/i.test(text)) return 'svc_seo';
  if (/\b(website|web ?dev|site|redesign)\b/i.test(text)) return 'svc_webdev';
  if (/\b(app|mobile|android|ios)\b/i.test(text)) return 'svc_appdev';
  if (/\b(market|advertis|social media|ppc|brand)\b/i.test(text)) return 'svc_marketing';
  if (/\b(ad\s*gen|ads?\s*creat|ad\s*design|ad\s*image|ad\s*maker|create\s*ads?|design\s*ads?|marketing\s*ads?)\b/i.test(text)) return 'svc_adgen';
  if (/\b(logo|brand\s*mark|wordmark|brand\s*design|design\s*logo|create\s*logo|make\s*logo|logo\s*maker)\b/i.test(text)) return 'svc_logo';
  if (/\b(chatbot|chat ?bot|ai assistant|virtual assistant|ai chat)\b/i.test(text)) return 'svc_chatbot';
  if (/\b(faq|support|info|question|help|how|what)\b/i.test(text)) return 'svc_info';
  if (/\b(chat|talk|sales|general|buy|start|quote)\b/i.test(text)) return 'svc_general';
  return null;
}

/**
 * LLM-backed service picker for flow-switch messages. Use this when the
 * intent classifier has already marked a message as `menu` or `exit`
 * and we need to figure out WHICH service the user wants to switch to —
 * especially cases where regex gets confused (negation: "forget the
 * website, do chatbot"; plurals: "marketing ads"; filler words).
 *
 * Returns one of the svc_* ids, or null if the user just wants the menu
 * without a specific target.
 */
async function pickServiceFromSwitch(text, userId) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  // Fast path: regex already handles the clear cases cleanly. Only fall
  // through to LLM when regex found nothing OR the text contains words
  // that often trip the regex (negation + another service word).
  const regexHit = matchServiceFromText(raw);
  const hasNegation = /\b(forget|skip|scrap|cancel|drop|leave|nvm|never\s*mind|instead)\b/i.test(raw);
  if (regexHit && !hasNegation) return regexHit;

  const { generateResponse } = require('../../llm/provider');
  const { logger } = require('../../utils/logger');

  const prompt = `The user is switching between services mid-flow. Pick which service they want to DO NEXT from this exact list. Return ONLY JSON: {"service": "<id>"|null}.

Services:
- svc_seo: free SEO audit of a website
- svc_webdev: build a new website
- svc_appdev: mobile / web app development
- svc_marketing: digital marketing / SEO package / strategy
- svc_adgen: generate marketing AD IMAGES for social media
- svc_logo: make a brand logo
- svc_chatbot: AI chatbot for a business
- svc_info: FAQ / info / support
- svc_general: talk to sales

Rules:
- If the user says "forget/skip/cancel X, do Y", pick Y — ignore what they're leaving behind.
- Match plurals and synonyms: "marketing ads" → svc_adgen, "chat bot" → svc_chatbot, "website" → svc_webdev.
- If they just want to go back to the menu with no specific target, return {"service": null}.
- If nothing in the message maps to a service, return {"service": null}.

User message: "${raw.replace(/"/g, '\\"').slice(0, 300)}"`;

  try {
    const resp = await generateResponse(
      prompt,
      [{ role: 'user', content: 'Pick the service now.' }],
      { userId, operation: 'service_switch_pick', timeoutMs: 10_000 }
    );
    const m = String(resp || '').match(/\{[\s\S]*?\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const svc = parsed?.service;
    if (typeof svc !== 'string') return null;
    // Only accept known service ids
    const known = new Set(['svc_seo', 'svc_webdev', 'svc_appdev', 'svc_marketing', 'svc_adgen', 'svc_logo', 'svc_chatbot', 'svc_info', 'svc_general']);
    return known.has(svc) ? svc : null;
  } catch (err) {
    logger.warn(`[SERVICE-PICK] LLM call failed: ${err.message}`);
    return null;
  }
}

module.exports = { handleServiceSelection, sendMainMenu, matchServiceFromText, pickServiceFromSwitch };
