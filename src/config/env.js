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
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'LLM_PROVIDER',
  'NETLIFY_TOKEN',
  'ADMIN_PASSWORD',
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
  'CHATBOT_BASE_URL',
  'META_PAGE_ACCESS_TOKEN',
  'META_APP_SECRET',
];

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
    provider: process.env.LLM_PROVIDER || 'claude',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
  },
  // Netlify
  netlify: {
    token: process.env.NETLIFY_TOKEN || '',
  },
  // Admin
  admin: {
    password: process.env.ADMIN_PASSWORD || '',
  },
  // Sales bot
  calendlyUrl: process.env.CALENDLY_URL || 'https://calendly.com/bytes-platform',
  portfolio: {
    website1: process.env.PORTFOLIO_WEBSITE_1 || 'https://quantiva-hq.vercel.app/',
    website2: process.env.PORTFOLIO_WEBSITE_2 || 'https://bytesplatform.info',
    ecommerce: process.env.PORTFOLIO_ECOMMERCE || 'https://bytescart.ai',
  },
  // Stripe
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
  },
  chatbot: {
    baseUrl: process.env.CHATBOT_BASE_URL || 'https://bytesplatform.com',
  },
  // Messenger & Instagram (shared Page Access Token)
  messenger: {
    pageAccessToken: process.env.META_PAGE_ACCESS_TOKEN || '',
    appSecret: process.env.META_APP_SECRET || '',
    verifyToken: process.env.WEBHOOK_VERIFY_TOKEN, // reuse the same verify token
  },
  agentPhone: process.env.AGENT_PHONE_NUMBER || '',
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = { env, validateEnv };
