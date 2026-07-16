import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return { ...actual, todayET: () => "2026-07-16", tomorrowET: () => "2026-07-17" };
});

import { createAdminClient } from "@/lib/supabase/admin";
import {
  selectUnpreppedCars,
  findUnpreppedCarsForTonight,
  type PrepReminderRow,
} from "./prep-reminder";

const TODAY = "2026-07-16";
const TOMORROW = "2026-07-17";

function row(overrides: Partial<PrepReminderRow> = {}): PrepReminderRow {
  return {
    id: "r1",
    first_name: "Jane",
    last_name: "Doe",
    make: "Toyota",
    model: "Camry",
    pick_up_date: TOMORROW,
    pick_up_time: "06:30:00",
    status: "checked_in",
    lock_box_number: null,
    ...overrides,
  };
}

describe("selectUnpreppedCars — window boundaries", () => {
  it("excludes a today pickup before 5 PM (16:59)", () => {
    const cars = selectUnpreppedCars(
      [row({ pick_up_date: TODAY, pick_up_time: "16:59:00" })],
      TODAY,
      TOMORROW
    );
    expect(cars).toHaveLength(0);
  });

  it("includes a today pickup at exactly 5 PM (17:00, inclusive)", () => {
    const cars = selectUnpreppedCars(
      [row({ pick_up_date: TODAY, pick_up_time: "17:00:00" })],
      TODAY,
      TOMORROW
    );
    expect(cars).toHaveLength(1);
    expect(cars[0].pickUp).toBe("5:00 PM tonight");
  });

  it("includes a tomorrow pickup before 9 AM (08:59)", () => {
    const cars = selectUnpreppedCars(
      [row({ pick_up_date: TOMORROW, pick_up_time: "08:59:00" })],
      TODAY,
      TOMORROW
    );
    expect(cars).toHaveLength(1);
    expect(cars[0].pickUp).toBe("8:59 AM tomorrow");
  });

  it("excludes a tomorrow pickup at exactly 9 AM (09:00, exclusive — shop is open)", () => {
    const cars = selectUnpreppedCars(
      [row({ pick_up_date: TOMORROW, pick_up_time: "09:00:00" })],
      TODAY,
      TOMORROW
    );
    expect(cars).toHaveLength(0);
  });

  it("excludes a tomorrow afternoon pickup (2 PM — staff present)", () => {
    const cars = selectUnpreppedCars(
      [row({ pick_up_date: TOMORROW, pick_up_time: "14:00:00" })],
      TODAY,
      TOMORROW
    );
    expect(cars).toHaveLength(0);
  });

  it("excludes a pickup on some other day entirely", () => {
    const cars = selectUnpreppedCars(
      [row({ pick_up_date: "2026-07-20", pick_up_time: "06:30:00" })],
      TODAY,
      TOMORROW
    );
    expect(cars).toHaveLength(0);
  });
});

describe("selectUnpreppedCars — prepped classification", () => {
  it('flags a still-parked (checked_in) car as "not pulled out"', () => {
    const cars = selectUnpreppedCars([row({ status: "checked_in" })], TODAY, TOMORROW);
    expect(cars[0].reason).toBe("not pulled out");
  });

  it('flags a reserved car as "not pulled out"', () => {
    const cars = selectUnpreppedCars([row({ status: "reserved" })], TODAY, TOMORROW);
    expect(cars[0].reason).toBe("not pulled out");
  });

  it('flags a checked-out car with no lockbox as "checked out, no lockbox code sent"', () => {
    const cars = selectUnpreppedCars(
      [row({ status: "checked_out", lock_box_number: null })],
      TODAY,
      TOMORROW
    );
    expect(cars).toHaveLength(1);
    expect(cars[0].reason).toBe("checked out, no lockbox code sent");
  });

  it("excludes a fully-prepped car (checked_out WITH a lockbox number)", () => {
    const cars = selectUnpreppedCars(
      [row({ status: "checked_out", lock_box_number: 3 })],
      TODAY,
      TOMORROW
    );
    expect(cars).toHaveLength(0);
  });

  it("treats lockbox #0 as a real lockbox (uses != null, not truthiness)", () => {
    const cars = selectUnpreppedCars(
      [row({ status: "checked_out", lock_box_number: 0 })],
      TODAY,
      TOMORROW
    );
    expect(cars).toHaveLength(0);
  });
});

describe("selectUnpreppedCars — display formatting", () => {
  it("renders name as first name + last initial, and full vehicle", () => {
    const cars = selectUnpreppedCars(
      [row({ first_name: "Mike", last_name: "Rossi", make: "Ford", model: "F-150" })],
      TODAY,
      TOMORROW
    );
    expect(cars[0].name).toBe("Mike R.");
    expect(cars[0].vehicle).toBe("Ford F-150");
  });

  it("sorts nothing itself — preserves caller order", () => {
    const cars = selectUnpreppedCars(
      [
        row({ id: "a", pick_up_time: "06:00:00" }),
        row({ id: "b", pick_up_time: "07:00:00" }),
      ],
      TODAY,
      TOMORROW
    );
    expect(cars.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

// Minimal chainable Supabase query-builder mock: every filter method returns
// the same object, which is awaitable and resolves to { data, error }.
function mockSupabase(result: { data: unknown; error: unknown }) {
  const eq = vi.fn();
  const inFn = vi.fn();
  const not = vi.fn();
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: eq.mockImplementation(() => chain),
    in: inFn.mockImplementation(() => chain),
    not: not.mockImplementation(() => chain),
    order: vi.fn(() => chain),
    then: (resolve: (v: unknown) => unknown) => resolve(result),
  };
  const from = vi.fn(() => chain);
  return { client: { from }, from, eq, in: inFn, not };
}

describe("findUnpreppedCarsForTonight — query wiring & error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails loud (ok:false) on a query error instead of returning an empty all-clear", async () => {
    const { client } = mockSupabase({ data: null, error: { message: "db exploded" } });
    vi.mocked(createAdminClient).mockReturnValue(client as never);

    const res = await findUnpreppedCarsForTonight();

    expect(res).toEqual({ ok: false, error: "db exploded" });
  });

  it("scopes the query to Broadway Motors, tonight/tomorrow, excluding cancelled/no-show", async () => {
    const { client, eq, in: inFn, not } = mockSupabase({
      data: [row({ status: "checked_in", pick_up_date: TOMORROW, pick_up_time: "06:30:00" })],
      error: null,
    });
    vi.mocked(createAdminClient).mockReturnValue(client as never);

    const res = await findUnpreppedCarsForTonight();

    expect(eq).toHaveBeenCalledWith("lot", "Broadway Motors");
    expect(inFn).toHaveBeenCalledWith("pick_up_date", [TODAY, TOMORROW]);
    expect(not).toHaveBeenCalledWith("status", "in", "(cancelled,no_show)");
    expect(res).toEqual({
      ok: true,
      cars: [
        {
          id: "r1",
          name: "Jane D.",
          vehicle: "Toyota Camry",
          pickUp: "6:30 AM tomorrow",
          reason: "not pulled out",
        },
      ],
    });
  });

  it("returns an empty car list (ok:true) when nothing is due tonight", async () => {
    const { client } = mockSupabase({ data: [], error: null });
    vi.mocked(createAdminClient).mockReturnValue(client as never);

    const res = await findUnpreppedCarsForTonight();

    expect(res).toEqual({ ok: true, cars: [] });
  });
});
