import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parkingSubmitSchema } from "@/lib/validators/parking";
import { findOrCreateParkingCustomer } from "@/lib/parking-customer";

// ── CORS ────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "https://broadwaymotorsma.com",
  "https://www.broadwaymotorsma.com",
  "https://broadwaymotorsrevere.com",
  "https://www.broadwaymotorsrevere.com",
  "https://broadway-motors-web.vercel.app",
  ...(process.env.NODE_ENV === "development"
    ? ["http://localhost:3000", "http://localhost:3001"]
    : []),
];

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// ── Rate Limiting (in-memory, per-IP) ───────────────────────────

const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW = 60_000; // 60 seconds

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT;
}

// ── OPTIONS (CORS preflight) ────────────────────────────────────

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

// ── POST ────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  // Rate limit by IP
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers }
    );
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers }
    );
  }

  // Validate
  const parsed = parkingSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400, headers }
    );
  }

  // Honeypot — silently accept but don't write to DB
  if (parsed.data.website && parsed.data.website.length > 0) {
    return NextResponse.json({ success: true }, { headers });
  }

  // Dedup — skip if same phone + drop-off date + lot already submitted recently
  if (parsed.data.phone && parsed.data.drop_off_date) {
    const supabaseCheck = createAdminClient();
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: existing } = await supabaseCheck
      .from("parking_reservations")
      .select("id")
      .eq("phone", parsed.data.phone)
      .eq("drop_off_date", parsed.data.drop_off_date)
      .eq("lot", parsed.data.lot)
      .gte("created_at", fiveMinAgo)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ success: true }, { headers });
    }
  }

  // Find or create a customer record for this parking reservation
  const customerId = await findOrCreateParkingCustomer({
    first_name: parsed.data.first_name,
    last_name: parsed.data.last_name,
    email: parsed.data.email,
    phone: parsed.data.phone,
  });

  // Write to Supabase
  const supabase = createAdminClient();
  const {
    website: _,
    color: rawColor,
    parking_type: rawParkingType,
    departing_flight: rawDepartingFlight,
    arriving_flight: rawArrivingFlight,
    confirmation_number: rawConfirmation,
    ...insertData
  } = parsed.data;

  const { error } = await supabase.from("parking_reservations").insert({
    ...insertData,
    color: rawColor || null,
    confirmation_number: rawConfirmation || "",
    parking_type: rawParkingType || "self_park",
    departing_flight: rawDepartingFlight || null,
    arriving_flight: rawArrivingFlight || null,
    status: "reserved" as const,
    customer_id: customerId,
  });

  if (error) {
    console.error("Parking reservation insert error:", error);
    return NextResponse.json(
      { error: "Failed to save reservation" },
      { status: 500, headers }
    );
  }

  // Await so Vercel doesn't kill the function before this completes
  if (parsed.data.phone) {
    try {
      const { onReservationCreated } = await import("@/lib/parking/on-reservation-created");
      await onReservationCreated({
        phone: parsed.data.phone,
        firstName: parsed.data.first_name,
        lastName: parsed.data.last_name,
        email: parsed.data.email || undefined,
        dropOffDate: parsed.data.drop_off_date,
        dropOffTime: parsed.data.drop_off_time,
        pickUpDate: parsed.data.pick_up_date,
        pickUpTime: parsed.data.pick_up_time,
        customerId,
        lot: parsed.data.lot,
        parkingType: parsed.data.parking_type,
      });
    } catch (err) {
      console.error("Parking submit: post-reservation error:", err);
    }
  }

  return NextResponse.json({ success: true }, { headers });
}
