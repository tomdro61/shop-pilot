/**
 * "This date has no row yet" and "the read failed" must not produce the same
 * value. They used to: both returned null, the form rendered an editable 0/0,
 * and the next Save upserted those zeros over the real counts for that date.
 *
 * These pin the three observable outcomes, the lookup predicate, the selected
 * columns, and the terminal method — dropping any one restores that bug.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getInspectionCounts, upsertInspectionCounts } from "./inspections";
import { createSupabaseMock, type SupabaseMockResult } from "./__test-helpers__/supabase-mock";

const DATE = "2026-08-14";
const TABLE = "daily_inspection_counts";

function mockDb(result: SupabaseMockResult | SupabaseMockResult[]) {
  const mock = createSupabaseMock(result);
  vi.mocked(createClient).mockResolvedValue(
    mock.client as unknown as Awaited<ReturnType<typeof createClient>>
  );
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getInspectionCounts", () => {
  it("returns the stored counts for a date that has a row", async () => {
    mockDb({ data: { state_count: 26, tnc_count: 11 }, error: null });
    await expect(getInspectionCounts(DATE)).resolves.toEqual({
      state_count: 26,
      tnc_count: 11,
    });
  });

  it("returns null — not zeros — for a date with no row yet", async () => {
    mockDb({ data: null, error: null });
    await expect(getInspectionCounts(DATE)).resolves.toBeNull();
  });

  it("throws when the read fails, so a failure cannot render as 0/0", async () => {
    mockDb({ data: null, error: { message: "statement timeout" } });
    await expect(getInspectionCounts(DATE)).rejects.toThrow(/statement timeout/);
  });

  it("names the date in the failure so the thrown error identifies what was lost", async () => {
    mockDb({ data: null, error: { message: "boom" } });
    await expect(getInspectionCounts(DATE)).rejects.toThrow(DATE);
  });

  it("reads from the inspection-counts table", async () => {
    const mock = mockDb({ data: null, error: null });
    await getInspectionCounts(DATE);
    expect(mock.calls).toContainEqual({ method: "from", args: [TABLE] });
  });

  // Pin the lookup predicate, not just the outcome. Without .eq("date", date)
  // this matches the whole table; maybeSingle() on a GET then synthesises
  // PGRST116 for >1 row (postgrest-js PostgrestBuilder.ts:162-174), so the read
  // throws for any populated table and silently returns the wrong date's counts
  // when exactly one row exists.
  it("looks the row up by the requested date", async () => {
    const mock = mockDb({ data: null, error: null });
    await getInspectionCounts(DATE);
    expect(mock.calls).toContainEqual({ method: "eq", args: ["date", DATE] });
  });

  // maybeSingle and single differ exactly where it matters: on zero rows
  // maybeSingle yields null, single yields a PGRST116 error. Swapping them
  // would make every not-yet-entered day hit the error panel and block the
  // shop from recording counts at all — and the mock resolves both identically,
  // so only the method name can catch it.
  it("terminates in maybeSingle, so a date with no row is null and not an error", async () => {
    const mock = mockDb({ data: null, error: null });
    await getInspectionCounts(DATE);
    expect(mock.calls).toContainEqual({ method: "maybeSingle", args: [] });
    expect(mock.calls).not.toContainEqual({ method: "single", args: [] });
  });

  // Backstop for the return-type annotation: if that is ever loosened, a column
  // dropped from the select comes back undefined, renders 0, and is saved as 0
  // over the real value.
  it("selects both counts", async () => {
    const mock = mockDb({ data: null, error: null });
    await getInspectionCounts(DATE);
    const select = mock.calls.find((c) => c.method === "select");
    expect(select?.args[0]).toBe("state_count, tnc_count");
  });
});

describe("upsertInspectionCounts", () => {
  it("writes both counts against the requested date", async () => {
    const mock = mockDb({ data: null, error: null });
    await upsertInspectionCounts(DATE, 26, 11);
    expect(mock.calls).toContainEqual({ method: "from", args: [TABLE] });
    const upsert = mock.calls.find((c) => c.method === "upsert");
    expect(upsert?.args[0]).toMatchObject({ date: DATE, state_count: 26, tnc_count: 11 });
    expect(upsert?.args[1]).toEqual({ onConflict: "date" });
  });

  it("throws when the write fails rather than reporting success", async () => {
    mockDb({ data: null, error: { message: "permission denied" } });
    await expect(upsertInspectionCounts(DATE, 26, 11)).rejects.toThrow(/permission denied/);
  });

  it("names the date and the counts in the failure", async () => {
    mockDb({ data: null, error: { message: "boom" } });
    await expect(upsertInspectionCounts(DATE, 26, 11)).rejects.toThrow(`${DATE} (26/11)`);
  });

  it("revalidates the page so the dashboard KPI does not serve a stale cache", async () => {
    mockDb({ data: null, error: null });
    await upsertInspectionCounts(DATE, 26, 11);
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/inspections");
  });

  it("does not revalidate when the write failed", async () => {
    mockDb({ data: null, error: { message: "denied" } });
    await expect(upsertInspectionCounts(DATE, 26, 11)).rejects.toThrow();
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
  });
});
