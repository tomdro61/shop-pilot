import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { createServerClient } from "@supabase/ssr";
import * as Sentry from "@sentry/nextjs";
import { middleware } from "./middleware";

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
    const res = await middleware(request("/dashboard"));
    expect(location(res)).toBe("/login");
  });

  it("lets a manager through to the dashboard with one role read", async () => {
    const { from, eq } = wire({ id: AUTH_ID }, { data: { role: "manager" }, error: null });
    const res = await middleware(request("/dashboard"));
    expect(location(res)).toBeNull();
    expect(res.status).toBe(200);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("users");
    expect(eq).toHaveBeenCalledWith("auth_id", AUTH_ID);
  });

  it("keeps a tech on the tech routes", async () => {
    wire({ id: AUTH_ID }, { data: { role: "tech" }, error: null });
    expect(location(await middleware(request("/dashboard")))).toBe("/dvi");
    expect(location(await middleware(request("/jobs/abc")))).toBe("/dvi");
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
      expect.objectContaining({ tags: { source: "middleware" } })
    );
  });

  it("treats a sign-in with no users row as a tech", async () => {
    wire({ id: AUTH_ID }, { data: null, error: null });
    expect(location(await middleware(request("/dashboard")))).toBe("/dvi");
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("routes a signed-in visitor off /login by role", async () => {
    wire({ id: AUTH_ID }, { data: { role: "manager" }, error: null });
    expect(location(await middleware(request("/login")))).toBe("/dashboard");

    wire({ id: AUTH_ID }, { data: { role: "tech" }, error: null });
    expect(location(await middleware(request("/login")))).toBe("/dvi");

    wire({ id: AUTH_ID }, { data: null, error: { message: "timeout" } });
    expect(location(await middleware(request("/login")))).toBe("/dvi");
  });

  it("does not read the role on public routes", async () => {
    const { from } = wire({ id: AUTH_ID }, { data: { role: "manager" }, error: null });
    const res = await middleware(request("/estimates/approve/some-token"));
    expect(location(res)).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("blocks crawlers before any Supabase call", async () => {
    const res = await middleware(request("/dashboard", "Mozilla/5.0 (compatible; Googlebot/2.1)"));
    expect(res.status).toBe(403);
    expect(createServerClient).not.toHaveBeenCalled();
  });
});
