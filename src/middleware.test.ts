import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { createServerClient } from "@supabase/ssr";
import * as Sentry from "@sentry/nextjs";
import { config, middleware } from "./middleware";

type ProfileResult = { data: { role: string } | null; error: { message: string } | null };

const AUTH_ID = "11111111-1111-4111-8111-111111111111";

function wire(user: { id: string } | null, profile: ProfileResult) {
  const eq = vi.fn(() => ({ maybeSingle: async () => profile }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  vi.mocked(createServerClient).mockReturnValue({
    auth: { getUser: async () => ({ data: { user } }) },
    from,
  } as never);
  return { from, select, eq };
}

function request(path: string, ua = "Mozilla/5.0 (iPhone)") {
  return new NextRequest(new URL(path, "https://shop.example.com"), {
    headers: { "user-agent": ua },
  });
}

function location(res: Response) {
  const value = res.headers.get("location");
  return value ? new URL(value).pathname : null;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("middleware role gate", () => {
  it("sends an unauthenticated visitor on a protected route to /login", async () => {
    wire(null, { data: null, error: null });
    expect(location(await middleware(request("/dashboard")))).toBe("/login");
    expect(location(await middleware(request("/inspections")))).toBe("/login");
  });

  it("lets a manager through to the dashboard with one role read", async () => {
    const { from, select, eq } = wire({ id: AUTH_ID }, { data: { role: "manager" }, error: null });
    const res = await middleware(request("/dashboard"));
    expect(location(res)).toBeNull();
    expect(res.status).toBe(200);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("users");
    expect(select).toHaveBeenCalledWith("role");
    expect(eq).toHaveBeenCalledWith("auth_id", AUTH_ID);
  });

  it("keeps a tech on the tech routes", async () => {
    wire({ id: AUTH_ID }, { data: { role: "tech" }, error: null });
    expect(location(await middleware(request("/dashboard")))).toBe("/dvi");
    expect(location(await middleware(request("/jobs/abc")))).toBe("/dvi");
    expect(location(await middleware(request("/inspections")))).toBe("/dvi");
    expect(location(await middleware(request("/parking")))).toBeNull();
    expect(location(await middleware(request("/quick-pay")))).toBeNull();
  });

  it("treats a failed role read as a tech and reports it", async () => {
    wire({ id: AUTH_ID }, { data: null, error: { message: "connection reset" } });
    const res = await middleware(request("/dashboard"));
    expect(location(res)).toBe("/dvi");
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { source: "middleware" }, extra: { path: "/dashboard", authId: AUTH_ID } })
    );
  });

  it("treats a sign-in with no users row as a tech and warns", async () => {
    wire({ id: AUTH_ID }, { data: null, error: null });
    expect(location(await middleware(request("/dashboard")))).toBe("/dvi");
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "middleware_user_row_missing",
      expect.objectContaining({ level: "warning", tags: { source: "middleware" } })
    );
  });

  it("routes a signed-in visitor off /login by role", async () => {
    wire({ id: AUTH_ID }, { data: { role: "manager" }, error: null });
    expect(location(await middleware(request("/login")))).toBe("/dashboard");

    wire({ id: AUTH_ID }, { data: { role: "tech" }, error: null });
    expect(location(await middleware(request("/login")))).toBe("/dvi");

    wire({ id: AUTH_ID }, { data: null, error: { message: "timeout" } });
    expect(location(await middleware(request("/login")))).toBe("/dvi");
  });

  it("does not read the role on public token routes", async () => {
    const { from } = wire({ id: AUTH_ID }, { data: { role: "manager" }, error: null });
    for (const path of ["/estimates/approve/some-token", "/inspect/some-token", "/receipt/some-token"]) {
      const res = await middleware(request(path));
      expect(location(res)).toBeNull();
    }
    expect(from).not.toHaveBeenCalled();
  });

  it("lets a logged-out customer open the public token routes", async () => {
    wire(null, { data: null, error: null });
    for (const path of ["/estimates/approve/some-token", "/inspect/some-token", "/receipt/some-token"]) {
      expect(location(await middleware(request(path)))).toBeNull();
    }
  });

  it("blocks crawlers before any Supabase call", async () => {
    const res = await middleware(request("/dashboard", "Mozilla/5.0 (compatible; Googlebot/2.1)"));
    expect(res.status).toBe(403);
    expect(createServerClient).not.toHaveBeenCalled();
  });
});

describe("middleware matcher", () => {
  const matches = (path: string) =>
    unstable_doesMiddlewareMatch({ config, url: `https://shop.example.com${path}` });

  it("runs on app pages", () => {
    expect(matches("/dashboard")).toBe(true);
    expect(matches("/jobs/abc")).toBe(true);
    expect(matches("/login")).toBe(true);
  });

  it("skips API routes, the Sentry tunnel and static assets", () => {
    expect(matches("/api/stripe/webhooks")).toBe(false);
    expect(matches("/monitoring?o=1")).toBe(false);
    expect(matches("/_next/static/chunks/main.js")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
  });
});
