import { describe, it, expect } from "vitest";
import { quoteRequestSubmitSchema } from "./quote-requests";

const VALID_UUID = "11111111-1111-4111-9111-111111111111";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    first_name: "Maria",
    last_name: "Silva",
    phone: "+16175551234",
    email: "maria@example.com",
    services: ["Brake Repair"],
    message: "Front brakes grinding when I stop, started last week.",
    client_id: VALID_UUID,
    license_plate: "1ABC23",
    website: "",
    ...overrides,
  };
}

describe("quoteRequestSubmitSchema — happy path", () => {
  it("accepts a complete valid submission (plate)", () => {
    expect(quoteRequestSubmitSchema.safeParse(baseInput()).success).toBe(true);
  });

  it("accepts optional vehicle year/make/model", () => {
    expect(
      quoteRequestSubmitSchema.safeParse(
        baseInput({ vehicle_year: 2018, vehicle_make: "Honda", vehicle_model: "Accord" })
      ).success
    ).toBe(true);
  });
});

describe("quoteRequestSubmitSchema — license plate / VIN requirement", () => {
  it("rejects when neither a plate nor a VIN is provided", () => {
    const { license_plate: _, ...withoutPlate } = baseInput();
    const result = quoteRequestSubmitSchema.safeParse(withoutPlate);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.includes("license_plate"))
      ).toBe(true);
    }
  });

  it("accepts a VIN alone (no plate)", () => {
    expect(
      quoteRequestSubmitSchema.safeParse(
        baseInput({ license_plate: undefined, vehicle_vin: "1HGCM82633A123456" })
      ).success
    ).toBe(true);
  });

  it("rejects an invalid VIN (contains I/O/Q) when it's the only identifier", () => {
    expect(
      quoteRequestSubmitSchema.safeParse(
        baseInput({ license_plate: undefined, vehicle_vin: "1HGCM82633A1234I6" })
      ).success
    ).toBe(false);
  });

  it("treats empty strings as absent (plate '' + no VIN → rejected)", () => {
    expect(
      quoteRequestSubmitSchema.safeParse(baseInput({ license_plate: "" })).success
    ).toBe(false);
  });

  it("rejects a whitespace-only plate with no VIN", () => {
    expect(
      quoteRequestSubmitSchema.safeParse(baseInput({ license_plate: "   " })).success
    ).toBe(false);
  });

  it("normalizes a lowercase/padded VIN and accepts it as the only identifier", () => {
    const result = quoteRequestSubmitSchema.safeParse(
      baseInput({ license_plate: undefined, vehicle_vin: "  1hgcm82633a123456  " })
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.vehicle_vin).toBe("1HGCM82633A123456");
  });
});
