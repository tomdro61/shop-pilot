/**
 * Schema-parity check between job_line_items and estimate_line_items.
 *
 * The two tables are intentionally separate (estimate snapshot / job
 * mutation — see Session 38 PROGRESS notes for the design rationale),
 * but the columns that DO exist on both must have identical types.
 *
 * The May 2026 cost-on-jobs-but-not-estimates drift was the kind of bug
 * this catches: someone adds a column to one table and forgets the
 * other. Without this test, the only signal is a manager noticing the
 * field is missing from the form (which is how the cost gap was caught).
 *
 * Adding a NEW column that should be shared:
 *   1. Migration on both tables
 *   2. Add the field name to SHARED_COLUMNS below
 *   3. Update both Row types in supabase.ts (or regenerate)
 *
 * If a column should NOT be shared (e.g., job-only `mileage_in`, or an
 * estimate-only `approval_token`), don't add it to SHARED_COLUMNS — the
 * test won't complain.
 */
import { describe, it, expectTypeOf } from "vitest";
import type { JobLineItem, EstimateLineItem } from "@/types";

// The columns that must stay in lockstep between the two tables. Each
// listed key is asserted to have an identical TypeScript type on both
// Row definitions.
type SharedColumns =
  | "type"
  | "description"
  | "quantity"
  | "unit_cost"
  | "cost"
  | "part_number"
  | "category"
  // `total` is `GENERATED ALWAYS AS (quantity * unit_cost) STORED` on both
  // tables — read-only in Postgres, never written via Insert/Update. If a
  // future migration replaces it with a manually-written column on one
  // side, the parity here would still pass (both stay `number | null`)
  // but the runtime semantics would diverge. Adjust this list if so.
  | "total";

describe("line-item schema parity", () => {
  it("shared columns have identical types on jobs and estimates", () => {
    expectTypeOf<Pick<JobLineItem, SharedColumns>>().toEqualTypeOf<
      Pick<EstimateLineItem, SharedColumns>
    >();
  });
});
