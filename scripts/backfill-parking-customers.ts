/**
 * One-time backfill script: link existing parking reservations to customer records.
 *
 * Usage:
 *   npx tsx scripts/backfill-parking-customers.ts --dry-run
 *   npx tsx scripts/backfill-parking-customers.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/supabase";

const DRY_RUN = process.argv.includes("--dry-run");

function formatPhone(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+")) return phone;
  return phone || null;
}

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get all parking reservations without a customer_id
  const { data: reservations, error } = await supabase
    .from("parking_reservations")
    .select("id, first_name, last_name, email, phone")
    .is("customer_id", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch reservations:", error.message);
    process.exit(1);
  }

  console.log(`Found ${reservations.length} unlinked parking reservations`);
  if (DRY_RUN) console.log("(DRY RUN — no changes will be made)\n");

  let linked = 0;
  let created = 0;
  let failed = 0;

  for (const res of reservations) {
    // 1. Try match by email
    const { data: emailMatch } = await supabase
      .from("customers")
      .select("id")
      .ilike("email", res.email)
      .limit(1)
      .single();

    if (emailMatch) {
      console.log(`  [LINK] ${res.first_name} ${res.last_name} (${res.email}) → existing customer ${emailMatch.id}`);
      if (!DRY_RUN) {
        await supabase
          .from("parking_reservations")
          .update({ customer_id: emailMatch.id })
          .eq("id", res.id);
      }
      linked++;
      continue;
    }

    // 2. Try match by phone
    const normalizedPhone = formatPhone(res.phone);
    if (normalizedPhone) {
      const { data: phoneMatch } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", normalizedPhone)
        .limit(1)
        .single();

      if (phoneMatch) {
        console.log(`  [LINK] ${res.first_name} ${res.last_name} (${normalizedPhone}) → existing customer ${phoneMatch.id}`);
        if (!DRY_RUN) {
          await supabase
            .from("parking_reservations")
            .update({ customer_id: phoneMatch.id })
            .eq("id", res.id);
        }
        linked++;
        continue;
      }
    }

    // 3. Create new customer
    console.log(`  [CREATE] ${res.first_name} ${res.last_name} (${res.email})`);
    if (!DRY_RUN) {
      const { data: newCustomer, error: createErr } = await supabase
        .from("customers")
        .insert({
          first_name: res.first_name,
          last_name: res.last_name,
          email: res.email,
          phone: normalizedPhone,
          customer_type: "parking" as const,
        })
        .select("id")
        .single();

      if (createErr) {
        console.error(`    FAILED: ${createErr.message}`);
        failed++;
        continue;
      }

      await supabase
        .from("parking_reservations")
        .update({ customer_id: newCustomer.id })
        .eq("id", res.id);
    }
    created++;
  }

  console.log(`\nDone${DRY_RUN ? " (dry run)" : ""}:`);
  console.log(`  Linked to existing: ${linked}`);
  console.log(`  New customers created: ${created}`);
  if (failed) console.log(`  Failed: ${failed}`);
}

main().catch(console.error);
