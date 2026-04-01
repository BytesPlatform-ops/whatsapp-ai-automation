-- Add chat_summary column to meetings table for salesperson briefing
-- Run this in Supabase SQL editor after 003_meetings.sql

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS chat_summary TEXT;
