-- Per-call LLM usage tracking so we can surface cost per conversation in the
-- admin dashboard. Each row is one call to Claude/OpenAI (or any future
-- provider). Cost is computed at insert-time using current provider rates so
-- historical data stays correct even if prices change later.
CREATE TABLE IF NOT EXISTS llm_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  operation VARCHAR(80) NOT NULL,        -- e.g. 'webdev_extract', 'website_content', 'sales_chat'
  provider VARCHAR(20) NOT NULL,         -- 'claude' | 'openai' | 'gemini'
  model VARCHAR(80) NOT NULL,            -- e.g. 'claude-sonnet-4-20250514', 'gpt-4o-mini'
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd NUMERIC(12, 6) DEFAULT 0,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_user ON llm_usage(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_llm_usage_operation ON llm_usage(operation);
