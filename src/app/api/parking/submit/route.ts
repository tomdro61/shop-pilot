import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parkingSubmitSchema } from "@/lib/validators/parking";

// ── CORS ────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "https://broadwaymotorsma.com",
  "https://www.broadwaymotorsma.com",
  "https://broadwaymotorsrevere.com",
  "https://www.broadwaymotorsrevere.com",
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

  // Write to Supabase
  const supabase = createAdminClient();
  const { website: _, ...insertData } = parsed.data;

  const { error } = await supabase.from("parking_reservations").insert({
    ...insertData,
    status: "reserved" as const,
  });

  if (error) {
    console.error("Parking reservation insert error:", error);
    return NextResponse.json(
      { error: "Failed to save reservation" },
      { status: 500, headers }
    );
  }

  return NextResponse.json({ success: true }, { headers });
}
