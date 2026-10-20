/**
 * Keyset paging on the jobs list: getJobs (first page, counted),
 * loadMoreJobs (cursor pages, validated input) and loadCalendarJobs (visible
 * range clamp). The cursor clause is asserted immediately before the limit and
 * the sort list is asserted exactly, so deleting either goes red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getJobs, loadCalendarJobs, loadMoreJobs } from "./jobs";
import { createSupabaseMock, type SupabaseMockResult } from "./__test-helpers__/supabase-mock";

const ID_A = "aaaaaaaa-aaaa-4aaa-9aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-4ccc-9ccc-cccccccccccc";

function row(id: string, date_received: string) {
  return { id, date_received, status: "complete", customers: null, vehicles: null, users: null };
}

function mockQueue(results: SupabaseMockResult[]) {
  const mock = createSupabaseMock(results);
  vi.mocked(createClient).mockResolvedValue(
    mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  return mock;
}

function orderArgs(mock: ReturnType<typeof mockQueue>) {
  return mock.calls.filter((c) => c.method === "order").map((c) => c.args);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getJobs first page", () => {
  it("counts exactly, sorts by date then id descending, and reads one row past the limit", async () => {
    const mock = mockQueue([{ data: [], error: null, count: 0 }]);
    await getJobs({}, { limit: 15 });

    expect(mock.calls).toContainEqual({
      method: "select",
      args: [expect.any(String), { count: "exact" }],
    });
    expect(orderArgs(mock)).toEqual([
      ["date_received", { ascending: false }],
      ["id", { ascending: false }],
    ]);
    expect(mock.calls).toContainEqual({ method: "limit", args: [16] });
    expect(mock.calls).toContainEqual({ method: "neq", args: ["status", "cancelled"] });
    expect(mock.calls.find((c) => c.method === "or")).toBeUndefined();
  });

  it("returns a cursor pointing at the last row shown when an extra row came back", async () => {
    mockQueue([
      { data: [row(ID_A, "2026-10-19"), row(ID_B, "2026-10-18"), row(ID_C, "2026-10-17")], error: null, count: 40 },
    ]);
    const result = await getJobs({ status: "complete" }, { limit: 2 });

    expect(result.jobs.map((j) => j.id)).toEqual([ID_A, ID_B]);
    expect(result.nextCursor).toEqual({ date_received: "2026-10-18", id: ID_B });
    expect(result.totalCount).toBe(40);
  });

  it("returns no cursor when the page came back short", async () => {
    mockQueue([{ data: [row(ID_A, "2026-10-19")], error: null, count: 1 }]);
    const result = await getJobs({}, { limit: 2 });
    expect(result.jobs).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("fails closed when the response carries no count", async () => {
    mockQueue([{ data: [], error: null }]);
    await expect(getJobs({}, { limit: 15 })).rejects.toThrow("exact count");
  });

  it("filters a category through the embedded line items inside the one counted query", async () => {
    const mock = mockQueue([{ data: [], error: null, count: 0 }]);
    await getJobs({ category: "Brakes" }, { limit: 15 });

    expect(mock.calls.filter((c) => c.method === "from")).toEqual([{ method: "from", args: ["jobs"] }]);
    const select = mock.calls[1].args[0] as string;
    expect(select).toContain("category_match:job_line_items(category)");
    // The per-job total must sum every line, so the filter targets the alias,
    // never the unaliased embed.
    expect(select).toContain("job_line_items(total)");
    expect(mock.calls).toContainEqual({ method: "eq", args: ["category_match.category", "Brakes"] });
    expect(mock.calls).toContainEqual({ method: "not", args: ["category_match", "is", null] });
    expect(mock.calls.find((c) => c.method === "eq" && c.args[0] === "job_line_items.category")).toBeUndefined();
  });

  it("drops the filter-only embed from the rows it returns", async () => {
    mockQueue([
      { data: [{ ...row(ID_A, "2026-10-19"), category_match: [{ category: "Brakes" }] }], error: null, count: 1 },
    ]);
    const result = await getJobs({ category: "Brakes" }, { limit: 15 });
    expect(result.jobs[0]).not.toHaveProperty("category_match");
    expect(result.jobs[0].id).toBe(ID_A);
  });

  it("returns no cursor when exactly the limit came back", async () => {
    mockQueue([{ data: [row(ID_A, "2026-10-19"), row(ID_B, "2026-10-18")], error: null, count: 2 }]);
    const result = await getJobs({}, { limit: 2 });
    expect(result.jobs).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });
});

describe("loadMoreJobs", () => {
  const CURSOR = { date_received: "2026-10-18", id: ID_B };

  it("applies the keyset predicate immediately before the limit and skips the count", async () => {
    const mock = mockQueue([{ data: [], error: null }]);
    await loadMoreJobs({ filters: { status: "complete" }, cursor: CURSOR, limit: 15 });

    const orIndex = mock.calls.findIndex((c) => c.method === "or");
    expect(orIndex).toBeGreaterThan(-1);
    expect(mock.calls[orIndex].args).toEqual([
      `date_received.lt.2026-10-18,and(date_received.eq.2026-10-18,id.lt.${ID_B})`,
    ]);
    expect(mock.calls[orIndex + 1]).toEqual({ method: "limit", args: [16] });
    expect(mock.calls).toContainEqual({ method: "eq", args: ["status", "complete"] });
    expect(mock.calls).toContainEqual({
      method: "select",
      args: [expect.any(String), { count: undefined }],
    });
  });

  it("applies the payment-status filter the client re-sends", async () => {
    const mock = mockQueue([{ data: [], error: null }]);
    await loadMoreJobs({ filters: { paymentStatus: "unpaid" }, cursor: CURSOR, limit: 25 });
    expect(mock.calls).toContainEqual({ method: "eq", args: ["payment_status", "unpaid"] });
  });

  it("keeps the search clause and the cursor clause as separate filters", async () => {
    const mock = mockQueue([
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]);
    await loadMoreJobs({ filters: { search: "honda" }, cursor: CURSOR, limit: 25 });

    // The customer and vehicle name lookups each call .or() first; the jobs
    // query's search clause and cursor clause are the last two.
    const ors = mock.calls.filter((c) => c.method === "or").map((c) => c.args[0]);
    expect(ors.slice(-2)).toEqual([
      "title.ilike.%honda%,notes.ilike.%honda%",
      `date_received.lt.2026-10-18,and(date_received.eq.2026-10-18,id.lt.${ID_B})`,
    ]);
  });

  it("returns the next cursor from the last row shown", async () => {
    mockQueue([
      { data: [row(ID_A, "2026-10-17"), row(ID_C, "2026-10-16")], error: null },
    ]);
    const result = await loadMoreJobs({ filters: {}, cursor: CURSOR, limit: 1 });
    expect(result.jobs.map((j) => j.id)).toEqual([ID_A]);
    expect(result.nextCursor).toEqual({ date_received: "2026-10-17", id: ID_A });
  });

  it("rejects a cursor whose date is not a plain ISO date without touching the database", async () => {
    await expect(
      loadMoreJobs({
        filters: {},
        cursor: { date_received: "2026-10-18,id.gt.0", id: ID_B },
        limit: 15,
      }),
    ).rejects.toThrow("Invalid load-more request");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects a cursor whose id is not a uuid", async () => {
    await expect(
      loadMoreJobs({ filters: {}, cursor: { date_received: "2026-10-18", id: "not-a-uuid" }, limit: 15 }),
    ).rejects.toThrow("Invalid load-more request");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects a limit outside 1..200", async () => {
    await expect(loadMoreJobs({ filters: {}, cursor: CURSOR, limit: 0 })).rejects.toThrow();
    await expect(loadMoreJobs({ filters: {}, cursor: CURSOR, limit: 201 })).rejects.toThrow();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects a status outside the enum", async () => {
    await expect(
      loadMoreJobs({
        filters: { status: "paid" as unknown as "complete" },
        cursor: CURSOR,
        limit: 15,
      }),
    ).rejects.toThrow("Invalid load-more request");
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("loadCalendarJobs", () => {
  it("intersects the visible range with the user's date filter and reads one past the cap", async () => {
    const mock = mockQueue([{ data: [], error: null, count: 0 }]);
    await loadCalendarJobs({
      filters: { dateFrom: "2026-10-10", dateTo: "2026-12-31" },
      range: { from: "2026-09-27", to: "2026-11-07" },
    });

    expect(mock.calls).toContainEqual({ method: "gte", args: ["date_received", "2026-10-10"] });
    expect(mock.calls).toContainEqual({ method: "lte", args: ["date_received", "2026-11-07"] });
    expect(mock.calls).toContainEqual({ method: "limit", args: [501] });
  });

  it("reports truncation when the range holds more jobs than the cap", async () => {
    const rows = Array.from({ length: 501 }, (_, i) =>
      row(`${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`, "2026-10-01"),
    );
    mockQueue([{ data: rows, error: null, count: 501 }]);
    const result = await loadCalendarJobs({
      filters: {},
      range: { from: "2026-09-27", to: "2026-11-07" },
    });
    expect(result.jobs).toHaveLength(500);
    expect(result.truncated).toBe(true);
  });

  it("rejects a malformed range without touching the database", async () => {
    await expect(
      loadCalendarJobs({ filters: {}, range: { from: "last month", to: "2026-11-07" } }),
    ).rejects.toThrow("Invalid calendar request");
    expect(createClient).not.toHaveBeenCalled();
  });
});
