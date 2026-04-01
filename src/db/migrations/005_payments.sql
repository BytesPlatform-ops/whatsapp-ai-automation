-- Payments table for tracking Stripe payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  phone_number VARCHAR(20),
  stripe_payment_link_id VARCHAR(255),
  stripe_payment_link_url TEXT,
  stripe_session_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  amount INTEGER NOT NULL,           -- Amount in cents
  currency VARCHAR(10) DEFAULT 'usd',
  status VARCHAR(50) DEFAULT 'pending',  -- pending, paid, expired, cancelled
  service_type VARCHAR(100),          -- website, seo, smm, ecommerce, app, custom
  package_tier VARCHAR(50),           -- floor, starter, mid, pro, premium
  description TEXT,
  customer_email VARCHAR(255),
  customer_name VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_session ON payments(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_payments_updated_at();
