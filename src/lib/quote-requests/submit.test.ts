import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/parking-customer", () => ({ findOrCreateCustomer: vi.fn() }));
vi.mock("@/lib/quo/contacts", () => ({ createOrUpdateQuoContact: vi.fn() }));
vi.mock("@/lib/quo/format", () => ({ toE164: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateCustomer } from "@/lib/parking-customer";
import { createOrUpdateQuoContact } from "@/lib/quo/contacts";
import { toE164 } from "@/lib/quo/format";
import { persistQuoteRequest } from "./submit";
import { createSupabaseMock } from "@/lib/actions/__test-helpers__/supabase-mock";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(toE164).mockReturnValue("+16175551234");
  vi.mocked(createOrUpdateQuoContact).mockResolvedValue({
    success: true,
    contactId: "quo-1",
  });
  vi.mocked(findOrCreateCustomer).mockResolvedValue("cust-1");
});

function baseFields(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Maria",
    lastName: "Silva",
    email: "maria@example.com",
    phone: "+16175551234",
    services: ["Brake Repair"],
    vehicleYear: null,
    vehicleMake: null,
    vehicleModel: null,
    vehicleVin: null,
    licensePlate: "1ABC23",
    message: "Front brakes grinding",
    photoPaths: [] as string[],
    ...overrides,
  };
}

describe("persistQuoteRequest", () => {
  it("creates the customer as 'retail' (estimate requesters are not parking)", async () => {
    const mock = createSupabaseMock({ data: { id: "qr-1" }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );

    const result = await persistQuoteRequest(baseFields());

    expect(result.ok).toBe(true);
    expect(vi.mocked(findOrCreateCustomer)).toHaveBeenCalledWith(
      expect.objectContaining({ first_name: "Maria", last_name: "Silva" }),
      "retail"
    );
  });

  it("still persists the request when customer find-or-create fails (null link)", async () => {
    const mock = createSupabaseMock({ data: { id: "qr-1" }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(
      mock.client as unknown as ReturnType<typeof createAdminClient>
    );
    vi.mocked(findOrCreateCustomer).mockRejectedValue(new Error("DB down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await persistQuoteRequest(baseFields());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.customerId).toBeNull();
    consoleSpy.mockRestore();
  });
});
