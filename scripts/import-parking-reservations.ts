/**
 * Import parking reservations from Google Sheet CSV export.
 *
 * Usage:
 *   npx tsx scripts/import-parking-reservations.ts --dry-run path/to/file.csv
 *   npx tsx scripts/import-parking-reservations.ts path/to/file.csv
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import type { Database } from "../src/types/supabase";

const DRY_RUN = process.argv.includes("--dry-run");
const csvPath = process.argv.find((a) => a.endsWith(".csv"));

if (!csvPath) {
  console.error("Usage: npx tsx scripts/import-parking-reservations.ts [--dry-run] <file.csv>");
  process.exit(1);
}

// The lot name for this CSV — change for other lot CSVs or pass --lot "Name"
const LOT = process.argv.find((_, i, a) => a[i - 1] === "--lot") || "Broadway Motors";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Helpers ──────────────────────────────────────────────────────

function formatPhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+")) return phone.replace(/\s/g, "");
  return phone;
}

/** Convert "10:15:00 PM" or "3:00:00 AM" → "22:15" or "03:00" */
function convertTime(raw: string): string {
  if (!raw || !raw.trim()) return "12:00";
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return "12:00";
  let hour = parseInt(match[1], 10);
  const min = match[2];
  const ampm = (match[3] || "").toUpperCase();
  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return `${hour.toString().padStart(2, "0")}:${min}`;
}

/** Generate a random confirmation number */
function genConfirmation(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

const SKIP_WORDS = new Set([
  "checked", "true", "false", "", "0", "1",
]);

const KNOWN_SERVICES: Record<string, string> = {
  "oil change": "oil_change",
  "detailing": "detailing",
  "brakes": "brakes",
  "tire replacement": "tire_replacement",
  "wipers": "wipers",
};

const COLORS = new Set([
  "black", "white", "red", "blue", "green", "silver", "gray", "grey",
  "brown", "gold", "orange", "yellow", "beige", "tan", "maroon", "purple",
]);

/** Check if a value looks like a license plate */
function looksLikePlate(val: string): boolean {
  if (!val || val.length < 2 || val.length > 20) return false;
  const lower = val.toLowerCase().trim();
  if (SKIP_WORDS.has(lower)) return false;
  // Short pure numbers (1-2 digits) are day counts, not plates
  if (/^\d{1,2}$/.test(val.trim())) return false;
  // Known services
  if (KNOWN_SERVICES[lower]) return false;
  // JSON arrays
  if (val.startsWith("[")) return false;
  return true;
}

/** Extract license plate from columns 9, 10, 11 */
function extractPlate(cols: string[]): string {
  // Try col 9 first (newest format), then 10, then 11
  for (const idx of [9, 10, 11]) {
    const val = (cols[idx] || "").trim();
    if (looksLikePlate(val)) return val;
  }
  return "";
}

/** Extract services from columns */
function extractServices(cols: string[]): string[] {
  const services: string[] = [];
  // Check cols 10, 11, 12 for service info
  for (const idx of [10, 11, 12]) {
    const val = (cols[idx] || "").trim();
    // JSON array format: ["Tire Replacement"]
    if (val.startsWith("[")) {
      try {
        const parsed = JSON.parse(val.replace(/""/g, '"'));
        for (const s of parsed) {
          const key = KNOWN_SERVICES[s.toLowerCase()];
          if (key) services.push(key);
        }
      } catch { /* ignore parse errors */ }
      continue;
    }
    // Plain text service names
    const key = KNOWN_SERVICES[val.toLowerCase()];
    if (key) services.push(key);
  }
  return services;
}

/** Split "Make and Model" into { make, model } */
function splitMakeModel(raw: string): { make: string; model: string } {
  let cleaned = raw.trim();
  // Remove parenthetical notes like "(Inspection fence)" or "(Back middle fence)"
  cleaned = cleaned.replace(/\(.*?\)/g, "").trim();
  // Remove leading year like "2017 "
  cleaned = cleaned.replace(/^\d{4}\s+/, "");
  // Remove leading color words
  const words = cleaned.split(/\s+/);
  if (words.length > 1 && COLORS.has(words[0].toLowerCase())) {
    words.shift();
  }
  if (words.length === 0) return { make: raw.trim(), model: "" };
  if (words.length === 1) return { make: words[0], model: "" };
  return { make: words[0], model: words.slice(1).join(" ") };
}

/** Determine reservation status based on dates */
function determineStatus(dropOff: string, pickUp: string): "reserved" | "checked_in" | "checked_out" {
  const today = new Date().toISOString().split("T")[0];
  if (pickUp < today) return "checked_out";
  if (dropOff <= today && pickUp >= today) return "checked_in";
  return "reserved";
}

// ── Find or create customer (same logic as parking-customer.ts) ──

async function findOrCreateCustomer(input: {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}): Promise<string | null> {
  if (!input.email && !input.phone) return null;

  try {
    // Match by email
    if (input.email) {
      const { data } = await supabase
        .from("customers")
        .select("id")
        .ilike("email", input.email)
        .limit(1)
        .single();
      if (data) return data.id;
    }

    // Match by phone
    if (input.phone) {
      const phone = formatPhone(input.phone);
      const { data } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", phone)
        .limit(1)
        .single();
      if (data) return data.id;
    }

    if (DRY_RUN) return "dry-run-id";

    // Create new
    const { data, error } = await supabase
      .from("customers")
      .insert({
        first_name: input.first_name.trim(),
        last_name: input.last_name.trim(),
        email: input.email || null,
        phone: formatPhone(input.phone) || null,
        customer_type: "parking" as const,
      })
      .select("id")
      .single();

    if (error) {
      console.warn(`  ⚠ Failed to create customer for ${input.email}: ${error.message}`);
      return null;
    }
    return data.id;
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📦 Parking Reservation Import${DRY_RUN ? " (DRY RUN)" : ""}`);
  console.log(`   Lot: ${LOT}`);
  console.log(`   File: ${csvPath}\n`);

  const raw = readFileSync(csvPath!, "utf-8");
  const rows: string[][] = parse(raw, {
    relax_column_count: true,
    skip_empty_lines: false,
  });

  // Skip header row
  const dataRows = rows.slice(1);

  let imported = 0;
  let skipped = 0;
  let errors = 0;
  const customerCache = new Map<string, string | null>();

  for (let i = 0; i < dataRows.length; i++) {
    const cols = dataRows[i];
    const firstName = (cols[0] || "").trim();
    const lastName = (cols[1] || "").trim();

    // Skip empty rows
    if (!firstName && !lastName) {
      skipped++;
      continue;
    }

    const email = (cols[2] || "").trim().toLowerCase();
    const phone = (cols[3] || "").trim();
    const dropOffDate = (cols[4] || "").trim();
    const dropOffTime = convertTime(cols[5] || "");
    const pickUpDate = (cols[6] || "").trim();
    const pickUpTime = convertTime(cols[7] || "");
    const makeModel = (cols[8] || "").trim();
    const plate = extractPlate(cols);
    const services = extractServices(cols);

    // Validate required fields
    if (!dropOffDate || !pickUpDate) {
      console.warn(`  ⚠ Row ${i + 2}: Missing dates for ${firstName} ${lastName}, skipping`);
      skipped++;
      continue;
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dropOffDate) || !/^\d{4}-\d{2}-\d{2}$/.test(pickUpDate)) {
      console.warn(`  ⚠ Row ${i + 2}: Invalid date format for ${firstName} ${lastName}: ${dropOffDate} / ${pickUpDate}, skipping`);
      skipped++;
      continue;
    }

    const { make, model } = splitMakeModel(makeModel);
    const status = determineStatus(dropOffDate, pickUpDate);
    const confirmation = genConfirmation();

    // Find or create customer (cache by email to avoid dups)
    const cacheKey = email || phone;
    let customerId: string | null = null;
    if (!DRY_RUN && cacheKey) {
      if (customerCache.has(cacheKey)) {
        customerId = customerCache.get(cacheKey)!;
      } else {
        customerId = await findOrCreateCustomer({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
        });
        customerCache.set(cacheKey, customerId);
      }
    }

    const record = {
      first_name: firstName,
      last_name: lastName,
      email,
      phone: formatPhone(phone),
      drop_off_date: dropOffDate,
      drop_off_time: dropOffTime,
      pick_up_date: pickUpDate,
      pick_up_time: pickUpTime,
      make: make || "Unknown",
      model: model || "",
      license_plate: plate,
      lot: LOT,
      confirmation_number: confirmation,
      services_interested: services,
      liability_acknowledged: true,
      status: status as "reserved",
      customer_id: customerId,
      ...(status === "checked_out"
        ? { checked_in_at: `${dropOffDate}T${dropOffTime}:00`, checked_out_at: `${pickUpDate}T${pickUpTime}:00` }
        : status === "checked_in"
          ? { checked_in_at: `${dropOffDate}T${dropOffTime}:00` }
          : {}),
    };

    if (DRY_RUN) {
      if (imported < 10) {
        console.log(`  ✓ ${firstName} ${lastName} | ${make} ${model} | ${plate} | ${dropOffDate}→${pickUpDate} | ${status}`);
      }
      imported++;
      continue;
    }

    const { error } = await supabase.from("parking_reservations").insert(record);
    if (error) {
      console.error(`  ✗ Row ${i + 2}: ${firstName} ${lastName} — ${error.message}`);
      errors++;
    } else {
      imported++;
      if (imported % 100 === 0) {
        console.log(`  ... ${imported} imported`);
      }
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Imported: ${imported}`);
  console.log(`   Skipped:  ${skipped}`);
  console.log(`   Errors:   ${errors}`);
  console.log(`   Customers cached: ${customerCache.size}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
