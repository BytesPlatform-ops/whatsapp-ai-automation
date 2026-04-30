require('dotenv').config();

const required = [
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_BUSINESS_ACCOUNT_ID',
  'WEBHOOK_VERIFY_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
];

const optional = [
  'WHATSAPP_APP_SECRET',
  'OPENAI_API_KEY',
  'NETLIFY_TOKEN',
  'ADMIN_PASSWORD',
  'ADMIN_SECRET',
  'PORT',
  'NODE_ENV',
  'LOG_LEVEL',
  'CALENDLY_URL',
  'PORTFOLIO_WEBSITE_1',
  'PORTFOLIO_WEBSITE_2',
  'PORTFOLIO_ECOMMERCE',
  'AGENT_PHONE_NUMBER',
  'CALENDLY_WEBHOOK_SIGNING_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'CHATBOT_BASE_URL',
  'META_PAGE_ACCESS_TOKEN',
  'META_APP_SECRET',
  'INSTAGRAM_ACCESS_TOKEN',
  'INSTAGRAM_APP_SECRET',
  'SENDGRID_API_KEY',
  'SENDGRID_FROM_EMAIL',
  'SENDGRID_FROM_NAME',
  'NAMECHEAP_API_USER',
  'NAMECHEAP_API_KEY',
  'NAMECHEAP_CLIENT_IP',
  'NAMECHEAP_USE_SANDBOX',
  'UNSPLASH_ACCESS_KEY',
  'TESTER_PHONES',
];
// Note: UNSPLASH_ACCESS_KEY / PEXELS_API_KEY are intentionally NOT required.
// Image fetches degrade gracefully — sites render with gradient heroes when
// no image source is configured.

function validateEnv() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

const env = {
  // WhatsApp
  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    verifyToken: process.env.WEBHOOK_VERIFY_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
  },
  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },
  // LLM
  llm: {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
  },
  // Netlify
  netlify: {
    token: process.env.NETLIFY_TOKEN || '',
  },
  // Admin — ADMIN_SECRET is the HMAC key used to derive admin session
  // tokens from ADMIN_PASSWORD. Rotating the secret invalidates all
  // existing sessions. Must be a random string (≥32 chars recommended).
  admin: {
    password: process.env.ADMIN_PASSWORD || '',
    secret: process.env.ADMIN_SECRET || '',
  },
  // Sales bot
  calendlyUrl: process.env.CALENDLY_URL || 'https://calendly.com/bytes-platform',
  portfolio: {
    website1: process.env.PORTFOLIO_WEBSITE_1 || 'https://quantiva-hq.vercel.app/',
    website2: process.env.PORTFOLIO_WEBSITE_2 || 'https://bytesplatform.info',
  },
  // Stripe
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    // Webhook signing secret — used to verify that incoming webhook requests
    // genuinely came from Stripe. Different per mode (test vs live), so
    // swapping modes requires rotating this value too.
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },
  chatbot: {
    baseUrl: process.env.CHATBOT_BASE_URL || 'https://bytesplatform.com',
  },
  // Messenger & Instagram
  messenger: {
    pageAccessToken: process.env.META_PAGE_ACCESS_TOKEN || '',
    instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',
    appSecret: process.env.META_APP_SECRET || '',
    verifyToken: process.env.WEBHOOK_VERIFY_TOKEN, // reuse the same verify token
    instagramUserId: process.env.INSTAGRAM_USER_ID || '',
  },
  // SendGrid
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY || '',
    fromEmail: process.env.SENDGRID_FROM_EMAIL || 'developer@bytesplatform.com',
    fromName: process.env.SENDGRID_FROM_NAME || 'Bytes Platform',
  },
  // Namecheap
  namecheap: {
    apiUser: process.env.NAMECHEAP_API_USER || '',
    apiKey: process.env.NAMECHEAP_API_KEY || '',
    clientIp: process.env.NAMECHEAP_CLIENT_IP || '',
    useSandbox: process.env.NAMECHEAP_USE_SANDBOX === 'true',
    get baseUrl() {
      return this.useSandbox
        ? 'https://api.sandbox.namecheap.com/xml.response'
        : 'https://api.namecheap.com/xml.response';
    },
  },
  // Unsplash (hero images for generated websites — legacy, kept as fallback)
  unsplash: {
    accessKey: process.env.UNSPLASH_ACCESS_KEY || '',
  },
  // Pexels (primary image source for generated websites — no attribution
  // required on customer-facing sites, 20k req/month free).
  pexels: {
    apiKey: process.env.PEXELS_API_KEY || '',
  },
  // remove.bg (background removal for user-uploaded logos). Free tier is
  // 50 images/month at preview resolution — enough for nav/hero placement
  // on generated sites. Missing key → logo processor falls back to using
  // the uploaded image as-is.
  removeBg: {
    apiKey: process.env.REMOVE_BG_API_KEY || '',
  },
  // Privacy / GDPR — used by the privacy policy page rendered at
  // GET /privacy and the one-line notice tacked onto first-time
  // greetings. PRIVACY_POLICY_URL overrides the URL the bot links
  // to; if unset we compute it from PUBLIC_API_BASE_URL + '/privacy'.
  privacy: {
    policyUrl: process.env.PRIVACY_POLICY_URL || '',
    companyName: process.env.PRIVACY_COMPANY_NAME || 'BytesPlatform',
    companyLegalName: process.env.PRIVACY_COMPANY_LEGAL_NAME || '',
    contactEmail: process.env.PRIVACY_CONTACT_EMAIL || 'privacy@bytesplatform.com',
    lastUpdated: process.env.PRIVACY_LAST_UPDATED || '',
  },
  agentPhone: process.env.AGENT_PHONE_NUMBER || '',
  // Comma-separated phone numbers (no + prefix needed, normalization is
  // applied in the isTester helper) whose conversations should be
  // excluded from the feedback system — no post-delivery prompts, no
  // implicit friction logging, no feedback table writes. Everything
  // else works normally.
  testerPhones: (process.env.TESTER_PHONES || '')
    .split(',')
    .map((s) => s.replace(/[^\d]/g, ''))
    .filter(Boolean),
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = { env, validateEnv };
