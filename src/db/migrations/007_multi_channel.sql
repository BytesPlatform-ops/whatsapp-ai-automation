-- Add channel support for Messenger & Instagram
-- The phone_number column stores the platform user ID (phone for WhatsApp, PSID for Messenger, IGSID for Instagram)

ALTER TABLE users
ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp'
CHECK (channel IN ('whatsapp', 'messenger', 'instagram'));

-- Composite unique: same platform ID can exist on different channels
-- Drop existing unique constraint on phone_number if it exists, then add composite
DO $$
BEGIN
  -- Try to drop single-column unique constraint (may not exist)
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_number_key;
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_number_unique;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Add composite unique constraint
ALTER TABLE users
ADD CONSTRAINT users_phone_channel_unique UNIQUE (phone_number, channel);

-- Add channel column to meetings table for reminder routing
ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp';

-- Add channel column to payments table for confirmation routing
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp';
