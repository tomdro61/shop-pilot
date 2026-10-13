/**
 * Edit-after-send, resend, field patching, and duplication for estimates.
 * Pins the lookup predicates adjacent to each write, not just the outcome.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/settings", () => ({ getShopSettings: vi.fn() }));
vi.mock("@/lib/actions/messages", () => ({ sendCustomerSMS: vi.fn() }));
vi.mock("@/lib/actions/email", () => ({ sendEstimateEmail: vi.fn() }));
vi.mock("@/lib/messaging/templates", () => ({ estimateSentSMS: vi.fn(() => "sms body") }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { getShopSettings } from "@/lib/actions/settings";
import { sendCustomerSMS } from "@/lib/actions/messages";
import { sendEstimateEmail } from "@/lib/actions/email";
import {
  createEstimateLineItem,
  updateEstimateLineItem,
  deleteEstimateLineItem,
  updateEstimateFields,
  duplicateEstimate,
  resendEstimate,
} from "./estimates";
import { createSupabaseMock, type RecordedCall } from "./__test-helpers__/supabase-mock";

const ESTIMATE_A = "11111111-1111-4111-9111-111111111111";
const NEW_ESTIMATE = "22222222-2222-4222-9222-222222222222";
const LINE_ITEM_X = "aaaaaaaa-aaaa-4aaa-9aaa-aaaaaaaaaaaa";
const JOB_A = "33333333-3333-4333-9333-333333333333";
const CUSTOMER_A = "44444444-4444-4444-9444-444444444444";
const CUSTOMER_B = "55555555-5555-4555-9555-555555555555";
const VEHICLE_A = "66666666-6666-4666-9666-666666666666";
const VEHICLE_B = "77777777-7777-4777-9777-777777777777";

type Client = Awaited<ReturnType<typeof createClient>>;

function mockClient(queue: Parameters<typeof createSupabaseMock>[0]) {
  const mock = createSupabaseMock(queue);
  vi.mocked(createClient).mockResolvedValue(mock.client as unknown as Client);
  return mock;
}

// Index of the nth write of a given kind, so predicates can be checked right
// after the write they belong to rather than anywhere in the call log.
function writeIndex(calls: RecordedCall[], method: string, nth = 0) {
  let seen = 0;
  for (let i = 0; i < calls.length; i++) {
    if (calls[i].method === method) {
      if (seen === nth) return i;
      seen += 1;
    }
  }
  return -1;
}

function eqsAfter(calls: RecordedCall[], idx: number) {
  const out: unknown[][] = [];
  for (let i = idx + 1; i < calls.length; i++) {
    const c = calls[i];
    if (c.method === "eq") out.push(c.args);
    else if (c.method === "select" || c.method === "order") continue;
    else break;
  }
  return out;
}

const LINE_ITEM_INPUT = {
  estimate_id: ESTIMATE_A,
  type: "labor" as const,
  description: "Brake job",
  quantity: 1,
  unit_cost: 100,
  part_number: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireManager).mockResolvedValue({ ok: true, userId: "u1" });
  vi.mocked(getShopSettings).mockResolvedValue({ tax_rate: 0.07 } as Awaited<
    ReturnType<typeof getShopSettings>
  >);
});

describe("line items on a sent estimate", () => {
  it("adds a line item and stamps last_edited_at on that estimate", async () => {
    const mock = mockClient([
      { data: { id: ESTIMATE_A, status: "sent", job_id: null }, error: null },
      { data: { id: LINE_ITEM_X }, error: null },
      { error: null },
    ]);

    const result = await createEstimateLineItem(LINE_ITEM_INPUT);

    expect(result).toEqual({ data: { id: LINE_ITEM_X } });
    const idx = writeIndex(mock.calls, "update");
    expect(idx).toBeGreaterThan(-1);
    expect(mock.calls[idx - 1]).toEqual({ method: "from", args: ["estimates"] });
    expect(Object.keys(mock.calls[idx].args[0] as object)).toEqual(["last_edited_at"]);
    expect(eqsAfter(mock.calls, idx)).toEqual([["id", ESTIMATE_A]]);
  });

  it("updates a line item on a sent estimate and stamps last_edited_at", async () => {
    const mock = mockClient([
      { data: { id: ESTIMATE_A, status: "sent" }, error: null },
      { data: { id: LINE_ITEM_X }, error: null },
      { error: null },
    ]);

    const result = await updateEstimateLineItem(LINE_ITEM_X, LINE_ITEM_INPUT);

    expect(result).toEqual({ data: { id: LINE_ITEM_X } });
    const itemUpdate = writeIndex(mock.calls, "update", 0);
    expect(eqsAfter(mock.calls, itemUpdate)).toEqual([
      ["id", LINE_ITEM_X],
      ["estimate_id", ESTIMATE_A],
    ]);
    const stamp = writeIndex(mock.calls, "update", 1);
    expect(mock.calls[stamp - 1]).toEqual({ method: "from", args: ["estimates"] });
    expect(eqsAfter(mock.calls, stamp)).toEqual([["id", ESTIMATE_A]]);
  });

  it("deletes a line item on a sent estimate and stamps last_edited_at", async () => {
    const mock = mockClient([
      { data: { id: ESTIMATE_A, status: "sent" }, error: null },
      { error: null, count: 1 },
      { error: null },
    ]);

    const result = await deleteEstimateLineItem(LINE_ITEM_X, ESTIMATE_A);

    expect(result).toEqual({ success: true });
    const del = writeIndex(mock.calls, "delete");
    expect(eqsAfter(mock.calls, del)).toEqual([
      ["id", LINE_ITEM_X],
      ["estimate_id", ESTIMATE_A],
    ]);
    const stamp = writeIndex(mock.calls, "update");
    expect(eqsAfter(mock.calls, stamp)).toEqual([["id", ESTIMATE_A]]);
  });

  it("reports a failed stamp instead of pretending the edit flag is set", async () => {
    const mock = mockClient([
      { data: { id: ESTIMATE_A, status: "sent" }, error: null },
      { error: null, count: 1 },
      { error: { message: "boom" } },
    ]);

    const result = await deleteEstimateLineItem(LINE_ITEM_X, ESTIMATE_A);

    expect(result).toEqual({
      error: "Line item deleted, but couldn't flag the estimate as edited: boom",
    });
    expect(writeIndex(mock.calls, "delete")).toBeGreaterThan(-1);
  });

  it.each(["approved", "declined"])("refuses to add items to a %s estimate", async (status) => {
    const mock = mockClient([{ data: { id: ESTIMATE_A, status, job_id: null }, error: null }]);

    const result = await createEstimateLineItem(LINE_ITEM_INPUT);

    expect(result).toEqual({
      error: "Only draft or sent estimates can be edited — duplicate this one to make changes",
    });
    expect(mock.calls.find((c) => c.method === "insert")).toBeUndefined();
  });
});

describe("updateEstimateFields", () => {
  it("assigns a vehicle that belongs to the estimate's customer, scoped by id and status", async () => {
    const mock = mockClient([
      { data: { id: ESTIMATE_A, status: "sent", customer_id: CUSTOMER_A, job_id: null }, error: null },
      { data: { id: VEHICLE_B, customer_id: CUSTOMER_A }, error: null },
      { error: null },
    ]);

    const result = await updateEstimateFields(ESTIMATE_A, { vehicle_id: VEHICLE_B });

    expect(result).toEqual({ success: true });
    const lookup = mock.calls.findIndex((c) => c.method === "from" && c.args[0] === "vehicles");
    expect(eqsAfter(mock.calls, lookup)).toEqual([["id", VEHICLE_B]]);
    const idx = writeIndex(mock.calls, "update");
    expect(mock.calls[idx].args[0]).toMatchObject({ vehicle_id: VEHICLE_B });
    expect(mock.calls[idx].args[0]).toHaveProperty("last_edited_at");
    expect(eqsAfter(mock.calls, idx)).toEqual([
      ["id", ESTIMATE_A],
      ["status", "sent"],
    ]);
  });

  it("refuses a vehicle owned by a different customer", async () => {
    const mock = mockClient([
      { data: { id: ESTIMATE_A, status: "draft", customer_id: CUSTOMER_A, job_id: null }, error: null },
      { data: { id: VEHICLE_B, customer_id: CUSTOMER_B }, error: null },
    ]);

    const result = await updateEstimateFields(ESTIMATE_A, { vehicle_id: VEHICLE_B });

    expect(result).toEqual({ error: "Vehicle does not belong to this customer" });
    expect(mock.calls.find((c) => c.method === "update")).toBeUndefined();
  });

  it("changes the customer on a draft and clears the vehicle", async () => {
    const mock = mockClient([
      { data: { id: ESTIMATE_A, status: "draft", customer_id: CUSTOMER_A, job_id: null }, error: null },
      { data: { id: CUSTOMER_B }, error: null },
      { error: null },
    ]);

    const result = await updateEstimateFields(ESTIMATE_A, { customer_id: CUSTOMER_B });

    expect(result).toEqual({ success: true });
    const idx = writeIndex(mock.calls, "update");
    expect(mock.calls[idx].args[0]).toMatchObject({ customer_id: CUSTOMER_B, vehicle_id: null });
    expect(eqsAfter(mock.calls, idx)).toEqual([
      ["id", ESTIMATE_A],
      ["status", "draft"],
    ]);
  });

  it("refuses to re-point a sent estimate at a different customer", async () => {
    const mock = mockClient([
      { data: { id: ESTIMATE_A, status: "sent", customer_id: CUSTOMER_A, job_id: null }, error: null },
    ]);

    const result = await updateEstimateFields(ESTIMATE_A, { customer_id: CUSTOMER_B });

    expect(result).toEqual({
      error: "The customer can only be changed on a draft estimate — duplicate this one instead",
    });
    expect(mock.calls.find((c) => c.method === "update")).toBeUndefined();
  });

  it("refuses to change the customer on an estimate attached to a job", async () => {
    const mock = mockClient([
      { data: { id: ESTIMATE_A, status: "draft", customer_id: CUSTOMER_A, job_id: JOB_A }, error: null },
    ]);

    const result = await updateEstimateFields(ESTIMATE_A, { customer_id: CUSTOMER_B });

    expect(result).toEqual({
      error: "This estimate belongs to a job — change the customer on the job",
    });
    expect(mock.calls.find((c) => c.method === "update")).toBeUndefined();
  });

  it("refuses once the estimate is approved", async () => {
    const mock = mockClient([
      { data: { id: ESTIMATE_A, status: "approved", customer_id: CUSTOMER_A, job_id: null }, error: null },
    ]);

    const result = await updateEstimateFields(ESTIMATE_A, { vehicle_id: null });

    expect(result).toEqual({
      error: "Only draft or sent estimates can be edited — duplicate this one to make changes",
    });
    expect(mock.calls.find((c) => c.method === "update")).toBeUndefined();
  });
});

describe("duplicateEstimate", () => {
  const SOURCE = {
    id: ESTIMATE_A,
    customer_id: CUSTOMER_A,
    vehicle_id: VEHICLE_A,
    charge_sales_tax: false,
    notes: "Customer supplied parts",
  };
  const ITEMS = [
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

  it("creates a standalone draft carrying the source's customer, vehicle, tax flag, and notes", async () => {
    const mock = mockClient([
      { data: SOURCE, error: null },
      { data: ITEMS, error: null },
      { data: { id: NEW_ESTIMATE }, error: null },
      { error: null },
    ]);

    const result = await duplicateEstimate(ESTIMATE_A);

    expect(result).toEqual({ data: { id: NEW_ESTIMATE } });

    const itemLookup = mock.calls.findIndex(
      (c) => c.method === "from" && c.args[0] === "estimate_line_items"
    );
    expect(eqsAfter(mock.calls, itemLookup)).toEqual([["estimate_id", ESTIMATE_A]]);

    const insert = writeIndex(mock.calls, "insert", 0);
    expect(mock.calls[insert - 1]).toEqual({ method: "from", args: ["estimates"] });
    expect(mock.calls[insert].args[0]).toEqual({
      job_id: null,
      customer_id: CUSTOMER_A,
      vehicle_id: VEHICLE_A,
      status: "draft",
      tax_rate: 0.07,
      charge_sales_tax: false,
      notes: "Customer supplied parts",
    });
  });

  it("copies every line item onto the new estimate, dropping cost on labor rows", async () => {
    const mock = mockClient([
      { data: SOURCE, error: null },
      { data: ITEMS, error: null },
      { data: { id: NEW_ESTIMATE }, error: null },
      { error: null },
    ]);

    await duplicateEstimate(ESTIMATE_A);

    const copy = writeIndex(mock.calls, "insert", 1);
    expect(mock.calls[copy - 1]).toEqual({ method: "from", args: ["estimate_line_items"] });
    expect(mock.calls[copy].args[0]).toEqual([
      {
        estimate_id: NEW_ESTIMATE,
        type: "labor",
        description: "Front brake pads",
        quantity: 2,
        unit_cost: 120,
        cost: null,
        part_number: null,
        category: "Brakes",
      },
      {
        estimate_id: NEW_ESTIMATE,
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

  it("rolls back the new estimate when the line-item copy fails", async () => {
    const mock = mockClient([
      { data: SOURCE, error: null },
      { data: ITEMS, error: null },
      { data: { id: NEW_ESTIMATE }, error: null },
      { error: { message: "copy failed" } },
      { error: null },
    ]);

    const result = await duplicateEstimate(ESTIMATE_A);

    expect(result).toEqual({ error: "Failed to copy line items: copy failed" });
    const del = writeIndex(mock.calls, "delete");
    expect(mock.calls[del - 1]).toEqual({ method: "from", args: ["estimates"] });
    expect(eqsAfter(mock.calls, del)).toEqual([["id", NEW_ESTIMATE]]);
  });

  it("skips the copy insert when the source has no line items", async () => {
    const mock = mockClient([
      { data: SOURCE, error: null },
      { data: [], error: null },
      { data: { id: NEW_ESTIMATE }, error: null },
    ]);

    const result = await duplicateEstimate(ESTIMATE_A);

    expect(result).toEqual({ data: { id: NEW_ESTIMATE } });
    expect(mock.calls.filter((c) => c.method === "insert")).toHaveLength(1);
  });
});

describe("resendEstimate", () => {
  const SENT_ROW = {
    id: ESTIMATE_A,
    status: "sent",
    approval_token: "tok",
    job_id: null,
    customer_id: CUSTOMER_A,
    customers: { id: CUSTOMER_A, first_name: "Ana", phone: "+16175550100", email: "ana@example.com" },
    vehicles: { year: 2019, make: "Honda", model: "Civic" },
  };

  it("sends both channels and stamps last_sent_at on this sent estimate", async () => {
    vi.mocked(sendCustomerSMS).mockResolvedValue({
      data: { sent: true, testMode: false, to: "+16175550100", customerName: "Ana" },
    });
    vi.mocked(sendEstimateEmail).mockResolvedValue({ sent: true });
    const mock = mockClient([{ data: SENT_ROW, error: null }, { error: null }]);

    const result = await resendEstimate(ESTIMATE_A);

    expect(result).toEqual({ data: { success: true, deliveryWarning: undefined } });
    expect(sendEstimateEmail).toHaveBeenCalledWith({ estimateId: ESTIMATE_A });
    expect(sendCustomerSMS).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: CUSTOMER_A, line: "shop" })
    );
    const idx = writeIndex(mock.calls, "update");
    expect(Object.keys(mock.calls[idx].args[0] as object)).toEqual(["last_sent_at"]);
    expect(eqsAfter(mock.calls, idx)).toEqual([
      ["id", ESTIMATE_A],
      ["status", "sent"],
    ]);
  });

  it("still stamps when one channel fails, and says which one", async () => {
    vi.mocked(sendCustomerSMS).mockResolvedValue({ error: "Quo down" });
    vi.mocked(sendEstimateEmail).mockResolvedValue({ sent: true });
    const mock = mockClient([{ data: SENT_ROW, error: null }, { error: null }]);

    const result = await resendEstimate(ESTIMATE_A);

    expect(result).toEqual({ data: { success: true, deliveryWarning: "SMS: Quo down" } });
    expect(writeIndex(mock.calls, "update")).toBeGreaterThan(-1);
  });

  it("does not stamp last_sent_at when nothing was delivered", async () => {
    vi.mocked(sendCustomerSMS).mockResolvedValue({ error: "Quo down" });
    vi.mocked(sendEstimateEmail).mockResolvedValue({ sent: false, error: "Resend down" });
    const mock = mockClient([{ data: SENT_ROW, error: null }]);

    const result = await resendEstimate(ESTIMATE_A);

    expect(result).toEqual({ error: "Resend failed: SMS: Quo down · Email: Resend down" });
    expect(mock.calls.find((c) => c.method === "update")).toBeUndefined();
  });

  it("refuses a draft estimate", async () => {
    mockClient([{ data: { ...SENT_ROW, status: "draft" }, error: null }]);

    const result = await resendEstimate(ESTIMATE_A);

    expect(result).toEqual({ error: "Only sent estimates can be resent" });
    expect(sendCustomerSMS).not.toHaveBeenCalled();
    expect(sendEstimateEmail).not.toHaveBeenCalled();
  });
});
