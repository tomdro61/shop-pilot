import { describe, it, expect, vi } from "vitest";
import { fetchAllRows } from "./fetch-all-rows";

type Row = { id: number };

/**
 * A fake PostgREST that serves `total` rows and clamps every page to `cap` —
 * the clamp being the behavior the helper exists to survive. `count` rides
 * along the way the real Content-Range header does.
 */
function fakeServer(total: number, cap = 1000, { withCount = true } = {}) {
  const calls: Array<[number, number]> = [];
  const page = (from: number, to: number) => {
    calls.push([from, to]);
    const size = Math.min(to - from + 1, cap);
    const rows: Row[] = [];
    for (let i = from; i < Math.min(from + size, total); i++) rows.push({ id: i });
    return Promise.resolve({ data: rows, error: null, count: withCount ? total : null });
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
  // again and get a short page before it stops.
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
    const page = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" }, count: null });
    await expect(fetchAllRows(page, "receivables", 1000)).rejects.toThrow(
      "Failed to load receivables: boom"
    );
  });

  // THE regression this helper is most likely to suffer: someone lowers the
  // project's api.max_rows below pageSize (a dashboard setting, invisible to
  // this repo). Every page comes back short, and without the count check the
  // helper would report a truncated set as complete — the exact bug class it
  // was written to kill.
  it("fails loudly when the server cap is below the requested page size", async () => {
    const { page } = fakeServer(2305, 500);
    await expect(fetchAllRows(page, "jobs", 1000)).rejects.toThrow(/server row cap/);
  });

  it("throws when the caller omits { count: \"exact\" }", async () => {
    const { page } = fakeServer(12, 1000, { withCount: false });
    await expect(fetchAllRows(page, "jobs", 1000)).rejects.toThrow(
      /requires \{ count: "exact" \}/
    );
  });

  // assertComplete rejects a null body as a head query; this must agree rather
  // than quietly returning a short set from mid-pagination.
  it("throws on a null body rather than treating it as the end of the data", async () => {
    const page = vi.fn().mockResolvedValue({ data: null, error: null, count: 5 });
    await expect(fetchAllRows(page, "x", 1000)).rejects.toThrow(/empty body/);
    expect(page).toHaveBeenCalledTimes(1);
  });

  // A caller that forgets its filter must not page an entire table into memory.
  it("refuses to page beyond the runaway ceiling", async () => {
    const { page } = fakeServer(500_000);
    await expect(fetchAllRows(page, "jobs", 1000)).rejects.toThrow(/refusing to page beyond/);
  });
});
