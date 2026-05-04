/**
 * Server-action tests for src/lib/actions/estimates.ts. Focused on guards
 * that protect money / data integrity — not exhaustive CRUD coverage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/settings", () => ({ getShopSettings: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import {
  updateEstimateLineItem,
  deleteEstimateLineItem,
} from "./estimates";
import { createSupabaseMock } from "./__test-helpers__/supabase-mock";

// Valid UUID v4 format — Zod's .uuid() validator requires the version
// nibble (third group's first char) to be 1-5 and the variant bits to be
// 8/9/a/b in the fourth group.
const ESTIMATE_A = "11111111-1111-4111-9111-111111111111";
const ESTIMATE_B = "22222222-2222-4222-9222-222222222222";
const LINE_ITEM_X = "aaaaaaaa-aaaa-4aaa-9aaa-aaaaaaaaaaaa";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireManager).mockResolvedValue({ ok: true, userId: "u1" });
});

describe("updateEstimateLineItem ownership guard (C-1)", () => {
  it("scopes the update by both id and estimate_id so a foreign line-item id can't be hijacked", async () => {
    // First query (status check on ESTIMATE_A) returns draft.
    // Second query (the update) finds no row — because the line-item
    // doesn't actually belong to ESTIMATE_A.
    const draftLookup = createSupabaseMock({ data: { id: ESTIMATE_A, status: "draft" }, error: null });
    const updateNoMatch = createSupabaseMock({ data: null, error: null });
    vi.mocked(createClient)
      // The action only awaits createClient once; both queries run on the same client.
      .mockResolvedValueOnce(draftLookup.client as unknown as Awaited<ReturnType<typeof createClient>>);
    // Re-use the same builder for both queries by combining call lists.
    // Simpler approach: mock createClient once, but since the client is the
    // same instance, both stages chain through the same builder. We need
    // the .single()/.maybeSingle() to return different values per call.
    let single = 0;
    draftLookup.builder.single = vi.fn(() => {
      single += 1;
      return Promise.resolve(
        single === 1 ? { data: { id: ESTIMATE_A, status: "draft" }, error: null } : { data: null, error: null }
      );
    });
    draftLookup.builder.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: null, error: null })
    );

    const result = await updateEstimateLineItem(LINE_ITEM_X, {
      estimate_id: ESTIMATE_A,
      type: "labor",
      description: "Brake job",
      quantity: 1,
      unit_cost: 100,
      part_number: "",
    });

    expect(result).toEqual({ error: "Line item not found on this estimate" });
    // Critical: the update query filtered by BOTH id AND estimate_id.
    expect(draftLookup.calls).toContainEqual({ method: "eq", args: ["id", LINE_ITEM_X] });
    expect(draftLookup.calls).toContainEqual({ method: "eq", args: ["estimate_id", ESTIMATE_A] });
  });

  it("blocks updates to non-draft estimates", async () => {
    const sentEstimate = createSupabaseMock({ data: { id: ESTIMATE_A, status: "sent" }, error: null });
    vi.mocked(createClient).mockResolvedValueOnce(
      sentEstimate.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await updateEstimateLineItem(LINE_ITEM_X, {
      estimate_id: ESTIMATE_A,
      type: "labor",
      description: "Brake job",
      quantity: 1,
      unit_cost: 100,
      part_number: "",
    });

    expect(result).toEqual({ error: "Can only edit items on draft estimates" });
    // Update should never have been issued.
    expect(sentEstimate.calls.find((c) => c.method === "update")).toBeUndefined();
  });
});

describe("deleteEstimateLineItem ownership guard (C-2)", () => {
  it("scopes the delete by both id and estimate_id and returns 'not found' when the line item belongs to a different estimate", async () => {
    // Status check passes (ESTIMATE_B is draft); delete affects 0 rows
    // because the supplied line-item id belongs to a different estimate.
    const mock = createSupabaseMock({ data: { id: ESTIMATE_B, status: "draft" }, error: null });
    let stage = 0;
    mock.builder.single = vi.fn(() => {
      stage += 1;
      // First call: status check. Subsequent calls won't be made on delete path
      // (delete uses the awaited builder thenable, not .single()).
      return Promise.resolve({ data: { id: ESTIMATE_B, status: "draft" }, error: null });
    });
    // Make the delete's awaited result have count: 0 (no row matched both filters).
    mock.builder.then = (
      resolve: (value: { data: null; error: null; count: number }) => unknown,
    ): unknown => resolve({ data: null, error: null, count: 0 });
    vi.mocked(createClient).mockResolvedValueOnce(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await deleteEstimateLineItem(LINE_ITEM_X, ESTIMATE_B);

    expect(result).toEqual({ error: "Line item not found on this estimate" });
    expect(mock.calls).toContainEqual({ method: "eq", args: ["id", LINE_ITEM_X] });
    expect(mock.calls).toContainEqual({ method: "eq", args: ["estimate_id", ESTIMATE_B] });
    // Sanity: delete WAS attempted (with the dual filter), it just affected zero rows.
    expect(mock.calls.find((c) => c.method === "delete")).toBeDefined();
  });

  it("blocks deletes on non-draft estimates without issuing a delete query", async () => {
    const approved = createSupabaseMock({ data: { id: ESTIMATE_A, status: "approved" }, error: null });
    vi.mocked(createClient).mockResolvedValueOnce(
      approved.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await deleteEstimateLineItem(LINE_ITEM_X, ESTIMATE_A);

    expect(result).toEqual({ error: "Can only delete items from draft estimates" });
    expect(approved.calls.find((c) => c.method === "delete")).toBeUndefined();
  });
});
