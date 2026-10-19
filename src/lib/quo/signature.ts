import { createHmac, timingSafeEqual } from "node:crypto";

export const QUO_SIGNATURE_HEADER = "openphone-signature";

// Quo (OpenPhone) signs each webhook as `hmac;1;<timestamp>;<base64 signature>`:
// HMAC-SHA256 of `${timestamp}.${rawBody}` keyed by the base64-decoded signing
// key shown in the webhook's details page. The raw body is signed as sent, so
// the route must read it as text before parsing.
export function verifyQuoSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = header.split(";");
  if (parts.length < 4) return false;
  const [scheme, , timestamp, providedSig] = parts;
  if (scheme !== "hmac" || !timestamp || !providedSig) return false;

  const expected = createHmac("sha256", Buffer.from(secret, "base64"))
    .update(`${timestamp}.${rawBody}`)
    .digest();
  const provided = Buffer.from(providedSig, "base64");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

// Quo issues one signing key per webhook. The env var holds them
// comma-separated so two webhooks can point at one endpoint and a key can be
// rotated by listing old and new until traffic moves.
export function verifyQuoSignatureAny(rawBody: string, header: string | null, secrets: string): boolean {
  return secrets
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .some((secret) => verifyQuoSignature(rawBody, header, secret));
}
