import { createAdminClient } from "@/lib/supabase/admin";
import { formatPhoneForStorage } from "@/lib/validators/customer";

// Shared customer find-or-create for public form submissions. The file name is
// historical (it began parking-only); it now also serves estimate requests, which
// pass customer_type 'retail'. Booking has a near-identical sibling at
// src/lib/appointments/find-or-create-customer.ts; the two are slated to merge
// into one helper in V1.5.

type CustomerType = "parking" | "retail";

interface FindOrCreateCustomerInput {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

/**
 * Find an existing customer or create a new one. Dedup: email first
 * (case-insensitive), then phone (E.164 normalized). An existing match is returned
 * as-is — `customerType` only stamps a NEWLY created row, so a caller never
 * reclassifies someone else's existing customer. Returns the customer ID, or null
 * on failure (the submission still saves without the link).
 */
export async function findOrCreateCustomer(
  input: FindOrCreateCustomerInput,
  customerType: CustomerType
): Promise<string | null> {
  try {
    const supabase = createAdminClient();

    // 1. Try matching by email (case-insensitive). Skip when no email — an empty
    //    string `ilike ''` spuriously matches any customer stored with an empty
    //    email, mis-linking the submission to an unrelated person. (The form often
    //    has no email; this guard mirrors findOrCreateBookingCustomer.)
    if (input.email && input.email.trim().length > 0) {
      const { data: emailMatch } = await supabase
        .from("customers")
        .select("id")
        .ilike("email", input.email)
        .limit(1)
        .single();

      if (emailMatch) return emailMatch.id;
    }

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

    // 3. No match — create a new customer of the requested type
    const { data: newCustomer, error } = await supabase
      .from("customers")
      .insert({
        first_name: input.first_name,
        last_name: input.last_name,
        email: input.email,
        phone: normalizedPhone,
        customer_type: customerType,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to create customer:", error);
      return null;
    }

    return newCustomer.id;
  } catch (err) {
    console.error("findOrCreateCustomer error:", err);
    return null;
  }
}
