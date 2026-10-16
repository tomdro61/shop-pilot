import { describe, it, expect } from "vitest";
import { escapeCSV, toCSVRow } from "./csv";

describe("escapeCSV", () => {
  it("leaves plain values alone", () => {
    expect(escapeCSV("Brake Service")).toBe("Brake Service");
    expect(escapeCSV("120.00")).toBe("120.00");
  });

  it("quotes values containing commas, quotes, or newlines", () => {
    expect(escapeCSV("Smith, John")).toBe('"Smith, John"');
    expect(escapeCSV('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCSV("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralizes formula-trigger prefixes", () => {
    expect(escapeCSV("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(escapeCSV("+cmd")).toBe("'+cmd");
    expect(escapeCSV("-2+3")).toBe("'-2+3");
    expect(escapeCSV("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCSV("\tTAB")).toBe("'\tTAB");
  });

  it("keeps negative numbers numeric", () => {
    expect(escapeCSV("-12.50")).toBe("-12.50");
    expect(escapeCSV("-3")).toBe("-3");
  });
});

describe("toCSVRow", () => {
  it("renders null, undefined, and empty as blank cells", () => {
    expect(toCSVRow(["a", null, undefined, "", 5])).toBe("a,,,,5");
  });

  it("escapes every cell", () => {
    expect(toCSVRow(["=1+1", "x,y"])).toBe("'=1+1,\"x,y\"");
  });
});
