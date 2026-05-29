import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireManager: vi.fn() }));
vi.mock("@/lib/quo/client", () => ({ sendSMS: vi.fn() }));
vi.mock("@/lib/quo/routing", () => ({ getPhoneNumber: vi.fn(() => "+1shopline") }));
vi.mock("@/lib/messaging/log", () => ({ logOutboundSms: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { sendSMS } from "@/lib/quo/client";
import { logOutboundSms } from "@/lib/messaging/log";
import { createSupabaseMock } from "@/lib/actions/__test-helpers__/supabase-mock";
import {
  confirmAppointment,
  rescheduleAppointment,
  cancelAppointment,
  getAppointmentInbox,
} from "./appointments";

function useMock(result: Parameters<typeof createSupabaseMock>[0]) {
  const mock = createSupabaseMock(result);
  vi.mocked(createClient).mockResolvedValue(
    mock.client as unknown as Awaited<ReturnType<typeof createClient>>
  );
  return mock;
}

const hadUpdate = (mock: ReturnType<typeof createSupabaseMock>) =>
  mock.calls.some((c) => c.method === "update");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireManager).mockResolvedValue({ ok: true, userId: "u1" });
  vi.mocked(sendSMS).mockResolvedValue({ success: true, testMode: false });
  vi.mocked(logOutboundSms).mockResolvedValue({});
});

const ET = { etDate: "2026-07-15", etTime: "13:00" };
const PENDING = {
  id: "a1",
  status: "pending",
  customer_id: "c1",
  snapshot_customer_phone: "+16175551234",
  service_category: "brakes",
};

describe("confirmAppointment", () => {
  it("rejects a non-pending appointment without updating", async () => {
    const mock = useMock({ data: { ...PENDING, status: "confirmed" }, error: null });
    const result = await confirmAppointment("a1", ET);
    expect(result.ok).toBe(false);
    expect(hadUpdate(mock)).toBe(false);
  });

  it("confirms a pending appointment and reports smsSent:true on success", async () => {
    const mock = useMock({ data: PENDING, error: null });
    const result = await confirmAppointment("a1", ET);
    expect(result).toEqual({ ok: true, data: { smsSent: true } });
    expect(sendSMS).toHaveBeenCalled();
    expect(logOutboundSms).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "sent",
        phone_line: "shop",
        related_appointment_id: "a1",
      })
    );
    const update = mock.calls.find((c) => c.method === "update");
    expect(update?.args[0]).toMatchObject({
      status: "confirmed",
      scheduled_at: expect.any(String),
    });
  });

  it("still confirms (ok) but reports smsSent:false when the text fails", async () => {
    useMock({ data: PENDING, error: null });
    vi.mocked(sendSMS).mockRejectedValue(new Error("quo down"));
    const result = await confirmAppointment("a1", ET);
    expect(result).toEqual({ ok: true, data: { smsSent: false } });
    expect(logOutboundSms).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed" })
    );
  });

  it("does not log to messages when the appointment has no linked customer", async () => {
    useMock({ data: { ...PENDING, customer_id: null }, error: null });
    const result = await confirmAppointment("a1", ET);
    expect(result).toEqual({ ok: true, data: { smsSent: true } });
    expect(logOutboundSms).not.toHaveBeenCalled();
  });

  it("rejects an invalid time without touching the DB", async () => {
    const mock = useMock({ data: PENDING, error: null });
    const result = await confirmAppointment("a1", { etDate: "2026-07-15", etTime: "9am" });
    expect(result.ok).toBe(false);
    expect(hadUpdate(mock)).toBe(false);
  });
});

describe("rescheduleAppointment", () => {
  it("rejects a non-confirmed appointment", async () => {
    const mock = useMock({ data: { ...PENDING, status: "pending" }, error: null });
    const result = await rescheduleAppointment("a1", ET);
    expect(result.ok).toBe(false);
    expect(hadUpdate(mock)).toBe(false);
  });

  it("reschedules a confirmed appointment and sends the update text", async () => {
    useMock({ data: { ...PENDING, status: "confirmed" }, error: null });
    const result = await rescheduleAppointment("a1", ET);
    expect(result).toEqual({ ok: true, data: { smsSent: true } });
    expect(logOutboundSms).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "sent", related_appointment_id: "a1" })
    );
  });
});

describe("cancelAppointment", () => {
  it("blocks cancelling a converted appointment", async () => {
    const mock = useMock({ data: { status: "converted_to_job" }, error: null });
    const result = await cancelAppointment("a1");
    expect(result.ok).toBe(false);
    expect(hadUpdate(mock)).toBe(false);
  });

  it("blocks cancelling an already-cancelled appointment", async () => {
    const mock = useMock({ data: { status: "cancelled" }, error: null });
    const result = await cancelAppointment("a1");
    expect(result.ok).toBe(false);
    expect(hadUpdate(mock)).toBe(false);
  });

  it("cancels a pending appointment", async () => {
    const mock = useMock({ data: { status: "pending" }, error: null });
    const result = await cancelAppointment("a1");
    expect(result).toEqual({ ok: true });
    const update = mock.calls.find((c) => c.method === "update");
    expect(update?.args[0]).toMatchObject({ status: "cancelled" });
  });
});

describe("getAppointmentInbox", () => {
  it("buckets pending / confirmed (sorted by time) / terminal (14-day window)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00.000Z"));
    const rows = [
      { id: "p1", status: "pending", scheduled_at: null, updated_at: "2026-06-19T00:00:00Z" },
      { id: "c2", status: "confirmed", scheduled_at: "2026-06-25T17:00:00Z", updated_at: "2026-06-19T00:00:00Z" },
      { id: "c1", status: "confirmed", scheduled_at: "2026-06-22T13:00:00Z", updated_at: "2026-06-19T00:00:00Z" },
      { id: "t_recent", status: "cancelled", scheduled_at: null, updated_at: "2026-06-10T00:00:00Z" }, // 10d ago → in
      { id: "t_old", status: "cancelled", scheduled_at: null, updated_at: "2026-05-20T00:00:00Z" }, // ~31d ago → out
    ];
    useMock({ data: rows, error: null });

    const inbox = await getAppointmentInbox();
    expect(inbox.pending.map((r) => r.id)).toEqual(["p1"]);
    expect(inbox.confirmed.map((r) => r.id)).toEqual(["c1", "c2"]); // ascending by scheduled_at
    expect(inbox.terminal.map((r) => r.id)).toEqual(["t_recent"]);

    vi.useRealTimers();
  });
});
