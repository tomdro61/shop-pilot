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
const NOW = 1760000000000;
const TS = String(NOW);

function sign(rawBody: string, key = SECRET, timestamp = TS): string {
  const sig = createHmac("sha256", Buffer.from(key, "base64")).update(`${timestamp}.${rawBody}`).digest("base64");
  return `hmac;1;${timestamp};${sig}`;
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

type Res = { status: number };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.mocked(logInboundSMS).mockResolvedValue({ data: { logged: true, customerId: "c1" } } as never);
  vi.stubEnv("QUO_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("QUO_SHOP_PHONE_NUMBER", SHOP_LINE);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Quo webhook signature", () => {
  it("refuses every delivery and reports to Sentry when no secret is configured", async () => {
    vi.stubEnv("QUO_WEBHOOK_SECRET", "");
    const body = inbound();
    const res = (await POST(request(body, { "openphone-signature": sign(body) }))) as Res;
    expect(res.status).toBe(500);
    expect(logInboundSMS).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "quo_webhook_secret_missing",
      expect.objectContaining({ tags: { source: "quo-webhook" } })
    );
  });

  it("rejects a missing signature quietly", async () => {
    const res = (await POST(request(inbound(), {}))) as Res;
    expect(res.status).toBe(401);
    expect(logInboundSMS).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("rejects the bare secret as the header value quietly", async () => {
    const res = (await POST(request(inbound(), { "openphone-signature": SECRET }))) as Res;
    expect(res.status).toBe(401);
    expect(logInboundSMS).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("rejects unsigned non-JSON with 401, not 400", async () => {
    const res = (await POST(request("not json", {}))) as Res;
    expect(res.status).toBe(401);
  });

  it("rejects a body signed with another key and reports the mismatch", async () => {
    const body = inbound();
    const other = Buffer.from("rogue").toString("base64");
    const res = (await POST(request(body, { "openphone-signature": sign(body, other) }))) as Res;
    expect(res.status).toBe(401);
    expect(logInboundSMS).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "quo_webhook_signature_rejected",
      expect.objectContaining({
        tags: { source: "quo-webhook" },
        extra: expect.objectContaining({ reason: "mismatch", keyCount: 1, timestamp: TS }),
      })
    );
  });

  it("rejects a body altered after signing", async () => {
    const body = inbound();
    const altered = inbound({ body: "Send $500 to this account" });
    const res = (await POST(request(altered, { "openphone-signature": sign(body) }))) as Res;
    expect(res.status).toBe(401);
    expect(logInboundSMS).not.toHaveBeenCalled();
  });

  it("rejects a correctly signed delivery older than five minutes and reports it as stale", async () => {
    const body = inbound();
    const old = String(NOW - 6 * 60 * 1000);
    const res = (await POST(request(body, { "openphone-signature": sign(body, SECRET, old) }))) as Res;
    expect(res.status).toBe(401);
    expect(logInboundSMS).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "quo_webhook_signature_rejected",
      expect.objectContaining({ extra: expect.objectContaining({ reason: "stale" }) })
    );
  });

  it("rejects a wrong-length signature with 401 rather than throwing", async () => {
    const res = (await POST(request(inbound(), { "openphone-signature": `hmac;1;${TS};AAAA` }))) as Res;
    expect(res.status).toBe(401);
  });

  it("logs a correctly signed inbound text on the shop line", async () => {
    const body = inbound();
    const res = (await POST(request(body, { "openphone-signature": sign(body) }))) as Res;
    expect(res.status).toBe(200);
    expect(logInboundSMS).toHaveBeenCalledTimes(1);
    expect(logInboundSMS).toHaveBeenCalledWith({
      customerPhone: "+16175551234",
      body: "On my way",
      phoneLine: "shop",
    });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("signs the raw body as sent, so a pretty-printed payload still verifies", async () => {
    const body = JSON.stringify(JSON.parse(inbound()), null, 2) + "\n";
    const res = (await POST(request(body, { "openphone-signature": sign(body) }))) as Res;
    expect(res.status).toBe(200);
    expect(logInboundSMS).toHaveBeenCalledTimes(1);
  });

  it("accepts the x- prefixed header name with the same signature", async () => {
    const body = inbound();
    const res = (await POST(request(body, { "x-openphone-signature": sign(body) }))) as Res;
    expect(res.status).toBe(200);
    expect(logInboundSMS).toHaveBeenCalledTimes(1);
  });

  it("accepts a signature from the second of two listed keys", async () => {
    const callsKey = Buffer.from("calls-key").toString("base64");
    vi.stubEnv("QUO_WEBHOOK_SECRET", `${SECRET},${callsKey}`);
    const body = inbound();
    const res = (await POST(request(body, { "openphone-signature": sign(body, callsKey) }))) as Res;
    expect(res.status).toBe(200);
  });

  it("refuses a secret list with no usable keys and reports it", async () => {
    vi.stubEnv("QUO_WEBHOOK_SECRET", " , ");
    const body = inbound();
    const res = (await POST(request(body, { "openphone-signature": sign(body, "") }))) as Res;
    expect(res.status).toBe(401);
    expect(logInboundSMS).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "quo_webhook_signature_rejected",
      expect.objectContaining({ extra: expect.objectContaining({ reason: "no_keys", keyCount: 0 }) })
    );
  });

  it("returns 400 for a signed body that is not JSON", async () => {
    const body = "not json";
    const res = (await POST(request(body, { "openphone-signature": sign(body) }))) as Res;
    expect(res.status).toBe(400);
    expect(logInboundSMS).not.toHaveBeenCalled();
  });

  it("acknowledges other signed event types without logging", async () => {
    const body = JSON.stringify({ type: "call.completed", data: {} });
    const res = (await POST(request(body, { "openphone-signature": sign(body) }))) as Res;
    expect(res.status).toBe(200);
    expect(logInboundSMS).not.toHaveBeenCalled();
  });
});

describe("Quo webhook logging outcome", () => {
  it("returns 500 and reports when the message can't be logged, so Quo redelivers", async () => {
    vi.mocked(logInboundSMS).mockResolvedValue({ error: "Customer lookup failed: timeout" } as never);
    const body = inbound();
    const res = (await POST(request(body, { "openphone-signature": sign(body) }))) as Res;
    expect(res.status).toBe(500);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { source: "quo-webhook" }, extra: { phoneLine: "shop" } })
    );
  });

  it("acknowledges a text from an unknown number", async () => {
    vi.mocked(logInboundSMS).mockResolvedValue({ data: { logged: false, reason: "unknown_number" } } as never);
    const body = inbound();
    const res = (await POST(request(body, { "openphone-signature": sign(body) }))) as Res;
    expect(res.status).toBe(200);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
