import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/quo/client", () => ({ sendSMS: vi.fn() }));
vi.mock("@/lib/quo/routing", () => ({ getPhoneNumber: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/messaging/log", () => ({ logOutboundSms: vi.fn() }));

import { sendSMS } from "@/lib/quo/client";
import { getPhoneNumber } from "@/lib/quo/routing";
import { logOutboundSms } from "@/lib/messaging/log";
import { onQuoteRequestCreated } from "./on-quote-request-created";

const base = {
  customerId: "cust-1" as string | null,
  phone: "+16175551234",
  closedState: { closed: false } as const,
  firstName: "Maria",
  lastName: "Silva",
  services: ["Brake Repair", "Oil Change"],
  vehicleYear: 2018,
  vehicleMake: "Honda",
  vehicleModel: "Civic",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPhoneNumber).mockReturnValue("+1shopline");
  vi.mocked(logOutboundSms).mockResolvedValue({});
  delete process.env.INTERNAL_NOTIFICATION_PHONES;
});

describe("onQuoteRequestCreated", () => {
  it("sends the ack on the shop line and logs status:'sent'", async () => {
    vi.mocked(sendSMS).mockResolvedValue({ success: true, testMode: false });

    const res = await onQuoteRequestCreated(base);

    expect(res).toEqual({ smsSent: true, smsError: undefined, messageLogged: true });
    expect(sendSMS).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+16175551234", from: "+1shopline" })
    );
    expect(logOutboundSms).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ customer_id: "cust-1", status: "sent", phone_line: "shop" })
    );
  });

  it("uses next-open-morning copy when the shop is closed", async () => {
    vi.mocked(sendSMS).mockResolvedValue({ success: true, testMode: false });

    await onQuoteRequestCreated({
      ...base,
      closedState: { closed: true, reason: "evening" },
    });

    const ack = vi.mocked(sendSMS).mock.calls[0][0];
    expect(ack.body).toContain("by 9am tomorrow");
  });

  it("records status:'failed' + smsError without throwing when the send fails", async () => {
    vi.mocked(sendSMS).mockRejectedValue(new Error("quo down"));

    const res = await onQuoteRequestCreated(base);

    expect(res.smsSent).toBe(false);
    expect(res.smsError).toBe("quo down");
    expect(res.messageLogged).toBe(true);
    expect(logOutboundSms).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed" })
    );
  });

  it("does not throw and logs status:'failed' when the phone-line env is missing", async () => {
    vi.mocked(getPhoneNumber).mockImplementation(() => {
      throw new Error("QUO_SHOP_PHONE_NUMBER is not set");
    });

    const res = await onQuoteRequestCreated(base);

    expect(res.smsSent).toBe(false);
    expect(res.smsError).toContain("QUO_SHOP_PHONE_NUMBER");
    expect(sendSMS).not.toHaveBeenCalled();
    expect(logOutboundSms).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed" })
    );
  });

  it("skips the messages log and returns messageLogged:false when there is no customer", async () => {
    vi.mocked(sendSMS).mockResolvedValue({ success: true, testMode: false });

    const res = await onQuoteRequestCreated({ ...base, customerId: null });

    expect(res.smsSent).toBe(true);
    expect(res.messageLogged).toBe(false);
    expect(logOutboundSms).not.toHaveBeenCalled();
  });

  it("fans out an owner alert to INTERNAL_NOTIFICATION_PHONES", async () => {
    vi.mocked(sendSMS).mockResolvedValue({ success: true, testMode: false });
    process.env.INTERNAL_NOTIFICATION_PHONES = "+1ownerA, +1ownerB";

    await onQuoteRequestCreated(base);

    expect(sendSMS).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+1ownerA", from: "+1shopline" })
    );
    expect(sendSMS).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+1ownerB", from: "+1shopline" })
    );
    const ownerCall = vi.mocked(sendSMS).mock.calls.find((c) => c[0].to === "+1ownerA");
    expect(ownerCall?.[0].body).toContain("New quote request");
  });

  it("isolates an owner-alert failure — the ack result is unaffected", async () => {
    process.env.INTERNAL_NOTIFICATION_PHONES = "+1ownerA";
    vi.mocked(sendSMS).mockImplementation(({ to }) =>
      to === "+1ownerA"
        ? Promise.reject(new Error("owner unreachable"))
        : Promise.resolve({ success: true, testMode: false })
    );

    const res = await onQuoteRequestCreated(base);

    expect(res.smsSent).toBe(true);
    expect(res.messageLogged).toBe(true);
  });

  it("skips the owner alert when INTERNAL_NOTIFICATION_PHONES is unset", async () => {
    vi.mocked(sendSMS).mockResolvedValue({ success: true, testMode: false });

    await onQuoteRequestCreated(base);

    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(sendSMS).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+16175551234" })
    );
  });
});
