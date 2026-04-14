-- Salon booking system: per-site booking settings + appointments table.

-- Store salon-specific booking config on the site record.
-- booking_mode: 'embed' (use external URL like Fresha/Booksy) or 'native' (our booking system).
-- booking_url: the embedded URL when mode='embed'.
-- booking_settings JSONB holds native-mode data:
--   { timezone, instagramHandle, weeklyHours: {mon:[{open,close}], ...}, slotMinutes,
--     services: [{ name, durationMinutes, priceText }] }
ALTER TABLE generated_sites ADD COLUMN IF NOT EXISTS booking_mode VARCHAR(20);
ALTER TABLE generated_sites ADD COLUMN IF NOT EXISTS booking_url TEXT;
ALTER TABLE generated_sites ADD COLUMN IF NOT EXISTS booking_settings JSONB DEFAULT '{}'::jsonb;

-- Appointments for native booking mode. Scoped by site_id.
CREATE TABLE IF NOT EXISTS appointments (
  id BIGSERIAL PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES generated_sites(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  -- Snapshot duration at booking time so service edits don't change existing appointments.
  duration_minutes INTEGER NOT NULL,
  -- start/end in UTC. Site-level timezone is used for display.
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed', -- confirmed | cancelled | completed
  cancel_token TEXT NOT NULL,
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT appointments_time_valid CHECK (end_at > start_at)
);

-- Prevent two confirmed bookings at the same slot for the same site.
-- Partial unique index so cancelled rows don't block rebooking.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_appointments_site_slot
  ON appointments(site_id, start_at)
  WHERE status = 'confirmed';

-- Primary access pattern: list upcoming bookings for a site.
CREATE INDEX IF NOT EXISTS idx_appointments_site_time
  ON appointments(site_id, start_at)
  WHERE status = 'confirmed';

-- Reminder job scans upcoming confirmed appointments needing a reminder.
CREATE INDEX IF NOT EXISTS idx_appointments_reminder_pending
  ON appointments(start_at)
  WHERE status = 'confirmed' AND reminder_sent_at IS NULL;

-- Cancellation link lookup.
CREATE INDEX IF NOT EXISTS idx_appointments_cancel_token
  ON appointments(cancel_token);

-- Apply updated_at trigger (function already exists from 001_initial.sql).
DROP TRIGGER IF EXISTS appointments_updated_at ON appointments;
CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
