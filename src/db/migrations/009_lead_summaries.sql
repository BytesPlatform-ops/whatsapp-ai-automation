-- Lead summaries table — captures a snapshot when a lead closes or opts out
CREATE TABLE IF NOT EXISTS lead_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  phone_number VARCHAR(50) NOT NULL,
  channel VARCHAR(20) DEFAULT 'whatsapp',
  name VARCHAR(255),
  business_name VARCHAR(255),
  industry VARCHAR(255),
  services_discussed TEXT,
  budget_range VARCHAR(100),
  lead_temperature VARCHAR(20),
  ad_source VARCHAR(50),
  outcome VARCHAR(50) NOT NULL, -- 'paid', 'meeting_booked', 'opted_out', 'declined'
  outcome_details TEXT,
  conversation_summary TEXT,
  total_messages INTEGER DEFAULT 0,
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_summaries_user ON lead_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_summaries_outcome ON lead_summaries(outcome);
