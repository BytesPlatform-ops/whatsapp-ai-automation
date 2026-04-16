const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { env, validateEnv } = require('./config/env');
const { logger } = require('./utils/logger');
const webhookRoutes = require('./webhook/routes');
const calendlyRoutes = require('./webhook/calendly');
const bookingRoutes = require('./webhook/bookingRoutes');
const adminRoutes = require('./admin/routes');
const { startFollowupScheduler } = require('./followup/scheduler');
const chatbotApiRoutes = require('./chatbot/api');
const chatbotPageRoutes = require('./chatbot/pages/routes');
const { startChatbotScheduler } = require('./chatbot/jobs/scheduler');
const { startInstagramTokenRefreshScheduler } = require('./jobs/instagramTokenRefresh');
const { startUpsellScheduler } = require('./jobs/upsellScheduler');
const { startDomainVerifier } = require('./jobs/domainVerifier');
const { startSiteCleanup } = require('./jobs/siteCleanup');
const { startBookingReminders } = require('./jobs/bookingReminders');
const path = require('path');

// Validate environment variables
validateEnv();

const app = express();

// Trust the first proxy (ngrok / reverse proxy) so rate-limiter reads the real IP
app.set('trust proxy', 1);

// Security middleware (skip helmet on /admin — it uses Tailwind CDN + inline scripts)
app.use((req, res, next) => {
  if (req.path === '/' || req.path.startsWith('/_next/') || req.path.startsWith('/admin') || req.path === '/widget.js' || req.path.startsWith('/chat/') || req.path.startsWith('/demo/')) return next();
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
// URL-encoded bodies (used by the cancellation form in the salon booking flow).
app.use(express.urlencoded({ extended: false }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhook routes
app.use('/', webhookRoutes);
app.use('/', calendlyRoutes);

// Salon booking API — endpoints are public (called from static salon sites on Netlify).
app.use('/', bookingRoutes);

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

// Landing page — served from Next.js static export (landing/out/) when built
// locally. In production the landing is deployed separately (Vercel). If
// LANDING_URL is set we redirect there; otherwise show a minimal placeholder
// so the API host URL doesn't send visitors to an unrelated domain.
const landingOutDir = path.join(__dirname, '..', 'landing', 'out');
const landingIndex = path.join(landingOutDir, 'index.html');
if (require('fs').existsSync(landingIndex)) {
  app.use('/_next', express.static(path.join(landingOutDir, '_next'), { maxAge: '1y', immutable: true }));
  app.use(express.static(landingOutDir));
  app.get('/', (_req, res) => res.sendFile(landingIndex));
} else if (process.env.LANDING_URL) {
  app.get('/', (_req, res) => res.redirect(302, process.env.LANDING_URL));
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .type('html')
      .send(
        `<!doctype html><meta charset="utf-8"><title>BytesPlatform API</title>` +
          `<style>body{font-family:system-ui;background:#0A1628;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}a{color:#25D366}</style>` +
          `<div><h1 style="font-weight:800;letter-spacing:-.02em">BytesPlatform API</h1>` +
          `<p style="opacity:.7">This is the bot backend. The public site lives elsewhere.</p>` +
          `<p style="margin-top:24px;font-size:14px;opacity:.5">Health: <a href="/health">/health</a></p></div>`
      );
  });
}

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

  // Start post-sale upsell email scheduler (daily)
  startUpsellScheduler();

  // Start domain DNS verification job (every 5 min)
  startDomainVerifier();

  // Start site cleanup job — watermark after 1h, delete after 60 days (every 15m)
  startSiteCleanup();

  // Start salon booking reminder job — 24h-before customer emails (every 15m)
  startBookingReminders();
});

// Catch unhandled promise rejections so they don't silently kill operations
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

module.exports = app;
