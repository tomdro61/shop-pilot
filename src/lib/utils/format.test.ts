import { describe, it, expect } from "vitest";
import { parseRONumber, formatDateTimeET } from "./format";

describe("parseRONumber", () => {
  it.each([
    ["RO-1860", 1860],
    ["ro-1860", 1860],
    ["RO 1860", 1860],
    ["RO#1860", 1860],
    ["ro1860", 1860],
    ["#1860", 1860],
    ["1860", 1860],
    ["RO-0042", 42],
    ["  RO-1860  ", 1860],
    ["999999999", 999999999],
    ["0123456789", 123456789],
  ])("parses %s", (input, expected) => {
    expect(parseRONumber(input)).toBe(expected);
  });

  it.each([
    ["honda"],
    ["ro"],
    ["RO-"],
    ["RO-0"],
    ["2019 civic"],
    ["RO-18a60"],
    ["18.60"],
    ["rotor 1860"],
    ["1234567890"],
    ["12345678901"],
    [""],
  ])("rejects %s", (input) => {
    expect(parseRONumber(input)).toBeNull();
  });
});

describe("formatDateTimeET", () => {
  it("renders a UTC instant in shop time with the hour and minute", () => {
    expect(formatDateTimeET("2026-10-09T18:50:33.447Z")).toBe("Oct 9, 2:50 PM");
  });

  it("follows the Eastern offset through the winter", () => {
    expect(formatDateTimeET("2026-01-15T18:50:00Z")).toBe("Jan 15, 1:50 PM");
  });
});
