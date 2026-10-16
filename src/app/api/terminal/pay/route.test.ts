import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, init }) },
}));
vi.mock("@/lib/auth", () => ({ requireStaff: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/stripe/terminal", () => ({
  createTerminalPaymentIntent: vi.fn(),
  processReaderPayment: vi.fn(),
  cancelReaderAction: vi.fn(),
}));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cancelReaderAction,
  createTerminalPaymentIntent,
  processReaderPayment,
} from "@/lib/stripe/terminal";
import { getStripe } from "@/lib/stripe";
import { POST } from "./route";
import {
  createSupabaseMock,
  type SupabaseMockResult,
} from "@/lib/actions/__test-helpers__/supabase-mock";

const JOB_ID = "11111111-1111-4111-9111-111111111111";
const PI_ID = "pi_test_123";

type RouteResult = { body: Record<string, unknown>; init?: { status?: number } };

const baseJob = {
  id: JOB_ID,
  status: "complete",
  payment_status: "unpaid",
  charge_sales_tax: true,
  job_line_items: [{ type: "part", quantity: 1, unit_cost: 100, total: 100, category: null }],
};
const SETTINGS = { tax_rate: 0.0625, shop_supplies_enabled: false, hazmat_enabled: false };

const cancelPaymentIntent = vi.fn();

function mockSupabase(results: SupabaseMockResult[]) {
  const mock = createSupabaseMock(results);
  vi.mocked(createAdminClient).mockReturnValue(
    mock.client as unknown as ReturnType<typeof createAdminClient>
  );
  return mock;
}

function happyQueue(job: Record<string, unknown> = baseJob): SupabaseMockResult[] {
  return [
    { data: job, error: null },
    { data: SETTINGS, error: null },
    { data: { id: JOB_ID }, error: null },
  ];
}

function buildRequest(body: Record<string, unknown>) {
  return new Request("https://example.com/api/terminal/pay", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function call(body: Record<string, unknown>): Promise<RouteResult> {
  return (await POST(buildRequest(body))) as unknown as RouteResult;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireStaff).mockResolvedValue({ ok: true, userId: "u1", role: "manager" });
  vi.mocked(createTerminalPaymentIntent).mockResolvedValue({
    id: PI_ID,
    status: "requires_payment_method",
  } as unknown as Awaited<ReturnType<typeof createTerminalPaymentIntent>>);
  vi.mocked(processReaderPayment).mockResolvedValue(
    undefined as unknown as Awaited<ReturnType<typeof processReaderPayment>>
  );
  vi.mocked(cancelReaderAction).mockResolvedValue(
    undefined as unknown as Awaited<ReturnType<typeof cancelReaderAction>>
  );
  vi.mocked(getStripe).mockReturnValue({
    paymentIntents: { cancel: cancelPaymentIntent },
  } as unknown as ReturnType<typeof getStripe>);
});

describe("POST /api/terminal/pay — amount", () => {
  it("charges the server-computed total (parts + 6.25% tax) for the looked-up job", async () => {
    const mock = mockSupabase(happyQueue());
    const res = await call({ jobId: JOB_ID });

    expect(createTerminalPaymentIntent).toHaveBeenCalledTimes(1);
    expect(createTerminalPaymentIntent).toHaveBeenCalledWith(10625, { job_id: JOB_ID });
    expect(processReaderPayment).toHaveBeenCalledWith(PI_ID);
    expect(res.init?.status).toBeUndefined();
    expect(res.body).toEqual({
      paymentIntentId: PI_ID,
      status: "requires_payment_method",
      amountCents: 10625,
    });

    // The job lookup: its select feeds calculateTotals, its predicate picks the job.
    expect(mock.calls.slice(0, 4)).toEqual([
      { method: "from", args: ["jobs"] },
      {
        method: "select",
        args: [
          "id, status, payment_status, charge_sales_tax, job_line_items(type, quantity, unit_cost, total, category)",
        ],
      },
      { method: "eq", args: ["id", JOB_ID] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  it("refuses a client amount that disagrees with the server total", async () => {
    mockSupabase(happyQueue());
    const res = await call({ jobId: JOB_ID, amountCents: 9999 });
    expect(res.init?.status).toBe(409);
    expect(createTerminalPaymentIntent).not.toHaveBeenCalled();
  });

  it("accepts a client amount equal to the server total", async () => {
    mockSupabase(happyQueue());
    await call({ jobId: JOB_ID, amountCents: 10625 });
    expect(createTerminalPaymentIntent).toHaveBeenCalledWith(10625, { job_id: JOB_ID });
  });
});

describe("POST /api/terminal/pay — refusals", () => {
  it.each([
    ["paid", { payment_status: "paid" }],
    ["waived", { payment_status: "waived" }],
    ["in_progress", { status: "in_progress" }],
  ])("returns 409 for a %s job and never creates an intent", async (_label, patch) => {
    mockSupabase(happyQueue({ ...baseJob, ...patch }));
    const res = await call({ jobId: JOB_ID });
    expect(res.init?.status).toBe(409);
    expect(createTerminalPaymentIntent).not.toHaveBeenCalled();
  });

  it("returns 500 when settings fail to load, and never creates an intent", async () => {
    mockSupabase([
      { data: baseJob, error: null },
      { data: null, error: { message: "boom" } },
    ]);
    const res = await call({ jobId: JOB_ID });
    expect(res.init?.status).toBe(500);
    expect(createTerminalPaymentIntent).not.toHaveBeenCalled();
  });

  it("returns 404 when the job does not exist", async () => {
    mockSupabase([{ data: null, error: null }]);
    const res = await call({ jobId: JOB_ID });
    expect(res.init?.status).toBe(404);
    expect(createTerminalPaymentIntent).not.toHaveBeenCalled();
  });

  it("returns 401 when the caller is not staff", async () => {
    vi.mocked(requireStaff).mockResolvedValue({ ok: false, error: "Unauthorized" });
    const mock = mockSupabase(happyQueue());
    const res = await call({ jobId: JOB_ID });
    expect(res.init?.status).toBe(401);
    expect(mock.calls).toEqual([]);
    expect(createTerminalPaymentIntent).not.toHaveBeenCalled();
  });
});

describe("POST /api/terminal/pay — arming the payment intent on the job", () => {
  it("writes the intent id to this job only while it is still unpaid", async () => {
    const mock = mockSupabase(happyQueue());
    await call({ jobId: JOB_ID });

    const updateIdx = mock.calls.findIndex((c) => c.method === "update");
    expect(updateIdx).toBeGreaterThan(0);
    expect(mock.calls.slice(updateIdx - 1)).toEqual([
      { method: "from", args: ["jobs"] },
      { method: "update", args: [{ stripe_payment_intent_id: PI_ID }] },
      { method: "eq", args: ["id", JOB_ID] },
      { method: "neq", args: ["payment_status", "paid"] },
      { method: "select", args: ["id"] },
      { method: "maybeSingle", args: [] },
    ]);
    expect(cancelReaderAction).not.toHaveBeenCalled();
    expect(cancelPaymentIntent).not.toHaveBeenCalled();
  });

  it("clears the reader and cancels this intent when the job settled in between", async () => {
    mockSupabase([
      { data: baseJob, error: null },
      { data: SETTINGS, error: null },
      { data: null, error: null },
    ]);
    const res = await call({ jobId: JOB_ID });

    expect(cancelReaderAction).toHaveBeenCalledTimes(1);
    expect(cancelPaymentIntent).toHaveBeenCalledTimes(1);
    expect(cancelPaymentIntent).toHaveBeenCalledWith(PI_ID);
    expect(res.init?.status).toBe(409);
  });
});
