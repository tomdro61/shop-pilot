import { z } from "zod";

export const customerSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(100),
  last_name: z.string().min(1, "Last name is required").max(100),
  phone: z.string().max(20),
  email: z.union([z.string().email("Invalid email address").max(255), z.literal("")]),
  address: z.string().max(500),
  notes: z.string().max(2000),
  customer_type: z.enum(["retail", "fleet"]),
  fleet_account: z.string().max(200).optional(),
});

export type CustomerFormData = z.infer<typeof customerSchema>;

// Transform phone to E.164 for storage
export function formatPhoneForStorage(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+")) return phone;
  return phone || null;
}

// Prepare form data for database insert/update
export function prepareCustomerData(data: CustomerFormData) {
  return {
    first_name: data.first_name,
    last_name: data.last_name,
    phone: formatPhoneForStorage(data.phone) || null,
    email: data.email || null,
    address: data.address || null,
    notes: data.notes || null,
    customer_type: data.customer_type || "retail",
    fleet_account: data.fleet_account || null,
  };
}
