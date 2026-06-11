import { describe, it, expect } from "vitest";
import {
  appointmentSubmitSchema,
  getMaxVehicleYear,
  SERVICE_CATEGORIES,
} from "./appointments";

const VALID_UUID = "11111111-1111-4111-9111-111111111111";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    first_name: "Maria",
    last_name: "Silva",
    phone: "+16175551234",
    email: "maria@example.com",
    service_category: "brakes" as const,
    description: "Front brakes grinding when I stop, started last week.",
    preferred_date: "2026-06-15", // Monday
    preferred_time: "09:00" as const,
    drop_off_or_wait: "drop_off" as const,
    client_id: VALID_UUID,
    license_plate: "1ABC23",
    website: "",
    ...overrides,
  };
}

describe("appointmentSubmitSchema — happy path", () => {
  it("accepts a complete valid submission", () => {
    const result = appointmentSubmitSchema.safeParse(baseInput());
    expect(result.success).toBe(true);
  });

  it("accepts when email is empty string", () => {
    const result = appointmentSubmitSchema.safeParse(baseInput({ email: "" }));
    expect(result.success).toBe(true);
  });

  it("accepts when email is missing", () => {
    const { email: _, ...withoutEmail } = baseInput();
    const result = appointmentSubmitSchema.safeParse(withoutEmail);
    expect(result.success).toBe(true);
  });

  it("accepts all eleven service categories", () => {
    for (const category of SERVICE_CATEGORIES) {
      const result = appointmentSubmitSchema.safeParse(
        baseInput({ service_category: category })
      );
      expect(result.success).toBe(true);
    }
  });

  it("defaults conditional_data to {} when omitted", () => {
    const result = appointmentSubmitSchema.safeParse(baseInput());
    if (result.success) {
      expect(result.data.conditional_data).toEqual({});
    } else {
      throw new Error("expected success");
    }
  });

  it("accepts optional vehicle fields when provided", () => {
    const result = appointmentSubmitSchema.safeParse(
      baseInput({
        vehicle_year: 2018,
        vehicle_make: "Honda",
        vehicle_model: "Accord",
        vehicle_vin: "1HGCM82633A123456",
        vehicle_mileage: 45000,
      })
    );
    expect(result.success).toBe(true);
  });
});

describe("appointmentSubmitSchema — phone validation", () => {
  it("rejects non-E.164 phone", () => {
    expect(appointmentSubmitSchema.safeParse(baseInput({ phone: "617-555-1234" })).success).toBe(false);
    expect(appointmentSubmitSchema.safeParse(baseInput({ phone: "(617) 555-1234" })).success).toBe(false);
    expect(appointmentSubmitSchema.safeParse(baseInput({ phone: "6175551234" })).success).toBe(false);
    expect(appointmentSubmitSchema.safeParse(baseInput({ phone: "+44XXXXXXXXX" })).success).toBe(false);
  });

  it("accepts E.164 phone", () => {
    expect(appointmentSubmitSchema.safeParse(baseInput({ phone: "+16175551234" })).success).toBe(true);
  });
});

describe("appointmentSubmitSchema — description validation", () => {
  it("rejects a too-short description", () => {
    const result = appointmentSubmitSchema.safeParse(baseInput({ description: "brakes" }));
    expect(result.success).toBe(false);
  });

  it("rejects a description that is 20 whitespace characters", () => {
    // Catches the same class of bug the DB btrim CHECK catches.
    const result = appointmentSubmitSchema.safeParse(
      baseInput({ description: "                    " })
    );
    expect(result.success).toBe(false);
  });

  it("rejects a description of 9 chars + trailing space (still 9 after trim)", () => {
    const desc = "x".repeat(9) + " ";
    expect(appointmentSubmitSchema.safeParse(baseInput({ description: desc })).success).toBe(false);
  });

  it("accepts exactly 10 characters of real content", () => {
    expect(
      appointmentSubmitSchema.safeParse(baseInput({ description: "x".repeat(10) })).success
    ).toBe(true);
  });
});

describe("appointmentSubmitSchema — Sunday refine", () => {
  it("rejects Sunday morning (entire day closed)", () => {
    // 2026-06-07 is Sunday
    const result = appointmentSubmitSchema.safeParse(
      baseInput({ preferred_date: "2026-06-07", preferred_time: "09:00" })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some((i) => i.path.includes("preferred_date"))).toBe(true);
    }
  });

  it("rejects Sunday afternoon", () => {
    const result = appointmentSubmitSchema.safeParse(
      baseInput({ preferred_date: "2026-06-07", preferred_time: "13:00" })
    );
    expect(result.success).toBe(false);
  });

  it("accepts the Sunday of the spring DST transition (still rejected as a Sunday)", () => {
    // 2026-03-08 is spring-forward Sunday. Should still be rejected.
    const result = appointmentSubmitSchema.safeParse(
      baseInput({ preferred_date: "2026-03-08", preferred_time: "09:00" })
    );
    expect(result.success).toBe(false);
  });
});

describe("appointmentSubmitSchema — Saturday-hours refine", () => {
  it("rejects Saturday after 1pm (shop closes 2pm Saturday)", () => {
    // 2026-06-06 is Saturday; 2pm is past the Saturday cutoff.
    const result = appointmentSubmitSchema.safeParse(
      baseInput({ preferred_date: "2026-06-06", preferred_time: "14:00" })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some((i) => i.path.includes("preferred_time"))).toBe(true);
    }
  });

  it("accepts Saturday at 1pm (the last bookable Saturday hour)", () => {
    const result = appointmentSubmitSchema.safeParse(
      baseInput({ preferred_date: "2026-06-06", preferred_time: "13:00" })
    );
    expect(result.success).toBe(true);
  });

  it("rejects Saturday at 9am (Saturday opens at 10am, not 9am)", () => {
    // The weekday 9am floor must NOT apply on Saturday — defense in depth against
    // a client that bypasses the form, which only offers Sat 10am–1pm.
    const result = appointmentSubmitSchema.safeParse(
      baseInput({ preferred_date: "2026-06-06", preferred_time: "09:00" })
    );
    expect(result.success).toBe(false);
  });

  it("accepts a weekday afternoon hour (3pm Wednesday)", () => {
    // 2026-06-03 is Wednesday
    const result = appointmentSubmitSchema.safeParse(
      baseInput({ preferred_date: "2026-06-03", preferred_time: "15:00" })
    );
    expect(result.success).toBe(true);
  });
});

describe("appointmentSubmitSchema — booking-hours refine", () => {
  it("rejects an hour before 9am", () => {
    // 2026-06-15 is a Monday — only the hour is out of range.
    const result = appointmentSubmitSchema.safeParse(
      baseInput({ preferred_time: "08:00" })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.includes("preferred_time"))
      ).toBe(true);
    }
  });

  it("rejects an hour after 4pm", () => {
    expect(
      appointmentSubmitSchema.safeParse(baseInput({ preferred_time: "17:00" })).success
    ).toBe(false);
  });

  it("accepts the 9am opening hour", () => {
    expect(
      appointmentSubmitSchema.safeParse(baseInput({ preferred_time: "09:00" })).success
    ).toBe(true);
  });

  it("accepts the 4pm closing hour (last weekday slot)", () => {
    expect(
      appointmentSubmitSchema.safeParse(baseInput({ preferred_time: "16:00" })).success
    ).toBe(true);
  });

  it("rejects a malformed time string", () => {
    // single-digit hour and out-of-range hour both fail the HH:MM regex
    expect(
      appointmentSubmitSchema.safeParse(baseInput({ preferred_time: "9:00" })).success
    ).toBe(false);
    expect(
      appointmentSubmitSchema.safeParse(baseInput({ preferred_time: "25:00" })).success
    ).toBe(false);
  });

  it("rejects a non-top-of-hour time (we book hourly slots only)", () => {
    // In-range hour, but :30 isn't a bookable slot — the format regex allows any
    // minute, so the refine is what enforces top-of-hour at the trust boundary.
    expect(
      appointmentSubmitSchema.safeParse(baseInput({ preferred_time: "09:30" })).success
    ).toBe(false);
    expect(
      appointmentSubmitSchema.safeParse(baseInput({ preferred_time: "16:30" })).success
    ).toBe(false);
  });
});

describe("appointmentSubmitSchema — vehicle_year bounds", () => {
  it("rejects pre-1981 vehicle years", () => {
    expect(
      appointmentSubmitSchema.safeParse(baseInput({ vehicle_year: 1980 })).success
    ).toBe(false);
  });

  it("accepts current_year + 2 (next-next model year)", () => {
    const max = getMaxVehicleYear();
    expect(appointmentSubmitSchema.safeParse(baseInput({ vehicle_year: max })).success).toBe(true);
  });

  it("rejects current_year + 3", () => {
    const tooFar = getMaxVehicleYear() + 1;
    expect(
      appointmentSubmitSchema.safeParse(baseInput({ vehicle_year: tooFar })).success
    ).toBe(false);
  });

  it("coerces a numeric string", () => {
    const result = appointmentSubmitSchema.safeParse(baseInput({ vehicle_year: "2018" }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.vehicle_year).toBe(2018);
  });
});

describe("appointmentSubmitSchema — VIN validation", () => {
  it("accepts valid VIN", () => {
    expect(
      appointmentSubmitSchema.safeParse(
        baseInput({ vehicle_vin: "1HGCM82633A123456" })
      ).success
    ).toBe(true);
  });

  it("rejects VINs containing I, O, or Q", () => {
    expect(
      appointmentSubmitSchema.safeParse(
        baseInput({ vehicle_vin: "1HGCM82633A1234I6" })
      ).success
    ).toBe(false);
    expect(
      appointmentSubmitSchema.safeParse(
        baseInput({ vehicle_vin: "OHGCM82633A123456" })
      ).success
    ).toBe(false);
    expect(
      appointmentSubmitSchema.safeParse(
        baseInput({ vehicle_vin: "QHGCM82633A123456" })
      ).success
    ).toBe(false);
  });

  it("rejects VINs with wrong length", () => {
    expect(
      appointmentSubmitSchema.safeParse(
        baseInput({ vehicle_vin: "1HGCM82633A12345" })
      ).success
    ).toBe(false);
    expect(
      appointmentSubmitSchema.safeParse(
        baseInput({ vehicle_vin: "1HGCM82633A1234567" })
      ).success
    ).toBe(false);
  });
});

describe("appointmentSubmitSchema — license plate / VIN requirement", () => {
  it("rejects when neither a plate nor a VIN is provided", () => {
    const { license_plate: _, ...withoutPlate } = baseInput();
    const result = appointmentSubmitSchema.safeParse(withoutPlate);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.includes("license_plate"))
      ).toBe(true);
    }
  });

  it("accepts a plate alone (no VIN)", () => {
    // baseInput already supplies license_plate and no vin.
    expect(appointmentSubmitSchema.safeParse(baseInput()).success).toBe(true);
  });

  it("accepts a VIN alone (no plate)", () => {
    expect(
      appointmentSubmitSchema.safeParse(
        baseInput({ license_plate: undefined, vehicle_vin: "1HGCM82633A123456" })
      ).success
    ).toBe(true);
  });

  it("rejects an empty-string plate with no VIN", () => {
    expect(
      appointmentSubmitSchema.safeParse(baseInput({ license_plate: "" })).success
    ).toBe(false);
  });

  it("rejects a whitespace-only plate with no VIN", () => {
    expect(
      appointmentSubmitSchema.safeParse(baseInput({ license_plate: "   " })).success
    ).toBe(false);
  });

  it("rejects a malformed VIN (contains I/O/Q) as the only identifier", () => {
    expect(
      appointmentSubmitSchema.safeParse(
        baseInput({ license_plate: undefined, vehicle_vin: "1HGCM82633A1234I6" })
      ).success
    ).toBe(false);
  });

  it("normalizes a lowercase/padded VIN and accepts it as the only identifier", () => {
    const result = appointmentSubmitSchema.safeParse(
      baseInput({ license_plate: undefined, vehicle_vin: "  1hgcm82633a123456  " })
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.vehicle_vin).toBe("1HGCM82633A123456");
  });

  it("trims and caps plate length", () => {
    expect(
      appointmentSubmitSchema.safeParse(baseInput({ license_plate: "x".repeat(21) }))
        .success
    ).toBe(false);
  });
});

describe("appointmentSubmitSchema — client_id", () => {
  it("rejects a malformed UUID", () => {
    expect(
      appointmentSubmitSchema.safeParse(baseInput({ client_id: "not-a-uuid" })).success
    ).toBe(false);
  });

  it("accepts a valid UUID", () => {
    expect(
      appointmentSubmitSchema.safeParse(baseInput({ client_id: VALID_UUID })).success
    ).toBe(true);
  });
});

describe("appointmentSubmitSchema — required fields", () => {
  it("rejects when first_name is empty", () => {
    expect(appointmentSubmitSchema.safeParse(baseInput({ first_name: "" })).success).toBe(false);
  });

  it("rejects an invalid preferred_date format", () => {
    expect(
      appointmentSubmitSchema.safeParse(baseInput({ preferred_date: "06/15/2026" })).success
    ).toBe(false);
  });

  it("rejects an unknown service_category", () => {
    expect(
      appointmentSubmitSchema.safeParse(baseInput({ service_category: "inspection" })).success
    ).toBe(false);
  });

  it("rejects an unknown drop_off_or_wait value", () => {
    expect(
      appointmentSubmitSchema.safeParse(baseInput({ drop_off_or_wait: "carry-it-out" })).success
    ).toBe(false);
  });
});
