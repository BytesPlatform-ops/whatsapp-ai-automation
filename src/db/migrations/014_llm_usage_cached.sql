-- Add prompt-caching visibility to llm_usage. Cached reads are billed at a
-- fraction of the base input rate (50% on OpenAI, ~10% on Anthropic), and
-- Anthropic also bills a write premium when it first stores a prompt in the
-- cache. We split them into dedicated columns so the admin view can show
-- cache hit-rate alongside raw tokens.
ALTER TABLE llm_usage
  ADD COLUMN IF NOT EXISTS cached_input_tokens INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_write_tokens INTEGER DEFAULT 0;
