const { getConversationHistory } = require('../db/conversations');
const { updateUserMetadata } = require('../db/users');
const { generateResponse } = require('../llm/provider');
const { logger } = require('../utils/logger');

// Regen the rolling summary every N new messages. 10 ≈ 5 user turns — often
// enough that the bot doesn't lose long-term context, rare enough that we
// don't burn LLM budget on every turn.
const SUMMARY_INTERVAL = 10;

// How many raw messages we feed into each regen call alongside the prior
// summary. Keeps the compaction prompt bounded regardless of history length.
const BATCH_SIZE = 20;

// Hard cap on stored summary — protects metadata blob + keeps future prompts cheap.
// Bumped from 2000 → 3000 once we started including durable identity facts
// alongside the conversation bullets.
const MAX_SUMMARY_CHARS = 3000;

const SUMMARY_PROMPT = `You're compacting an ongoing WhatsApp conversation between a customer and Pixie (our sales/support bot) so Pixie can remember context across long chats.

The raw message window the bot sees at reply time is rolling (last ~40 msgs), so this summary is the bot's only long-term memory. Make it self-contained.

Produce a compact summary in two sections:

## Facts
Durable identity + context the bot must always remember, one per line. Include whichever are known:
- Business name
- Industry / niche
- City / service area
- Contact info mentioned (email, phone — mask digits if they're PII)
- Services the customer asked about or was pitched
- Pricing / package / budget discussed (exact numbers if quoted)
- Any URLs / social handles / booking tools shared
- Ad source or how they found us
- Language they're chatting in (if not English)

## Conversation context
What the raw messages can't capture with structured fields — 4-8 bullets:
- Customer's stated preferences ("wants it minimal", "no stock photos", "needs it by Friday")
- Objections raised — with exact wording when possible ("too expensive, I'll use Wix", "let me think")
- Promises Pixie made ("I'll send a preview", "will follow up tomorrow")
- Pending offers or choices still on the table
- Emotional tone (excited / skeptical / frustrated / rushed)
- Important context a new Pixie reading this cold would need to pick up the conversation

Skip greetings, small talk, confirmations, and step-by-step flow questions the user already answered.

Output only the two sections with their headers. No preamble, no trailing commentary.`;

/**
 * Refresh the rolling conversation summary if enough new messages have
 * accumulated since the last regen. Safe to fire-and-forget from the router —
 * swallows all errors so it can't break the user-facing turn.
 */
async function maybeUpdateSummary(user) {
  try {
    // Only summarize messages from the current (post-reset) session.
    // Pre-reset context stays in the DB for admin but the rolling
    // summary that feeds the sales prompt starts fresh after /reset.
    const history = await getConversationHistory(user.id, 200, {
      afterTimestamp: user.metadata?.lastResetAt || null,
    });
    const totalMessages = history.length;
    const lastSummaryCount = user.metadata?.lastSummaryMessageCount || 0;
    const newSinceLast = totalMessages - lastSummaryCount;

    if (newSinceLast < SUMMARY_INTERVAL) return;

    const priorSummary = user.metadata?.conversationSummary || '';
    const batch = history.slice(-Math.max(newSinceLast, BATCH_SIZE));
    const batchText = batch
      .map((m) => `${m.role}: ${m.message_text}`)
      .join('\n');

    const userContent = priorSummary
      ? `PREVIOUS SUMMARY:\n${priorSummary}\n\nNEW MESSAGES SINCE LAST SUMMARY:\n${batchText}\n\nProduce an updated compact summary that merges the prior summary with what's new. Drop anything superseded; keep what still matters.`
      : `CONVERSATION SO FAR:\n${batchText}\n\nProduce the compact summary.`;

    const response = await generateResponse(
      SUMMARY_PROMPT,
      [{ role: 'user', content: userContent }],
      { userId: user.id, operation: 'conversation_summary' }
    );

    const summary = (response || '').trim().slice(0, MAX_SUMMARY_CHARS);
    if (!summary) return;

    await updateUserMetadata(user.id, {
      conversationSummary: summary,
      conversationSummaryAt: new Date().toISOString(),
      lastSummaryMessageCount: totalMessages,
    });

    logger.debug(
      `[SUMMARY] Updated for ${user.phone_number} (${totalMessages} msgs, +${newSinceLast}): ${summary.slice(0, 120).replace(/\s+/g, ' ')}`
    );
  } catch (err) {
    logger.error('[SUMMARY] Failed to update:', err.message);
  }
}

/**
 * Build a summary snippet to prepend to a system prompt. Returns '' when no
 * summary exists yet (first few turns of a conversation).
 */
function buildSummaryContext(user) {
  const summary = user?.metadata?.conversationSummary;
  if (!summary) return '';
  return `\n\n---\n\n# LONG-TERM MEMORY OF THIS CUSTOMER\nThis summarizes the whole conversation so far, including any details from earlier messages that may have rolled out of the raw message window. Trust these facts — they were captured when the customer stated them.\n\n${summary}\n\n---\n`;
}

module.exports = { maybeUpdateSummary, buildSummaryContext };
