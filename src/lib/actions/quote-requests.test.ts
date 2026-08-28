/**
 * Server-action tests for src/lib/actions/quote-requests.ts. Focused on the
 * status flip, which is what takes a lead off the New list — a flip that
 * reports success without landing means the quote gets worked twice.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { updateQuoteRequestStatus } from "./quote-requests";
import { createSupabaseMock } from "./__test-helpers__/supabase-mock";

const QUOTE_A = "55555555-5555-4555-9555-555555555555";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireManager).mockResolvedValue({ ok: true, userId: "u1" });
});

function mockClient(result: Parameters<typeof createSupabaseMock>[0]) {
  const mock = createSupabaseMock(result);
  vi.mocked(createClient).mockResolvedValue(
    mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  return mock;
}

describe("updateQuoteRequestStatus", () => {
  it("flips the status and stamps updated_at", async () => {
    const mock = mockClient({ error: null, count: 1 });

    const result = await updateQuoteRequestStatus(QUOTE_A, "converted");

    expect(result).toEqual({ success: true });
    const update = mock.calls.find((c) => c.method === "update");
    const payload = update?.args[0] as { status: string; updated_at: string };
    expect(payload.status).toBe("converted");
    expect(new Date(payload.updated_at).getTime()).not.toBeNaN();
    expect(mock.calls).toContainEqual({ method: "eq", args: ["id", QUOTE_A] });
  });

  it("asks for an exact count, without which a zero-row update reads as success", async () => {
    const mock = mockClient({ error: null, count: 1 });

    await updateQuoteRequestStatus(QUOTE_A, "converted");

    const update = mock.calls.find((c) => c.method === "update");
    expect(update?.args[1]).toEqual({ count: "exact" });
  });

  it("reports a miss when the row is gone rather than claiming success", async () => {
    // PostgREST returns error: null for an UPDATE matching zero rows, so this
    // is the only signal that a deleted quote never actually flipped.
    mockClient({ error: null, count: 0 });

    const result = await updateQuoteRequestStatus(QUOTE_A, "converted");

    expect(result).toEqual({
      error: "That quote request no longer exists — it may have been deleted.",
    });
  });

  it("treats a null count as a miss too", async () => {
    mockClient({ error: null, count: null });

    const result = await updateQuoteRequestStatus(QUOTE_A, "converted");

    expect(result).toMatchObject({ error: expect.stringContaining("no longer exists") });
  });

  it("surfaces a query error", async () => {
    mockClient({ error: { message: "connection reset" }, count: null });

    const result = await updateQuoteRequestStatus(QUOTE_A, "converted");

    expect(result).toEqual({ error: "connection reset" });
  });

  it("refuses a non-manager without issuing a write", async () => {
    vi.mocked(requireManager).mockResolvedValue({ ok: false, error: "Unauthorized" });
    const mock = mockClient({ error: null, count: 1 });

    const result = await updateQuoteRequestStatus(QUOTE_A, "converted");

    expect(result).toEqual({ error: "Unauthorized" });
    expect(mock.calls.find((c) => c.method === "update")).toBeUndefined();
  });
});
