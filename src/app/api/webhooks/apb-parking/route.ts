import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateCustomer } from "@/lib/parking-customer";

// Inbound push from Airport Parking Boston (airportparkingboston.com). On a PAID
// APB booking for a Broadway-operated lot, APB pushes the reservation here so the
// customer never has to fill out the on-arrival confirmation form. This is at
// parity with the form path (src/app/api/parking/submit): same findOrCreateCustomer
// + parking_reservations insert + onReservationCreated. The only intentional
// differences: the APB_##### confirmation_number, liability from APB's checkout
// Terms, and the SUPPRESSED customer SMS (APB sends its own confirmation email).
//
// Public route (no requireManager) — authenticated by a shared secret in the
// x-webhook-secret header (APB_PARKING_WEBHOOK_SECRET), same model as wix-parking.

/** "9:00 PM" / "10:15:00 AM" / "15:00" -> "HH:MM" 24h. Empty/unparseable -> "12:00". */
function convertTime(raw: string): string {
  if (!raw || !raw.trim()) return "12:00";
  const t = raw.trim();
  if (/^\d{1,2}:\d{2}$/.test(t) && !/[APap]/.test(t)) {
    const [h, m] = t.split(":");
    return `${h.padStart(2, "0")}:${m}`;
  }
  const match = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return "12:00";
  let hour = parseInt(match[1], 10);
  const min = match[2];
  const ampm = (match[3] || "").toUpperCase();
  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return `${hour.toString().padStart(2, "0")}:${min}`;
}

// APB sends a clean, structured payload (no field-name guessing needed, unlike
// the Wix route). Optional fields mirror APB's checkout (phone + vehicle optional).
const apbParkingSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(40).optional().default(""), // matches APB checkout's phone cap (avoids a spurious 400 on a long entry)
  drop_off_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pick_up_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  drop_off_time: z.string().max(20).optional().default(""),
  pick_up_time: z.string().max(20).optional().default(""),
  make: z.string().max(50).optional().default(""),
  model: z.string().max(50).optional().default(""),
  color: z.string().max(30).optional().default(""),
  license_plate: z.string().max(20).optional().default(""),
  lot: z.string().min(1).max(100),
  confirmation_number: z.string().regex(/^APB_\d+$/),
  // Checkbox values + an optional free-text "other" note as one entry (the same
  // column the on-arrival form writes; existing rows already hold free text).
  services_interested: z.array(z.string().max(200)).max(20).optional().default([]),
});

export async function POST(request: Request) {
  // 1. Auth — shared secret (honest 401 on mismatch so APB records a real failure).
  const secret = request.headers.get("x-webhook-secret") || "";
  const expected = process.env.APB_PARKING_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 2. Parse + validate.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = apbParkingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const supabase = createAdminClient();

  // 3. Dedup by confirmation_number (fast path; the partial unique index
  //    parking_reservations_apb_confirmation_unique is the atomic guard for the
  //    concurrent-delivery race handled at the insert below).
  const { data: existing, error: dedupErr } = await supabase
    .from("parking_reservations")
    .select("id")
    .eq("confirmation_number", d.confirmation_number)
    .limit(1)
    .maybeSingle();
  if (dedupErr) {
    console.error("apb-parking: dedup lookup failed:", dedupErr);
    return NextResponse.json({ ok: false, error: "dedup_failed" }, { status: 500 });
  }
  if (existing) {
    // Already registered — an idempotent no-op. APB maps this to success.
    return NextResponse.json(
      { ok: false, reason: "duplicate", reservation_id: existing.id },
      { status: 409 }
    );
  }

  // 4. Find/create the customer (parity with the form path).
  const customerId = await findOrCreateCustomer(
    { first_name: d.first_name, last_name: d.last_name, email: d.email, phone: d.phone },
    "parking"
  );

  const dropOffTime = convertTime(d.drop_off_time);
  const pickUpTime = convertTime(d.pick_up_time);
  const parkingType = "self_park"; // the 3 Broadway lots are all self-park

  // 5. Insert — same shape as the form path, coercing every NOT NULL text column.
  const { data: inserted, error: insertErr } = await supabase
    .from("parking_reservations")
    .insert({
      first_name: d.first_name,
      last_name: d.last_name,
      email: d.email,
      phone: d.phone || "",
      drop_off_date: d.drop_off_date,
      drop_off_time: dropOffTime,
      pick_up_date: d.pick_up_date,
      pick_up_time: pickUpTime,
      make: d.make || "Unknown",
      model: d.model || "",
      color: d.color || null,
      license_plate: d.license_plate || "",
      lot: d.lot,
      confirmation_number: d.confirmation_number,
      services_interested: d.services_interested,
      liability_acknowledged: true,
      status: "reserved" as const,
      parking_type: parkingType,
      customer_id: customerId,
    })
    .select("id")
    .single();

  if (insertErr) {
    // 23505 = the partial unique index caught a concurrent duplicate → treat as dup.
    if (insertErr.code === "23505") {
      return NextResponse.json({ ok: false, reason: "duplicate" }, { status: 409 });
    }
    console.error("apb-parking: reservation insert failed:", insertErr);
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });
  }

  // 6. Respond immediately — the durable pre-registration is established by the
  //    insert. Run the Quo contact + (suppressed) SMS AFTER the response so a slow
  //    Quo call never sits inside APB's push timeout and flips a real success into
  //    a false failure.
  if (d.phone) {
    after(async () => {
      try {
        const { onReservationCreated } = await import("@/lib/parking/on-reservation-created");
        await onReservationCreated({
          phone: d.phone,
          firstName: d.first_name,
          lastName: d.last_name,
          email: d.email || undefined,
          dropOffDate: d.drop_off_date,
          dropOffTime,
          pickUpDate: d.pick_up_date,
          pickUpTime,
          customerId,
          lot: d.lot,
          parkingType,
          sendCustomerSms: false, // APB already emails its own confirmation
        });
      } catch (err) {
        console.error("apb-parking: post-reservation error:", err);
      }
    });
  }

  return NextResponse.json({ ok: true, reservation_id: inserted.id }, { status: 200 });
}
