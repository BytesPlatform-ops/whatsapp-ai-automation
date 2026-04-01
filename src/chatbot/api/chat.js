const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../../utils/logger');
const { generateResponse } = require('../../llm/provider');
const { getClient } = require('../db/clients');
const { findOrCreateConversation, appendMessage, updateVisitorInfo } = require('../db/conversations');
const { incrementAnalytics } = require('../db/analytics');
const { buildChatbotPrompt } = require('../services/prompt-builder');

const router = express.Router();

// Rate limit tracking per session (in-memory)
const sessionMessageCounts = new Map();
const SESSION_RATE_LIMIT = 30; // messages per hour
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

function checkRateLimit(sessionId) {
  const now = Date.now();
  const entry = sessionMessageCounts.get(sessionId);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    sessionMessageCounts.set(sessionId, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= SESSION_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Clean up old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of sessionMessageCounts) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
      sessionMessageCounts.delete(key);
    }
  }
}, 10 * 60 * 1000);

// POST /api/v1/chat - Main chat endpoint
router.post('/', async (req, res) => {
  try {
    const { client_id, session_id, message, visitor_info, source } = req.body;

    if (!client_id || !message) {
      return res.status(400).json({ error: 'client_id and message are required' });
    }

    // Look up client
    const client = await getClient(client_id);
    if (!client) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }
    if (client.status === 'cancelled') {
      return res.status(403).json({ error: 'This chatbot is no longer active' });
    }
    if (client.status === 'paused') {
      return res.status(403).json({ error: 'This chatbot is currently offline' });
    }

    // Generate or use existing session
    const sid = session_id || uuidv4();

    // Rate limit check
    if (!checkRateLimit(sid)) {
      return res.status(429).json({ error: 'Too many messages. Please try again later.' });
    }

    // Find or create conversation
    const isNew = !session_id;
    const conversation = await findOrCreateConversation(client_id, sid, source || 'widget', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Update visitor info if provided
    if (visitor_info) {
      await updateVisitorInfo(conversation.id, visitor_info);

      // Track lead capture
      if (visitor_info.email || visitor_info.phone) {
        await incrementAnalytics(client_id, { leads: 1 });
      }
    }

    // Append user message
    await appendMessage(conversation.id, 'user', message);

    // Build AI prompt
    const systemPrompt = buildChatbotPrompt(client);

    // Build message history (last 20 messages)
    const history = conversation.messages || [];
    const recentMessages = history.slice(-20).map(m => ({
      role: m.role,
      content: m.content,
    }));
    // Add current message
    recentMessages.push({ role: 'user', content: message });

    // Call AI
    let reply;
    try {
      reply = await generateResponse(systemPrompt, recentMessages);
    } catch (aiError) {
      logger.error('[CHATBOT] AI API error:', aiError.message);
      const fallbackPhone = client.chatbot_data?.phone || '';
      reply = `I'm having a bit of trouble right now. Please try again in a moment` +
        (fallbackPhone ? `, or contact us directly at ${fallbackPhone}.` : '.');
    }

    // Append assistant response
    await appendMessage(conversation.id, 'assistant', reply);

    // Update analytics
    await incrementAnalytics(client_id, {
      messages: 2, // user + assistant
      conversations: isNew ? 1 : 0,
      visitors: isNew ? 1 : 0,
    });

    res.json({
      reply,
      session_id: sid,
      conversation_id: conversation.id,
    });
  } catch (error) {
    logger.error('[CHATBOT] Chat error:', error.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
