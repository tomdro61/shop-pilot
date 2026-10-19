import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyQuoSignature, verifyQuoSignatureAny } from "./signature";

const secret = Buffer.from("shop-signing-key").toString("base64");
const body = JSON.stringify({ type: "message.received", data: { object: { from: "+16175551234" } } });
const ts = "1760000000000";

function sign(rawBody: string, timestamp: string, key = secret): string {
  const sig = createHmac("sha256", Buffer.from(key, "base64"))
    .update(`${timestamp}.${rawBody}`)
    .digest("base64");
  return `hmac;1;${timestamp};${sig}`;
}

describe("verifyQuoSignature", () => {
  it("accepts a correctly signed body", () => {
    expect(verifyQuoSignature(body, sign(body, ts), secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifyQuoSignature(body + " ", sign(body, ts), secret)).toBe(false);
  });

  it("rejects a signature made with another key", () => {
    const other = Buffer.from("not-our-key").toString("base64");
    expect(verifyQuoSignature(body, sign(body, ts, other), secret)).toBe(false);
  });

  it("rejects a shifted timestamp", () => {
    const parts = sign(body, ts).split(";");
    parts[2] = "1760000000001";
    expect(verifyQuoSignature(body, parts.join(";"), secret)).toBe(false);
  });

  it("rejects a missing, malformed, or non-hmac header", () => {
    expect(verifyQuoSignature(body, null, secret)).toBe(false);
    expect(verifyQuoSignature(body, "garbage", secret)).toBe(false);
    expect(verifyQuoSignature(body, `hmac;1;${ts}`, secret)).toBe(false);
    expect(verifyQuoSignature(body, "hmac;1;;", secret)).toBe(false);
    expect(verifyQuoSignature(body, sign(body, ts).replace(/^hmac/, "plain"), secret)).toBe(false);
  });

  it("rejects the plain secret as the header value (the old check's contract)", () => {
    expect(verifyQuoSignature(body, secret, secret)).toBe(false);
  });

  it("rejects a right-length signature with wrong bytes", () => {
    const parts = sign(body, ts).split(";");
    const sig = parts[3];
    parts[3] = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(verifyQuoSignature(body, parts.join(";"), secret)).toBe(false);
  });
});

describe("verifyQuoSignatureAny", () => {
  const messagesKey = Buffer.from("messages-webhook-key").toString("base64");
  const callsKey = Buffer.from("calls-webhook-key").toString("base64");
  const both = ` ${messagesKey}, ${callsKey} `;

  it("accepts an event signed with either listed key", () => {
    expect(verifyQuoSignatureAny(body, sign(body, ts, messagesKey), both)).toBe(true);
    expect(verifyQuoSignatureAny(body, sign(body, ts, callsKey), both)).toBe(true);
  });

  it("rejects a key that is not listed", () => {
    const rogue = Buffer.from("rogue").toString("base64");
    expect(verifyQuoSignatureAny(body, sign(body, ts, rogue), both)).toBe(false);
  });

  it("rejects an empty secret list", () => {
    expect(verifyQuoSignatureAny(body, sign(body, ts), " , ")).toBe(false);
  });
});
