import { describe, it, expect } from "vitest";
import { assertComplete } from "./assert-complete";

type Row = { id: string };
const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: String(i) }));

// The parameter type forbids some of the runtime shapes below (a head:true
// query really does return data:null with error:null). Cast at the boundary so
// the runtime contract stays pinned.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (result: unknown) => assertComplete(result as any, "completed jobs");

describe("assertComplete", () => {
  it("throws when the row set came back short of the count", () => {
    expect(() => call({ data: rows(1000), error: null, count: 1002 })).toThrow(
      /completed jobs: query truncated — got 1000 of 1002 rows/
    );
  });

  it("returns the rows when the count matches", () => {
    const data = rows(5);
    expect(call({ data, error: null, count: 5 })).toBe(data);
  });

  // The load-bearing case. count is null exactly when the caller forgot
  // `{ count: "exact" }` — the one mistake this guard exists to catch. It
  // cannot be caught at compile time: supabase-js erases the count option from
  // the result type, so a counted and an uncounted select are the same type.
  // Fail closed, or the guard reads as protection while doing nothing.
  it("throws when count is null (caller forgot { count: \"exact\" })", () => {
    expect(() => call({ data: rows(1000), error: null, count: null })).toThrow(
      /requires \{ count: "exact" \} on the select/
    );
  });

  it("reports the query error, not truncation, when both would apply", () => {
    expect(() => call({ data: null, error: { message: "boom" }, count: null })).toThrow(
      "Failed to load completed jobs: boom"
    );
  });

  // An empty shop / new install. A naive `if (!data.length) throw` would break
  // this, and a naive `if (!data) throw` would break it under the old `?? []`.
  it("returns an empty array for a legitimately empty result", () => {
    expect(call({ data: [], error: null, count: 0 })).toEqual([]);
  });

  it("rejects a head:true count query rather than reading it as truncated", () => {
    expect(() => call({ data: null, error: null, count: 42 })).toThrow(
      /expected a row set, got an empty body/
    );
  });

  // Documents that this is a floor check, not an equality assertion — a count
  // lagging the row set is not the failure mode being guarded against.
  it("does not throw when more rows arrive than the count reported", () => {
    expect(call({ data: rows(5), error: null, count: 3 })).toHaveLength(5);
  });
});
