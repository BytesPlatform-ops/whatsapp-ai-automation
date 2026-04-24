-- User feedback — explicit ratings from post-delivery prompts AND implicit
-- friction signals inferred from conversation behavior (frustrated phrasing,
-- correction loops, rapid resets, help-escape requests).
--
-- Separate from `conversations` so the admin conversation view stays clean
-- and the feedback page can filter/aggregate without row-level scanning
-- through every chat message ever sent.
--
-- `source = 'explicit'`  — user tapped one of the post-delivery buttons
--                          (rating populated: 'loved' / 'good' / 'issues').
-- `source = 'implicit'`  — we detected friction from their behavior
--                          (rating typically 'issues' or null; trigger_type
--                          names the specific signal).
--
-- Tester phones (env TESTER_PHONES) are excluded from writes here at the
-- application layer so the table only holds real-user signal.

CREATE TABLE IF NOT EXISTS feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  phone_number TEXT,                            -- denormalized for fast admin lookup
  channel VARCHAR(32) DEFAULT 'whatsapp',       -- whatsapp | messenger | instagram
  flow VARCHAR(32),                             -- website | logo | ad | chatbot | seo | general
  source VARCHAR(16) NOT NULL,                  -- explicit | implicit
  trigger_type VARCHAR(32) NOT NULL,            -- delivery-prompt | frustrated-phrasing | correction-loop | rapid-reset | help-escape | admin-requested
  rating VARCHAR(16),                           -- loved | good | issues | null (no response yet)
  comment TEXT,                                 -- free-text from the "what happened?" follow-up OR the user message that triggered an implicit signal
  excerpt JSONB DEFAULT '[]',                   -- recent conversation excerpt for context (array of {role, text, at})
  state TEXT,                                   -- the user's bot state when the row was created
  tags TEXT[] DEFAULT '{}',                     -- admin-added topical tags
  resolved BOOLEAN DEFAULT FALSE,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,                             -- admin email or label
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_source ON feedback(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_trigger ON feedback(trigger_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_resolved ON feedback(resolved, created_at DESC) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_feedback_flow ON feedback(flow, created_at DESC);
