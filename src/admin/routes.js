const express = require('express');
const crypto = require('crypto');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { DASHBOARD_PATH, getLoginHTML } = require('./template');
const queries = require('./queries');

const router = express.Router();

// ─── Auth helpers ──────────────────────────────
function makeToken(password) {
  return crypto.createHmac('sha256', 'wa-bot-admin').update(password).digest('hex');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach((pair) => {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  });
  return cookies;
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  const token = cookies.admin_token;
  if (!token || !env.admin.password) return false;
  return token === makeToken(env.admin.password);
}

function authMiddleware(req, res, next) {
  if (req.path === '/login' || req.path === '/login/') return next();
  if (!isAuthenticated(req)) return res.redirect('/admin/login');
  next();
}

// ─── Auth routes ───────────────────────────────
router.use(authMiddleware);

// Parse URL-encoded form bodies for login
router.use(express.urlencoded({ extended: false }));

router.get('/login', (req, res) => {
  if (isAuthenticated(req)) return res.redirect('/admin');
  res.send(getLoginHTML());
});

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== env.admin.password) {
    return res.send(getLoginHTML('Invalid password. Please try again.'));
  }
  const token = makeToken(password);
  res.setHeader('Set-Cookie', `admin_token=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=86400`);
  res.redirect('/admin');
});

router.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'admin_token=; Path=/admin; HttpOnly; Max-Age=0');
  res.redirect('/admin/login');
});

// ─── Dashboard page ────────────────────────────
router.get('/', (req, res) => {
  res.sendFile(DASHBOARD_PATH);
});

// ─── API endpoints ─────────────────────────────
router.get('/api/overview', async (req, res) => {
  try {
    const data = await queries.getOverviewMetrics();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Overview error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/leads', async (req, res) => {
  try {
    const data = await queries.getLeads();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Leads error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/lead-summaries', async (req, res) => {
  try {
    const data = await queries.getLeadSummaries();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Lead summaries error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/conversations/:userId', async (req, res) => {
  try {
    const data = await queries.getConversation(req.params.userId);
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Conversation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/dropoffs', async (req, res) => {
  try {
    const data = await queries.getDropoffs();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Dropoffs error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/funnel', async (req, res) => {
  try {
    const data = await queries.getFunnel();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Funnel error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/sites', async (req, res) => {
  try {
    const data = await queries.getSites();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Sites error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/audits', async (req, res) => {
  try {
    const data = await queries.getAudits();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Audits error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/meetings', async (req, res) => {
  try {
    const data = await queries.getMeetings();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Meetings error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/message-volume', async (req, res) => {
  try {
    const data = await queries.getMessageVolume();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Message volume error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Payment & Revenue endpoints ──────────────
router.get('/api/payments', async (req, res) => {
  try {
    const data = await queries.getPayments();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Payments error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/revenue', async (req, res) => {
  try {
    const data = await queries.getRevenue();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Revenue error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/sales-prep', async (req, res) => {
  try {
    const data = await queries.getSalesPrep();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Sales prep error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/sales-prep/:userId/summary', async (req, res) => {
  try {
    const summary = await queries.generateLeadSummary(req.params.userId);
    res.json({ summary });
  } catch (err) {
    logger.error('[ADMIN] Generate summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/payments/sync', async (req, res) => {
  try {
    const { syncAllPendingPayments } = require('../payments/stripe');
    const result = await syncAllPendingPayments();
    res.json(result);
  } catch (err) {
    logger.error('[ADMIN] Payment sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Chatbot SaaS Admin ──────────────────────
const path = require('path');
const chatbotClients = require('../chatbot/db/clients');
const chatbotConversations = require('../chatbot/db/conversations');
const chatbotAnalytics = require('../chatbot/db/analytics');

router.get('/chatbot', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'chatbot', 'admin', 'dashboard.html'));
});

router.get('/api/chatbot/clients', async (req, res) => {
  try {
    const { status, tier, search } = req.query;
    const data = await chatbotClients.listClients({ status, tier, search });
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Chatbot clients error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/chatbot/clients/:clientId', async (req, res) => {
  try {
    const data = await chatbotClients.getClient(req.params.clientId);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Chatbot client detail error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/chatbot/clients/:clientId', async (req, res) => {
  try {
    const data = await chatbotClients.updateClient(req.params.clientId, req.body);
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Chatbot client update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/chatbot/clients/:clientId/activate', async (req, res) => {
  try {
    const data = await chatbotClients.updateClient(req.params.clientId, {
      status: 'active',
      activated_at: new Date().toISOString(),
    });
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Chatbot activate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/chatbot/clients/:clientId/pause', async (req, res) => {
  try {
    const data = await chatbotClients.updateClient(req.params.clientId, { status: 'paused' });
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Chatbot pause error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/chatbot/clients/:clientId/cancel', async (req, res) => {
  try {
    const data = await chatbotClients.deactivateClient(req.params.clientId);
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Chatbot cancel error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/chatbot/clients/:clientId/conversations', async (req, res) => {
  try {
    const data = await chatbotConversations.getConversationsByClient(req.params.clientId, 100);
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Chatbot conversations error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/chatbot/clients/:clientId/analytics', async (req, res) => {
  try {
    const data = await chatbotAnalytics.getAnalyticsSummary(req.params.clientId, parseInt(req.query.days) || 30);
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Chatbot analytics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/chatbot/global', async (req, res) => {
  try {
    const data = await chatbotAnalytics.getGlobalAnalytics();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Chatbot global analytics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
