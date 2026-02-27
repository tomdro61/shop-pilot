import { createAdminClient } from "@/lib/supabase/admin";
import { formatPhoneForStorage } from "@/lib/validators/customer";

interface ParkingCustomerInput {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

/**
 * Find an existing customer or create a new one for a parking reservation.
 * Dedup strategy: match by email first (case-insensitive), then by phone (E.164 normalized).
 * Returns the customer ID, or null on failure (reservation still saves without link).
 */
export async function findOrCreateParkingCustomer(
  input: ParkingCustomerInput
): Promise<string | null> {
  try {
    const supabase = createAdminClient();

    // 1. Try matching by email (case-insensitive)
    const { data: emailMatch } = await supabase
      .from("customers")
      .select("id")
      .ilike("email", input.email)
      .limit(1)
      .single();

    if (emailMatch) return emailMatch.id;

    // 2. Try matching by phone (E.164 normalized)
    const normalizedPhone = formatPhoneForStorage(input.phone);
    if (normalizedPhone) {
      const { data: phoneMatch } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", normalizedPhone)
        .limit(1)
        .single();

      if (phoneMatch) return phoneMatch.id;
    }

    // 3. No match — create a new customer with type "parking"
    const { data: newCustomer, error } = await supabase
      .from("customers")
      .insert({
        first_name: input.first_name,
        last_name: input.last_name,
        email: input.email,
        phone: normalizedPhone,
        customer_type: "parking" as const,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to create parking customer:", error);
      return null;
    }

    return newCustomer.id;
  } catch (err) {
    console.error("findOrCreateParkingCustomer error:", err);
    return null;
  }
}
