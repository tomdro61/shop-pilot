-- Add phone_line column to messages table to track which business line sent/received
ALTER TABLE messages ADD COLUMN phone_line text;
-- Values: 'shop' or 'parking' (nullable for backward compat with existing records)
