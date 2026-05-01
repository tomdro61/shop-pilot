// Format phone number for display: +11234567890 -> (123) 456-7890
export function formatPhone(phone: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const area = digits.slice(1, 4);
    const prefix = digits.slice(4, 7);
    const line = digits.slice(7);
    return `(${area}) ${prefix}-${line}`;
  }
  if (digits.length === 10) {
    const area = digits.slice(0, 3);
    const prefix = digits.slice(3, 6);
    const line = digits.slice(6);
    return `(${area}) ${prefix}-${line}`;
  }
  return phone;
}

// Format currency
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

// Format currency without cents — for dashboard/report KPI cards
export function formatCurrencyWhole(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format vehicle display string
export function formatVehicle(vehicle: {
  year: number | null;
  make: string | null;
  model: string | null;
}): string {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
}

// Format RO number for display: 1 -> "RO-0001"
export function formatRONumber(n: number | null): string {
  if (n == null) return "\u2014";
  return `RO-${String(n).padStart(4, "0")}`;
}

// Format a date string (YYYY-MM-DD or ISO) for display without timezone shift.
// new Date("2026-02-27") parses as UTC midnight which shows as the previous
// day in US timezones. Appending T00:00:00 forces local-time interpretation.
export function formatDate(dateStr: string): string {
  const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString();
}

export function formatDateShort(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// Format customer name
export function formatCustomerName(customer: {
  first_name: string;
  last_name: string;
}): string {
  return `${customer.first_name} ${customer.last_name}`;
}

// "Apr 19, 2026" — month abbrev, day, year. Uses the same T00:00:00 fix
// as formatDate to avoid the UTC-midnight-shifts-to-yesterday bug.
export function formatDateLong(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function getInitials(value: string | null | undefined, fallback = "?"): string {
  if (!value) return fallback;
  const parts = value.trim().split(/\s+/);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
