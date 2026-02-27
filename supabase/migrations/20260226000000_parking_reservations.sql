-- Airport Parking Reservations
-- Stores form submissions from external booking forms for three parking lots:
-- "Broadway Motors", "Airport Parking Boston 1", "Airport Parking Boston 2"

-- Status enum
CREATE TYPE parking_status AS ENUM (
  'reserved',
  'checked_in',
  'checked_out',
  'no_show',
  'cancelled'
);

-- Main table
CREATE TABLE parking_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Customer info (from external form)
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,

  -- Trip details
  drop_off_date date NOT NULL,
  drop_off_time time NOT NULL,
  pick_up_date date NOT NULL,
  pick_up_time time NOT NULL,

  -- Vehicle
  make text NOT NULL,
  model text NOT NULL,
  license_plate text NOT NULL,

  -- Booking
  lot text NOT NULL,
  confirmation_number text NOT NULL,
  services_interested text[] DEFAULT '{}',
  liability_acknowledged boolean NOT NULL DEFAULT false,

  -- Operational (staff-managed)
  status parking_status NOT NULL DEFAULT 'reserved',
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  spot_number text,
  staff_notes text,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for dashboard queries
CREATE INDEX idx_parking_drop_off_date ON parking_reservations(drop_off_date);
CREATE INDEX idx_parking_pick_up_date ON parking_reservations(pick_up_date);
CREATE INDEX idx_parking_status ON parking_reservations(status);
CREATE INDEX idx_parking_license_plate ON parking_reservations(license_plate);
CREATE INDEX idx_parking_confirmation ON parking_reservations(confirmation_number);
CREATE INDEX idx_parking_last_name ON parking_reservations(last_name);
CREATE INDEX idx_parking_lot ON parking_reservations(lot);

-- Updated_at trigger (reuses existing function from initial migration)
CREATE TRIGGER set_parking_updated_at
  BEFORE UPDATE ON parking_reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security
ALTER TABLE parking_reservations ENABLE ROW LEVEL SECURITY;

-- Managers: full access
CREATE POLICY "managers_full_parking" ON parking_reservations
  FOR ALL USING (is_manager());

-- Techs: read-only (may need to see spot assignments)
CREATE POLICY "techs_read_parking" ON parking_reservations
  FOR SELECT USING (get_user_role() = 'tech');
