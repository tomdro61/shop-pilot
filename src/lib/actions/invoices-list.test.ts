/**
 * Keyset paging on the invoices list: getInvoices (first page, counted, with
 * the header total read from the amount column) and loadMoreInvoices (cursor
 * pages, validated input). Name search reads the whole filtered set.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/stripe/create-invoice", () => ({
  createStripeInvoice: vi.fn(),
  createParkingStripeInvoice: vi.fn(),
}));
vi.mock("@/lib/stripe/customer-sync", () => ({
  createStripeCustomer: vi.fn(),
  syncStripeCustomer: vi.fn(),
}));
vi.mock("@/lib/actions/settings", () => ({ getShopSettings: vi.fn() }));
vi.mock("@/lib/actions/messages", () => ({ sendCustomerSMS: vi.fn() }));
vi.mock("@/lib/actions/email", () => ({ sendCustomerEmail: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getInvoices, loadMoreInvoices } from "./invoices";
import { createSupabaseMock, type SupabaseMockResult } from "./__test-helpers__/supabase-mock";

const ID_A = "aaaaaaaa-aaaa-4aaa-9aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-4ccc-9ccc-cccccccccccc";
const T1 = "2026-10-19T20:15:33.112297+00:00";
const T2 = "2026-10-19T20:10:10.157098+00:00";
const T3 = "2026-10-17T17:27:52.230990+00:00";

function invoice(
  id: string,
  created_at: string,
  amount: number,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    created_at,
    amount,
    status: "paid",
    job_id: null,
    parking_reservation_id: null,
    jobs: null,
    parking_reservations: null,
    ...extra,
  };
}

function mockQueue(results: SupabaseMockResult[]) {
  const mock = createSupabaseMock(results);
  vi.mocked(createClient).mockResolvedValue(
    mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getInvoices first page", () => {
  it("counts exactly, sorts by created_at then id descending, reads one past the limit, then totals the amount column", async () => {
    const mock = mockQueue([
      { data: [invoice(ID_A, T1, 100)], error: null, count: 1 },
      { data: [{ amount: 100 }], error: null, count: 1 },
    ]);
    const result = await getInvoices({ status: "paid", source: "jobs" }, { limit: 25 });

    const selects = mock.calls.filter((c) => c.method === "select").map((c) => c.args);
    expect(selects[0]).toEqual([expect.stringContaining("stripe_hosted_invoice_url"), { count: "exact" }]);
    expect(selects[1]).toEqual(["amount", { count: "exact" }]);

    const limitIndex = mock.calls.findIndex((c) => c.method === "limit");
    expect(mock.calls[limitIndex].args).toEqual([26]);
    const before = mock.calls.slice(0, limitIndex);
    expect(before.filter((c) => c.method === "order").map((c) => c.args)).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
    expect(before).toContainEqual({ method: "eq", args: ["status", "paid"] });
    expect(before).toContainEqual({ method: "not", args: ["job_id", "is", null] });
    expect(before.find((c) => c.method === "or")).toBeUndefined();

    const after = mock.calls.slice(limitIndex + 1);
    expect(after).toContainEqual({ method: "eq", args: ["status", "paid"] });
    expect(after).toContainEqual({ method: "not", args: ["job_id", "is", null] });
    expect(after).toContainEqual({ method: "range", args: [0, 999] });

    expect(result.totalCount).toBe(1);
    expect(result.totalAmount).toBe(100);
    expect(result.nextCursor).toBeNull();
  });

  it("returns a cursor pointing at the last row shown when an extra row came back", async () => {
    mockQueue([
      { data: [invoice(ID_A, T1, 10), invoice(ID_B, T2, 20), invoice(ID_C, T3, 30)], error: null, count: 409 },
      { data: [{ amount: 10 }, { amount: 20 }, { amount: 30 }], error: null, count: 3 },
    ]);
    const result = await getInvoices({}, { limit: 2 });

    expect(result.invoices.map((i) => i.id)).toEqual([ID_A, ID_B]);
    expect(result.nextCursor).toEqual({ created_at: T2, id: ID_B });
    expect(result.totalCount).toBe(409);
    expect(result.totalAmount).toBe(60);
  });

  it("fails closed when the page carries no count", async () => {
    mockQueue([{ data: [], error: null }]);
    await expect(getInvoices({}, { limit: 25 })).rejects.toThrow("exact count");
  });

  it("fails closed when the totals read comes back short of its own count", async () => {
    mockQueue([
      { data: [], error: null, count: 0 },
      { data: [{ amount: 1 }], error: null, count: 2 },
    ]);
    await expect(getInvoices({}, { limit: 25 })).rejects.toThrow();
  });
});

describe("getInvoices search", () => {
  it("pages through the whole filtered set and matches job customers and parking lots in memory", async () => {
    const rows = [
      invoice(ID_A, T1, 10, {
        job_id: "j1",
        jobs: { id: "j1", title: "Brakes", customers: { id: "c1", first_name: "Maria", last_name: "Lopez" }, vehicles: null },
      }),
      invoice(ID_B, T2, 20, {
        parking_reservation_id: "p1",
        parking_reservations: { id: "p1", customer_id: null, first_name: "Sam", last_name: "Chen", lot: "Lopez Lot" },
      }),
      invoice(ID_C, T3, 30, {
        job_id: "j2",
        jobs: { id: "j2", title: "Oil", customers: { id: "c2", first_name: "Dan", last_name: "Ortiz" }, vehicles: null },
      }),
    ];
    const mock = mockQueue([{ data: rows, error: null, count: 3 }]);
    const result = await getInvoices({ search: "  LOPEZ " }, { limit: 25 });

    expect(mock.calls).toContainEqual({ method: "range", args: [0, 999] });
    expect(mock.calls.find((c) => c.method === "limit")).toBeUndefined();
    expect(result.invoices.map((i) => i.id)).toEqual([ID_A, ID_B]);
    expect(result.nextCursor).toBeNull();
    expect(result.totalCount).toBe(2);
    expect(result.totalAmount).toBe(30);
  });
});

describe("loadMoreInvoices", () => {
  const CURSOR = { created_at: T2, id: ID_B };

  it("applies the keyset predicate immediately before the limit and keeps the filters", async () => {
    const mock = mockQueue([{ data: [], error: null, count: 0 }]);
    await loadMoreInvoices({ filters: { status: "sent", source: "parking" }, cursor: CURSOR });

    const orIndex = mock.calls.findIndex((c) => c.method === "or");
    expect(orIndex).toBeGreaterThan(-1);
    expect(mock.calls[orIndex].args).toEqual([
      `created_at.lt.${T2},and(created_at.eq.${T2},id.lt.${ID_B})`,
    ]);
    expect(mock.calls[orIndex + 1]).toEqual({ method: "limit", args: [26] });
    expect(mock.calls).toContainEqual({ method: "eq", args: ["status", "sent"] });
    expect(mock.calls).toContainEqual({ method: "not", args: ["parking_reservation_id", "is", null] });
    expect(mock.calls.find((c) => c.method === "range")).toBeUndefined();
  });

  it("returns the next cursor from the last row shown", async () => {
    mockQueue([{ data: Array.from({ length: 26 }, (_, i) => invoice(`${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`, T3, 1)), error: null }]);
    const result = await loadMoreInvoices({ filters: {}, cursor: CURSOR });
    expect(result.invoices).toHaveLength(25);
    expect(result.nextCursor).toEqual({ created_at: T3, id: "00000024-0000-4000-8000-000000000000" });
  });

  it("rejects a cursor that is not a timestamp plus uuid without touching the database", async () => {
    await expect(
      loadMoreInvoices({ filters: {}, cursor: { created_at: "2026-10-19", id: ID_B } }),
    ).rejects.toThrow("Invalid load-more request");
    await expect(
      loadMoreInvoices({ filters: {}, cursor: { created_at: T2, id: "x" } }),
    ).rejects.toThrow("Invalid load-more request");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects a status or source outside the enums", async () => {
    await expect(
      loadMoreInvoices({ filters: { status: "void" as unknown as "paid" }, cursor: CURSOR }),
    ).rejects.toThrow("Invalid load-more request");
    expect(createClient).not.toHaveBeenCalled();
  });
});
