import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("./find-or-create-customer", () => ({
  findOrCreateBookingCustomer: vi.fn(),
}));
vi.mock("./find-or-create-vehicle", () => ({
  findOrCreateVehicle: vi.fn(),
}));
vi.mock("@/lib/vin/decode", () => ({ decodeVin: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateBookingCustomer } from "./find-or-create-customer";
import { findOrCreateVehicle } from "./find-or-create-vehicle";
import { decodeVin } from "@/lib/vin/decode";
import {
  findExistingAppointment,
  insertAppointment,
} from "./submit";
import { createSupabaseMock } from "@/lib/actions/__test-helpers__/supabase-mock";

const CLIENT_ID = "11111111-1111-4111-9111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

function baseInsertInput(overrides: Record<string, unknown> = {}) {
  return {
    client_id: CLIENT_ID,
    first_name: "Maria",
    last_name: "Silva",
    phone: "+16175551234",
    email: "maria@example.com",
    service_category: "brakes" as const,
    description: "Front brakes grinding when I stop, started last week.",
    conditional_data: {},
    preferred_date: "2026-06-15",
    preferred_time: "09:00" as const,
    drop_off_or_wait: "drop_off" as const,
    photo_paths: [] as string[],
    ...overrides,
  };
}

// ── findExistingAppointment — dedup ────────────────────────────────────

describe("findExistingAppointment", () => {
  it("returns kind: 'no_match' on dedup miss", async () => {
    const mock = createSupabaseMock({ data: null, error: null });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );

    const result = await findExistingAppointment({
      phone: "+16175551234",
      preferred_date: "2026-06-15",
      preferred_time: "09:00",
    });

    expect(result).toEqual({ kind: "no_match" });
  });

  it("returns kind: 'match' with the existing id on dedup hit", async () => {
    const mock = createSupabaseMock({
      data: { id: "appt-existing" },
      error: null,
    });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );

    const result = await findExistingAppointment({
      phone: "+16175551234",
      preferred_date: "2026-06-15",
      preferred_time: "09:00",
    });

    expect(result).toEqual({ kind: "match", existingId: "appt-existing" });
  });

  it("uses the three-key dedup (phone + date + time) — verifies all three .eq calls", async () => {
    const mock = createSupabaseMock({ data: null, error: null });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );

    await findExistingAppointment({
      phone: "+16175551234",
      preferred_date: "2026-06-15",
      preferred_time: "13:00",
    });

    // The most important invariant: preferred_time must be in the dedup key.
    // Without it, a customer correcting 1pm→2pm would silently get back the
    // stale 1pm row instead of a new one for the manager to reconcile.
    expect(mock.calls).toContainEqual({
      method: "eq",
      args: ["snapshot_customer_phone", "+16175551234"],
    });
    expect(mock.calls).toContainEqual({
      method: "eq",
      args: ["preferred_date", "2026-06-15"],
    });
    expect(mock.calls).toContainEqual({
      method: "eq",
      args: ["preferred_time", "13:00"],
    });
  });

  it("returns kind: 'error' on query failure (route handler returns 500, does NOT insert)", async () => {
    const mock = createSupabaseMock({
      data: null,
      error: { message: "DB timeout" },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );

    const result = await findExistingAppointment({
      phone: "+16175551234",
      preferred_date: "2026-06-15",
      preferred_time: "09:00",
    });

    expect(result).toEqual(
      expect.objectContaining({ kind: "error", message: expect.any(String) })
    );
  });
});

// ── insertAppointment — main path ──────────────────────────────────────

describe("insertAppointment", () => {
  it("returns ok with customer_link + vehicle_link both true on the happy path", async () => {
    const mock = createSupabaseMock({
      data: { id: CLIENT_ID },
      error: null,
    });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );
    vi.mocked(findOrCreateBookingCustomer).mockResolvedValue("cust-1");
    vi.mocked(findOrCreateVehicle).mockResolvedValue("veh-1");

    const result = await insertAppointment(
      baseInsertInput({
        vehicle_year: 2018,
        vehicle_make: "Honda",
        vehicle_model: "Accord",
      })
    );

    expect(result).toEqual({
      ok: true,
      appointment_id: CLIENT_ID,
      customer_id: "cust-1",
      customer_link: true,
      vehicle_link: true,
    });
  });

  it("inserts the row with id = client_id (overrides gen_random_uuid default)", async () => {
    const mock = createSupabaseMock({
      data: { id: CLIENT_ID },
      error: null,
    });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );
    vi.mocked(findOrCreateBookingCustomer).mockResolvedValue("cust-1");
    vi.mocked(findOrCreateVehicle).mockResolvedValue(null);

    await insertAppointment(baseInsertInput());

    const insertCall = mock.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ id: CLIENT_ID });
  });

  it("writes preferred_time and derives the afternoon window at the noon boundary", async () => {
    const mock = createSupabaseMock({ data: { id: CLIENT_ID }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );
    vi.mocked(findOrCreateBookingCustomer).mockResolvedValue("cust-1");

    // 12:00 is the load-bearing boundary: `< 12 ? morning : afternoon` must put
    // noon in the afternoon bucket. The derived window feeds the manager inbox.
    await insertAppointment(baseInsertInput({ preferred_time: "12:00" }));

    const insertCall = mock.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({
      preferred_time: "12:00",
      preferred_time_window: "afternoon",
    });
  });

  it("derives the morning window for an hour before noon", async () => {
    const mock = createSupabaseMock({ data: { id: CLIENT_ID }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );
    vi.mocked(findOrCreateBookingCustomer).mockResolvedValue("cust-1");

    await insertAppointment(baseInsertInput({ preferred_time: "11:00" }));

    const insertCall = mock.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({
      preferred_time: "11:00",
      preferred_time_window: "morning",
    });
  });

  it("populates snapshot columns from input + decoded VIN fields", async () => {
    const mock = createSupabaseMock({
      data: { id: CLIENT_ID },
      error: null,
    });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );
    vi.mocked(findOrCreateBookingCustomer).mockResolvedValue("cust-1");
    vi.mocked(findOrCreateVehicle).mockResolvedValue("veh-1");
    vi.mocked(decodeVin).mockResolvedValue({
      vin: "1HGCM82633A123456",
      year: 2003,
      make: "HONDA",
      model: "Accord",
      trim: "EX V6",
    });

    // VIN provided, year/make/model NOT — decode should fill them in.
    await insertAppointment(
      baseInsertInput({
        vehicle_vin: "1HGCM82633A123456",
      })
    );

    const insertCall = mock.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({
      snapshot_customer_name: "Maria Silva",
      snapshot_customer_phone: "+16175551234",
      snapshot_customer_email: "maria@example.com",
      snapshot_vehicle_year: 2003,
      snapshot_vehicle_make: "HONDA",
      snapshot_vehicle_model: "Accord",
      snapshot_vehicle_vin: "1HGCM82633A123456",
    });
  });

  it("does NOT overwrite Y/M/M from VIN decode if the form supplied them", async () => {
    const mock = createSupabaseMock({
      data: { id: CLIENT_ID },
      error: null,
    });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );
    vi.mocked(findOrCreateBookingCustomer).mockResolvedValue("cust-1");
    vi.mocked(findOrCreateVehicle).mockResolvedValue("veh-1");
    vi.mocked(decodeVin).mockResolvedValue({
      vin: "1HGCM82633A123456",
      year: 2003,
      make: "HONDA",
      model: "Accord",
      trim: null,
    });

    await insertAppointment(
      baseInsertInput({
        vehicle_year: 2018,
        vehicle_make: "Honda",
        vehicle_model: "Accord",
        vehicle_vin: "1HGCM82633A123456",
      })
    );

    const insertCall = mock.calls.find((c) => c.method === "insert");
    // Form values win over VIN decode for snapshot fields the user typed.
    expect(insertCall?.args[0]).toMatchObject({
      snapshot_vehicle_year: 2018,
      snapshot_vehicle_make: "Honda",
      snapshot_vehicle_model: "Accord",
    });
  });

  it("skips VIN decode + vehicle lookup if customer find-or-create failed", async () => {
    const mock = createSupabaseMock({
      data: { id: CLIENT_ID },
      error: null,
    });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );
    vi.mocked(findOrCreateBookingCustomer).mockResolvedValue(null);

    const result = await insertAppointment(
      baseInsertInput({
        vehicle_year: 2018,
        vehicle_make: "Honda",
        vehicle_model: "Accord",
        vehicle_vin: "1HGCM82633A123456",
      })
    );

    expect(result).toEqual({
      ok: true,
      appointment_id: CLIENT_ID,
      customer_id: null,
      customer_link: false,
      vehicle_link: false,
    });
    expect(vi.mocked(decodeVin)).not.toHaveBeenCalled();
    expect(vi.mocked(findOrCreateVehicle)).not.toHaveBeenCalled();
  });

  it("skips VIN decode + vehicle lookup when no vehicle info is supplied", async () => {
    const mock = createSupabaseMock({
      data: { id: CLIENT_ID },
      error: null,
    });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );
    vi.mocked(findOrCreateBookingCustomer).mockResolvedValue("cust-1");

    await insertAppointment(baseInsertInput());

    expect(vi.mocked(decodeVin)).not.toHaveBeenCalled();
    expect(vi.mocked(findOrCreateVehicle)).not.toHaveBeenCalled();
  });

  it("returns vehicle_link false when findOrCreateVehicle returns null", async () => {
    const mock = createSupabaseMock({
      data: { id: CLIENT_ID },
      error: null,
    });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );
    vi.mocked(findOrCreateBookingCustomer).mockResolvedValue("cust-1");
    vi.mocked(findOrCreateVehicle).mockResolvedValue(null);

    const result = await insertAppointment(
      baseInsertInput({
        vehicle_year: 2018,
        vehicle_make: "Honda",
        vehicle_model: "Accord",
      })
    );

    expect(result).toMatchObject({
      ok: true,
      customer_link: true,
      vehicle_link: false,
    });
  });

  it("returns insert_failed on DB insert error", async () => {
    const mock = createSupabaseMock({
      data: null,
      error: { message: "FK violation" },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );
    vi.mocked(findOrCreateBookingCustomer).mockResolvedValue("cust-1");

    const result = await insertAppointment(baseInsertInput());

    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: "insert_failed" })
    );
  });

  it("writes photo_paths into the appointment row", async () => {
    const mock = createSupabaseMock({
      data: { id: CLIENT_ID },
      error: null,
    });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );
    vi.mocked(findOrCreateBookingCustomer).mockResolvedValue("cust-1");

    const paths = [`${CLIENT_ID}/0.jpg`, `${CLIENT_ID}/1.png`];
    await insertAppointment(baseInsertInput({ photo_paths: paths }));

    const insertCall = mock.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ photo_paths: paths });
  });

  it("treats empty-string email as null in snapshot + helper input", async () => {
    const mock = createSupabaseMock({
      data: { id: CLIENT_ID },
      error: null,
    });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );
    vi.mocked(findOrCreateBookingCustomer).mockResolvedValue("cust-1");

    await insertAppointment(baseInsertInput({ email: "" }));

    const insertCall = mock.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({
      snapshot_customer_email: null,
    });
    expect(vi.mocked(findOrCreateBookingCustomer)).toHaveBeenCalledWith(
      expect.objectContaining({ email: null })
    );
  });
});
