const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { env, validateEnv } = require('./config/env');
const { logger } = require('./utils/logger');
const webhookRoutes = require('./webhook/routes');
const calendlyRoutes = require('./webhook/calendly');
const adminRoutes = require('./admin/routes');
const { startFollowupScheduler } = require('./followup/scheduler');
const chatbotApiRoutes = require('./chatbot/api');
const chatbotPageRoutes = require('./chatbot/pages/routes');
const { startChatbotScheduler } = require('./chatbot/jobs/scheduler');
const { startInstagramTokenRefreshScheduler } = require('./jobs/instagramTokenRefresh');
const path = require('path');

// Validate environment variables
validateEnv();

const app = express();

// Trust the first proxy (ngrok / reverse proxy) so rate-limiter reads the real IP
app.set('trust proxy', 1);

// Security middleware (skip helmet on /admin — it uses Tailwind CDN + inline scripts)
app.use((req, res, next) => {
  if (req.path === '/' || req.path.startsWith('/admin') || req.path === '/widget.js' || req.path.startsWith('/chat/') || req.path.startsWith('/demo/')) return next();
  helmet()(req, res, next);
});

// Rate limiting — 100 requests per minute per IP
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Parse JSON bodies — capture raw bytes for webhook signature verification
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhook routes
app.use('/', webhookRoutes);
app.use('/', calendlyRoutes);

// Messenger & Instagram webhook routes
const messengerRoutes = require('./webhook/messengerRoutes');
app.use('/', messengerRoutes);

// Admin dashboard
app.use('/admin', adminRoutes);

// Chatbot SaaS - API routes
app.use('/api/v1', chatbotApiRoutes);

// Chatbot SaaS - widget.js static file (CORS enabled for cross-origin embedding)
app.get('/widget.js', (req, res) => {
  const fs = require('fs');
  const filePath = path.join(__dirname, 'chatbot', 'widget', 'widget.js');
  const content = fs.readFileSync(filePath, 'utf8');
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(content);
});

// Chatbot SaaS - demo and standalone pages
app.use('/', chatbotPageRoutes);

// Landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'landing.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(env.port, () => {
  logger.info(`Server running on port ${env.port} (${env.nodeEnv})`);
  logger.info('Webhook URL: https://your-domain.com/webhook');

  // Start the follow-up scheduler (checks every 30 minutes)
  startFollowupScheduler();

  // Start the chatbot SaaS scheduler (trial expiry, demo follow-ups, monthly reports)
  startChatbotScheduler();

  // Start Instagram token auto-refresh (every 50 days)
  startInstagramTokenRefreshScheduler();
});

// Catch unhandled promise rejections so they don't silently kill operations
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

module.exports = app;
