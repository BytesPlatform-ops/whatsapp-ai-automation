/**
 * objectionHandler.js
 *
 * Dedicated handler for messages classified by messageAnalyzer as
 * `intent === 'objection'`. Examples: "too expensive", "not sure this is
 * worth it", "let me think about it", "I'll just use Wix", "your prices
 * are crazy".
 *
 * Goals:
 * 1. Acknowledge the concern with empathy first. Do NOT push.
 * 2. Share relevant social proof / value framing pulled from the RAG
 *    knowledge base when available.
 * 3. Offer a lower-commitment next step (call, free audit, see examples),
 *    never a hard ask for payment.
 * 4. Tag the objection in user.metadata.objectionTopics for the follow-up
 *    scheduler to pick up later.
 *
 * The router wires this in BEFORE state dispatch when
 * analysis.intent === 'objection'. After the handler runs we return the
 * user to their current state (no forced transition) so the flow continues
 * naturally once the objection is addressed.
 */

'use strict';

const { sendTextMessage } = require('../../messages/sender');
const { logMessage } = require('../../db/conversations');
const { updateUserMetadata } = require('../../db/users');
const { generateResponse } = require('../../llm/provider');
const { logger } = require('../../utils/logger');
const { buildDirective: languageDirective } = require('../../llm/languageDirective');

// ── Objection-topic classifier (regex → tag) ───────────────────────────
// Rough but cheap first-pass tagging. Used for metadata.objectionTopics
// so the follow-up scheduler can pick the right re-engagement angle.
function classifyObjectionTopic(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(expensive|costly|too much|cheaper|discount|budget|afford|price|pricing|cost)\b/.test(t)) return 'price';
  if (/\b(think|thinking|consider|decide|later|time)\b/.test(t)) return 'timing';
  if (/\b(trust|scam|legit|real|reviews?|testimonials?|proof)\b/.test(t)) return 'trust';
  if (/\b(worth|value|why|benefit|roi|return)\b/.test(t)) return 'value';
  if (/\b(wix|squarespace|shopify|godaddy|myself|diy|free)\b/.test(t)) return 'competitor';
  if (/\b(quality|cheap work|bad|terrible)\b/.test(t)) return 'quality';
  return 'general';
}

const TOPIC_NOTES = {
  price: "Price is the most common objection — frame value relative to revenue impact, mention the $100 starter tier and payment plans, never discount reflexively.",
  timing: "User wants time to think — respect it completely. Don't create fake urgency. Offer to send a summary + check back later.",
  trust: "User is worried about legitimacy — share the portfolio/proof points honestly. Mention the preview-first workflow (see it before paying).",
  value: "User is questioning the ROI — give a concrete win someone similar to them got, and why a website matters for their specific industry.",
  competitor: "User is considering a DIY tool — don't bash it, acknowledge it can work, then explain what they get from us that DIY doesn't (setup help, on-brand, ongoing fixes).",
  quality: "User is worried about quality — share that they see a preview BEFORE paying, unlimited revisions, 100% refund if not happy.",
  general: "Standard objection — validate first, then find out what specifically is holding them back.",
};

const OBJECTION_PROMPT_BASE = `You are Pixie, a warm, experienced digital agency consultant on WhatsApp. Your customer just raised an objection (too expensive / not sure / I'll think about it / competitor / quality concern / etc).

STRICT RULES:
- Lead with empathy. First sentence must acknowledge their concern, NOT pitch.
- No fake urgency. No guilt trips. No "limited time offers" you just made up.
- Short — 2-4 sentences max, WhatsApp-style.
- No emojis unless the user used them first.
- Never break character. Never say you're an AI/bot.
- Do NOT volunteer the company name "Bytes Platform".
- End with ONE low-commitment option (see an example, book a 15-min call, get the $100 starter, or simply "want me to check back tomorrow?") — NOT a hard ask for payment.
- If their objection is a pure delay ("let me think", "not now"), respect it completely. Offer to follow up. Don't pitch again in that same reply.

FACTS YOU CAN REFERENCE:
- Base website starts at $100.
- Preview-first workflow: customer sees the site BEFORE paying anything.
- Revisions are free on every plan.
- Real team delivers in 1-3 days typically.
- Split payments available (e.g. 60 now / 50 after delivery).

Your reply must land on ONE of these closing moves (pick whichever fits the objection):
A) "I hear you — want me to just send over a preview first? Costs nothing to look at."
B) "Totally fair. I'll circle back [tomorrow / next week] — nothing to decide right now."
C) "Make sense. If budget is the blocker we can do $X now and the rest after delivery."
D) "Fair enough. Want to hop on a 15-min call with our PM? No pitch, just a scoping chat."`;

/**
 * Build the full objection system prompt, tailored to the detected topic
 * and any RAG-available context. Returns a prompt string.
 */
async function buildObjectionPrompt(topic, userText) {
  let knowledgeContext = '';
  try {
    const { retrieveContext } = require('../../knowledge/retriever');
    const chunks = await retrieveContext(userText, 2);
    if (chunks && chunks.length > 0) {
      knowledgeContext =
        '\n\nRELEVANT BACKGROUND (use sparingly, quote only if it lands naturally):\n' +
        chunks.map((c) => c.content).join('\n---\n');
    }
  } catch {
    // Knowledge base unavailable — fine, the prompt is self-sufficient.
  }

  return (
    OBJECTION_PROMPT_BASE +
    `\n\nDETECTED OBJECTION TOPIC: ${topic}\nTOPIC GUIDANCE: ${TOPIC_NOTES[topic] || TOPIC_NOTES.general}` +
    knowledgeContext
  );
}

/**
 * Main handler entry. Called by router.js when analysis.intent === 'objection'.
 * Returns:
 *   - `null` to keep the user in the same state (flow continues on next turn)
 *   - a STATES.X string to force a transition (not currently used)
 *
 * IMPORTANT: this handler only sends ONE reply — it does not call the
 * current state handler afterwards. The router must NOT then re-run the
 * state handler for this turn, otherwise the user gets two responses.
 */
async function handleObjection(user, message) {
  const text = (message.text || '').trim();
  const topic = classifyObjectionTopic(text);

  // Persist the topic tag. Dedup so one user doesn't balloon the array.
  const existing = Array.isArray(user.metadata?.objectionTopics)
    ? user.metadata.objectionTopics
    : [];
  if (!existing.includes(topic)) {
    const updated = [...existing, topic].slice(-10); // cap at 10
    await updateUserMetadata(user.id, {
      objectionTopics: updated,
      lastObjectionAt: new Date().toISOString(),
      lastObjectionTopic: topic,
    });
    user.metadata = { ...(user.metadata || {}), objectionTopics: updated, lastObjectionAt: new Date().toISOString(), lastObjectionTopic: topic };
  }

  logger.info(`[OBJECTION] ${user.phone_number}: topic=${topic} text="${text.slice(0, 80)}"`);

  let reply;
  try {
    let systemPrompt = await buildObjectionPrompt(topic, text);
    systemPrompt += languageDirective(user);
    reply = await generateResponse(
      systemPrompt,
      [{ role: 'user', content: text }],
      {
        userId: user.id,
        operation: 'objection_handler',
        // gpt-4o-mini handles tone-matching fine for short empathetic
        // replies; 4o's extra reasoning isn't worth the cost here.
        model: 'gpt-4o-mini',
      }
    );
  } catch (err) {
    logger.error(`[OBJECTION] LLM failed: ${err.message}`);
    // Safe fallback by topic — at least we never go silent.
    reply =
      topic === 'timing'
        ? "Totally fair — take your time. I'll check back in a day or two. No pressure."
        : topic === 'price'
          ? "I hear you on budget. Our starter site is $100, and you only pay AFTER you see the preview you like. Want me to send one over so you can take a look?"
          : "I hear you. Want me to send a preview first so you can see what you'd be getting? Costs nothing to look.";
  }

  await sendTextMessage(user.phone_number, reply);
  await logMessage(user.id, reply, 'assistant');
  return null; // keep state — the user can continue the flow or re-object
}

module.exports = {
  handleObjection,
  classifyObjectionTopic,
};
