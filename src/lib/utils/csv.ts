const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
const E164_PHONE = /^\+\d{7,15}$/;

/**
 * Quote a CSV cell and neutralize spreadsheet formula injection: a cell that
 * starts with `=`, `+`, `-`, `@` (or tab/CR) is prefixed with `'` so Excel and
 * Sheets treat it as text. Plain numbers like `-12.50` are left alone so
 * negative amounts stay numeric.
 */
export function escapeCSV(value: string): string {
  const safe =
    FORMULA_TRIGGER.test(value) && !PLAIN_NUMBER.test(value) && !E164_PHONE.test(value)
      ? `'${value}`
      : value;
  if (safe.includes(",") || safe.includes('"') || safe.includes("\n") || safe.includes("\r")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function toCSVRow(fields: (string | number | null | undefined)[]): string {
  return fields.map((f) => (f == null || f === "" ? "" : escapeCSV(String(f)))).join(",");
}
