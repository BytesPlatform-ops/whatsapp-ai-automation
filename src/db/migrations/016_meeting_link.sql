-- Meeting join URL + invitee email
-- Persists the video-conference join link (Google Meet / Zoom / etc.) and
-- the invitee's email from Calendly's webhook so the admin dashboard can
-- both launch the meeting and re-send the link to the lead on demand.
-- Run this in Supabase SQL editor after 015_conversations_seq.sql.

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS join_url TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS invitee_email VARCHAR(255);
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS reschedule_url TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS cancel_url TEXT;
