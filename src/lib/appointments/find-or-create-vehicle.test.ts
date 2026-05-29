import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  decideVehicleAction,
  findOrCreateVehicle,
} from "./find-or-create-vehicle";
import { createSupabaseMock } from "@/lib/actions/__test-helpers__/supabase-mock";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── decideVehicleAction — pure decision tree ────────────────────────────

describe("decideVehicleAction", () => {
  const CUST_A = "cust-a";
  const CUST_B = "cust-b";

  it("returns use_existing (no relink) when VIN match is the same customer", () => {
    expect(
      decideVehicleAction({ id: "v1", customer_id: CUST_A }, null, CUST_A)
    ).toEqual({ kind: "use_existing", id: "v1" });
  });

  it("returns use_existing WITH relink when VIN match belongs to a different customer", () => {
    expect(
      decideVehicleAction({ id: "v1", customer_id: CUST_B }, null, CUST_A)
    ).toEqual({ kind: "use_existing", id: "v1", relinkTo: CUST_A });
  });

  it("prefers VIN match over year/make/model match", () => {
    // Both lookups returned — VIN wins, year/make/model is ignored.
    expect(
      decideVehicleAction({ id: "by-vin", customer_id: CUST_A }, { id: "by-ymm" }, CUST_A)
    ).toEqual({ kind: "use_existing", id: "by-vin" });
  });

  it("returns use_existing on year/make/model match when no VIN match", () => {
    expect(decideVehicleAction(null, { id: "v-ymm" }, CUST_A)).toEqual({
      kind: "use_existing",
      id: "v-ymm",
    });
  });

  it("returns create_new when neither lookup matched", () => {
    expect(decideVehicleAction(null, null, CUST_A)).toEqual({ kind: "create_new" });
  });
});

// ── findOrCreateVehicle — IO orchestration ──────────────────────────────

describe("findOrCreateVehicle", () => {
  const CUST = "cust-1";
  const VIN = "1HGCM82633A123456";

  it("returns existing vehicle id on VIN match (same customer, no relink)", async () => {
    const mock = createSupabaseMock({
      data: { id: "veh-existing", customer_id: CUST },
      error: null,
    });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );

    const id = await findOrCreateVehicle({
      customer_id: CUST,
      vin: VIN,
      year: 2018,
      make: "Honda",
      model: "Accord",
    });

    expect(id).toBe("veh-existing");
    // No insert, no relink update.
    expect(mock.calls.find((c) => c.method === "insert")).toBeUndefined();
    expect(mock.calls.find((c) => c.method === "update")).toBeUndefined();
  });

  it("returns existing id AND re-links customer_id when VIN matches a different customer", async () => {
    const mock = createSupabaseMock([
      { data: { id: "veh-prev-owner", customer_id: "cust-other" }, error: null }, // vin lookup
      { data: null, error: null }, // re-link update
    ]);
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );

    const id = await findOrCreateVehicle({
      customer_id: CUST,
      vin: VIN,
    });

    expect(id).toBe("veh-prev-owner");
    const updateCall = mock.calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toEqual({ customer_id: CUST });
  });

  it("falls through to year/make/model lookup when no VIN provided", async () => {
    const mock = createSupabaseMock({ data: { id: "veh-by-ymm" }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );

    const id = await findOrCreateVehicle({
      customer_id: CUST,
      year: 2018,
      make: "honda", // intentionally lowercase to verify ilike use
      model: "accord",
    });

    expect(id).toBe("veh-by-ymm");
    expect(mock.calls).toContainEqual({ method: "ilike", args: ["make", "honda"] });
    expect(mock.calls).toContainEqual({ method: "ilike", args: ["model", "accord"] });
    // VIN query should NOT have run.
    expect(
      mock.calls.find(
        (c) => c.method === "eq" && Array.isArray(c.args) && c.args[0] === "vin"
      )
    ).toBeUndefined();
  });

  it("skips year/make/model lookup if any of year/make/model is missing", async () => {
    // No vin + missing model → both lookups skipped → insert is the only query.
    const mock = createSupabaseMock({ data: { id: "veh-new" }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );

    const id = await findOrCreateVehicle({
      customer_id: CUST,
      year: 2018,
      make: "Honda",
      // model intentionally missing
    });

    expect(id).toBe("veh-new");
    expect(
      mock.calls.find(
        (c) =>
          c.method === "ilike" && Array.isArray(c.args) && c.args[0] === "make"
      )
    ).toBeUndefined();
    expect(mock.calls.find((c) => c.method === "insert")).toBeDefined();
  });

  it("inserts a new vehicle when nothing matches", async () => {
    const mock = createSupabaseMock([
      { data: null, error: null }, // vin lookup
      { data: null, error: null }, // ymm lookup
      { data: { id: "veh-new" }, error: null }, // insert
    ]);
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );

    const id = await findOrCreateVehicle({
      customer_id: CUST,
      vin: VIN,
      year: 2018,
      make: "Honda",
      model: "Accord",
      mileage: 45000,
    });

    expect(id).toBe("veh-new");
    const insertCall = mock.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({
      customer_id: CUST,
      year: 2018,
      make: "Honda",
      model: "Accord",
      vin: VIN,
      mileage: 45000,
    });
  });

  it("returns null when VIN lookup errors (does NOT fall through to insert — guards against duplicate VIN rows)", async () => {
    const mock = createSupabaseMock({
      data: null,
      error: { message: "RLS denied" },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );

    const id = await findOrCreateVehicle({
      customer_id: CUST,
      vin: VIN,
      year: 2018,
      make: "Honda",
      model: "Accord",
    });

    expect(id).toBeNull();
    expect(mock.calls.find((c) => c.method === "insert")).toBeUndefined();
  });

  it("returns null when year/make/model lookup errors", async () => {
    const mock = createSupabaseMock({
      data: null,
      error: { message: "DB timeout" },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );

    const id = await findOrCreateVehicle({
      customer_id: CUST,
      year: 2018,
      make: "Honda",
      model: "Accord",
    });

    expect(id).toBeNull();
    expect(mock.calls.find((c) => c.method === "insert")).toBeUndefined();
  });

  it("returns null on insert failure", async () => {
    const mock = createSupabaseMock([
      { data: null, error: null }, // vin lookup
      { data: null, error: null }, // ymm lookup
      { data: null, error: { message: "FK violation" } }, // insert fails
    ]);
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );

    const id = await findOrCreateVehicle({
      customer_id: CUST,
      year: 2018,
      make: "Honda",
      model: "Accord",
    });

    expect(id).toBeNull();
  });

  it("propagates a createAdminClient() throw (config errors are NOT collapsed into null)", async () => {
    vi.mocked(createAdminClient).mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    });

    await expect(
      findOrCreateVehicle({ customer_id: CUST, vin: VIN })
    ).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("re-link failure is logged but does not block returning the vehicle id", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mock = createSupabaseMock([
      { data: { id: "veh-prev", customer_id: "cust-other" }, error: null },
      { data: null, error: { message: "RLS denied" } }, // re-link update fails
    ]);
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );

    const id = await findOrCreateVehicle({ customer_id: CUST, vin: VIN });

    expect(id).toBe("veh-prev");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("re-link failed"),
      expect.any(String)
    );
    consoleSpy.mockRestore();
  });
});
