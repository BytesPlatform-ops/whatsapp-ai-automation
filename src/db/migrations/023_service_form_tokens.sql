-- Service form tokens — one row per CRM-style services-form link the bot
-- hands a user (salon services or real-estate listings). Token is opaque
-- 48-char hex, looked up at GET /services-form/:token to render the form
-- and at POST to validate before persisting and advancing the state machine.

CREATE TABLE IF NOT EXISTS service_form_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  industry VARCHAR(32) NOT NULL,             -- 'salon' | 'real_estate'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_service_form_tokens_user
  ON service_form_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_form_tokens_active
  ON service_form_tokens(token) WHERE submitted_at IS NULL;
