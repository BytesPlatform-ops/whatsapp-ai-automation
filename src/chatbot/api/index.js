const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { env } = require('../../config/env');

const clientRoutes = require('./clients');
const chatRoutes = require('./chat');
const analyticsRoutes = require('./analytics');
const widgetRoutes = require('./widget');

const router = express.Router();

// CORS - widget and chat endpoints need to be accessible from any origin
router.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Admin auth middleware for protected endpoints
function adminAuth(req, res, next) {
  // Check cookie-based auth (same as existing admin dashboard)
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(pair => {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  });

  const token = cookies.admin_token;
  if (token && env.admin.password) {
    const expected = crypto.createHmac('sha256', 'wa-bot-admin').update(env.admin.password).digest('hex');
    if (token === expected) return next();
  }

  // Check Authorization header (for API access)
  const authHeader = req.headers.authorization;
  if (authHeader && env.admin.password) {
    const provided = authHeader.replace('Bearer ', '');
    if (provided === env.admin.password) return next();
  }

  res.status(401).json({ error: 'Unauthorized' });
}

// Public endpoints (used by widget, no auth needed)
router.use('/chat', chatRoutes);
router.use('/widget', widgetRoutes);

// Protected endpoints (admin only)
router.use('/clients', adminAuth, clientRoutes);
router.use('/analytics', adminAuth, analyticsRoutes);

module.exports = router;
