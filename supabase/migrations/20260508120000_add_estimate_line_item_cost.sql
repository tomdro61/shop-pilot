-- Mirror of migration 20250226000000_add_part_cost.sql which added `cost`
-- to job_line_items but missed estimate_line_items. The two tables are
-- intentionally separate (estimate snapshot / job mutation) but the shared
-- columns must stay in lockstep — a vitest expectTypeOf parity check now
-- fails CI on future drift.
ALTER TABLE estimate_line_items ADD COLUMN cost numeric(10, 2) DEFAULT NULL;
