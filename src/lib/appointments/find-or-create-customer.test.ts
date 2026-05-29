import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateBookingCustomer } from "./find-or-create-customer";
import { createSupabaseMock } from "@/lib/actions/__test-helpers__/supabase-mock";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findOrCreateBookingCustomer", () => {
  it("returns existing customer id on email match", async () => {
    const mock = createSupabaseMock({
      data: { id: "cust-existing-by-email" },
      error: null,
    });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );

    const id = await findOrCreateBookingCustomer({
      first_name: "Tom",
      last_name: "DiGregorio",
      email: "Tom@example.com",
      phone: "617-555-1234",
    });

    expect(id).toBe("cust-existing-by-email");
    // The match query is case-insensitive — ilike with the supplied email.
    expect(mock.calls).toContainEqual({ method: "ilike", args: ["email", "Tom@example.com"] });
    // Should never reach the insert.
    expect(mock.calls.find((c) => c.method === "insert")).toBeUndefined();
  });

  it("falls through to phone match when no email match", async () => {
    const mock = createSupabaseMock([
      { data: null, error: null }, // email lookup: no match
      { data: { id: "cust-existing-by-phone" }, error: null }, // phone lookup: match
    ]);
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );

    const id = await findOrCreateBookingCustomer({
      first_name: "Tom",
      last_name: "DiGregorio",
      email: "newaddress@example.com",
      phone: "617-555-1234",
    });

    expect(id).toBe("cust-existing-by-phone");
    // Phone is E.164-normalized for the lookup.
    expect(mock.calls).toContainEqual({ method: "eq", args: ["phone", "+16175551234"] });
    expect(mock.calls.find((c) => c.method === "insert")).toBeUndefined();
  });

  it("skips email lookup entirely when no email supplied", async () => {
    const mock = createSupabaseMock({ data: { id: "cust-by-phone" }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );

    await findOrCreateBookingCustomer({
      first_name: "Tom",
      last_name: "DiGregorio",
      email: "",
      phone: "617-555-1234",
    });

    expect(mock.calls.find((c) => c.method === "ilike")).toBeUndefined();
    expect(mock.calls).toContainEqual({ method: "eq", args: ["phone", "+16175551234"] });
  });

  it("creates a new customer with customer_type 'retail' when neither match", async () => {
    const mock = createSupabaseMock([
      { data: null, error: null }, // email lookup: none
      { data: null, error: null }, // phone lookup: none
      { data: { id: "cust-new" }, error: null }, // insert
    ]);
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );

    const id = await findOrCreateBookingCustomer({
      first_name: "Maria",
      last_name: "Silva",
      email: "maria@example.com",
      phone: "617-555-9999",
    });

    expect(id).toBe("cust-new");
    const insertCall = mock.calls.find((c) => c.method === "insert");
    expect(insertCall).toBeDefined();
    expect(insertCall?.args[0]).toMatchObject({
      first_name: "Maria",
      last_name: "Silva",
      email: "maria@example.com",
      phone: "+16175559999",
      customer_type: "retail",
    });
  });

  it("never stamps customer_type 'parking' (the silent data bug we're guarding against)", async () => {
    const mock = createSupabaseMock([
      { data: null, error: null },
      { data: null, error: null },
      { data: { id: "cust-new" }, error: null },
    ]);
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );

    await findOrCreateBookingCustomer({
      first_name: "X",
      last_name: "Y",
      email: "x@y.com",
      phone: "617-555-0000",
    });

    const insertCall = mock.calls.find((c) => c.method === "insert");
    expect(
      (insertCall?.args[0] as { customer_type: string }).customer_type
    ).not.toBe("parking");
  });

  it("returns null when email lookup errors (does NOT fall through to insert)", async () => {
    // The bug class: a transient DB error on the email lookup would otherwise
    // make the helper proceed to insert, creating a duplicate customer row.
    const mock = createSupabaseMock({
      data: null,
      error: { message: "RLS denied" },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );

    const id = await findOrCreateBookingCustomer({
      first_name: "Tom",
      last_name: "DiGregorio",
      email: "tom@example.com",
      phone: "617-555-1234",
    });

    expect(id).toBeNull();
    expect(mock.calls.find((c) => c.method === "insert")).toBeUndefined();
  });

  it("returns null when phone lookup errors (does NOT fall through to insert)", async () => {
    const mock = createSupabaseMock([
      { data: null, error: null }, // email lookup: no match
      { data: null, error: { message: "DB timeout" } }, // phone lookup: errors
    ]);
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );

    const id = await findOrCreateBookingCustomer({
      first_name: "Tom",
      last_name: "DiGregorio",
      email: "tom@example.com",
      phone: "617-555-1234",
    });

    expect(id).toBeNull();
    expect(mock.calls.find((c) => c.method === "insert")).toBeUndefined();
  });

  it("accepts email: null (the form didn't collect one)", async () => {
    const mock = createSupabaseMock({ data: { id: "cust-by-phone" }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );

    await findOrCreateBookingCustomer({
      first_name: "Tom",
      last_name: "DiGregorio",
      email: null,
      phone: "617-555-1234",
    });

    // Email lookup is skipped (just like empty-string case).
    expect(mock.calls.find((c) => c.method === "ilike")).toBeUndefined();
  });

  it("returns null on insert failure", async () => {
    const mock = createSupabaseMock([
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: { message: "constraint violation" } },
    ]);
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>,
    );

    const id = await findOrCreateBookingCustomer({
      first_name: "X",
      last_name: "Y",
      email: "x@y.com",
      phone: "617-555-0000",
    });

    expect(id).toBeNull();
  });

  it("propagates a createAdminClient() throw (config errors are NOT collapsed into null)", async () => {
    // Intentional: a missing service-role key is a deployment error, not a
    // "no customer link" case. Surfaces as 500 in the route handler instead
    // of silently dropping every customer link.
    vi.mocked(createAdminClient).mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    });

    await expect(
      findOrCreateBookingCustomer({
        first_name: "X",
        last_name: "Y",
        email: "x@y.com",
        phone: "617-555-0000",
      })
    ).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
