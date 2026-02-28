import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateParkingCustomer } from "@/lib/parking-customer";

// ── Helpers (adapted from scripts/import-parking-reservations.ts) ──

const COLORS = new Set([
  "black", "white", "red", "blue", "green", "silver", "gray", "grey",
  "brown", "gold", "orange", "yellow", "beige", "tan", "maroon", "purple",
]);

/** Split "Make and Model" into { make, model } — handles year prefixes, color prefixes, parenthetical notes */
function splitMakeModel(raw: string): { make: string; model: string } {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/\(.*?\)/g, "").trim();
  cleaned = cleaned.replace(/^\d{4}\s+/, "");
  const words = cleaned.split(/\s+/);
  if (words.length > 1 && COLORS.has(words[0].toLowerCase())) {
    words.shift();
  }
  if (words.length === 0) return { make: raw.trim(), model: "" };
  if (words.length === 1) return { make: words[0], model: "" };
  return { make: words[0], model: words.slice(1).join(" ") };
}

/** Derive lot name from Wix form name */
function deriveLot(formName: string): string {
  const lower = formName.toLowerCase();
  if (lower.includes("2050 revere beach")) return "Airport Parking Boston 2";
  if (lower.includes("961 broadway")) return "Airport Parking Boston 1";
  if (lower.includes("valet")) return "Boston Logan Valet";
  if (lower.includes("broadway motors")) return "Broadway Motors";
  return "";
}

/** Convert "3:00 PM" or "10:15:00 AM" or "15:00" → "HH:MM" 24h */
function convertTime(raw: string): string {
  if (!raw || !raw.trim()) return "12:00";
  const trimmed = raw.trim();
  // Already in HH:MM 24h format
  if (/^\d{1,2}:\d{2}$/.test(trimmed) && !trimmed.match(/[APap]/)) {
    const [h, m] = trimmed.split(":");
    return `${h.padStart(2, "0")}:${m}`;
  }
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return "12:00";
  let hour = parseInt(match[1], 10);
  const min = match[2];
  const ampm = (match[3] || "").toUpperCase();
  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return `${hour.toString().padStart(2, "0")}:${min}`;
}

/** Parse a date string to YYYY-MM-DD. Handles ISO strings, MM/DD/YYYY, etc. */
function parseDate(raw: string): string {
  if (!raw || !raw.trim()) return "";
  const trimmed = raw.trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // ISO datetime — take the date part
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.split("T")[0];
  // MM/DD/YYYY or M/D/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[1].padStart(2, "0")}-${slashMatch[2].padStart(2, "0")}`;
  }
  // Try native Date parse as last resort
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return "";
}

/** Generate a random 8-char alphanumeric confirmation number */
function genConfirmation(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/** Normalize services — accepts array, comma-separated string, or JSON string */
function parseServices(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === "string");
  if (typeof raw === "string") {
    // Try JSON parse first
    if (raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === "string");
      } catch { /* fall through */ }
    }
    // Comma-separated
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

// ── POST handler ──────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    // 1. Parse JSON body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      console.error("Wix parking webhook: invalid JSON body");
      return NextResponse.json({ success: true }, { status: 200 });
    }

    // 2. Verify shared secret — check header first, then body param (Wix doesn't support custom headers)
    const secret =
      request.headers.get("x-webhook-secret") ||
      (typeof body.webhook_secret === "string" ? body.webhook_secret : "") ||
      (typeof (body.data as Record<string, unknown>)?.webhook_secret === "string"
        ? (body.data as Record<string, unknown>).webhook_secret as string
        : "");
    const expected = process.env.WIX_PARKING_WEBHOOK_SECRET;

    if (!expected || secret !== expected) {
      console.error("Wix parking webhook: invalid or missing secret");
      return NextResponse.json({ success: true }, { status: 200 });
    }

    console.log("Wix parking webhook received:", JSON.stringify(body));

    // 3. Extract fields — flexible lookup to handle Wix naming variations
    // Wix may nest data under a "data" key or send flat
    const data = (typeof body.data === "object" && body.data !== null ? body.data : body) as Record<string, unknown>;

    const getString = (keys: string[]): string => {
      for (const key of keys) {
        const val = data[key];
        if (typeof val === "string" && val.trim()) return val.trim();
      }
      return "";
    };

    const firstName = getString(["first_name", "firstName", "First Name", "first name"]);
    const lastName = getString(["last_name", "lastName", "Last Name", "last name"]);
    const email = getString(["email", "Email", "e-mail"]).toLowerCase();
    const phone = getString(["phone", "Phone", "phone_number", "phoneNumber", "Phone Number"]);
    const dropOffDateRaw = getString(["drop_off_date", "dropOffDate", "Drop Off Date", "drop off date", "dropoff_date", "Drop-Off Date"]);
    const dropOffTimeRaw = getString(["drop_off_time", "dropOffTime", "Drop Off Time", "drop off time", "dropoff_time", "Drop-Off Time"]);
    const pickUpDateRaw = getString(["pick_up_date", "pickUpDate", "Pick Up Date", "pick up date", "pickup_date", "Pick-Up Date"]);
    const pickUpTimeRaw = getString(["pick_up_time", "pickUpTime", "Pick Up Time", "pick up time", "pickup_time", "Pick-Up Time"]);
    const makeModelRaw = getString(["make_model", "makeModel", "Make and Model", "make and model", "Make & Model", "make_and_model"]);
    const licensePlate = getString(["license_plate", "licensePlate", "License Plate", "license plate", "plate"]);
    const color = getString(["color", "Color", "vehicle_color", "vehicleColor"]);
    const confirmationRaw = getString(["confirmation_number", "confirmationNumber", "Confirmation Number", "confirmation"]);
    const formName = getString(["form_name", "formName", "Form name"]);
    const lot = deriveLot(formName) || getString(["lot", "Lot", "parking_lot", "parkingLot"]) || "Broadway Motors";
    const servicesRaw = data["services"] ?? data["services_interested"] ?? data["servicesInterested"] ?? data["Services"] ?? [];

    // 4. Validate minimum required fields
    if (!firstName || !lastName) {
      console.error("Wix parking webhook: missing name fields", { firstName, lastName });
      return NextResponse.json({ success: true }, { status: 200 });
    }

    if (!email && !phone) {
      console.error("Wix parking webhook: missing both email and phone");
      return NextResponse.json({ success: true }, { status: 200 });
    }

    // 5. Parse and normalize fields
    const dropOffDate = parseDate(dropOffDateRaw);
    const dropOffTime = convertTime(dropOffTimeRaw);
    const pickUpDate = parseDate(pickUpDateRaw);
    const pickUpTime = convertTime(pickUpTimeRaw);

    if (!dropOffDate || !pickUpDate) {
      console.error("Wix parking webhook: could not parse dates", { dropOffDateRaw, pickUpDateRaw });
      return NextResponse.json({ success: true }, { status: 200 });
    }

    // 6. Split make/model if combined, or use as-is
    let make = getString(["make", "Make"]);
    let model = getString(["model", "Model"]);

    if (!make && makeModelRaw) {
      const split = splitMakeModel(makeModelRaw);
      make = split.make;
      model = split.model;
    }

    const confirmationNumber = confirmationRaw || genConfirmation();
    const services = parseServices(servicesRaw);

    // 7. Find or create customer
    const customerId = (email || phone)
      ? await findOrCreateParkingCustomer({
          first_name: firstName,
          last_name: lastName,
          email: email,
          phone: phone,
        })
      : null;

    // 8. Insert parking reservation
    const supabase = createAdminClient();
    const { error } = await supabase.from("parking_reservations").insert({
      first_name: firstName,
      last_name: lastName,
      email: email || "",
      phone: phone || "",
      drop_off_date: dropOffDate,
      drop_off_time: dropOffTime,
      pick_up_date: pickUpDate,
      pick_up_time: pickUpTime,
      make: make || "Unknown",
      model: model || "",
      license_plate: licensePlate,
      color: color || null,
      lot,
      confirmation_number: confirmationNumber,
      services_interested: services,
      liability_acknowledged: true,
      status: "reserved" as const,
      customer_id: customerId,
    });

    if (error) {
      console.error("Wix parking webhook: reservation insert failed:", error);
      return NextResponse.json({ success: true }, { status: 200 });
    }

    console.log(`Wix parking webhook: reservation created for ${firstName} ${lastName} (${confirmationNumber})`);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("Wix parking webhook: unexpected error:", err);
    return NextResponse.json({ success: true }, { status: 200 });
  }
}
