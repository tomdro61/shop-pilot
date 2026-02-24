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

// Format customer name
export function formatCustomerName(customer: {
  first_name: string;
  last_name: string;
}): string {
  return `${customer.first_name} ${customer.last_name}`;
}
