import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { requireCronSecret } from "./auth";

function req(authorization?: string): Request {
  return new Request("https://example.com/api/cron/health", {
    headers: authorization ? { authorization } : {},
  });
}

describe("requireCronSecret", () => {
  const original = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    // `process.env` stores only strings, so assigning `undefined` writes the
    // literal "undefined" — the same coercion that caused the outage this file
    // exists to pin. Delete instead, or the next cron test to run in this
    // worker inherits a CRON_SECRET that looks set and isn't.
    if (original === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = original;
    }
    vi.restoreAllMocks();
  });

  it("authorizes a request carrying the configured secret", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(requireCronSecret(req("Bearer s3cret"))).toBeNull();
  });

  it("rejects a wrong secret", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(requireCronSecret(req("Bearer nope"))?.status).toBe(401);
  });

  it("rejects a missing header", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(requireCronSecret(req())?.status).toBe(401);
  });

  it("rejects the raw secret sent without the 'Bearer ' prefix", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(requireCronSecret(req("s3cret"))?.status).toBe(401);
  });

  // Pins the `!secret` guard specifically: narrowing it to `secret === undefined`
  // would let a blank env var fall through to the equality branch, losing the
  // misconfiguration log that makes a dead cron diagnosable.
  it("fails closed and logs misconfiguration when CRON_SECRET is an empty string", () => {
    process.env.CRON_SECRET = "";
    expect(requireCronSecret(req())?.status).toBe(401);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("CRON_SECRET is not set")
    );
  });

  // The severity split IS the diagnosability fix — collapsing both branches to
  // one logger would make a misconfigured cron indistinguishable from a
  // rejected caller again.
  it("warns rather than errors when the secret is configured but the request is invalid", () => {
    process.env.CRON_SECRET = "s3cret";
    requireCronSecret(req("Bearer nope"));
    expect(console.warn).toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  // The bug that silently killed the nightly parking reminder for a week: with
  // CRON_SECRET unset, the old check compared against the literal string
  // "Bearer undefined" — so Vercel's real (header-less) cron invocation 401'd
  // while any public caller sending that literal was let straight through.
  describe("when CRON_SECRET is unset", () => {
    beforeEach(() => {
      delete process.env.CRON_SECRET;
    });

    it("rejects the literal 'Bearer undefined' instead of authorizing it", () => {
      expect(requireCronSecret(req("Bearer undefined"))?.status).toBe(401);
    });

    it("rejects a header-less request and logs the misconfiguration", () => {
      expect(requireCronSecret(req())?.status).toBe(401);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("CRON_SECRET is not set")
      );
    });
  });
});
