import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPhoneForStorage } from "@/lib/validators/customer";

// Shared customer find-or-create for public form submissions. The file name is
// historical (it began parking-only); it now also serves estimate requests, which
// pass customer_type 'retail'. Booking has an older sibling at
// src/lib/appointments/find-or-create-customer.ts (email first, no name check);
// the two are slated to merge into one helper in V1.5.

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
 * Dedup: phone first (E.164 normalized), then email (case-insensitive) — but an
 * email hit only counts when the customer's name also matches. Two people can
 * share one inbox and book two cars; linking the second booking to the first
 * person's record texts the invoice to the other person's phone and raises the
 * Stripe invoice under their name (Oct 2026, two parking customers on one
 * email). A duplicate customer row is the cheaper failure — it can be deleted
 * and the reservation relinked by hand — so a name mismatch creates.
 *
 * An existing match is returned as-is — the type arg is not applied to an
 * existing row. Returns null when a lookup or the insert fails (the submission
 * still saves without the link). A failed lookup must not fall through to the
 * insert: a transient DB error would otherwise spawn a duplicate that shares
 * the original's phone, and phone-first matching would then pick between the
 * two at random on every later booking.
 */
export async function findOrCreateCustomer(
  input: FindOrCreateCustomerInput,
  customerType: CustomerType
): Promise<string | null> {
  // Outside the try so a missing service-role key surfaces as a thrown
  // deployment error rather than as a quiet "no customer link".
  const supabase = createAdminClient();

  try {
    const normalizedPhone = formatPhoneForStorage(input.phone);
    if (normalizedPhone) {
      const { data: phoneMatch, error: phoneErr } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", normalizedPhone)
        .limit(1)
        .maybeSingle();

      if (phoneErr) {
        console.error("[findOrCreateCustomer] phone lookup failed:", phoneErr.message);
        Sentry.captureException(phoneErr, {
          tags: { source: "find-or-create-customer", path: "phone-lookup" },
          extra: { phone: normalizedPhone },
        });
        return null;
      }

      if (phoneMatch) return phoneMatch.id;
    }

    // Skip when no email — an empty string `ilike ''` matches every customer
    // stored with email '' (the estimate-request form and the Wix webhook can
    // pass an empty email), mis-linking the submission to an unrelated person.
    // No .limit(1): once two people share an email there are two rows, and the
    // right one may not sort first.
    if (input.email && input.email.trim().length > 0) {
      const { data: emailMatches, error: emailErr } = await supabase
        .from("customers")
        .select("id, first_name, last_name")
        .ilike("email", input.email);

      if (emailErr) {
        console.error("[findOrCreateCustomer] email lookup failed:", emailErr.message);
        Sentry.captureException(emailErr, {
          tags: { source: "find-or-create-customer", path: "email-lookup" },
          extra: { email: input.email },
        });
        return null;
      }

      const emailMatch = emailMatches.find((c) => sameName(c, input));
      if (emailMatch) return emailMatch.id;

      if (emailMatches.length > 0) {
        console.warn(
          `[findOrCreateCustomer] email ${input.email} already belongs to customer(s) ${emailMatches
            .map((c) => c.id)
            .join(", ")} with a different name; creating a new row for ${input.first_name} ${input.last_name}`
        );
      }
    }

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
