-- WhatsApp Flow sessions — one row per Flow the bot sends a user.
-- Keyed by flow_token (unique per user per send). The dynamic endpoint
-- persists answers across screens here: Screen 1 writes business_name /
-- email / industry + the classified theme + resolved language; Screen 2
-- appends the theme-specific answers; the final nfm_reply webhook reads
-- the whole row to trigger the Pixie build. Also stores ctwa_clid so the
-- CAPI LeadSubmitted event fired after the build keeps ad attribution.
--
-- Short-lived (a flow completes in minutes) but persisted so a server
-- restart mid-flow doesn't lose collected answers.

CREATE TABLE IF NOT EXISTS flow_sessions (
  flow_token       TEXT PRIMARY KEY,
  wa_id            TEXT,                 -- user's WhatsApp number (digits)
  phone_number_id  TEXT,                 -- which of our numbers they messaged
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  lang             VARCHAR(8) DEFAULT 'en',
  theme            VARCHAR(16),          -- salon|hvac|realestate|portfolio|general
  ctwa_clid        TEXT,
  answers          JSONB DEFAULT '{}'::jsonb,   -- accumulated screen answers
  status           VARCHAR(16) DEFAULT 'open',  -- open | submitted | expired
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  submitted_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_flow_sessions_wa
  ON flow_sessions(wa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flow_sessions_open
  ON flow_sessions(flow_token) WHERE status = 'open';
