-- Add media storage columns to conversations table
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS media_data TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS media_mime TEXT;
