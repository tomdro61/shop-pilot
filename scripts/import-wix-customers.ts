/**
 * Wix Customer Data Import Script
 *
 * One-time script to import customer contacts from a Wix CSV export into
 * ShopPilot's Supabase database. Filters out parking-only contacts, normalizes
 * data, deduplicates, and batch inserts.
 *
 * Usage:
 *   npx tsx scripts/import-wix-customers.ts path/to/export.csv           # Dry run
 *   npx tsx scripts/import-wix-customers.ts path/to/export.csv --commit  # Actually insert
 */

import { createReadStream, accessSync, constants } from "fs";
import { resolve } from "path";
import { parse } from "csv-parse";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

// Load .env.local
config({ path: resolve(__dirname, "../.env.local") });

// ---------------------------------------------------------------------------
// Supabase admin client (inlined to avoid @/ path alias issues with tsx)
// ---------------------------------------------------------------------------
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Phone normalization (copied from src/lib/validators/customer.ts)
// ---------------------------------------------------------------------------
function formatPhoneForStorage(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+")) return phone;
  return phone || null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface WixRow {
  "First Name": string;
  "Last Name": string;
  "Phone 1": string;
  "Email 1": string;
  "Address 1 - Street": string;
  "Address 1 - City": string;
  "Address 1 - State/Region": string;
  "Address 1 - Zip": string;
  Labels: string;
  "Created At": string;
  [key: string]: string;
}

interface ParsedCustomer {
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  customer_type: "retail";
  fleet_account: null;
  notes: null;
  _score: number; // for dedup tiebreaking
  _created_at: Date | null;
}

// Shop placeholder emails to strip
const SHOP_EMAILS = [
  "broadwaymotorsrevere@gmail.com",
];

function isShopEmail(email: string): boolean {
  const lower = email.toLowerCase().trim();
  if (SHOP_EMAILS.includes(lower)) return true;
  if (lower.endsWith("@broadwaymotorsrevere.com")) return true;
  return false;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------
async function readCsv(filePath: string): Promise<WixRow[]> {
  // Check file exists before opening stream (better error handling)
  accessSync(filePath, constants.R_OK);

  const rows: WixRow[] = [];
  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
    })
  );

  for await (const row of parser) {
    rows.push(row as WixRow);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Row processing
// ---------------------------------------------------------------------------
function parseRow(row: WixRow): ParsedCustomer | null {
  const labels = (row["Labels"] || "").toLowerCase();

  // 1. Parking filter: has "airport parking" but NOT "customers"
  if (labels.includes("airport parking") && !labels.includes("customers")) {
    return null; // filtered: parking
  }

  const firstName = (row["First Name"] || "").trim();
  const lastName = (row["Last Name"] || "").trim();

  // 2. No name filter
  if (!firstName) {
    return null; // filtered: no name
  }

  const rawPhone = (row["Phone 1"] || "").trim();
  const rawEmail = (row["Email 1"] || "").trim();

  // 3. No contact info filter
  if (!rawPhone && !rawEmail) {
    return null; // filtered: no contact
  }

  // Normalize phone — strip leading apostrophe before normalizing
  const cleanPhone = rawPhone.replace(/^'+/, "");
  const phone = formatPhoneForStorage(cleanPhone);

  // Normalize email
  let email: string | null = rawEmail.toLowerCase().trim() || null;
  if (email && isShopEmail(email)) {
    email = null;
  }
  if (email && !isValidEmail(email)) {
    email = null;
  }

  // Build address
  const street = (row["Address 1 - Street"] || "").trim();
  const city = (row["Address 1 - City"] || "").trim();
  const state = (row["Address 1 - State/Region"] || "").trim();
  const zip = (row["Address 1 - Zip"] || "").trim();

  const stateZip = [state, zip].filter(Boolean).join(" ");
  const addressParts = [street, city, stateZip].filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(", ") : null;

  // Parse created date for tiebreaking
  const createdRaw = (row["Created At"] || "").trim();
  const createdAt = createdRaw ? new Date(createdRaw) : null;

  // Score for dedup tiebreaking
  let score = 0;
  if (email) score += 2;
  if (address) score += 1;
  if (labels.includes("customers")) score += 1;

  return {
    first_name: firstName,
    last_name: lastName,
    phone,
    email,
    address,
    customer_type: "retail",
    fleet_account: null,
    notes: null,
    _score: score,
    _created_at: createdAt && !isNaN(createdAt.getTime()) ? createdAt : null,
  };
}

type FilterReason = "parking" | "no_name" | "no_contact";

function classifyFilterReason(row: WixRow): FilterReason | null {
  const labels = (row["Labels"] || "").toLowerCase();
  if (labels.includes("airport parking") && !labels.includes("customers")) {
    return "parking";
  }
  const firstName = (row["First Name"] || "").trim();
  if (!firstName) return "no_name";
  const rawPhone = (row["Phone 1"] || "").trim();
  const rawEmail = (row["Email 1"] || "").trim();
  if (!rawPhone && !rawEmail) return "no_contact";
  return null;
}

// ---------------------------------------------------------------------------
// Deduplication within CSV (by phone)
// ---------------------------------------------------------------------------
function deduplicateByPhone(
  customers: ParsedCustomer[]
): { unique: ParsedCustomer[]; duplicateCount: number } {
  const withPhone: ParsedCustomer[] = [];
  const withoutPhone: ParsedCustomer[] = [];

  for (const c of customers) {
    if (c.phone) {
      withPhone.push(c);
    } else {
      withoutPhone.push(c);
    }
  }

  const phoneMap = new Map<string, ParsedCustomer>();
  let duplicateCount = 0;

  for (const c of withPhone) {
    const existing = phoneMap.get(c.phone!);
    if (!existing) {
      phoneMap.set(c.phone!, c);
    } else {
      duplicateCount++;
      // Keep the better record
      if (
        c._score > existing._score ||
        (c._score === existing._score &&
          c._created_at &&
          existing._created_at &&
          c._created_at > existing._created_at)
      ) {
        phoneMap.set(c.phone!, c);
      }
    }
  }

  return {
    unique: [...phoneMap.values(), ...withoutPhone],
    duplicateCount,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const commitFlag = args.includes("--commit");
  const csvPath = args.find((a) => !a.startsWith("--"));

  if (!csvPath) {
    console.error(
      "Usage: npx tsx scripts/import-wix-customers.ts <path/to/export.csv> [--commit]"
    );
    process.exit(1);
  }

  const resolvedPath = resolve(csvPath);
  console.log(`\nReading CSV: ${resolvedPath}`);
  console.log(`Mode: ${commitFlag ? "COMMIT (will insert into database)" : "DRY RUN (no changes)"}\n`);

  // Read CSV
  let rows: WixRow[];
  try {
    rows = await readCsv(resolvedPath);
  } catch (err) {
    console.error(`Failed to read CSV: ${(err as Error).message}`);
    process.exit(1);
  }

  const totalRows = rows.length;
  console.log(`Total CSV rows: ${totalRows.toLocaleString()}`);

  // Classify and count filter reasons
  let parkingCount = 0;
  let noNameCount = 0;
  let noContactCount = 0;
  const parsed: ParsedCustomer[] = [];

  for (const row of rows) {
    const reason = classifyFilterReason(row);
    if (reason === "parking") {
      parkingCount++;
      continue;
    }
    if (reason === "no_name") {
      noNameCount++;
      continue;
    }
    if (reason === "no_contact") {
      noContactCount++;
      continue;
    }

    const customer = parseRow(row);
    if (customer) {
      parsed.push(customer);
    }
  }

  console.log(`Filtered (parking):      ${parkingCount.toLocaleString()}`);
  console.log(`Filtered (no name):      ${noNameCount.toLocaleString()}`);
  console.log(`Filtered (no contact):   ${noContactCount.toLocaleString()}`);
  console.log(`Passed filters:          ${parsed.length.toLocaleString()}`);

  // Deduplicate within CSV
  const { unique, duplicateCount } = deduplicateByPhone(parsed);
  console.log(`Duplicates (within CSV): ${duplicateCount.toLocaleString()}`);

  // Deduplicate against existing DB customers (paginate — Supabase default limit is 1000)
  const supabase = createAdminClient();
  const allPhones: string[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;

  while (true) {
    const { data, error: fetchError } = await supabase
      .from("customers")
      .select("phone")
      .not("phone", "is", null)
      .range(from, from + PAGE_SIZE - 1);

    if (fetchError) {
      console.error(`Failed to fetch existing customers: ${fetchError.message}`);
      process.exit(1);
    }

    for (const c of data || []) {
      if (c.phone) allPhones.push(c.phone);
    }

    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  console.log(`Existing customers in DB: ${allPhones.length.toLocaleString()}`);
  const existingPhones = new Set(allPhones);

  const toInsert: ParsedCustomer[] = [];
  let dbDuplicateCount = 0;

  for (const c of unique) {
    if (c.phone && existingPhones.has(c.phone)) {
      dbDuplicateCount++;
    } else {
      toInsert.push(c);
    }
  }

  console.log(`Duplicates (in DB):      ${dbDuplicateCount.toLocaleString()}`);

  // Count any errors (rows that passed filters but had issues)
  const errorCount = 0;
  console.log(`Errors:                  ${errorCount.toLocaleString()}`);
  console.log(`--------------------------`);
  console.log(`To import:               ${toInsert.length.toLocaleString()}`);

  // Show sample rows
  console.log(`\n--- Sample rows (first 10) ---`);
  for (const c of toInsert.slice(0, 10)) {
    console.log(
      `  ${c.first_name} ${c.last_name} | ${c.phone || "(no phone)"} | ${c.email || "(no email)"} | ${c.address || "(no address)"}`
    );
  }

  if (!commitFlag) {
    console.log(
      `\n** DRY RUN — no records inserted. Run with --commit to insert. **\n`
    );
    return;
  }

  // Batch insert
  const BATCH_SIZE = 100;
  let insertedCount = 0;
  let insertErrors = 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE).map((c) => ({
      first_name: c.first_name,
      last_name: c.last_name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      customer_type: c.customer_type,
      fleet_account: c.fleet_account,
      notes: c.notes,
    }));

    const { error: insertError, data } = await supabase
      .from("customers")
      .insert(batch)
      .select("id");

    if (insertError) {
      console.error(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${insertError.message}`
      );
      insertErrors += batch.length;
    } else {
      insertedCount += (data || []).length;
      process.stdout.write(
        `\rInserted: ${insertedCount.toLocaleString()} / ${toInsert.length.toLocaleString()}`
      );
    }
  }

  console.log(`\n`);
  console.log(`=== Wix Import Summary ===`);
  console.log(`Total CSV rows:          ${totalRows.toLocaleString()}`);
  console.log(`Filtered (parking):      ${parkingCount.toLocaleString()}`);
  console.log(`Filtered (no name):      ${noNameCount.toLocaleString()}`);
  console.log(`Filtered (no contact):   ${noContactCount.toLocaleString()}`);
  console.log(`Duplicates (within CSV): ${duplicateCount.toLocaleString()}`);
  console.log(`Duplicates (in DB):      ${dbDuplicateCount.toLocaleString()}`);
  console.log(`Errors:                  ${insertErrors.toLocaleString()}`);
  console.log(`--------------------------`);
  console.log(`Imported:                ${insertedCount.toLocaleString()}`);
  console.log();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
