import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateCustomer } from "./parking-customer";
import { createSupabaseMock } from "@/lib/actions/__test-helpers__/supabase-mock";

beforeEach(() => {
  vi.clearAllMocks();
});

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    first_name: "Maria",
    last_name: "Silva",
    email: "maria@example.com",
    phone: "+16175551234",
    ...overrides,
  };
}

function useMock(mock: ReturnType<typeof createSupabaseMock>) {
  vi.mocked(createAdminClient).mockReturnValue(
    mock.client as unknown as ReturnType<typeof createAdminClient>
  );
}

describe("findOrCreateCustomer", () => {
  it("stamps customer_type 'retail' on a newly created customer", async () => {
    const mock = createSupabaseMock([
      { data: null, error: null }, // phone lookup miss
      { data: [], error: null }, // email lookup miss
      { data: { id: "cust-new" }, error: null }, // insert
    ]);
    useMock(mock);

    const id = await findOrCreateCustomer(baseInput(), "retail");

    expect(id).toBe("cust-new");
    const insertCall = mock.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ customer_type: "retail" });
  });

  it("stamps customer_type 'parking' when called with 'parking'", async () => {
    const mock = createSupabaseMock([
      { data: null, error: null },
      { data: [], error: null },
      { data: { id: "cust-new" }, error: null },
    ]);
    useMock(mock);

    await findOrCreateCustomer(baseInput(), "parking");

    const insertCall = mock.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ customer_type: "parking" });
  });

  it("returns a phone match before consulting email", async () => {
    const mock = createSupabaseMock([{ data: { id: "cust-phone" }, error: null }]);
    useMock(mock);

    const id = await findOrCreateCustomer(baseInput(), "retail");

    expect(id).toBe("cust-phone");
    expect(mock.calls).toContainEqual({ method: "eq", args: ["phone", "+16175551234"] });
    expect(mock.calls.find((c) => c.method === "ilike")).toBeUndefined();
    expect(mock.calls.find((c) => c.method === "insert")).toBeUndefined();
  });

  it("returns an existing same-name email match as-is (the type arg never reclassifies it)", async () => {
    const mock = createSupabaseMock([
      { data: null, error: null }, // phone lookup miss
      {
        data: [{ id: "cust-existing", first_name: "Maria", last_name: "Silva" }],
        error: null,
      },
    ]);
    useMock(mock);

    const id = await findOrCreateCustomer(baseInput(), "retail");

    expect(id).toBe("cust-existing");
    expect(mock.calls).toContainEqual({ method: "ilike", args: ["email", "maria@example.com"] });
    expect(mock.calls.find((c) => c.method === "insert")).toBeUndefined();
  });

  it("creates a new customer when the email matches but the name does not (shared household inbox)", async () => {
    const mock = createSupabaseMock([
      { data: null, error: null }, // phone lookup miss — a different phone
      {
        data: [{ id: "cust-jeff", first_name: "Jeff", last_name: "Williams" }],
        error: null,
      },
      { data: { id: "cust-sandralee" }, error: null }, // insert
    ]);
    useMock(mock);

    const id = await findOrCreateCustomer(
      baseInput({
        first_name: "SandraLee",
        last_name: "Robinson",
        email: "shared@example.com",
        phone: "+18585550000",
      }),
      "parking"
    );

    expect(id).toBe("cust-sandralee");
    const insertCall = mock.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({
      first_name: "SandraLee",
      last_name: "Robinson",
      email: "shared@example.com",
      phone: "+18585550000",
    });
  });

  it("picks the same-name row when several customers share the email, ignoring case and spacing", async () => {
    const mock = createSupabaseMock([
      { data: null, error: null }, // phone lookup miss
      {
        data: [
          { id: "cust-jeff", first_name: "Jeff", last_name: "Williams" },
          { id: "cust-sandralee", first_name: "Sandralee", last_name: "Robinson " },
        ],
        error: null,
      },
    ]);
    useMock(mock);

    const id = await findOrCreateCustomer(
      baseInput({ first_name: " SandraLee", last_name: "robinson", email: "shared@example.com" }),
      "parking"
    );

    expect(id).toBe("cust-sandralee");
    expect(mock.calls.find((c) => c.method === "insert")).toBeUndefined();
  });

  it("does not cap the email lookup at one row", async () => {
    const mock = createSupabaseMock([
      { data: null, error: null },
      { data: [], error: null },
      { data: { id: "cust-new" }, error: null },
    ]);
    useMock(mock);

    await findOrCreateCustomer(baseInput(), "retail");

    const emailSelectIndex = mock.calls.findIndex((c) => c.method === "ilike");
    const insertIndex = mock.calls.findIndex((c) => c.method === "insert");
    const between = mock.calls.slice(emailSelectIndex, insertIndex);
    expect(between.find((c) => c.method === "limit")).toBeUndefined();
    expect(between.find((c) => c.method === "single")).toBeUndefined();
  });

  it("skips the email lookup when no email (no spurious '' match), falls through to insert", async () => {
    const mock = createSupabaseMock([
      { data: null, error: null }, // phone lookup miss
      { data: { id: "cust-new" }, error: null }, // insert
    ]);
    useMock(mock);

    const id = await findOrCreateCustomer(baseInput({ email: "" }), "retail");

    expect(id).toBe("cust-new");
    // The empty-email guard must prevent any email ilike query (which would
    // otherwise mis-link to a customer stored with an empty email).
    expect(mock.calls.find((c) => c.method === "ilike")).toBeUndefined();
  });
});
