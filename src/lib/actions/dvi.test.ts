/**
 * Tests for the DVI actions' Supabase error handling.
 *
 * startInspection: a failed read must stop the insert, a missing job must not
 * produce an orphan inspection, and a parking reservation requesting a DVI is
 * linked. sendInspection: everything needed to notify the customer is read
 * BEFORE the inspection is marked sent, so a failed lookup leaves it at
 * "completed" and the Send button still works.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/actions/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("@/lib/actions/messages", () => ({ sendCustomerSMS: vi.fn() }));
vi.mock("@/lib/actions/email", () => ({ sendCustomerEmail: vi.fn() }));
vi.mock("@/lib/messaging/templates", () => ({ dviReportSMS: vi.fn(() => "sms body") }));
vi.mock("@/lib/resend/templates", () => ({ dviReportEmail: vi.fn(() => ({ subject: "s", html: "h" })) }));
vi.mock("@/lib/parking-vehicle", () => ({ findOrCreateParkingVehicle: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/actions/auth";
import { requireManager } from "@/lib/auth";
import { sendCustomerSMS } from "@/lib/actions/messages";
import { startInspection, sendInspection } from "./dvi";
import { createSupabaseMock, type RecordedCall, type SupabaseMockResult } from "./__test-helpers__/supabase-mock";

const JOB_ID = "11111111-1111-4111-9111-111111111111";
const INSPECTION_ID = "22222222-2222-4222-9222-222222222222";
const TEMPLATE = { data: { id: "tpl", name: "Default" } };
const NO_CATEGORIES = { data: [] };

function wire(results: SupabaseMockResult[]) {
  const mock = createSupabaseMock(results);
  vi.mocked(createClient).mockResolvedValue(mock.client as never);
  return mock;
}

function insertsInto(calls: RecordedCall[], table: string) {
  return calls.filter((c, i) => c.method === "insert" && calls[i - 1]?.method === "from" && calls[i - 1].args[0] === table);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "tech-1", role: "tech" } as never);
  vi.mocked(requireManager).mockResolvedValue({ ok: true } as never);
});

describe("startInspection", () => {
  it("returns the read error and inserts nothing when the existing-inspection check fails", async () => {
    const mock = wire([TEMPLATE, NO_CATEGORIES, { data: null, error: { message: "timeout" } }]);
    const result = await startInspection(JOB_ID);
    expect(result).toEqual({ error: "timeout" });
    expect(mock.calls).toContainEqual({ method: "eq", args: ["job_id", JOB_ID] });
    expect(mock.calls.filter((c) => c.method === "maybeSingle")).toHaveLength(1);
    expect(mock.calls.filter((c) => c.method === "insert")).toHaveLength(0);
  });

  it("refuses when an inspection already exists", async () => {
    const mock = wire([TEMPLATE, NO_CATEGORIES, { data: { id: "existing" } }]);
    const result = await startInspection(JOB_ID);
    expect(result).toEqual({ error: "An inspection already exists for this job" });
    expect(mock.calls.filter((c) => c.method === "insert")).toHaveLength(0);
  });

  it("refuses a job that does not exist instead of inserting an orphan", async () => {
    const mock = wire([TEMPLATE, NO_CATEGORIES, { data: null }, { data: null, error: null }]);
    const result = await startInspection(JOB_ID);
    expect(result).toEqual({ error: "Job not found" });
    expect(mock.calls).toContainEqual({ method: "eq", args: ["id", JOB_ID] });
    expect(mock.calls.filter((c) => c.method === "insert")).toHaveLength(0);
  });

  it("returns the job read error", async () => {
    const mock = wire([TEMPLATE, NO_CATEGORIES, { data: null }, { data: null, error: { message: "jobs down" } }]);
    expect(await startInspection(JOB_ID)).toEqual({ error: "jobs down" });
    expect(mock.calls.filter((c) => c.method === "insert")).toHaveLength(0);
  });

  it("links the customer's open parking reservation that asked for a DVI", async () => {
    const mock = wire([
      TEMPLATE,
      NO_CATEGORIES,
      { data: null },
      { data: { vehicle_id: "v1", customer_id: "c1" } },
      { data: [{ id: "r1", services_interested: ["dvi_inspection"], services_completed: [] }] },
      { data: { id: INSPECTION_ID } },
      { error: null },
    ]);
    const result = await startInspection(JOB_ID);
    expect(result).toEqual({ data: { inspectionId: INSPECTION_ID } });
    expect(mock.calls).toContainEqual({ method: "eq", args: ["customer_id", "c1"] });
    const inserts = insertsInto(mock.calls, "dvi_inspections");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[0]).toEqual(
      expect.objectContaining({ job_id: JOB_ID, vehicle_id: "v1", customer_id: "c1", parking_reservation_id: "r1" })
    );
  });

  it("returns the reservation read error and inserts nothing", async () => {
    const mock = wire([
      TEMPLATE,
      NO_CATEGORIES,
      { data: null },
      { data: { vehicle_id: "v1", customer_id: "c1" } },
      { data: null, error: { message: "reservations down" } },
    ]);
    expect(await startInspection(JOB_ID)).toEqual({ error: "reservations down" });
    expect(insertsInto(mock.calls, "dvi_inspections")).toHaveLength(0);
  });
});

describe("sendInspection", () => {
  const OPTIONS = { mode: "informational" as const };
  const STANDALONE = { data: { job_id: null, customer_id: "c1", vehicle_id: null, jobs: null } };
  const CUSTOMER = { data: { id: "c1", first_name: "Ann", phone: "+16175551234", email: null } };

  function updates(calls: RecordedCall[]) {
    return calls.filter((c) => c.method === "update");
  }

  it("does not mark the inspection sent when the inspection read fails", async () => {
    const mock = wire([{ data: null, error: { message: "read failed" } }]);
    const result = await sendInspection(INSPECTION_ID, OPTIONS);
    expect(result).toEqual({ error: "Couldn't load the inspection, so nothing was sent. Try again." });
    expect(updates(mock.calls)).toHaveLength(0);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { source: "dvi-send" }, extra: { inspectionId: INSPECTION_ID } })
    );
    expect(sendCustomerSMS).not.toHaveBeenCalled();
  });

  it("does not mark the inspection sent when the customer read fails", async () => {
    const mock = wire([STANDALONE, { data: null, error: { message: "customers down" } }]);
    const result = await sendInspection(INSPECTION_ID, OPTIONS);
    expect(result).toEqual({ error: "Couldn't load the customer, so nothing was sent. Try again." });
    expect(mock.calls).toContainEqual({ method: "eq", args: ["id", "c1"] });
    expect(updates(mock.calls)).toHaveLength(0);
    expect(sendCustomerSMS).not.toHaveBeenCalled();
  });

  it("reports an inspection that no longer exists", async () => {
    const mock = wire([{ data: null, error: null }]);
    expect(await sendInspection(INSPECTION_ID, OPTIONS)).toEqual({ error: "Inspection not found" });
    expect(updates(mock.calls)).toHaveLength(0);
  });

  it("marks the inspection sent only after the customer is resolved, pinned to its id", async () => {
    const mock = wire([STANDALONE, CUSTOMER, { data: { id: INSPECTION_ID } }]);
    const result = await sendInspection(INSPECTION_ID, OPTIONS);
    expect(result).toMatchObject({ data: { dviUrl: expect.stringContaining("/inspect/") } });

    const updateIndex = mock.calls.findIndex((c) => c.method === "update");
    expect(updateIndex).toBeGreaterThan(-1);
    expect(mock.calls[updateIndex].args[0]).toEqual(expect.objectContaining({ status: "sent", send_mode: "informational" }));
    expect(mock.calls[updateIndex + 1]).toEqual({ method: "eq", args: ["id", INSPECTION_ID] });
    expect(mock.calls[updateIndex + 2]).toEqual({ method: "select", args: ["id"] });
    expect(mock.calls[updateIndex + 3]).toEqual({ method: "maybeSingle", args: [] });

    const customerRead = mock.calls.findIndex((c) => c.method === "eq" && c.args[0] === "id" && c.args[1] === "c1");
    expect(customerRead).toBeLessThan(updateIndex);

    await vi.waitFor(() => expect(sendCustomerSMS).toHaveBeenCalledTimes(1));
    expect(sendCustomerSMS).toHaveBeenCalledWith(expect.objectContaining({ customerId: "c1", line: "shop" }));
  });

  it("reports a zero-row update instead of claiming the inspection was sent", async () => {
    wire([STANDALONE, CUSTOMER, { data: null, error: null }]);
    expect(await sendInspection(INSPECTION_ID, OPTIONS)).toEqual({ error: "Inspection not found" });
    expect(sendCustomerSMS).not.toHaveBeenCalled();
  });

  it("returns the update error", async () => {
    wire([STANDALONE, CUSTOMER, { data: null, error: { message: "update failed" } }]);
    expect(await sendInspection(INSPECTION_ID, OPTIONS)).toEqual({ error: "update failed" });
    expect(sendCustomerSMS).not.toHaveBeenCalled();
  });
});
