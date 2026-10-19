import { createHmac, timingSafeEqual } from "node:crypto";

export const QUO_SIGNATURE_HEADER = "openphone-signature";

// Quo's webhook page recommends rejecting deliveries more than five minutes
// off the current time.
export const QUO_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

export type QuoSignatureResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "malformed" | "stale" | "mismatch" | "no_keys" };

export interface QuoSignatureOptions {
  now?: number;
  toleranceMs?: number;
}

export function parseQuoSignatureHeader(
  header: string | null
): { timestamp: string; signature: string } | null {
  if (!header) return null;
  const parts = header.split(";");
  if (parts.length < 4) return null;
  const [scheme, , timestamp, signature] = parts;
  if (scheme !== "hmac" || !/^\d+$/.test(timestamp) || !signature) return null;
  return { timestamp, signature };
}

// Quo's example timestamp is milliseconds; the docs don't state the unit, so
// a ten-digit value is read as seconds.
function timestampToMs(timestamp: string): number {
  const n = Number(timestamp);
  return timestamp.length <= 10 ? n * 1000 : n;
}

// Quo (OpenPhone) signs each webhook as `hmac;1;<timestamp>;<base64 signature>`:
// HMAC-SHA256 of `${timestamp}.${rawBody}` keyed by the base64-decoded signing
// key shown in the webhook's details page. The raw body is signed as sent, so
// the route must read it as text before parsing.
export function verifyQuoSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  options: QuoSignatureOptions = {}
): QuoSignatureResult {
  if (!header) return { ok: false, reason: "missing" };
  const parsed = parseQuoSignatureHeader(header);
  if (!parsed) return { ok: false, reason: "malformed" };

  const now = options.now ?? Date.now();
  const toleranceMs = options.toleranceMs ?? QUO_SIGNATURE_TOLERANCE_MS;
  if (Math.abs(now - timestampToMs(parsed.timestamp)) > toleranceMs) {
    return { ok: false, reason: "stale" };
  }

  const expected = createHmac("sha256", Buffer.from(secret, "base64"))
    .update(`${parsed.timestamp}.${rawBody}`)
    .digest();
  const provided = Buffer.from(parsed.signature, "base64");
  if (provided.length !== expected.length) return { ok: false, reason: "mismatch" };
  return timingSafeEqual(provided, expected) ? { ok: true } : { ok: false, reason: "mismatch" };
}

export function splitQuoSecrets(secrets: string): string[] {
  return secrets
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Quo issues one signing key per webhook. The env var holds them
// comma-separated so two webhooks can point at one endpoint and a key can be
// rotated by listing old and new until traffic moves.
export function verifyQuoSignatureAny(
  rawBody: string,
  header: string | null,
  secrets: string,
  options: QuoSignatureOptions = {}
): QuoSignatureResult {
  const keys = splitQuoSecrets(secrets);
  if (keys.length === 0) return { ok: false, reason: "no_keys" };
  let last: QuoSignatureResult = { ok: false, reason: "mismatch" };
  for (const key of keys) {
    last = verifyQuoSignature(rawBody, header, key, options);
    if (last.ok) return last;
    // Missing, malformed and stale don't depend on the key.
    if (last.reason !== "mismatch") return last;
  }
  return last;
}
