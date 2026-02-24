-- Add status column to messages table for delivery tracking
ALTER TABLE messages ADD COLUMN status text DEFAULT 'sent';
