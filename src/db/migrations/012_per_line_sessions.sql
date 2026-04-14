-- Per-line WhatsApp sessions.
--
-- Before: users were unique on (phone_number, channel). A single customer
-- texting two of our WhatsApp numbers on the same WABA shared one user row
-- and therefore one state/history — conversations bled across lines.
--
-- After: users are unique on (phone_number, channel, via_phone_number_id),
-- where via_phone_number_id is which of OUR business numbers the customer
-- texted. Texting number A and number B produces two independent rows with
-- separate state, history, and metadata.
--
-- Legacy rows (pre-migration) have via_phone_number_id = NULL. The app
-- auto-adopts them onto the first new line a user messages, so existing
-- customers don't lose their session.

ALTER TABLE users ADD COLUMN IF NOT EXISTS via_phone_number_id TEXT;

-- Drop the old (phone_number, channel) composite unique so we can replace it.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_channel_unique;

-- COALESCE(..., '') lets NULL legacy rows coexist with identically-phoned rows
-- on specific lines without tripping the unique. Works on any Postgres version,
-- no need for NULLS NOT DISTINCT (PG15+).
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_channel_via_unique
  ON users (phone_number, channel, COALESCE(via_phone_number_id, ''));

-- Fast lookup of all sessions a given customer has across lines (admin/debug).
CREATE INDEX IF NOT EXISTS idx_users_phone_channel
  ON users (phone_number, channel);
