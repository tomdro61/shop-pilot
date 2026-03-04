-- Add index on first_name for parking reservation search performance
CREATE INDEX IF NOT EXISTS idx_parking_first_name ON parking_reservations (first_name);

-- Also add phone index (searched but not indexed)
CREATE INDEX IF NOT EXISTS idx_parking_phone ON parking_reservations (phone);
