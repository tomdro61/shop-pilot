import { describe, it, expect, vi } from "vitest";
import { fetchAllRows } from "./fetch-all-rows";

type Row = { id: number };

/** A fake PostgREST that serves `total` rows and clamps every page to `cap`. */
function fakeServer(total: number, cap = 1000) {
  const calls: Array<[number, number]> = [];
  const page = (from: number, to: number) => {
    calls.push([from, to]);
    const size = Math.min(to - from + 1, cap);
    const rows: Row[] = [];
    for (let i = from; i < Math.min(from + size, total); i++) rows.push({ id: i });
    return Promise.resolve({ data: rows, error: null });
  };
  return { page, calls };
}

describe("fetchAllRows", () => {
  it("returns everything when the set fits in one page", async () => {
    const { page, calls } = fakeServer(12);
    expect(await fetchAllRows(page, "x", 1000)).toHaveLength(12);
    expect(calls).toHaveLength(1);
  });

  // The case the whole helper exists for: more rows than one response can carry.
  it("pages past the row cap and returns every row exactly once", async () => {
    const { page, calls } = fakeServer(2305);
    const rows = await fetchAllRows<Row>(page, "x", 1000);
    expect(rows).toHaveLength(2305);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2305);
    expect(rows[0].id).toBe(0);
    expect(rows[2304].id).toBe(2304);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  // A full final page can't be assumed to be the last one — the helper must ask
  // again and get an empty page before it stops.
  it("makes one extra request when the total is an exact multiple of the page size", async () => {
    const { page, calls } = fakeServer(2000);
    expect(await fetchAllRows(page, "x", 1000)).toHaveLength(2000);
    expect(calls).toHaveLength(3);
  });

  it("returns an empty array when there are no rows", async () => {
    const { page } = fakeServer(0);
    expect(await fetchAllRows(page, "x", 1000)).toEqual([]);
  });

  it("throws on a query error instead of returning a short set", async () => {
    const page = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(fetchAllRows(page, "receivables", 1000)).rejects.toThrow(
      "Failed to load receivables: boom"
    );
  });

  it("stops on a null body rather than looping forever", async () => {
    const page = vi.fn().mockResolvedValue({ data: null, error: null });
    expect(await fetchAllRows(page, "x", 1000)).toEqual([]);
    expect(page).toHaveBeenCalledTimes(1);
  });

  // A caller that forgets its filter must not page an entire table into memory.
  it("refuses to page beyond the runaway ceiling", async () => {
    const { page } = fakeServer(500_000);
    await expect(fetchAllRows(page, "jobs", 1000)).rejects.toThrow(/refusing to page beyond/);
  });
});
