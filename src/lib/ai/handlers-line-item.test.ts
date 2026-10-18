import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("@/lib/actions/job-line-items", () => ({
  createLineItem: vi.fn(),
  updateLineItem: vi.fn(),
  getLineItemById: vi.fn(),
  deleteLineItem: vi.fn(),
  splitLineItem: vi.fn(),
}));
// The handler module imports every action; none of these are reached by
// update_line_item, so they are stubbed to keep their dependencies out of the test.
vi.mock("@/lib/actions/customers", () => ({}));
vi.mock("@/lib/actions/vehicles", () => ({}));
vi.mock("@/lib/actions/jobs", () => ({}));
vi.mock("@/lib/actions/estimates", () => ({}));
vi.mock("@/lib/actions/invoices", () => ({}));
vi.mock("@/lib/actions/team", () => ({}));
vi.mock("@/lib/actions/reports", () => ({}));
vi.mock("@/lib/actions/messages", () => ({}));
vi.mock("@/lib/actions/settings", () => ({}));
vi.mock("@/lib/actions/parking", () => ({}));
vi.mock("@/lib/actions/catalog", () => ({}));

import { getLineItemById, splitLineItem, updateLineItem } from "@/lib/actions/job-line-items";
import { executeToolCall } from "./handlers";

const LINE_ID = "11111111-1111-4111-9111-111111111111";
const JOB_ID = "22222222-2222-4222-9222-222222222222";

const stored = {
  id: LINE_ID,
  job_id: JOB_ID,
  type: "part",
  description: "Brake pads",
  quantity: 1,
  unit_cost: 60,
  cost: 40,
  part_number: "BP-1",
  category: "Brakes",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getLineItemById).mockResolvedValue({ data: stored } as Awaited<
    ReturnType<typeof getLineItemById>
  >);
  vi.mocked(updateLineItem).mockResolvedValue({ success: true } as unknown as Awaited<
    ReturnType<typeof updateLineItem>
  >);
});

describe("executeToolCall update_line_item", () => {
  it("keeps the stored cost, category and job when only quantity is sent", async () => {
    await executeToolCall("update_line_item", { id: LINE_ID, quantity: 2 });

    expect(getLineItemById).toHaveBeenCalledWith(LINE_ID);
    expect(updateLineItem).toHaveBeenCalledTimes(1);
    expect(updateLineItem).toHaveBeenCalledWith(LINE_ID, {
      job_id: JOB_ID,
      type: "part",
      description: "Brake pads",
      quantity: 2,
      unit_cost: 60,
      cost: 40,
      part_number: "BP-1",
      category: "Brakes",
    });
  });

  it("ignores a job_id the model sends and uses the stored row's job", async () => {
    await executeToolCall("update_line_item", {
      id: LINE_ID,
      job_id: "33333333-3333-4333-9333-333333333333",
      unit_cost: 75,
    });
    expect(vi.mocked(updateLineItem).mock.calls[0][1]).toMatchObject({
      job_id: JOB_ID,
      unit_cost: 75,
      cost: 40,
      category: "Brakes",
    });
  });

  it("applies fields the model does send, including an explicit null cost", async () => {
    await executeToolCall("update_line_item", {
      id: LINE_ID,
      cost: null,
      category: "Suspension",
    });
    expect(vi.mocked(updateLineItem).mock.calls[0][1]).toMatchObject({
      quantity: 1,
      cost: null,
      category: "Suspension",
    });
  });

  it("returns the lookup error and does not update when the line is missing", async () => {
    vi.mocked(getLineItemById).mockResolvedValue({ error: "Line item not found" });
    const out = await executeToolCall("update_line_item", { id: LINE_ID, quantity: 2 });
    expect(JSON.parse(out)).toEqual({ error: "Line item not found" });
    expect(updateLineItem).not.toHaveBeenCalled();
  });
});

describe("executeToolCall split_line_item", () => {
  it("passes each part's description, amount and category through, coercing a numeric string", async () => {
    vi.mocked(splitLineItem).mockResolvedValue({ data: { ids: ["a", "b"] } });

    const out = await executeToolCall("split_line_item", {
      id: LINE_ID,
      parts: [
        { description: "Oil change", amount: "60", category: "Oil Change" },
        { description: "State inspection", amount: 40, category: "" },
      ],
    });

    expect(splitLineItem).toHaveBeenCalledWith(LINE_ID, {
      parts: [
        { description: "Oil change", amount: 60, category: "Oil Change" },
        { description: "State inspection", amount: 40, category: undefined },
      ],
    });
    expect(JSON.parse(out)).toEqual({ data: { ids: ["a", "b"] } });
  });

  it("returns the action's validation errors to the model when parts are missing", async () => {
    vi.mocked(splitLineItem).mockResolvedValue({ error: { parts: ["A split needs at least two lines"] } });

    const out = await executeToolCall("split_line_item", { id: LINE_ID });

    expect(splitLineItem).toHaveBeenCalledWith(LINE_ID, { parts: [] });
    expect(JSON.parse(out)).toEqual({ error: { parts: ["A split needs at least two lines"] } });
  });
});
