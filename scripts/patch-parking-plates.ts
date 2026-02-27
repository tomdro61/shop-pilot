/**
 * Patch missing license plates on imported parking reservations.
 *
 * Usage:
 *   npx tsx scripts/patch-parking-plates.ts --dry-run file1.csv file2.csv
 *   npx tsx scripts/patch-parking-plates.ts file1.csv file2.csv
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import type { Database } from "../src/types/supabase";

const DRY_RUN = process.argv.includes("--dry-run");
const csvPaths = process.argv.filter((a) => a.endsWith(".csv"));

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function looksLikePlate(val: string): boolean {
  if (!val || val.length < 2 || val.length > 20) return false;
  const lower = val.toLowerCase().trim();
  if (["checked", "true", "false", "", "0", "1"].includes(lower)) return false;
  if (/^\d{1,2}$/.test(val.trim())) return false;
  if (val.startsWith("[")) return false;
  const services: Record<string, boolean> = { "oil change": true, detailing: true, brakes: true, "tire replacement": true, wipers: true };
  if (services[lower]) return false;
  return true;
}

function extractPlate(cols: string[]): string {
  for (const idx of [9, 10, 11]) {
    const val = (cols[idx] || "").trim();
    if (looksLikePlate(val)) return val;
  }
  return "";
}

async function main() {
  console.log(`\n🔧 Patch Missing License Plates${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  // Build a map of (email + drop_off_date) → plate from CSVs
  const plateMap = new Map<string, string>();

  for (const csvPath of csvPaths) {
    const raw = readFileSync(csvPath, "utf-8");
    const rows: string[][] = parse(raw, { relax_column_count: true, skip_empty_lines: false });

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      const email = (cols[2] || "").trim().toLowerCase();
      const dropOff = (cols[4] || "").trim();
      const plate = extractPlate(cols);
      if (email && dropOff && plate) {
        plateMap.set(`${email}|${dropOff}`, plate);
      }
    }
  }

  console.log(`  CSV plates loaded: ${plateMap.size} entries`);

  // Find reservations with empty license plates
  const { data: missing, error } = await supabase
    .from("parking_reservations")
    .select("id, email, drop_off_date, license_plate")
    .or("license_plate.eq.,license_plate.is.null");

  if (error) {
    console.error("Query error:", error.message);
    return;
  }

  console.log(`  Reservations with empty plates: ${missing.length}\n`);

  let patched = 0;
  let notFound = 0;

  for (const r of missing) {
    const key = `${(r.email || "").toLowerCase()}|${r.drop_off_date}`;
    const plate = plateMap.get(key);

    if (!plate) {
      notFound++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  ✓ ${r.email} (${r.drop_off_date}) → ${plate}`);
      patched++;
      continue;
    }

    const { error: updateError } = await supabase
      .from("parking_reservations")
      .update({ license_plate: plate })
      .eq("id", r.id);

    if (updateError) {
      console.error(`  ✗ ${r.email}: ${updateError.message}`);
    } else {
      patched++;
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Patched:   ${patched}`);
  console.log(`   Not found: ${notFound}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
