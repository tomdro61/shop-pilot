import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { logOutboundSms } from "./log";
import { createSupabaseMock } from "@/lib/actions/__test-helpers__/supabase-mock";

function asClient(
  mock: ReturnType<typeof createSupabaseMock>
): SupabaseClient<Database> {
  return mock.client as unknown as SupabaseClient<Database>;
}

describe("logOutboundSms", () => {
  it("writes one canonical outbound-SMS row (channel/direction fixed, optional FKs null)", async () => {
    const mock = createSupabaseMock({ data: null, error: null });

    const res = await logOutboundSms(asClient(mock), {
      customer_id: "cust-1",
      body: "hi there",
      phone_line: "shop",
      status: "sent",
    });

    expect(res).toEqual({});
    expect(mock.calls).toContainEqual({ method: "from", args: ["messages"] });
    const insert = mock.calls.find((c) => c.method === "insert");
    // Locks the exact row all four backfilled callers now depend on.
    expect(insert?.args[0]).toEqual({
      customer_id: "cust-1",
      job_id: null,
      channel: "sms",
      direction: "out",
      body: "hi there",
      status: "sent",
      phone_line: "shop",
      related_appointment_id: null,
    });
  });

  it("passes through job_id and related_appointment_id when provided", async () => {
    const mock = createSupabaseMock({ data: null, error: null });

    await logOutboundSms(asClient(mock), {
      customer_id: "cust-2",
      body: "ack",
      phone_line: "apb",
      status: "failed",
      job_id: "job-1",
      related_appointment_id: "appt-9",
    });

    const insert = mock.calls.find((c) => c.method === "insert");
    expect(insert?.args[0]).toMatchObject({
      job_id: "job-1",
      related_appointment_id: "appt-9",
      status: "failed",
      phone_line: "apb",
    });
  });

  it("returns { error } when the insert fails so best-effort callers can react", async () => {
    const mock = createSupabaseMock({
      data: null,
      error: { message: "rls denied" },
    });

    const res = await logOutboundSms(asClient(mock), {
      customer_id: "cust-3",
      body: "x",
      phone_line: "shop",
      status: "sent",
    });

    expect(res).toEqual({ error: "rls denied" });
  });
});
