/**
 * Tests for sendJobReceiptWith — the shared receipt sender behind both the
 * manager server action and the staff API route.
 *
 * The invariant that matters most: a typed destination is used for that send and
 * NEVER written to `customers`. Walk-in and Quick Pay jobs all share one customer
 * row, so storing a per-transaction phone there would send the next walk-in's
 * receipt to the previous one. Several tests assert the absence of a write
 * rather than the presence of one, which is the only way to pin that.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/actions/settings", () => ({ getShopSettings: vi.fn() }));
vi.mock("@/lib/resend/client", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/quo/client", () => ({ sendSMS: vi.fn() }));
vi.mock("@/lib/quo/routing", () => ({ getPhoneNumber: () => "+15550000000" }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { getShopSettings } from "@/lib/actions/settings";
import { sendEmail } from "@/lib/resend/client";
import { sendSMS } from "@/lib/quo/client";
import { sendJobReceiptWith } from "./send";
import { WALK_IN_CUSTOMER_ID } from "@/lib/constants";
import {
  createSupabaseMock,
  type RecordedCall,
  type SupabaseMockResult,
} from "@/lib/actions/__test-helpers__/supabase-mock";

const JOB_ID = "11111111-1111-4111-9111-111111111111";
const REAL_CUSTOMER_ID = "22222222-2222-4222-9222-222222222222";

const SETTINGS = {
  tax_rate: 0.0625,
  shop_supplies_enabled: false,
  hazmat_enabled: false,
};

function buildJob(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    title: "Oil change",
    payment_status: "paid",
    payment_method: "terminal",
    receipt_token: "aaaaaaaa-1111-4111-9111-aaaaaaaaaaaa",
    customer_id: REAL_CUSTOMER_ID,
    charge_sales_tax: false,
    customers: {
      id: REAL_CUSTOMER_ID,
      first_name: "Maria",
      phone: null,
      email: null,
    },
    vehicles: null,
    job_line_items: [{ type: "labor", description: "Oil change", quantity: 1, unit_cost: 60 }],
    ...overrides,
  };
}

/** First queued result is the job read; later ones are the messages inserts. */
function mockClient(results: SupabaseMockResult[]) {
  return createSupabaseMock(results);
}

/** Writes recorded against one table, in call order. */
const tableWrites = (calls: RecordedCall[], table: string) => {
  const out: RecordedCall[] = [];
  let current: unknown = null;
  for (const c of calls) {
    if (c.method === "from") current = c.args[0];
    if (current === table && ["update", "insert", "upsert", "delete"].includes(c.method)) {
      out.push(c);
    }
  }
  return out;
};

const customerWrites = (calls: RecordedCall[]) => tableWrites(calls, "customers");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getShopSettings).mockResolvedValue(
    SETTINGS as unknown as Awaited<ReturnType<typeof getShopSettings>>
  );
  vi.mocked(sendEmail).mockResolvedValue({ success: true, testMode: false });
  vi.mocked(sendSMS).mockResolvedValue({ success: true, testMode: false });
});

describe("sendJobReceiptWith — typed destinations are never stored", () => {
  it("texts a typed number and writes nothing to customers", async () => {
    const mock = mockClient([{ data: buildJob(), error: null }, { data: null, error: null }]);

    const result = await sendJobReceiptWith(mock.client as never, {
      jobId: JOB_ID,
      sms: true,
      email: false,
      smsTo: "617-555-0134",
    });

    expect(result).toMatchObject({ ok: true, sms: { sent: true } });
    expect(sendSMS).toHaveBeenCalledWith(expect.objectContaining({ to: "+16175550134" }));
    expect(customerWrites(mock.calls)).toEqual([]);

    // Guard against the above passing vacuously: the recorder must actually be
    // capturing table names and writes, which the messages log proves it does.
    expect(mock.calls).toContainEqual({ method: "from", args: ["messages"] });
    expect(tableWrites(mock.calls, "messages")).toHaveLength(1);
  });

  it("emails a typed address and writes nothing to customers", async () => {
    const mock = mockClient([{ data: buildJob(), error: null }, { data: null, error: null }]);

    const result = await sendJobReceiptWith(mock.client as never, {
      jobId: JOB_ID,
      sms: false,
      email: true,
      emailTo: "walkin@example.com",
    });

    expect(result).toMatchObject({ ok: true, email: { sent: true } });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "walkin@example.com" })
    );
    expect(customerWrites(mock.calls)).toEqual([]);
  });

  it("writes nothing to customers even on the shared walk-in row", async () => {
    const job = buildJob({
      customer_id: WALK_IN_CUSTOMER_ID,
      customers: { id: WALK_IN_CUSTOMER_ID, first_name: "Walk-In", phone: null, email: null },
    });
    const mock = mockClient([{ data: job, error: null }, { data: null, error: null }]);

    await sendJobReceiptWith(mock.client as never, {
      jobId: JOB_ID,
      sms: true,
      email: false,
      smsTo: "6175550134",
    });

    expect(customerWrites(mock.calls)).toEqual([]);
  });

  it("does not greet a walk-in by the sentinel row's name", async () => {
    const job = buildJob({
      customer_id: WALK_IN_CUSTOMER_ID,
      customers: { id: WALK_IN_CUSTOMER_ID, first_name: "Walk-In", phone: null, email: null },
    });
    const mock = mockClient([{ data: job, error: null }, { data: null, error: null }]);

    await sendJobReceiptWith(mock.client as never, {
      jobId: JOB_ID,
      sms: true,
      email: false,
      smsTo: "6175550134",
    });

    const body = vi.mocked(sendSMS).mock.calls[0][0].body;
    expect(body).not.toContain("Walk-In");
    expect(body).not.toContain("null");
  });
});

describe("sendJobReceiptWith — falls back to what is on file", () => {
  it("uses the stored phone when no override is given", async () => {
    const job = buildJob({
      customers: { id: REAL_CUSTOMER_ID, first_name: "Maria", phone: "617-555-9999", email: null },
    });
    const mock = mockClient([{ data: job, error: null }, { data: null, error: null }]);

    await sendJobReceiptWith(mock.client as never, { jobId: JOB_ID, sms: true, email: false });

    expect(sendSMS).toHaveBeenCalledWith(expect.objectContaining({ to: "+16175559999" }));
  });

  it("prefers the typed number over the stored one without overwriting it", async () => {
    const job = buildJob({
      customers: { id: REAL_CUSTOMER_ID, first_name: "Maria", phone: "617-555-9999", email: null },
    });
    const mock = mockClient([{ data: job, error: null }, { data: null, error: null }]);

    await sendJobReceiptWith(mock.client as never, {
      jobId: JOB_ID,
      sms: true,
      email: false,
      smsTo: "978-555-0000",
    });

    expect(sendSMS).toHaveBeenCalledWith(expect.objectContaining({ to: "+19785550000" }));
    expect(customerWrites(mock.calls)).toEqual([]);
  });
});

describe("sendJobReceiptWith — refusals", () => {
  it("refuses an unpaid job", async () => {
    const mock = mockClient([{ data: buildJob({ payment_status: "unpaid" }), error: null }]);

    const result = await sendJobReceiptWith(mock.client as never, {
      jobId: JOB_ID,
      sms: true,
      email: false,
      smsTo: "6175550134",
    });

    expect(result.ok).toBe(false);
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it("refuses when shop settings can't load, rather than guessing a total", async () => {
    vi.mocked(getShopSettings).mockResolvedValue(null);
    const mock = mockClient([{ data: buildJob(), error: null }]);

    const result = await sendJobReceiptWith(mock.client as never, {
      jobId: JOB_ID,
      sms: false,
      email: true,
      emailTo: "a@b.com",
    });

    expect(result.ok).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("rejects a malformed phone number before calling Quo", async () => {
    const mock = mockClient([{ data: buildJob(), error: null }]);

    const result = await sendJobReceiptWith(mock.client as never, {
      jobId: JOB_ID,
      sms: true,
      email: false,
      smsTo: "12",
    });

    expect(result).toMatchObject({ ok: true, sms: { sent: false } });
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it("rejects a malformed email before calling Resend", async () => {
    const mock = mockClient([{ data: buildJob(), error: null }]);

    const result = await sendJobReceiptWith(mock.client as never, {
      jobId: JOB_ID,
      sms: false,
      email: true,
      emailTo: "not-an-email",
    });

    expect(result).toMatchObject({ ok: true, email: { sent: false } });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("reports per channel — a failed email does not block the text", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ success: false, testMode: false, error: "bounced" });
    const mock = mockClient([
      { data: buildJob(), error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);

    const result = await sendJobReceiptWith(mock.client as never, {
      jobId: JOB_ID,
      sms: true,
      email: true,
      smsTo: "6175550134",
      emailTo: "a@b.com",
    });

    expect(result).toMatchObject({
      ok: true,
      email: { sent: false },
      sms: { sent: true },
    });
  });
});
