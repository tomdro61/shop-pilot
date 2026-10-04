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

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function sameName(
  candidate: { first_name: string; last_name: string },
  input: FindOrCreateCustomerInput
): boolean {
  return (
    normalizeName(candidate.first_name) === normalizeName(input.first_name) &&
    normalizeName(candidate.last_name) === normalizeName(input.last_name)
  );
}

/**
 * Find an existing customer or create a new one. Dedup: phone first (E.164
 * normalized), then email (case-insensitive) — but an email hit only counts when
 * the customer's name also matches. A household often shares one inbox across
 * two people booking two cars; linking the second booking to the first person's
 * record routes their invoice SMS and Stripe invoice to the wrong phone and name
 * (Oct 2026, two parking customers on one email). A duplicate customer row is
 * the cheaper failure — the manager can merge it — so a name mismatch creates.
 *
 * An existing match is returned as-is — `customerType` only stamps a NEWLY
 * created row, so a caller never reclassifies someone else's existing customer.
 * Returns the customer ID, or null on failure (the submission still saves
 * without the link).
 */
export async function findOrCreateCustomer(
  input: FindOrCreateCustomerInput,
  customerType: CustomerType
): Promise<string | null> {
  try {
    const supabase = createAdminClient();

    // 1. Try matching by phone (E.164 normalized)
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

    // 2. Try matching by email (case-insensitive), accepting only a same-name
    //    row. Skip when no email — an empty string `ilike ''` spuriously matches
    //    any customer stored with an empty email, mis-linking the submission to
    //    an unrelated person. (The form often has no email; this guard mirrors
    //    findOrCreateBookingCustomer.) No .limit(1): once two people share an
    //    email there are two rows, and the right one may not sort first.
    if (input.email && input.email.trim().length > 0) {
      const { data: emailMatches } = await supabase
        .from("customers")
        .select("id, first_name, last_name")
        .ilike("email", input.email);

      const emailMatch = emailMatches?.find((c) => sameName(c, input));
      if (emailMatch) return emailMatch.id;
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
