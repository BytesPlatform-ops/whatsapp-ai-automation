const express = require('express');
const { logger } = require('../../utils/logger');
const { getAnalyticsSummary, getGlobalAnalytics } = require('../db/analytics');
const { getClient } = require('../db/clients');
const { getConversationsByClient } = require('../db/conversations');

const router = express.Router();

// GET /api/v1/analytics/:client_id - Get analytics for a client
router.get('/:client_id', async (req, res) => {
  try {
    const { days } = req.query;
    const summary = await getAnalyticsSummary(req.params.client_id, parseInt(days) || 30);
    res.json(summary);
  } catch (error) {
    logger.error('[CHATBOT] Analytics error:', error.message);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// GET /api/v1/analytics/:client_id/report - Generate 30-day performance report
router.get('/:client_id/report', async (req, res) => {
  try {
    const client = await getClient(req.params.client_id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const summary = await getAnalyticsSummary(req.params.client_id, 30);
    const conversations = await getConversationsByClient(req.params.client_id, 100);

    // Extract top questions from conversations
    const questions = [];
    for (const convo of conversations) {
      const msgs = convo.messages || [];
      for (const msg of msgs) {
        if (msg.role === 'user' && msg.content && msg.content.length > 5) {
          questions.push(msg.content);
        }
      }
    }

    // Simple frequency count of common question themes
    const questionCounts = {};
    for (const q of questions) {
      const normalized = q.toLowerCase().replace(/[?!.,]/g, '').trim();
      const key = normalized.slice(0, 80);
      questionCounts[key] = (questionCounts[key] || 0) + 1;
    }
    const topQuestions = Object.entries(questionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([question, count]) => ({ question, count }));

    // Busiest days
    const busiestDays = (summary.daily || [])
      .sort((a, b) => b.total_conversations - a.total_conversations)
      .slice(0, 5);

    res.json({
      client_id: client.client_id,
      business_name: client.business_name,
      period: '30 days',
      summary: {
        total_conversations: summary.total_conversations,
        total_messages: summary.total_messages,
        leads_captured: summary.leads_captured,
        unique_visitors: summary.unique_visitors,
      },
      top_questions: topQuestions,
      busiest_days: busiestDays,
      daily_breakdown: summary.daily,
    });
  } catch (error) {
    logger.error('[CHATBOT] Report error:', error.message);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

module.exports = router;
