-- Track when parking specials SMS was sent to a reservation
ALTER TABLE parking_reservations
ADD COLUMN specials_sent_at timestamptz;
