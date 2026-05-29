// Find-or-create the customer record behind an online appointment booking.
//
// Mirrors findOrCreateParkingCustomer (src/lib/parking-customer.ts) BUT stamps
// `customer_type: 'retail'` instead of `'parking'`. The two helpers will
// consolidate into a single shared `findOrCreateCustomer(input, type)` in V1.5
// (per BOOKING_TECHNICAL_PLAN.md §13 #4); for V1 they live as siblings to
// avoid bundling a wider refactor with the booking work.
//
// Dedup strategy: email first (case-insensitive), then phone (E.164 normalized).
// Per BOOKING_TECHNICAL_PLAN.md §5.1 step 1.

import { createAdminClient } from "@/lib/supabase/admin";
import { formatPhoneForStorage } from "@/lib/validators/customer";

export type BookingCustomerInput = {
  first_name: string;
  last_name: string;
  email: string | null; // null when the form didn't collect one
  phone: string;
};

/**
 * Returns the customer ID (existing or newly created), or null on unrecoverable
 * failure. The route handler treats null as "appointment saves but with no
 * customer link" — the dashboard surfaces an alert so the manager can link
 * manually.
 *
 * createAdminClient() is called BEFORE the try block intentionally — a missing
 * service-role key is a deployment error, not a "no customer link" case, and
 * should surface as 500 instead of silently dropping every customer link.
 */
export async function findOrCreateBookingCustomer(
  input: BookingCustomerInput
): Promise<string | null> {
  const supabase = createAdminClient();

  try {
    // 1. Email match (case-insensitive). Skip when no email — empty-string ilike
    //    matches no rows but still wastes a roundtrip.
    if (input.email && input.email.trim().length > 0) {
      const { data: emailMatch, error: emailErr } = await supabase
        .from("customers")
        .select("id")
        .ilike("email", input.email)
        .limit(1)
        .maybeSingle();

      if (emailErr) {
        // Lookup failed — do NOT fall through to insert. A transient DB error
        // here would otherwise spawn a duplicate customer on every retry.
        console.error(
          "[findOrCreateBookingCustomer] email lookup failed:",
          emailErr.message
        );
        return null;
      }

      if (emailMatch) return emailMatch.id;
    }

    // 2. Phone match (E.164 normalized).
    const normalizedPhone = formatPhoneForStorage(input.phone);
    if (normalizedPhone) {
      const { data: phoneMatch, error: phoneErr } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", normalizedPhone)
        .limit(1)
        .maybeSingle();

      if (phoneErr) {
        console.error(
          "[findOrCreateBookingCustomer] phone lookup failed:",
          phoneErr.message
        );
        return null;
      }

      if (phoneMatch) return phoneMatch.id;
    }

    // 3. No match — create new. customer_type MUST be 'retail' (NOT 'parking').
    const { data: newCustomer, error } = await supabase
      .from("customers")
      .insert({
        first_name: input.first_name,
        last_name: input.last_name,
        email: input.email ?? "",
        phone: normalizedPhone,
        customer_type: "retail" as const,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[findOrCreateBookingCustomer] insert failed:", error.message);
      return null;
    }

    return newCustomer.id;
  } catch (err) {
    console.error("[findOrCreateBookingCustomer] unexpected error:", err);
    return null;
  }
}
