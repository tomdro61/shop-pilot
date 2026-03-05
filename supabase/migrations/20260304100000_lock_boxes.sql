-- Lock boxes table for parking key lockboxes
CREATE TABLE lock_boxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_number int NOT NULL UNIQUE,
  code text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add lock_box_number to parking reservations
ALTER TABLE parking_reservations ADD COLUMN lock_box_number int;

-- Seed lock boxes (placeholder codes — user will provide real values)
INSERT INTO lock_boxes (box_number, code) VALUES
  (1, '235'),
  (2, '195'),
  (3, '145'),
  (4, '654'),
  (5, '295'),
  (6, '958'),
  (7, '305'),
  (8, '515');
