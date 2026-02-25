import type { Database } from "./supabase";

// Convenience type aliases
export type Customer = Database["public"]["Tables"]["customers"]["Row"];
export type CustomerInsert = Database["public"]["Tables"]["customers"]["Insert"];
export type CustomerUpdate = Database["public"]["Tables"]["customers"]["Update"];

export type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
export type VehicleInsert = Database["public"]["Tables"]["vehicles"]["Insert"];
export type VehicleUpdate = Database["public"]["Tables"]["vehicles"]["Update"];

export type Job = Database["public"]["Tables"]["jobs"]["Row"];
export type JobInsert = Database["public"]["Tables"]["jobs"]["Insert"];
export type JobUpdate = Database["public"]["Tables"]["jobs"]["Update"];

export type JobLineItem = Database["public"]["Tables"]["job_line_items"]["Row"];
export type JobLineItemInsert = Database["public"]["Tables"]["job_line_items"]["Insert"];
export type JobLineItemUpdate = Database["public"]["Tables"]["job_line_items"]["Update"];

export type JobPreset = Database["public"]["Tables"]["job_presets"]["Row"];
export type JobPresetInsert = Database["public"]["Tables"]["job_presets"]["Insert"];
export type JobPresetUpdate = Database["public"]["Tables"]["job_presets"]["Update"];

export type PresetLineItem = {
  type: "labor" | "part";
  description: string;
  quantity: number;
  unit_cost: number;
  cost?: number | null;
  part_number?: string;
  category?: string;
};

export type Estimate = Database["public"]["Tables"]["estimates"]["Row"];
export type EstimateInsert = Database["public"]["Tables"]["estimates"]["Insert"];
export type EstimateUpdate = Database["public"]["Tables"]["estimates"]["Update"];

export type EstimateLineItem = Database["public"]["Tables"]["estimate_line_items"]["Row"];
export type EstimateLineItemInsert = Database["public"]["Tables"]["estimate_line_items"]["Insert"];
export type EstimateLineItemUpdate = Database["public"]["Tables"]["estimate_line_items"]["Update"];

export type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
export type InvoiceInsert = Database["public"]["Tables"]["invoices"]["Insert"];
export type InvoiceUpdate = Database["public"]["Tables"]["invoices"]["Update"];

export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type MessageInsert = Database["public"]["Tables"]["messages"]["Insert"];
export type MessageUpdate = Database["public"]["Tables"]["messages"]["Update"];

export type User = Database["public"]["Tables"]["users"]["Row"];
export type UserInsert = Database["public"]["Tables"]["users"]["Insert"];
export type UserUpdate = Database["public"]["Tables"]["users"]["Update"];

export type ShopSettings = Database["public"]["Tables"]["shop_settings"]["Row"];
export type ShopSettingsUpdate = Database["public"]["Tables"]["shop_settings"]["Update"];
export type ShopSuppliesMethod = "percent_of_labor" | "percent_of_parts" | "percent_of_total" | "flat";

// Enum types
export type JobStatus = Database["public"]["Enums"]["job_status"];
export type LineItemType = Database["public"]["Enums"]["line_item_type"];
export type EstimateStatus = Database["public"]["Enums"]["estimate_status"];
export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];
export type MessageChannel = Database["public"]["Enums"]["message_channel"];
export type MessageDirection = Database["public"]["Enums"]["message_direction"];
export type UserRole = Database["public"]["Enums"]["user_role"];
export type CustomerType = Database["public"]["Enums"]["customer_type"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status"];

// Job with relations (commonly used in lists/details)
export type JobWithRelations = Job & {
  customers: Pick<Customer, "id" | "first_name" | "last_name" | "phone"> | null;
  vehicles: Pick<Vehicle, "id" | "year" | "make" | "model"> | null;
  job_line_items?: JobLineItem[];
};
