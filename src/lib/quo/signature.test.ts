import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  QUO_SIGNATURE_TOLERANCE_MS,
  parseQuoSignatureHeader,
  splitQuoSecrets,
  verifyQuoSignature,
  verifyQuoSignatureAny,
} from "./signature";

const secret = Buffer.from("shop-signing-key").toString("base64");
const body = JSON.stringify({ type: "message.received", data: { object: { from: "+16175551234" } } });
const NOW = 1760000000000;
const ts = String(NOW);
const at = { now: NOW };

// Mirrors Quo's published scheme. There is no vendor-published test vector to
// pin against, so this proves the code agrees with the documented algorithm,
// not with a captured delivery; the first real text after deploy is that check.
function sign(rawBody: string, timestamp: string, key = secret): string {
  const sig = createHmac("sha256", Buffer.from(key, "base64"))
    .update(`${timestamp}.${rawBody}`)
    .digest("base64");
  return `hmac;1;${timestamp};${sig}`;
}

describe("verifyQuoSignature", () => {
  it("accepts a correctly signed body", () => {
    expect(verifyQuoSignature(body, sign(body, ts), secret, at)).toEqual({ ok: true });
  });

  it("accepts a ten-digit (seconds) timestamp", () => {
    const seconds = String(Math.floor(NOW / 1000));
    expect(verifyQuoSignature(body, sign(body, seconds), secret, at)).toEqual({ ok: true });
  });

  it("rejects a tampered body", () => {
    expect(verifyQuoSignature(body + " ", sign(body, ts), secret, at)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects a signature made with another key", () => {
    const other = Buffer.from("not-our-key").toString("base64");
    expect(verifyQuoSignature(body, sign(body, ts, other), secret, at)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects a shifted timestamp inside the window", () => {
    const parts = sign(body, ts).split(";");
    parts[2] = String(NOW + 1);
    expect(verifyQuoSignature(body, parts.join(";"), secret, at)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects a delivery older than the tolerance as stale, even when correctly signed", () => {
    const old = String(NOW - QUO_SIGNATURE_TOLERANCE_MS - 1);
    expect(verifyQuoSignature(body, sign(body, old), secret, at)).toEqual({ ok: false, reason: "stale" });
    const future = String(NOW + QUO_SIGNATURE_TOLERANCE_MS + 1);
    expect(verifyQuoSignature(body, sign(body, future), secret, at)).toEqual({ ok: false, reason: "stale" });
    const edge = String(NOW - QUO_SIGNATURE_TOLERANCE_MS);
    expect(verifyQuoSignature(body, sign(body, edge), secret, at)).toEqual({ ok: true });
  });

  it("honours a custom tolerance", () => {
    const old = String(NOW - 60_000);
    expect(verifyQuoSignature(body, sign(body, old), secret, { now: NOW, toleranceMs: 30_000 })).toEqual({ ok: false, reason: "stale" });
    expect(verifyQuoSignature(body, sign(body, old), secret, { now: NOW, toleranceMs: 120_000 })).toEqual({ ok: true });
  });

  it("rejects a missing header as missing", () => {
    expect(verifyQuoSignature(body, null, secret, at)).toEqual({ ok: false, reason: "missing" });
  });

  it("rejects malformed headers as malformed", () => {
    for (const header of ["garbage", `hmac;1;${ts}`, "hmac;1;;", `hmac;1;not-a-number;abc`, sign(body, ts).replace(/^hmac/, "plain")]) {
      expect(verifyQuoSignature(body, header, secret, at)).toEqual({ ok: false, reason: "malformed" });
    }
  });

  it("rejects the plain secret as the header value (the old check's contract)", () => {
    expect(verifyQuoSignature(body, secret, secret, at).ok).toBe(false);
  });

  it("rejects a right-length signature with wrong bytes", () => {
    const parts = sign(body, ts).split(";");
    const sig = parts[3];
    parts[3] = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(verifyQuoSignature(body, parts.join(";"), secret, at)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects a wrong-length signature without throwing", () => {
    expect(verifyQuoSignature(body, `hmac;1;${ts};AAAA`, secret, at)).toEqual({ ok: false, reason: "mismatch" });
  });
});

describe("parseQuoSignatureHeader", () => {
  it("extracts the timestamp and signature", () => {
    expect(parseQuoSignatureHeader(`hmac;1;${ts};abc=`)).toEqual({ timestamp: ts, signature: "abc=" });
  });
});

describe("splitQuoSecrets", () => {
  it("drops blanks so a trailing comma can't add an empty key", () => {
    expect(splitQuoSecrets(` ${secret}, `)).toEqual([secret]);
    expect(splitQuoSecrets(" , ")).toEqual([]);
  });
});

describe("verifyQuoSignatureAny", () => {
  const messagesKey = Buffer.from("messages-webhook-key").toString("base64");
  const callsKey = Buffer.from("calls-webhook-key").toString("base64");
  const both = ` ${messagesKey}, ${callsKey} `;

  it("accepts an event signed with either listed key", () => {
    expect(verifyQuoSignatureAny(body, sign(body, ts, messagesKey), both, at)).toEqual({ ok: true });
    expect(verifyQuoSignatureAny(body, sign(body, ts, callsKey), both, at)).toEqual({ ok: true });
  });

  it("rejects a key that is not listed", () => {
    const rogue = Buffer.from("rogue").toString("base64");
    expect(verifyQuoSignatureAny(body, sign(body, ts, rogue), both, at)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("never accepts a signature made with an empty key", () => {
    const forged = sign(body, ts, "");
    expect(verifyQuoSignatureAny(body, forged, " , ", at)).toEqual({ ok: false, reason: "no_keys" });
    expect(verifyQuoSignatureAny(body, forged, `${secret},`, at)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("reports stale and malformed without trying every key", () => {
    const old = String(NOW - QUO_SIGNATURE_TOLERANCE_MS - 1);
    expect(verifyQuoSignatureAny(body, sign(body, old, callsKey), both, at)).toEqual({ ok: false, reason: "stale" });
    expect(verifyQuoSignatureAny(body, "garbage", both, at)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyQuoSignatureAny(body, null, both, at)).toEqual({ ok: false, reason: "missing" });
  });
});
