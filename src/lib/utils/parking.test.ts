import { describe, it, expect } from "vitest";
import { hasPendingService } from "./parking";

describe("hasPendingService", () => {
  it("returns false when services_interested is null", () => {
    expect(
      hasPendingService({ services_interested: null, services_completed: null })
    ).toBe(false);
  });

  it("returns false when services_interested is an empty array", () => {
    expect(
      hasPendingService({ services_interested: [], services_completed: null })
    ).toBe(false);
  });

  it("returns true when services_completed is null but interested has items", () => {
    expect(
      hasPendingService({
        services_interested: ["oil_change"],
        services_completed: null,
      })
    ).toBe(true);
  });

  it("returns false when every interested service is in services_completed", () => {
    expect(
      hasPendingService({
        services_interested: ["oil_change", "tire_rotation"],
        services_completed: ["tire_rotation", "oil_change"],
      })
    ).toBe(false);
  });

  it("returns true when only some interested services are completed", () => {
    expect(
      hasPendingService({
        services_interested: ["oil_change", "brake_inspection"],
        services_completed: ["oil_change"],
      })
    ).toBe(true);
  });

  it("returns false when services_completed is a superset of services_interested", () => {
    expect(
      hasPendingService({
        services_interested: ["oil_change"],
        services_completed: ["oil_change", "tire_rotation", "alignment"],
      })
    ).toBe(false);
  });

  it("treats services as case-sensitive — mismatched casing means still pending", () => {
    expect(
      hasPendingService({
        services_interested: ["oil_change"],
        services_completed: ["Oil_Change"],
      })
    ).toBe(true);
  });
});
