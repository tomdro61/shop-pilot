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
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import {
  updateEstimateLineItem,
  deleteEstimateLineItem,
  markEstimateDeclined,
  approveEstimate,
  markEstimateApproved,
} from "./estimates";
import { createSupabaseMock } from "./__test-helpers__/supabase-mock";
import type { SupabaseMockResult } from "./__test-helpers__/supabase-mock";

// Valid UUID v4 format — Zod's .uuid() validator requires the version
// nibble (third group's first char) to be 1-5 and the variant bits to be
// 8/9/a/b in the fourth group.
const ESTIMATE_A = "11111111-1111-4111-9111-111111111111";
const ESTIMATE_B = "22222222-2222-4222-9222-222222222222";
const LINE_ITEM_X = "aaaaaaaa-aaaa-4aaa-9aaa-aaaaaaaaaaaa";
const JOB_A = "33333333-3333-4333-9333-333333333333";
const CUSTOMER_A = "44444444-4444-4444-9444-444444444444";
const TOKEN = "approval-token-abc";

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

describe("markEstimateDeclined status guard", () => {
  it("flips a sent estimate to declined and stamps declined_at", async () => {
    const sent = createSupabaseMock({ data: { id: ESTIMATE_A, status: "sent", customer_id: null, job_id: null }, error: null });
    vi.mocked(createClient).mockResolvedValueOnce(
      sent.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await markEstimateDeclined(ESTIMATE_A);

    expect(result).toEqual({ success: true });
    // Sanity: an UPDATE was issued.
    const updateCall = sent.calls.find((c) => c.method === "update");
    expect(updateCall).toBeDefined();
    const updatePayload = updateCall?.args[0] as { status: string; declined_at: string };
    expect(updatePayload.status).toBe("declined");
    // Tighter than typeof string — confirm it parses as a valid date so a
    // future regression that passes a Date object or empty string fails.
    expect(new Date(updatePayload.declined_at).getTime()).not.toBeNaN();
  });

  it("blocks re-declining an already-declined estimate (idempotency)", async () => {
    const declined = createSupabaseMock({ data: { id: ESTIMATE_A, status: "declined" }, error: null });
    vi.mocked(createClient).mockResolvedValueOnce(
      declined.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await markEstimateDeclined(ESTIMATE_A);

    expect(result).toEqual({ error: "Only sent estimates can be marked declined" });
    expect(declined.calls.find((c) => c.method === "update")).toBeUndefined();
  });

  it("blocks marking a draft estimate declined (delete it instead)", async () => {
    const draft = createSupabaseMock({ data: { id: ESTIMATE_A, status: "draft" }, error: null });
    vi.mocked(createClient).mockResolvedValueOnce(
      draft.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await markEstimateDeclined(ESTIMATE_A);

    expect(result).toEqual({ error: "Only sent estimates can be marked declined" });
    expect(draft.calls.find((c) => c.method === "update")).toBeUndefined();
  });

  it("blocks marking an approved estimate declined", async () => {
    const approved = createSupabaseMock({ data: { id: ESTIMATE_A, status: "approved" }, error: null });
    vi.mocked(createClient).mockResolvedValueOnce(
      approved.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await markEstimateDeclined(ESTIMATE_A);

    expect(result).toEqual({ error: "Only sent estimates can be marked declined" });
    expect(approved.calls.find((c) => c.method === "update")).toBeUndefined();
  });
});

/**
 * A job created before its estimate was priced stayed empty: nothing copied
 * estimate_line_items across, and convertEstimateToJob refuses once job_id is
 * set. Approval now copies them — but only into a job with no line items of its
 * own, no invoice, and not settled or cancelled.
 */
const LINE_ITEMS = [
  {
    type: "labor",
    description: "Front brake pads",
    quantity: 2,
    unit_cost: 120,
    cost: 99,
    part_number: null,
    category: "Brakes",
  },
  {
    type: "part",
    description: "Rotor",
    quantity: 1,
    unit_cost: 80,
    cost: 45,
    part_number: "R-1234",
    category: "Brakes",
  },
];

const ESTIMATE_ROW = {
  id: ESTIMATE_A,
  status: "sent",
  customer_id: CUSTOMER_A,
  job_id: JOB_A,
  estimate_line_items: LINE_ITEMS,
};

const OPEN_JOB = { id: JOB_A, payment_status: "unpaid", status: "in_progress" };

/** Queue tail for the sync helper: job -> invoice probe -> items probe -> insert. */
function syncQueue(
  job: unknown = OPEN_JOB,
  invoice: unknown = null,
  items: unknown = [],
  insert: SupabaseMockResult = { error: null },
): SupabaseMockResult[] {
  return [
    { data: job, error: null },
    { data: invoice, error: null },
    { data: items, error: null },
    insert,
  ];
}

function insertIndex(calls: Array<{ method: string; args: unknown[] }>) {
  return calls.findIndex((c) => c.method === "insert");
}

type Call = { method: string; args: unknown[] };

/**
 * The compare-and-set is only safe if the UPDATE identifies its row AND pins the
 * status AND asks for a count. Dropping .eq("id") turns it into a shop-wide
 * "approve everything sent"; dropping count:"exact" makes count null, so every
 * approval reports the race error.
 */
function expectGuardedUpdate(calls: Call[], id: string, status: string) {
  const updateIdx = calls.findIndex((c) => c.method === "update");
  expect(updateIdx).toBeGreaterThan(-1);
  expect(calls[updateIdx].args[1]).toEqual({ count: "exact" });

  const predicates = calls.slice(updateIdx);
  expect(predicates).toContainEqual({ method: "eq", args: ["id", id] });
  expect(predicates).toContainEqual({ method: "eq", args: ["status", status] });
  // The predicate must be attached to the UPDATE, not the read above it.
  expect(calls.slice(0, updateIdx)).not.toContainEqual({
    method: "eq",
    args: ["status", status],
  });
}

/** The line items have to be selected, or the copy silently becomes a no-op. */
function expectLineItemsSelected(calls: Call[]) {
  const select = calls.find((c) => c.method === "select");
  expect(select?.args[0]).toContain("estimate_line_items(*)");
}

describe("approveEstimate -> linked job line-item sync", () => {
  function mockAdmin(results: Parameters<typeof createSupabaseMock>[0]) {
    const mock = createSupabaseMock(results);
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );
    return mock;
  }

  const approved = [{ data: ESTIMATE_ROW, error: null }, { error: null, count: 1 }];

  it("copies the approved line items onto an empty linked job", async () => {
    const mock = mockAdmin([...approved, ...syncQueue()]);

    const result = await approveEstimate(TOKEN);

    expect(result).toEqual({ data: { success: true } });

    const idx = insertIndex(mock.calls);
    expect(idx).toBeGreaterThan(-1);
    // The insert must target job_line_items — a regression writing back to
    // estimate_line_items would otherwise keep this test green.
    expect(mock.calls[idx - 1]).toEqual({ method: "from", args: ["job_line_items"] });

    // Full equality, not toMatchObject: a mapping bug on any single field
    // (e.g. quantity sourced from unit_cost) must fail here.
    expect(mock.calls[idx].args[0]).toEqual([
      {
        job_id: JOB_A,
        type: "labor",
        description: "Front brake pads",
        quantity: 2,
        unit_cost: 120,
        cost: null, // labor never carries a cost basis, even when the estimate row did
        part_number: null,
        category: "Brakes",
      },
      {
        job_id: JOB_A,
        type: "part",
        description: "Rotor",
        quantity: 1,
        unit_cost: 80,
        cost: 45,
        part_number: "R-1234",
        category: "Brakes",
      },
    ]);
  });

  it("revalidates the Shop Floor list, which totals job_line_items per job", async () => {
    mockAdmin([...approved, ...syncQueue()]);

    await approveEstimate(TOKEN);

    // getJobs() sums job_line_items for the /jobs list, so populating a job
    // without this leaves a stale total on the board.
    expect(revalidatePath).toHaveBeenCalledWith("/jobs");
    expect(revalidatePath).toHaveBeenCalledWith(`/jobs/${JOB_A}`);
  });

  it("guards the UPDATE by row id, status, and an exact count", async () => {
    const mock = mockAdmin([...approved, ...syncQueue()]);

    await approveEstimate(TOKEN);

    expectGuardedUpdate(mock.calls, ESTIMATE_A, "sent");
  });

  it("selects the line items it intends to copy", async () => {
    const mock = mockAdmin([...approved, ...syncQueue()]);

    await approveEstimate(TOKEN);

    expectLineItemsSelected(mock.calls);
  });

  it("scopes the empty-job probe to this job", async () => {
    const mock = mockAdmin([...approved, ...syncQueue()]);

    await approveEstimate(TOKEN);

    // Scoped to the probe's own chain: the invoice probe also filters on
    // job_id, so a range-wide assertion passes even with this one dropped.
    // Unscoped, .limit(1) returns a row from any job, every job reads as
    // non-empty, and the copy silently never happens.
    const probeIdx = mock.calls.findIndex(
      (c) => c.method === "from" && c.args[0] === "job_line_items",
    );
    const insertIdx = insertIndex(mock.calls);
    expect(probeIdx).toBeGreaterThan(-1);
    expect(mock.calls.slice(probeIdx, insertIdx - 1)).toContainEqual({
      method: "eq",
      args: ["job_id", JOB_A],
    });
  });

  it("reports a failed race re-read instead of swallowing it", async () => {
    const mock = mockAdmin([
      { data: ESTIMATE_ROW, error: null },
      { error: null, count: 0 },
      { data: null, error: { message: "reread failed" } },
    ]);

    const result = await approveEstimate(TOKEN);

    expect(result).toEqual({
      error: "This estimate is no longer available to approve. Please call the shop.",
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "reread failed" }),
      expect.objectContaining({
        tags: { source: "approve-estimate", path: "race-reread" },
      }),
    );
    expect(insertIndex(mock.calls)).toBe(-1);
  });

  it("treats a null count as a failed flip, not a success", async () => {
    // The documented reason the check is !== 1 rather than === 0.
    const mock = mockAdmin([
      { data: ESTIMATE_ROW, error: null },
      { error: null, count: null },
      { data: { status: "sent" }, error: null },
    ]);

    const result = await approveEstimate(TOKEN);

    expect(result).toEqual({
      error: "This estimate is no longer available to approve. Please call the shop.",
    });
    expect(insertIndex(mock.calls)).toBe(-1);
  });

  it("reports success for an already-approved estimate instead of a false failure", async () => {
    // The approval page doesn't poll: a tab left open while the manager marks it
    // approved still shows a live button.
    const mock = mockAdmin([
      { data: { ...ESTIMATE_ROW, status: "approved" }, error: null },
    ]);

    const result = await approveEstimate(TOKEN);

    expect(result).toEqual({ data: { success: true } });
    expect(mock.calls.find((c) => c.method === "update")).toBeUndefined();
  });

  it("refuses a declined estimate with the friendly message", async () => {
    const mock = mockAdmin([
      { data: { ...ESTIMATE_ROW, status: "declined" }, error: null },
    ]);

    const result = await approveEstimate(TOKEN);

    expect(result).toEqual({
      error: "This estimate is no longer available to approve. Please call the shop.",
    });
    expect(mock.calls.find((c) => c.method === "update")).toBeUndefined();
  });

  it("reports success to a customer who lost the race but whose estimate is approved", async () => {
    // count 0 = the manager's "mark approved" landed first. The customer's
    // approval is a real approval; telling them it failed is the wrong answer.
    const mock = mockAdmin([
      { data: ESTIMATE_ROW, error: null },
      { error: null, count: 0 },
      { data: { status: "approved" }, error: null },
    ]);

    const result = await approveEstimate(TOKEN);

    expect(result).toEqual({ data: { success: true } });
    expect(insertIndex(mock.calls)).toBe(-1);
  });

  it("reports a real failure when the flip matched no row and the estimate is not approved", async () => {
    const mock = mockAdmin([
      { data: ESTIMATE_ROW, error: null },
      { error: null, count: 0 },
      { data: { status: "declined" }, error: null },
    ]);

    const result = await approveEstimate(TOKEN);

    expect(result).toEqual({
      error: "This estimate is no longer available to approve. Please call the shop.",
    });
    expect(insertIndex(mock.calls)).toBe(-1);
  });

  it("leaves a job that already has its own line items alone", async () => {
    const mock = mockAdmin([...approved, ...syncQueue(OPEN_JOB, null, [{ id: LINE_ITEM_X }])]);

    const result = await approveEstimate(TOKEN);

    expect(result).toEqual({ data: { success: true } });
    expect(insertIndex(mock.calls)).toBe(-1);
  });

  it.each([
    ["paid", { id: JOB_A, payment_status: "paid", status: "complete" }],
    ["invoiced", { id: JOB_A, payment_status: "invoiced", status: "complete" }],
    ["waived", { id: JOB_A, payment_status: "waived", status: "complete" }],
    ["cancelled", { id: JOB_A, payment_status: "unpaid", status: "cancelled" }],
  ])("leaves a %s job alone", async (_label, job) => {
    const mock = mockAdmin([...approved, ...syncQueue(job)]);

    const result = await approveEstimate(TOKEN);

    expect(result).toEqual({ data: { success: true } });
    expect(insertIndex(mock.calls)).toBe(-1);
  });

  it("leaves a job with an existing invoice alone even when it still reads unpaid", async () => {
    const mock = mockAdmin([...approved, ...syncQueue(OPEN_JOB, { id: "inv-1" })]);

    const result = await approveEstimate(TOKEN);

    expect(result).toEqual({ data: { success: true } });
    expect(insertIndex(mock.calls)).toBe(-1);
  });

  it("does not touch job tables at all for a standalone estimate", async () => {
    const mock = mockAdmin([
      { data: { ...ESTIMATE_ROW, job_id: null }, error: null },
      { error: null, count: 1 },
    ]);

    const result = await approveEstimate(TOKEN);

    expect(result).toEqual({ data: { success: true } });
    expect(mock.calls.filter((c) => c.method === "from" && c.args[0] === "jobs")).toHaveLength(0);
    expect(insertIndex(mock.calls)).toBe(-1);
  });

  it("skips the job queries entirely when the estimate has no line items", async () => {
    const mock = mockAdmin([
      { data: { ...ESTIMATE_ROW, estimate_line_items: [] }, error: null },
      { error: null, count: 1 },
    ]);

    await approveEstimate(TOKEN);

    expect(mock.calls.filter((c) => c.method === "from" && c.args[0] === "jobs")).toHaveLength(0);
  });

  // Each failed read must fail CLOSED — never fall through to the insert — and
  // must leave a Sentry trace, since the public path discards the warning and
  // the shop has no other way to learn the job stayed empty.
  it.each([
    ["job lookup", 0, "job-lookup"],
    ["invoice probe", 1, "invoice-check"],
    ["existing-items probe", 2, "existing-items"],
  ])("fails closed and reports when the %s errors", async (_label, position, expectedPath) => {
    const queue = syncQueue();
    queue[position] = { data: null, error: { message: "boom" } };
    const mock = mockAdmin([...approved, ...queue]);

    const result = await approveEstimate(TOKEN);

    expect(result).toEqual({ data: { success: true } });
    expect(insertIndex(mock.calls)).toBe(-1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "boom" }),
      expect.objectContaining({
        tags: { source: "approve-estimate", path: expectedPath },
      }),
    );
  });

  it("fails closed when the existing-items probe comes back null without an error", async () => {
    const mock = mockAdmin([...approved, ...syncQueue(OPEN_JOB, null, null)]);

    await approveEstimate(TOKEN);

    expect(insertIndex(mock.calls)).toBe(-1);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("line-item probe returned null"),
      expect.objectContaining({
        tags: { source: "approve-estimate", path: "existing-items" },
      }),
    );
  });

  it("reports a missing linked job rather than throwing on it", async () => {
    const mock = mockAdmin([...approved, ...syncQueue(null)]);

    const result = await approveEstimate(TOKEN);

    expect(result).toEqual({ data: { success: true } });
    expect(insertIndex(mock.calls)).toBe(-1);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("missing job"),
      expect.objectContaining({
        tags: { source: "approve-estimate", path: "job-missing" },
      }),
    );
  });

  it("captures the copy failure, since the customer's approval still succeeded", async () => {
    // The action discards the helper's warning on this path, so Sentry is the
    // ONLY observable effect — without this assertion the failure branch could
    // be deleted wholesale and the suite would stay green.
    const mock = mockAdmin([
      ...approved,
      ...syncQueue(OPEN_JOB, null, [], { error: { message: "insert exploded" } }),
    ]);

    const result = await approveEstimate(TOKEN);

    expect(result).toEqual({ data: { success: true } });
    expect(insertIndex(mock.calls)).toBeGreaterThan(-1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "insert exploded" }),
      expect.objectContaining({
        tags: { source: "approve-estimate", path: "copy-line-items" },
      }),
    );
  });
});

/**
 * The manager-side path is where the sync's warnings are actually visible —
 * approveEstimate discards them by design, so without these the entire
 * user-facing failure surface of the feature is untested.
 */
describe("markEstimateApproved -> linked job line-item sync", () => {
  const PROFILE = { data: { id: "user-row-1" }, error: null };

  function mockManager(results: Parameters<typeof createSupabaseMock>[0]) {
    const mock = createSupabaseMock(results);
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    return mock;
  }

  // Query order differs from the public path: estimate, users profile, update.
  const head = (estimate: unknown = ESTIMATE_ROW) => [
    { data: estimate, error: null },
    PROFILE,
    { error: null, count: 1 },
  ];

  it("copies onto an empty job and reports no warning", async () => {
    const mock = mockManager([...head(), ...syncQueue()]);

    const result = await markEstimateApproved(ESTIMATE_A);

    expect(result).toEqual({ success: true, syncWarning: undefined });
    expect(insertIndex(mock.calls)).toBeGreaterThan(-1);
  });

  it("surfaces a warning the manager can act on when the copy fails", async () => {
    mockManager([
      ...head(),
      ...syncQueue(OPEN_JOB, null, [], { error: { message: "insert exploded" } }),
    ]);

    const result = await markEstimateApproved(ESTIMATE_A);

    expect(result).toMatchObject({ success: true });
    expect((result as { syncWarning?: string }).syncWarning).toBe(
      "couldn't copy the approved line items onto the linked job",
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "insert exploded" }),
      expect.objectContaining({
        // Tagged by caller, so an alert distinguishes this from the public link.
        tags: { source: "mark-estimate-approved", path: "copy-line-items" },
      }),
    );
  });

  it("warns rather than silently skipping when the job is already settled", async () => {
    const mock = mockManager([
      ...head(),
      ...syncQueue({ id: JOB_A, payment_status: "waived", status: "complete" }),
    ]);

    const result = await markEstimateApproved(ESTIMATE_A);

    expect((result as { syncWarning?: string }).syncWarning).toBe(
      "the linked job is already settled, so its line items were left alone",
    );
    expect(insertIndex(mock.calls)).toBe(-1);
  });

  it("pins its flip to the status it read, not a hardcoded 'sent'", async () => {
    const draft = { ...ESTIMATE_ROW, status: "draft" };
    const mock = mockManager([...head(draft), ...syncQueue()]);

    await markEstimateApproved(ESTIMATE_A);

    expectGuardedUpdate(mock.calls, ESTIMATE_A, "draft");
    expectLineItemsSelected(mock.calls);
  });

  it("refuses to approve a declined estimate", async () => {
    // The CAS pins to the status it read, so without this guard a declined
    // estimate would flip to approved and copy its line items onto the job.
    const mock = mockManager([
      { data: { ...ESTIMATE_ROW, status: "declined" }, error: null },
    ]);

    const result = await markEstimateApproved(ESTIMATE_A);

    expect(result).toEqual({ error: "Only draft or sent estimates can be marked approved" });
    expect(mock.calls.find((c) => c.method === "update")).toBeUndefined();
  });

  it("does not touch job tables for a standalone estimate", async () => {
    const mock = mockManager([...head({ ...ESTIMATE_ROW, job_id: null })]);

    const result = await markEstimateApproved(ESTIMATE_A);

    expect(result).toEqual({ success: true, syncWarning: undefined });
    expect(mock.calls.filter((c) => c.method === "from" && c.args[0] === "jobs")).toHaveLength(0);
  });

  it("revalidates the Shop Floor list after copying", async () => {
    mockManager([...head(), ...syncQueue()]);

    await markEstimateApproved(ESTIMATE_A);

    expect(revalidatePath).toHaveBeenCalledWith("/jobs");
  });

  it("surfaces the existing-invoice warning verbatim", async () => {
    // Blank or reworded warnings render as "Estimate approved — ." to the manager.
    const mock = mockManager([...head(), ...syncQueue(OPEN_JOB, { id: "inv-1" })]);

    const result = await markEstimateApproved(ESTIMATE_A);

    expect((result as { syncWarning?: string }).syncWarning).toBe(
      "the linked job already has an invoice, so its line items were left alone",
    );
    expect(insertIndex(mock.calls)).toBe(-1);
  });

  it("surfaces the missing-job warning verbatim", async () => {
    const mock = mockManager([...head(), ...syncQueue(null)]);

    const result = await markEstimateApproved(ESTIMATE_A);

    expect((result as { syncWarning?: string }).syncWarning).toBe(
      "the linked job no longer exists, so nothing was copied",
    );
    expect(insertIndex(mock.calls)).toBe(-1);
  });

  it("copies line items when a draft estimate is marked approved", async () => {
    const draft = { ...ESTIMATE_ROW, status: "draft" };
    const mock = mockManager([...head(draft), ...syncQueue()]);

    await markEstimateApproved(ESTIMATE_A);

    expect(insertIndex(mock.calls)).toBeGreaterThan(-1);
  });

  it("reports its own race message when the flip matches no row", async () => {
    const mock = mockManager([
      { data: ESTIMATE_ROW, error: null },
      PROFILE,
      { error: null, count: 0 },
    ]);

    const result = await markEstimateApproved(ESTIMATE_A);

    expect(result).toEqual({
      error: "This estimate was just approved somewhere else. Refresh to see it.",
    });
    expect(insertIndex(mock.calls)).toBe(-1);
  });
});
