-- Add category-scoping columns for shop supplies and hazmat fees
-- NULL = applies to all categories (backward compatible)
ALTER TABLE shop_settings
  ADD COLUMN shop_supplies_categories jsonb DEFAULT NULL,
  ADD COLUMN hazmat_categories jsonb DEFAULT NULL;
