// Find-or-create the vehicle row behind an online appointment booking.
// NEW helper — no equivalent exists in the codebase. Per BOOKING_TECHNICAL_PLAN.md §5.1 step 2.
//
// Matching strategy:
//   1. VIN-first (across all customers — VIN is unique per vehicle). If found:
//      - same customer  → return id, no re-link needed
//      - different owner → return id AND update customer_id to current (vehicle changed hands;
//        the snapshot columns on the appointment preserve the previous owner's history if needed)
//   2. If no VIN match (or no VIN provided): customer + year + make + model (case-insensitive
//      on make/model via ilike) — covers the common case where year/make/model are typed in
//      slightly different casing across bookings.
//   3. Otherwise: insert a new vehicle tied to the customer.
//
// Returns the vehicle id or null on failure (route handler treats null as "appointment
// saves without vehicle link" — same pattern as the customer helper).

import { createAdminClient } from "@/lib/supabase/admin";

export type VehicleInput = {
  customer_id: string;
  // All optional — undefined means "the form didn't collect this field."
  // null is NOT a valid input value; callers should omit the field entirely.
  // (Avoids `?: T | null` ambiguity where both spellings mean the same thing.)
  year?: number;
  make?: string;
  model?: string;
  vin?: string;
  mileage?: number;
};

type ExistingVehicle = {
  id: string;
  customer_id: string;
};

export type VehicleDecision =
  | { kind: "use_existing"; id: string; relinkTo?: string }
  | { kind: "create_new" };

/**
 * Pure decision: given the results of the VIN lookup and the (customer, year, make,
 * model) lookup, decide what to do. Exported for unit testing — the IO layer
 * (findOrCreateVehicle below) does the queries; this function does the branching.
 */
export function decideVehicleAction(
  byVin: ExistingVehicle | null,
  byYmm: { id: string } | null,
  currentCustomerId: string,
): VehicleDecision {
  if (byVin) {
    return byVin.customer_id === currentCustomerId
      ? { kind: "use_existing", id: byVin.id }
      : { kind: "use_existing", id: byVin.id, relinkTo: currentCustomerId };
  }
  if (byYmm) {
    return { kind: "use_existing", id: byYmm.id };
  }
  return { kind: "create_new" };
}

export async function findOrCreateVehicle(input: VehicleInput): Promise<string | null> {
  // createAdminClient outside try: a missing service-role key is a deployment
  // error, not a "no vehicle link" case — should surface as 500.
  const supabase = createAdminClient();

  try {
    // ─── Step 1: VIN lookup (if VIN provided) ───────────────────────────
    // On lookup error we bail out (return null). Falling through to insert
    // would create a duplicate vehicle row from a transient DB error — and
    // because the vehicles table has no UNIQUE constraint on vin, that
    // duplicate would persist permanently with bad history attribution.
    let byVin: ExistingVehicle | null = null;
    if (input.vin) {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, customer_id")
        .eq("vin", input.vin)
        .maybeSingle();
      if (error) {
        console.error("[findOrCreateVehicle] vin lookup failed:", error.message);
        return null;
      }
      byVin = data ?? null;
    }

    // ─── Step 2: customer + year/make/model lookup (only if no VIN match) ─
    let byYmm: { id: string } | null = null;
    if (!byVin && input.year && input.make && input.model) {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id")
        .eq("customer_id", input.customer_id)
        .eq("year", input.year)
        .ilike("make", input.make)
        .ilike("model", input.model)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("[findOrCreateVehicle] year/make/model lookup failed:", error.message);
        return null;
      }
      byYmm = data ?? null;
    }

    // ─── Step 3: decide ──────────────────────────────────────────────────
    const decision = decideVehicleAction(byVin, byYmm, input.customer_id);

    if (decision.kind === "use_existing") {
      if (decision.relinkTo) {
        const { error: relinkErr } = await supabase
          .from("vehicles")
          .update({ customer_id: decision.relinkTo })
          .eq("id", decision.id);
        if (relinkErr) {
          // Re-link is best-effort. The vehicle still works for this booking;
          // log loudly so the inconsistency is visible if the customer disputes it.
          console.error(
            `[findOrCreateVehicle] re-link failed for vehicle ${decision.id}:`,
            relinkErr.message,
          );
        }
      }
      return decision.id;
    }

    // ─── Step 4: insert new ──────────────────────────────────────────────
    const { data: created, error: insertErr } = await supabase
      .from("vehicles")
      .insert({
        customer_id: input.customer_id,
        year: input.year ?? null,
        make: input.make ?? null,
        model: input.model ?? null,
        vin: input.vin ?? null,
        mileage: input.mileage ?? null,
      })
      .select("id")
      .single();
    // ^ The nullish coalescing on optional fields is intentional — schema
    //   columns are nullable; we explicitly write null when the form didn't
    //   collect a value.

    if (insertErr) {
      console.error("[findOrCreateVehicle] insert failed:", insertErr.message);
      return null;
    }

    return created.id;
  } catch (err) {
    console.error("[findOrCreateVehicle] unexpected error:", err);
    return null;
  }
}
