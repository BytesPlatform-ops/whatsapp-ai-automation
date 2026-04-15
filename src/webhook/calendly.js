const crypto = require('crypto');
const { Router } = require('express');
const { env } = require('../config/env');
const { sendTextMessage } = require('../messages/sender');
const { logMessage, getConversationHistory } = require('../db/conversations');
const { generateResponse } = require('../llm/provider');
const { logger } = require('../utils/logger');
const { supabase } = require('../config/database');

const router = Router();

/**
 * Verify Calendly webhook signature.
 * Calendly signs payloads with the webhook signing key using HMAC-SHA256.
 */
function verifyCalendlySignature(req) {
  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!signingKey) return true; // Skip verification if not configured

  const signature = req.headers['calendly-webhook-signature'];
  if (!signature) return false;

  // Calendly signature format: t=<timestamp>,v1=<signature>
  const parts = {};
  for (const part of signature.split(',')) {
    const [key, value] = part.split('=');
    parts[key] = value;
  }

  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;

  const payload = `${timestamp}.${JSON.stringify(req.body)}`;
  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(payload, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}

/**
 * Normalize a phone number to E.164 format for matching.
 * Strips spaces, dashes, parens, and ensures leading +.
 */
function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : `+${digits}`;
}

/**
 * Try to find a WhatsApp user by the invitee's phone number or email.
 */
async function findUserByInvitee(invitee) {
  // Try phone number first (most reliable match)
  const phone = normalizePhone(invitee.phone_number || invitee.phone);
  if (phone) {
    const waNumber = phone.replace(/^\+/, '');
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('phone_number', waNumber)
      .single();
    if (data) return data;
  }

  // Try email match in metadata
  const email = invitee.email;
  if (email) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .contains('metadata', { email })
      .single();
    if (data) return data;
  }

  // Try name match - match against the WhatsApp contact name or name in users table
  const name = (invitee.name || '').trim().toLowerCase();
  if (name) {
    // Match against users.name (set from WhatsApp contact name)
    const { data } = await supabase
      .from('users')
      .select('*')
      .ilike('name', name)
      .single();
    if (data) return data;

    // Also try partial match (first name only)
    const firstName = name.split(' ')[0];
    if (firstName && firstName.length > 2) {
      const { data: partial } = await supabase
        .from('users')
        .select('*')
        .ilike('name', `${firstName}%`)
        .single();
      if (partial) return partial;
    }
  }

  // Last resort — find the most recent user in SALES_CHAT who got a Calendly
  // link in the last 24 hours. `leadClosed: true` is set the moment we send
  // the booking link, so this catches every flow where the invitee used
  // different contact info on the Calendly form than their WhatsApp profile.
  // Dropping the `email || name` guard too — Calendly ALWAYS sends at least
  // one of those, but if payload is weird we still want a best-effort match
  // rather than a silent drop.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentLeads } = await supabase
    .from('users')
    .select('*')
    .eq('state', 'SALES_CHAT')
    .contains('metadata', { leadClosed: true })
    .gte('updated_at', cutoff)
    .order('updated_at', { ascending: false })
    .limit(1);
  const recentLead = recentLeads && recentLeads[0];
  if (recentLead) {
    logger.info(`Calendly: fell back to most-recent lead-closed user (${recentLead.phone_number}) for invitee ${name} <${email}>`);
    return recentLead;
  }

  logger.warn(`Calendly: no user match at all for invitee name="${name}" email="${email}" phone="${invitee.phone_number || ''}"`);
  return null;
}

const MEETING_SUMMARY_PROMPT = `You are a sales assistant preparing a briefing for the project specialist who will take the meeting. Read the full WhatsApp conversation below and produce a structured summary.

Return this EXACT format (fill in each field, use "N/A" if unknown):

**Lead Name:** [name]
**Business Name:** [name]
**Industry:** [industry]
**Service Needed:** [website / ecommerce / SEO / SMM / other]
**Current Website:** [URL or N/A]
**Pain Point / Goal:** [what they want to achieve or fix]
**Budget:** [stated budget or range]
**Timeline:** [when they need it]
**Package Discussed:** [which tier/price was discussed]
**Payment Plan:** [yes/no, details if yes]
**Personality Mode:** [Cool / Professional / Unsure / Negotiator]
**Language:** [language used in the chat]
**Objections Raised:** [list any objections or "none"]

**Conversation Summary:**
[2-4 sentence summary of how the conversation went - what was discussed, what the client responded well to, any concerns, and where things left off. Include anything the salesperson should know going into the call.]

**Recommended Approach for Call:**
[1-2 sentences on how to approach this client based on their personality and conversation history]`;

/**
 * Generate a chat summary for the salesperson from the full conversation history.
 */
async function generateChatSummary(userId) {
  const history = await getConversationHistory(userId, 100);

  if (!history.length) return null;

  const chatLog = history
    .map((h) => `[${h.role}]: ${h.message_text}`)
    .join('\n');

  const summary = await generateResponse(MEETING_SUMMARY_PROMPT, [
    { role: 'user', content: chatLog },
  ]);

  return summary;
}

/**
 * POST /calendly/webhook - Handle Calendly booking events.
 *
 * Calendly sends events like:
 *   - invitee.created  (someone booked a meeting)
 *   - invitee.canceled (someone cancelled)
 *
 * We match the invitee back to a WhatsApp user and send a farewell / update.
 */
router.post('/calendly/webhook', async (req, res) => {
  res.sendStatus(200);

  if (!verifyCalendlySignature(req)) {
    logger.warn('Invalid Calendly webhook signature');
    return;
  }

  const { event, payload } = req.body;

  logger.info('Calendly webhook received', { event });

  if (event === 'invitee.created') {
    const invitee = payload?.invitee || payload;
    const eventDetails = payload?.event || {};

    const name = invitee.name || invitee.first_name || 'there';
    const startTime = eventDetails.start_time || payload?.scheduled_event?.start_time;

    // Try to match this invitee to a WhatsApp user
    const user = await findUserByInvitee(invitee);

    if (!user) {
      logger.info('Calendly booking received but no matching WhatsApp user found', {
        email: invitee.email,
        phone: invitee.phone_number,
      });
      return;
    }

    // Format the meeting time nicely
    let timeStr = '';
    if (startTime) {
      const dt = new Date(startTime);
      timeStr = `\n📅 *${dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}*` +
        `\n🕐 *${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}*`;
    }

    const farewell =
      `🎉 *Meeting booked - you're all set, ${name}!*\n` +
      timeStr +
      `\n\nOur project specialist will be on the call ready to go. ` +
      `If anything comes up before then, just message here.\n\n` +
      `Talk soon! 🤝`;

    await sendTextMessage(user.phone_number, farewell);
    await logMessage(user.id, farewell, 'assistant');

    // Mark lead as closed so follow-up scheduler stops contacting them
    const { updateUserMetadata } = require('../db/users');
    await updateUserMetadata(user.id, { meetingBooked: true, leadClosed: true });

    // Generate chat summary and update the meeting record for the salesperson
    try {
      const summary = await generateChatSummary(user.id);

      if (summary) {
        // Find the latest meeting for this user and update it
        const { data: meeting } = await supabase
          .from('meetings')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (meeting) {
          await supabase
            .from('meetings')
            .update({
              status: 'confirmed',
              chat_summary: summary,
              name: name !== 'there' ? name : null,
            })
            .eq('id', meeting.id);

          logger.info(`Chat summary saved to meeting ${meeting.id} for ${user.phone_number}`);
        }
      }
    } catch (error) {
      logger.error('Failed to generate/save chat summary:', error);
      // Non-critical - farewell was already sent
    }

    logger.info(`Farewell sent to ${user.phone_number} after Calendly booking`);
  }

  if (event === 'invitee.canceled') {
    const invitee = payload?.invitee || payload;
    const user = await findUserByInvitee(invitee);

    if (!user) return;

    const cancelMsg =
      `Looks like the meeting was cancelled - no worries at all.\n\n` +
      `If you'd like to rebook, just let me know and I'll send the link again.`;

    await sendTextMessage(user.phone_number, cancelMsg);
    await logMessage(user.id, cancelMsg, 'assistant');

    logger.info(`Cancellation notice sent to ${user.phone_number}`);
  }
});

module.exports = router;
