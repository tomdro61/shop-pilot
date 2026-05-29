import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { decodeVin, parseNhtsaResponse } from "./decode";
import { createSupabaseMock } from "@/lib/actions/__test-helpers__/supabase-mock";

const VALID_VIN = "1HGCM82633A123456"; // example Honda VIN, regex-valid

const NHTSA_HAPPY_RESPONSE = {
  Count: 1,
  Message: "Results returned successfully",
  Results: [
    {
      ModelYear: "2003",
      Make: "HONDA",
      Model: "Accord",
      Trim: "EX V6",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── parseNhtsaResponse — pure parsing tests ─────────────────────────────

describe("parseNhtsaResponse", () => {
  it("extracts year/make/model/trim from a happy NHTSA response", () => {
    expect(parseNhtsaResponse(VALID_VIN, NHTSA_HAPPY_RESPONSE)).toEqual({
      vin: VALID_VIN,
      year: 2003,
      make: "HONDA",
      model: "Accord",
      trim: "EX V6",
    });
  });

  it("coerces empty strings to null", () => {
    // NHTSA returns "" not null for unknown fields
    expect(
      parseNhtsaResponse(VALID_VIN, {
        Results: [{ ModelYear: "", Make: "", Model: "", Trim: "" }],
      })
    ).toEqual({ vin: VALID_VIN, year: null, make: null, model: null, trim: null });
  });

  it("trims whitespace from string fields", () => {
    expect(
      parseNhtsaResponse(VALID_VIN, {
        Results: [{ ModelYear: " 2018 ", Make: " Toyota ", Model: "RAV4", Trim: " LE " }],
      })
    ).toEqual({ vin: VALID_VIN, year: 2018, make: "Toyota", model: "RAV4", trim: "LE" });
  });

  it("handles ModelYear as a number directly", () => {
    expect(
      parseNhtsaResponse(VALID_VIN, {
        Results: [{ ModelYear: 2021, Make: "Ford", Model: "F-150", Trim: "XLT" }],
      })?.year
    ).toBe(2021);
  });

  it("returns null year on non-numeric ModelYear", () => {
    expect(
      parseNhtsaResponse(VALID_VIN, {
        Results: [{ ModelYear: "abc", Make: "Ford", Model: "F-150", Trim: null }],
      })?.year
    ).toBeNull();
  });

  it("returns null when raw is null or non-object", () => {
    expect(parseNhtsaResponse(VALID_VIN, null)).toBeNull();
    expect(parseNhtsaResponse(VALID_VIN, "not an object")).toBeNull();
    expect(parseNhtsaResponse(VALID_VIN, 42)).toBeNull();
  });

  it("returns null when Results is missing or empty", () => {
    expect(parseNhtsaResponse(VALID_VIN, {})).toBeNull();
    expect(parseNhtsaResponse(VALID_VIN, { Results: [] })).toBeNull();
    expect(parseNhtsaResponse(VALID_VIN, { Results: "not an array" })).toBeNull();
  });
});

// ── decodeVin — IO tests with mocks ─────────────────────────────────────

describe("decodeVin", () => {
  it("rejects malformed VIN before any IO", async () => {
    // Doesn't match the [A-HJ-NPR-Z0-9]{17} regex
    expect(await decodeVin("not-a-vin")).toBeNull();
    expect(await decodeVin("1HGCM82633A12345")).toBeNull(); // 16 chars
    expect(await decodeVin("1HGCM82633A1234567")).toBeNull(); // 18 chars
    expect(await decodeVin("1HGCM82633A12345I")).toBeNull(); // contains I
    // Critically: createAdminClient should never have been called for these.
    expect(vi.mocked(createAdminClient)).not.toHaveBeenCalled();
  });

  it("returns the cached row when fresh", async () => {
    const freshRow = {
      vin: VALID_VIN,
      year: 2003,
      make: "HONDA",
      model: "Accord",
      trim: "EX V6",
      decoded_at: new Date().toISOString(),
    };
    const mock = createSupabaseMock({ data: freshRow, error: null });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );
    const fetchSpy = vi.spyOn(global, "fetch");

    const result = await decodeVin(VALID_VIN);
    expect(result).toEqual({
      vin: VALID_VIN,
      year: 2003,
      make: "HONDA",
      model: "Accord",
      trim: "EX V6",
    });
    // No NHTSA call on a cache hit.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refetches from NHTSA when the cache row is stale", async () => {
    const staleRow = {
      vin: VALID_VIN,
      year: 2003,
      make: "HONDA",
      model: "Accord",
      trim: "EX V6",
      decoded_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const mock = createSupabaseMock([
      { data: staleRow, error: null }, // cache lookup
      { data: null, error: null }, // upsert
    ]);
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(NHTSA_HAPPY_RESPONSE), { status: 200 })
    );

    const result = await decodeVin(VALID_VIN);
    expect(result).toEqual({
      vin: VALID_VIN,
      year: 2003,
      make: "HONDA",
      model: "Accord",
      trim: "EX V6",
    });
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it("fetches from NHTSA when cache miss", async () => {
    const mock = createSupabaseMock([
      { data: null, error: null }, // cache miss
      { data: null, error: null }, // upsert
    ]);
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(NHTSA_HAPPY_RESPONSE), { status: 200 })
    );

    const result = await decodeVin(VALID_VIN);
    expect(result?.make).toBe("HONDA");
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it("falls back to stale cache when NHTSA returns non-OK", async () => {
    const staleRow = {
      vin: VALID_VIN,
      year: 2003,
      make: "HONDA",
      model: "Accord",
      trim: "EX V6",
      decoded_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const mock = createSupabaseMock({ data: staleRow, error: null });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("", { status: 503 }));

    const result = await decodeVin(VALID_VIN);
    expect(result).toEqual({
      vin: VALID_VIN,
      year: 2003,
      make: "HONDA",
      model: "Accord",
      trim: "EX V6",
    });
  });

  it("returns null when NHTSA fails AND cache is empty", async () => {
    const mock = createSupabaseMock({ data: null, error: null });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("", { status: 503 }));

    expect(await decodeVin(VALID_VIN)).toBeNull();
  });

  it("treats a cache row exactly at TTL as STALE (strict < boundary)", async () => {
    const exactlyTtlMs = 30 * 24 * 60 * 60 * 1000;
    const boundaryRow = {
      vin: VALID_VIN,
      year: 2003,
      make: "HONDA",
      model: "Accord",
      trim: "EX V6",
      decoded_at: new Date(Date.now() - exactlyTtlMs).toISOString(),
    };
    const mock = createSupabaseMock([
      { data: boundaryRow, error: null }, // cache lookup
      { data: null, error: null }, // upsert
    ]);
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(NHTSA_HAPPY_RESPONSE), { status: 200 })
    );

    await decodeVin(VALID_VIN);
    // The comparison is `< CACHE_TTL_MS`, so exactly TTL means stale → NHTSA called.
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("treats a cache row just under TTL as FRESH (no NHTSA call)", async () => {
    const justUnderTtlMs = 30 * 24 * 60 * 60 * 1000 - 1;
    const freshRow = {
      vin: VALID_VIN,
      year: 2003,
      make: "HONDA",
      model: "Accord",
      trim: "EX V6",
      decoded_at: new Date(Date.now() - justUnderTtlMs).toISOString(),
    };
    const mock = createSupabaseMock({ data: freshRow, error: null });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );
    const fetchSpy = vi.spyOn(global, "fetch");

    await decodeVin(VALID_VIN);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns the parsed decode even when the cache upsert fails (best-effort write)", async () => {
    // Lock the contract documented in decode.ts: "Upsert cache (best-effort —
    // don't block the response on a cache write fail)". If a future refactor
    // makes upsert failures fatal, this test fails.
    const mock = createSupabaseMock([
      { data: null, error: null }, // cache miss
      { data: null, error: { message: "RLS denied" } }, // upsert fails
    ]);
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(NHTSA_HAPPY_RESPONSE), { status: 200 })
    );

    const result = await decodeVin(VALID_VIN);
    expect(result?.make).toBe("HONDA");
  });

  it("falls back to stale cache when NHTSA throws", async () => {
    const staleRow = {
      vin: VALID_VIN,
      year: 2003,
      make: "HONDA",
      model: "Accord",
      trim: "EX V6",
      decoded_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const mock = createSupabaseMock({ data: staleRow, error: null });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));

    const result = await decodeVin(VALID_VIN);
    expect(result?.make).toBe("HONDA");
  });
});
