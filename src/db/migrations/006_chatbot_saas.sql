-- Chatbot SaaS tables

-- Clients table - one record per paying chatbot client
CREATE TABLE IF NOT EXISTS chatbot_clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id VARCHAR(100) UNIQUE NOT NULL,  -- slug e.g. "dr-ahmed-dental"
  business_name VARCHAR(255) NOT NULL,
  industry VARCHAR(100),
  owner_name VARCHAR(255),
  owner_phone VARCHAR(20),  -- WhatsApp number
  owner_email VARCHAR(255),
  website_url TEXT,

  -- Chatbot data (what the AI uses to answer questions)
  chatbot_data JSONB DEFAULT '{}',
  -- Structure:
  -- {
  --   description: string,
  --   services: [{ name, description, price }],
  --   faqs: [{ question, answer }],
  --   hours: string,
  --   location: string,
  --   phone: string,
  --   booking_link: string,
  --   custom_instructions: string
  -- }

  -- Configuration
  tier VARCHAR(20) DEFAULT 'starter' CHECK (tier IN ('starter', 'growth', 'premium')),
  status VARCHAR(20) DEFAULT 'demo' CHECK (status IN ('demo', 'trial', 'active', 'paused', 'cancelled')),
  trial_ends_at TIMESTAMPTZ,
  widget_color VARCHAR(7) DEFAULT '#1A73E8',
  welcome_message TEXT DEFAULT 'Hi! How can I help you today?',

  -- Branding
  logo_url TEXT,
  chatbot_name VARCHAR(255),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  activated_at TIMESTAMPTZ
);

-- Chatbot conversations table - one record per conversation session
CREATE TABLE IF NOT EXISTS chatbot_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id VARCHAR(100) REFERENCES chatbot_clients(client_id) ON DELETE CASCADE,
  session_id VARCHAR(100) NOT NULL,
  source VARCHAR(20) DEFAULT 'widget' CHECK (source IN ('widget', 'standalone', 'demo')),

  -- Messages stored as JSONB array
  messages JSONB DEFAULT '[]',
  -- Structure: [{ role, content, timestamp }]

  -- Lead capture
  visitor_name VARCHAR(255),
  visitor_email VARCHAR(255),
  visitor_phone VARCHAR(20),

  -- Metadata
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  ip_address VARCHAR(45),
  user_agent TEXT
);

-- Chatbot analytics table - daily aggregated stats per client
CREATE TABLE IF NOT EXISTS chatbot_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id VARCHAR(100) REFERENCES chatbot_clients(client_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_conversations INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  leads_captured INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,

  -- Unique constraint: one row per client per day
  UNIQUE(client_id, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chatbot_clients_status ON chatbot_clients(status);
CREATE INDEX IF NOT EXISTS idx_chatbot_clients_tier ON chatbot_clients(tier);
CREATE INDEX IF NOT EXISTS idx_chatbot_clients_owner_phone ON chatbot_clients(owner_phone);
CREATE INDEX IF NOT EXISTS idx_chatbot_convos_client ON chatbot_conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_convos_session ON chatbot_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_convos_last_msg ON chatbot_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chatbot_analytics_client_date ON chatbot_analytics(client_id, date DESC);

-- Auto-update updated_at for chatbot_clients
CREATE OR REPLACE FUNCTION update_chatbot_clients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chatbot_clients_updated_at ON chatbot_clients;
CREATE TRIGGER chatbot_clients_updated_at
  BEFORE UPDATE ON chatbot_clients
  FOR EACH ROW EXECUTE FUNCTION update_chatbot_clients_updated_at();
