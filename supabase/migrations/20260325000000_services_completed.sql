-- Track which parking services have been completed
ALTER TABLE parking_reservations
ADD COLUMN services_completed text[] DEFAULT '{}';
