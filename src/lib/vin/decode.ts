// NHTSA VIN decode with DB caching via the vin_decode_cache table.
//
// Why a DB cache, not Next.js fetch cache: `next.revalidate` on fetch is silently
// ignored inside API route handlers in some Next.js versions, especially in
// combination with admin Supabase calls in the same handler. The DB table is the
// authoritative cache; the TTL is enforced by `decoded_at` and a 30-day window.
//
// Per BOOKING_TECHNICAL_PLAN.md §7.

import { createAdminClient } from "@/lib/supabase/admin";

const NHTSA_URL =
  "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Single source of truth for the VIN regex. Mirrors the
 * `vin_decode_cache.vin` CHECK constraint — excludes I/O/Q (illegal per NHTSA)
 * and enforces exactly 17 chars. Imported by `validators/appointments.ts` so
 * Zod and the cache layer can't drift.
 */
export const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

export type VinDecode = {
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
};

/**
 * Pure parser — takes the raw NHTSA `DecodeVinValues` JSON and shapes it into
 * our VinDecode type. Exported so tests can hit it without any IO.
 *
 * NHTSA returns empty strings (not nulls) when a field isn't known; we coerce
 * those to null so callers don't have to guard against "" vs missing.
 */
export function parseNhtsaResponse(vin: string, raw: unknown): VinDecode | null {
  if (!raw || typeof raw !== "object") return null;
  const results = (raw as { Results?: unknown }).Results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const r = results[0] as Record<string, unknown>;

  return {
    vin,
    year: parseYear(r.ModelYear),
    make: parseString(r.Make),
    model: parseString(r.Model),
    trim: parseString(r.Trim),
  };
}

function parseYear(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed.length === 0) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Decode a VIN. Cache-first; falls back to NHTSA if cache miss or stale.
 * Returns null on invalid VIN or unrecoverable NHTSA failure.
 *
 * If NHTSA fails and we have a stale cached entry, return the stale entry rather
 * than null — degraded data beats no data for the auto-populate use case.
 */
export async function decodeVin(vin: string): Promise<VinDecode | null> {
  if (!VIN_REGEX.test(vin)) return null;

  const supabase = createAdminClient();

  // 1. Cache lookup
  const { data: cached, error: cacheErr } = await supabase
    .from("vin_decode_cache")
    .select("vin, year, make, model, trim, decoded_at")
    .eq("vin", vin)
    .maybeSingle();

  if (cacheErr) {
    // Don't block decode on cache read failures — log and fall through to fetch.
    console.error("[decodeVin] cache lookup failed:", cacheErr.message);
  }

  const cachedFresh =
    cached &&
    Date.now() - new Date(cached.decoded_at).getTime() < CACHE_TTL_MS;
  if (cachedFresh) {
    return toVinDecode(cached);
  }

  // 2. Fetch fresh from NHTSA
  let parsed: VinDecode | null = null;
  try {
    const res = await fetch(
      `${NHTSA_URL}/${encodeURIComponent(vin)}?format=json`
    );
    if (!res.ok) {
      console.error(`[decodeVin] NHTSA HTTP ${res.status}`);
      return cached ? toVinDecode(cached) : null;
    }
    const raw = await res.json();
    parsed = parseNhtsaResponse(vin, raw);
    if (!parsed) return cached ? toVinDecode(cached) : null;
  } catch (err) {
    console.error("[decodeVin] NHTSA fetch failed:", err);
    return cached ? toVinDecode(cached) : null;
  }

  // 3. Upsert cache (best-effort — don't block the response on a cache write fail)
  const { error: upsertErr } = await supabase.from("vin_decode_cache").upsert({
    vin: parsed.vin,
    year: parsed.year,
    make: parsed.make,
    model: parsed.model,
    trim: parsed.trim,
    decoded_at: new Date().toISOString(),
  });
  if (upsertErr) {
    console.error("[decodeVin] cache upsert failed:", upsertErr.message);
  }

  return parsed;
}

// Strip `decoded_at` from a cache row, leaving the VinDecode shape.
// Typed against VinDecode itself so any future field change ripples here.
function toVinDecode(row: VinDecode & { decoded_at: string }): VinDecode {
  const { vin, year, make, model, trim } = row;
  return { vin, year, make, model, trim };
}
