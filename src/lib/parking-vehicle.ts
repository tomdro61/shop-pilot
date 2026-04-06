import { createAdminClient } from "@/lib/supabase/admin";

interface ParkingVehicleInput {
  customerId: string;
  make: string;
  model: string;
  color?: string | null;
  licensePlate?: string | null;
}

/**
 * Find an existing vehicle or create a new one for a parking reservation.
 * Uses upsert with a unique index on (customer_id, lower(make), lower(model))
 * to prevent race-condition duplicates.
 * Returns the vehicle ID, or null on failure.
 */
export async function findOrCreateParkingVehicle(
  input: ParkingVehicleInput
): Promise<string | null> {
  try {
    const supabase = createAdminClient();

    // Try to find existing vehicle first (case-insensitive make + model)
    const { data: existing } = await supabase
      .from("vehicles")
      .select("id")
      .eq("customer_id", input.customerId)
      .ilike("make", input.make)
      .ilike("model", input.model)
      .limit(1)
      .single();

    if (existing) return existing.id;

    // No match — insert (unique index prevents duplicates on race)
    const { data: newVehicle, error } = await supabase
      .from("vehicles")
      .insert({
        customer_id: input.customerId,
        make: input.make,
        model: input.model,
        color: input.color ?? null,
        license_plate: input.licensePlate ?? null,
      })
      .select("id")
      .single();

    if (error) {
      // If unique constraint violation, another request created it — fetch it
      if (error.code === "23505") {
        const { data: raced } = await supabase
          .from("vehicles")
          .select("id")
          .eq("customer_id", input.customerId)
          .ilike("make", input.make)
          .ilike("model", input.model)
          .limit(1)
          .single();
        return raced?.id ?? null;
      }
      console.error("Failed to create parking vehicle:", error);
      return null;
    }

    return newVehicle.id;
  } catch (err) {
    console.error("findOrCreateParkingVehicle error:", err);
    return null;
  }
}
