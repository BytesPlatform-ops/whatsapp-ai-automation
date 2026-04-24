// Objection handler (Phase 8).
//
// Fires when the intent classifier tags a message as "objection" while the
// user is in a WEB_COLLECT_* state. Without this, the data-collection
// handler would treat "this is too expensive" as the answer to whatever
// field it was asking for (business name, colors, etc.) and barrel ahead.
//
// What it does, in one turn:
//   1. Validate the concern in the user's own register ("hear you",
//      "totally fair", "makes sense").
//   2. Share ONE short piece of context or social proof IF it fits — not
//      a re-pitch, not a feature dump.
//   3. Offer ONE low-commitment next step: continue, a call, or back off.
//
// What it never does:
//   - Fake urgency ("only X spots left this month")
//   - Discount pressure
//   - Re-sell / feature dump / "but here's why you should…" pivots
//
// The user stays in the same state — one-shot reply, next message flows
// normally. We also write the detected topic into metadata.objectionTopics
// so later follow-up logic can reference it.
//
// Scope is deliberately narrow (WEB_COLLECT_* only). SALES_CHAT already
// has Stage 6 objection playbooks baked into its system prompt; we don't
// want to double-handle. If we see objections landing badly in logo / ad /
// chatbot / domain flows later, we widen by expanding the allowed-states
// gate in router.js.

const { sendTextMessage } = require('../../messages/sender');
const { generateResponse } = require('../../llm/provider');
const { updateUserMetadata } = require('../../db/users');
const { logMessage, getConversationHistory } = require('../../db/conversations');
const { localize } = require('../../utils/localizer');
const { logger } = require('../../utils/logger');

const OBJECTION_PROMPT = `You are Pixie, a friendly WhatsApp bot helping the user build a website. The user was mid-questionnaire and just pushed back on the process itself — a doubt, a price concern, stalling, or a competitor mention. This is NOT an answer to the current question; it's a concern to address.

Your job: recognize the concern, validate it like a real person would, share ONE short piece of context or social proof if it fits, and offer ONE low-commitment next step. Then stop.

Context so you can be specific:
- The question the bot was asking: "{{CURRENT_QUESTION}}"
- Recent conversation:
{{CONTEXT}}
- The user's pushback: "{{MESSAGE}}"

Return ONLY valid JSON, no prose around it:
{"topic": "price"|"timing"|"trust"|"competitor"|"uncertainty"|"scope"|"other", "reply": "<2-3 sentences, casual WhatsApp tone>"}

Rules for the reply text:
- Lead with a natural validation: "hear you", "totally fair", "makes sense", "no worries". Never "I understand your concern" — too formal.
- If you include social proof, keep it to ONE line — "most folks come to us after trying a builder and realizing it eats their weekends" type of thing. Skip it if there's nothing honest to say.
- End with ONE of these — pick whichever fits the mood:
  - Offer to continue ("want to keep going, or…")
  - Offer a call ("happy to jump on a quick call if it helps")
  - Back off ("take your time, i'll be here" — this is the ONLY right move for "let me think about it")
- NEVER do any of:
  - Fake urgency ("only X spots left", "this month only", "slots almost full")
  - Discount pressure ("i can drop the price", "special deal for you")
  - Re-pitch or list features after validating
  - "But here's why you should still do it…" pivots — that's re-selling, not hearing them
  - Long replies. Max 3 sentences.
- Match their energy. If they're curt, stay curt. No over-explaining.
- No emojis unless they used one first.

Topic guide — pick the single best fit:
- "price" — direct cost concern ("too expensive", "can't afford")
- "timing" — not the right time ("later", "i'll think about it", "next month")
- "trust" — skeptical of process / company / legitimacy
- "competitor" — mentions wix, squarespace, chatgpt, cheaper alternative
- "uncertainty" — generic doubt ("not sure it's worth it")
- "scope" — pushback on what's being asked of them specifically
- "other" — anything else

Examples:
- Message "this is too expensive, i'll just use wix" → {"topic":"competitor","reply":"hear you — wix can work for simple stuff. most folks come to us after trying a builder and realizing it eats their weekends. wanna keep going, or want me to send a couple examples and circle back later?"}
- Message "not sure it's worth it tbh" → {"topic":"uncertainty","reply":"totally fair. no pressure either way. want me to build a quick preview so you can see it before deciding?"}
- Message "let me think about it" → {"topic":"timing","reply":"of course, take your time. no rush on my end — just msg me when you're ready."}
- Message "chatgpt could do this for free" → {"topic":"competitor","reply":"ha fair. chatgpt's great for words — the design, hosting, and the actually-looks-good part is where it falls apart. happy to show you a preview, or circle back another time if you want."}`;

function escapeForPrompt(s) {
  return String(s || '').replace(/[\r\n]+/g, ' ').slice(0, 500);
}

async function handleObjection(user, message, currentState, currentQuestion) {
  const text = (message.text || '').trim();
  if (!text) return currentState;

  // Short recent context — 4 messages is enough for topical grounding
  // without blowing up the prompt. Ignore errors; a missing history just
  // means the LLM has less to work with.
  let contextLines = '(no prior context)';
  try {
    const history = await getConversationHistory(user.id, 4, {
      afterTimestamp: user.metadata?.lastResetAt || null,
    });
    if (Array.isArray(history) && history.length) {
      contextLines = history
        .slice(-4)
        .map((h) => `${h.role}: ${escapeForPrompt(h.message_text)}`)
        .join('\n');
    }
  } catch {
    // fall through with the default
  }

  let topic = 'other';
  let reply = null;

  try {
    const filled = OBJECTION_PROMPT
      .replace('{{CURRENT_QUESTION}}', escapeForPrompt(currentQuestion || '(asking for information)'))
      .replace('{{CONTEXT}}', contextLines)
      .replace('{{MESSAGE}}', escapeForPrompt(text));

    const raw = await generateResponse(
      filled,
      [{ role: 'user', content: text }],
      { userId: user.id, operation: 'objection_handler' }
    );
    const match = String(raw || '').match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.topic === 'string') topic = parsed.topic;
        if (typeof parsed.reply === 'string' && parsed.reply.trim()) {
          reply = parsed.reply.trim();
        }
      }
    }
  } catch (err) {
    logger.warn(`[OBJECTION] LLM call failed for ${user.phone_number}: ${err.message}`);
  }

  if (!reply) {
    // Safe fallback — validate and back off without pushing. Used only
    // when the LLM fails or returns unparseable output.
    reply = "hear you. no pressure — want to keep going, or should we pick it back up later?";
  }

  // Persist the detected topic (unique-union, capped so a chatty user can't
  // balloon metadata). The follow-up scheduler — whenever that ships — can
  // reference these to keep outreach coherent with the concern raised.
  try {
    const existing = Array.isArray(user.metadata?.objectionTopics)
      ? user.metadata.objectionTopics
      : [];
    if (!existing.includes(topic)) {
      const next = [...existing, topic].slice(-10);
      await updateUserMetadata(user.id, { objectionTopics: next });
      if (user.metadata) user.metadata.objectionTopics = next;
    }
  } catch (err) {
    logger.warn(`[OBJECTION] Failed to persist topic for ${user.phone_number}: ${err.message}`);
  }

  const localized = await localize(reply, user, text);
  await sendTextMessage(user.phone_number, localized);
  await logMessage(user.id, localized, 'assistant');

  logger.info(`[OBJECTION] ${user.phone_number} topic=${topic} state=${currentState}`);

  // One-shot: stay in the same state so the user's next message picks up
  // where they were. If they want to leave the flow they'll send something
  // the classifier reads as "menu" / "exit" on the next turn.
  return currentState;
}

module.exports = { handleObjection };
