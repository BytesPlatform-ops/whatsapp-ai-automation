-- Conversation message ordering was relying on created_at alone, which has
-- millisecond precision in practice and can tie for messages inserted in
-- rapid succession (e.g. a reply + menu prompt fired back-to-back). The UUID
-- primary key is random so it can't be used as a tiebreaker. Add a
-- monotonically-increasing bigserial that the admin UI can sort by to get
-- deterministic insertion order.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS seq BIGSERIAL;

-- Backfill is automatic for new rows via DEFAULT; existing rows get sequence
-- numbers assigned by Postgres in whatever physical order they were stored.
-- Rough approximation of true order is fine since historical rows already
-- look mis-ordered — the fix is forward-looking.
CREATE INDEX IF NOT EXISTS idx_conversations_seq ON conversations(user_id, seq);
