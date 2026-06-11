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

describe("findOrCreateCustomer", () => {
  it("stamps customer_type 'retail' on a newly created customer", async () => {
    const mock = createSupabaseMock([
      { data: null, error: null }, // email lookup miss
      { data: null, error: null }, // phone lookup miss
      { data: { id: "cust-new" }, error: null }, // insert
    ]);
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );

    const id = await findOrCreateCustomer(baseInput(), "retail");

    expect(id).toBe("cust-new");
    const insertCall = mock.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ customer_type: "retail" });
  });

  it("stamps customer_type 'parking' when called with 'parking'", async () => {
    const mock = createSupabaseMock([
      { data: null, error: null },
      { data: null, error: null },
      { data: { id: "cust-new" }, error: null },
    ]);
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );

    await findOrCreateCustomer(baseInput(), "parking");

    const insertCall = mock.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ customer_type: "parking" });
  });

  it("returns an existing email match as-is (the type arg never reclassifies it)", async () => {
    const mock = createSupabaseMock({ data: { id: "cust-existing" }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );

    const id = await findOrCreateCustomer(baseInput(), "retail");

    expect(id).toBe("cust-existing");
    expect(mock.calls.find((c) => c.method === "insert")).toBeUndefined();
  });

  it("skips the email lookup when no email (no spurious '' match), falls back to phone", async () => {
    const mock = createSupabaseMock([
      { data: null, error: null }, // phone lookup miss
      { data: { id: "cust-new" }, error: null }, // insert
    ]);
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );

    const id = await findOrCreateCustomer(baseInput({ email: "" }), "retail");

    expect(id).toBe("cust-new");
    // The empty-email guard must prevent any email ilike query (which would
    // otherwise mis-link to a customer stored with an empty email).
    expect(mock.calls.find((c) => c.method === "ilike")).toBeUndefined();
  });
});
