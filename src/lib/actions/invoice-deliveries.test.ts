/**
 * getInvoiceDeliveriesForJobs reads the messages log for the invoice-send
 * history shown on the job and customer pages. The predicates are the feature:
 * drop the job filter and customer A's page lists customer B's invoice texts;
 * drop the direction filter and a customer's inbound reply counts as a send.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getInvoiceDeliveriesForJobs } from "./invoice-deliveries";
import { createSupabaseMock } from "./__test-helpers__/supabase-mock";

const JOB_A = "aaaaaaaa-aaaa-4aaa-9aaa-aaaaaaaaaaaa";
const JOB_B = "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb";

const ROW = {
  id: "m1",
  job_id: JOB_A,
  channel: "sms",
  status: "sent",
  body: "Hi EZY, your invoice from Broadway Motors is ready. Pay here: https://x",
  sent_at: "2026-10-09T18:50:33.447Z",
};

describe("getInvoiceDeliveriesForJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty list without touching the database when given no jobs", async () => {
    const result = await getInvoiceDeliveriesForJobs([]);
    expect(result).toEqual({ ok: true, data: [] });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("scopes the read to the given jobs, outbound only, invoice wording only, newest first", async () => {
    const mock = createSupabaseMock({ data: [ROW], error: null });
    vi.mocked(createClient).mockResolvedValue(mock.client as never);

    const result = await getInvoiceDeliveriesForJobs([JOB_A, JOB_B]);

    expect(result).toEqual({ ok: true, data: [ROW] });
    expect(mock.calls).toEqual([
      { method: "from", args: ["messages"] },
      { method: "select", args: ["id, job_id, channel, status, body, sent_at"] },
      { method: "in", args: ["job_id", [JOB_A, JOB_B]] },
      { method: "eq", args: ["direction", "out"] },
      { method: "ilike", args: ["body", "%invoice%"] },
      { method: "order", args: ["sent_at", { ascending: false }] },
      { method: "limit", args: [200] },
    ]);
  });

  it("surfaces a query error instead of an empty history", async () => {
    const mock = createSupabaseMock({ data: null, error: { message: "boom" } });
    vi.mocked(createClient).mockResolvedValue(mock.client as never);

    const result = await getInvoiceDeliveriesForJobs([JOB_A]);

    expect(result).toEqual({ ok: false, error: "boom" });
  });
});
