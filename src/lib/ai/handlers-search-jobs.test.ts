import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("@/lib/actions/jobs", () => ({ getJobs: vi.fn() }));
// The handler module imports every action; none of these are reached by
// search_jobs, so they are stubbed to keep their dependencies out of the test.
vi.mock("@/lib/actions/job-line-items", () => ({}));
vi.mock("@/lib/actions/customers", () => ({}));
vi.mock("@/lib/actions/vehicles", () => ({}));
vi.mock("@/lib/actions/estimates", () => ({}));
vi.mock("@/lib/actions/invoices", () => ({}));
vi.mock("@/lib/actions/team", () => ({}));
vi.mock("@/lib/actions/reports", () => ({}));
vi.mock("@/lib/actions/messages", () => ({}));
vi.mock("@/lib/actions/settings", () => ({}));
vi.mock("@/lib/actions/parking", () => ({}));
vi.mock("@/lib/actions/catalog", () => ({}));

import { getJobs } from "@/lib/actions/jobs";
import { executeToolCall } from "./handlers";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("executeToolCall search_jobs", () => {
  it("asks for one bounded page and reports the full match count beside what it returned", async () => {
    vi.mocked(getJobs).mockResolvedValue({
      jobs: [{ id: "a" }, { id: "b" }],
      nextCursor: { date_received: "2026-10-18", id: "b" },
      totalCount: 40,
    } as unknown as Awaited<ReturnType<typeof getJobs>>);

    const raw = await executeToolCall("search_jobs", { search: "honda", status: "complete" });

    expect(getJobs).toHaveBeenCalledWith({ search: "honda", status: "complete" }, { limit: 25 });
    expect(JSON.parse(raw)).toEqual({
      jobs: [{ id: "a" }, { id: "b" }],
      total_matches: 40,
      showing: 2,
    });
  });
});
