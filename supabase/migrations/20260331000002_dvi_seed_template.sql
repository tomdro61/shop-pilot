-- ============================================================
-- DVI — Seed Default "Multi-Point Inspection" Template
-- ============================================================

-- Insert the default template
INSERT INTO dvi_templates (id, name, is_default)
VALUES ('00000000-0000-0000-0000-000000000001', 'Multi-Point Inspection', true);

-- ── Under Hood (sort_order 1) ──
INSERT INTO dvi_template_categories (id, template_id, name, sort_order)
VALUES ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Under Hood', 1);

INSERT INTO dvi_template_items (category_id, name, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Battery & Connections', 1),
  ('10000000-0000-0000-0000-000000000001', 'Air Filter', 2),
  ('10000000-0000-0000-0000-000000000001', 'Serpentine Belt', 3),
  ('10000000-0000-0000-0000-000000000001', 'Hoses & Clamps', 4),
  ('10000000-0000-0000-0000-000000000001', 'Oil Level & Condition', 5),
  ('10000000-0000-0000-0000-000000000001', 'Coolant Level', 6),
  ('10000000-0000-0000-0000-000000000001', 'Brake Fluid Level', 7),
  ('10000000-0000-0000-0000-000000000001', 'Power Steering Fluid', 8),
  ('10000000-0000-0000-0000-000000000001', 'Transmission Fluid', 9),
  ('10000000-0000-0000-0000-000000000001', 'Washer Fluid', 10);

-- ── Under Vehicle (sort_order 2) ──
INSERT INTO dvi_template_categories (id, template_id, name, sort_order)
VALUES ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Under Vehicle', 2);

INSERT INTO dvi_template_items (category_id, name, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000002', 'Exhaust System', 1),
  ('10000000-0000-0000-0000-000000000002', 'Shocks & Struts', 2),
  ('10000000-0000-0000-0000-000000000002', 'CV Joints & Boots', 3),
  ('10000000-0000-0000-0000-000000000002', 'Brake Lines & Hoses', 4),
  ('10000000-0000-0000-0000-000000000002', 'Fuel Lines', 5),
  ('10000000-0000-0000-0000-000000000002', 'Frame & Subframe', 6);

-- ── Brakes (sort_order 3) ──
INSERT INTO dvi_template_categories (id, template_id, name, sort_order)
VALUES ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Brakes', 3);

INSERT INTO dvi_template_items (category_id, name, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000003', 'Front Brake Pads', 1),
  ('10000000-0000-0000-0000-000000000003', 'Rear Brake Pads', 2),
  ('10000000-0000-0000-0000-000000000003', 'Front Rotors', 3),
  ('10000000-0000-0000-0000-000000000003', 'Rear Rotors', 4),
  ('10000000-0000-0000-0000-000000000003', 'Brake Hardware', 5),
  ('10000000-0000-0000-0000-000000000003', 'Parking Brake', 6);

-- ── Tires & Wheels (sort_order 4) ──
INSERT INTO dvi_template_categories (id, template_id, name, sort_order)
VALUES ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Tires & Wheels', 4);

INSERT INTO dvi_template_items (category_id, name, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000004', 'Left Front Tire', 1),
  ('10000000-0000-0000-0000-000000000004', 'Right Front Tire', 2),
  ('10000000-0000-0000-0000-000000000004', 'Left Rear Tire', 3),
  ('10000000-0000-0000-0000-000000000004', 'Right Rear Tire', 4),
  ('10000000-0000-0000-0000-000000000004', 'Tire Tread Depth', 5),
  ('10000000-0000-0000-0000-000000000004', 'Wheel Condition', 6),
  ('10000000-0000-0000-0000-000000000004', 'TPMS', 7);

-- ── Exterior (sort_order 5) ──
INSERT INTO dvi_template_categories (id, template_id, name, sort_order)
VALUES ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Exterior', 5);

INSERT INTO dvi_template_items (category_id, name, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000005', 'Headlights', 1),
  ('10000000-0000-0000-0000-000000000005', 'Taillights', 2),
  ('10000000-0000-0000-0000-000000000005', 'Brake Lights', 3),
  ('10000000-0000-0000-0000-000000000005', 'Turn Signals', 4),
  ('10000000-0000-0000-0000-000000000005', 'Wipers & Washers', 5),
  ('10000000-0000-0000-0000-000000000005', 'Windshield', 6),
  ('10000000-0000-0000-0000-000000000005', 'Body Condition', 7),
  ('10000000-0000-0000-0000-000000000005', 'Mirrors', 8);

-- ── Interior (sort_order 6) ──
INSERT INTO dvi_template_categories (id, template_id, name, sort_order)
VALUES ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Interior', 6);

INSERT INTO dvi_template_items (category_id, name, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000006', 'Horn', 1),
  ('10000000-0000-0000-0000-000000000006', 'Seat Belts', 2),
  ('10000000-0000-0000-0000-000000000006', 'HVAC System', 3),
  ('10000000-0000-0000-0000-000000000006', 'Gauges & Warning Lights', 4),
  ('10000000-0000-0000-0000-000000000006', 'Steering Play', 5);

-- ── Electrical (sort_order 7) ──
INSERT INTO dvi_template_categories (id, template_id, name, sort_order)
VALUES ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'Electrical', 7);

INSERT INTO dvi_template_items (category_id, name, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000007', 'Battery Test', 1),
  ('10000000-0000-0000-0000-000000000007', 'Alternator Output', 2),
  ('10000000-0000-0000-0000-000000000007', 'Starter Operation', 3);

-- ── Fluids (sort_order 8) ──
INSERT INTO dvi_template_categories (id, template_id, name, sort_order)
VALUES ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'Fluids', 8);

INSERT INTO dvi_template_items (category_id, name, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000008', 'Differential Fluid', 1),
  ('10000000-0000-0000-0000-000000000008', 'Transfer Case Fluid', 2);
