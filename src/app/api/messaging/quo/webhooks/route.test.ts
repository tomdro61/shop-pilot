import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) },
}));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));
vi.mock("@/lib/actions/messages", () => ({ logInboundSMS: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import { logInboundSMS } from "@/lib/actions/messages";
import { POST } from "./route";

const SECRET = Buffer.from("shop-signing-key").toString("base64");
const SHOP_LINE = "+16179968371";
const TS = "1760000000000";

function sign(rawBody: string, key = SECRET): string {
  const sig = createHmac("sha256", Buffer.from(key, "base64")).update(`${TS}.${rawBody}`).digest("base64");
  return `hmac;1;${TS};${sig}`;
}

function inbound(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "message.received",
    data: { object: { from: "+16175551234", to: SHOP_LINE, body: "On my way", ...overrides } },
  });
}

function request(rawBody: string, headers: Record<string, string>) {
  return new Request("https://example.com/api/messaging/quo/webhooks", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(logInboundSMS).mockResolvedValue({ success: true } as never);
  vi.stubEnv("QUO_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("QUO_SHOP_PHONE_NUMBER", SHOP_LINE);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Quo webhook signature", () => {
  it("refuses every delivery and reports to Sentry when no secret is configured", async () => {
    vi.stubEnv("QUO_WEBHOOK_SECRET", "");
    const body = inbound();
    const res = (await POST(request(body, { "openphone-signature": sign(body) }))) as { status: number };
    expect(res.status).toBe(500);
    expect(logInboundSMS).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "quo_webhook_secret_missing",
      expect.objectContaining({ tags: { source: "quo-webhook" } })
    );
  });

  it("rejects a missing signature", async () => {
    const res = (await POST(request(inbound(), {}))) as { status: number };
    expect(res.status).toBe(401);
    expect(logInboundSMS).not.toHaveBeenCalled();
  });

  it("rejects the bare secret as the header value", async () => {
    const res = (await POST(request(inbound(), { "openphone-signature": SECRET }))) as { status: number };
    expect(res.status).toBe(401);
    expect(logInboundSMS).not.toHaveBeenCalled();
  });

  it("rejects a body signed with another key", async () => {
    const body = inbound();
    const other = Buffer.from("rogue").toString("base64");
    const res = (await POST(request(body, { "openphone-signature": sign(body, other) }))) as { status: number };
    expect(res.status).toBe(401);
    expect(logInboundSMS).not.toHaveBeenCalled();
  });

  it("rejects a body altered after signing", async () => {
    const body = inbound();
    const altered = inbound({ body: "Send $500 to this account" });
    const res = (await POST(request(altered, { "openphone-signature": sign(body) }))) as { status: number };
    expect(res.status).toBe(401);
    expect(logInboundSMS).not.toHaveBeenCalled();
  });

  it("logs a correctly signed inbound text on the shop line", async () => {
    const body = inbound();
    const res = (await POST(request(body, { "openphone-signature": sign(body) }))) as { status: number };
    expect(res.status).toBe(200);
    expect(logInboundSMS).toHaveBeenCalledTimes(1);
    expect(logInboundSMS).toHaveBeenCalledWith({
      customerPhone: "+16175551234",
      body: "On my way",
      phoneLine: "shop",
    });
  });

  it("accepts the x- prefixed header name with the same signature", async () => {
    const body = inbound();
    const res = (await POST(request(body, { "x-openphone-signature": sign(body) }))) as { status: number };
    expect(res.status).toBe(200);
    expect(logInboundSMS).toHaveBeenCalledTimes(1);
  });

  it("accepts a signature from the second of two listed keys", async () => {
    const callsKey = Buffer.from("calls-key").toString("base64");
    vi.stubEnv("QUO_WEBHOOK_SECRET", `${SECRET},${callsKey}`);
    const body = inbound();
    const res = (await POST(request(body, { "openphone-signature": sign(body, callsKey) }))) as { status: number };
    expect(res.status).toBe(200);
  });

  it("returns 400 for a signed body that is not JSON", async () => {
    const body = "not json";
    const res = (await POST(request(body, { "openphone-signature": sign(body) }))) as { status: number };
    expect(res.status).toBe(400);
    expect(logInboundSMS).not.toHaveBeenCalled();
  });

  it("acknowledges other signed event types without logging", async () => {
    const body = JSON.stringify({ type: "call.completed", data: {} });
    const res = (await POST(request(body, { "openphone-signature": sign(body) }))) as { status: number };
    expect(res.status).toBe(200);
    expect(logInboundSMS).not.toHaveBeenCalled();
  });
});
