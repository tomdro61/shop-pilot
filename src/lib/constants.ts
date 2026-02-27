import type { JobStatus, EstimateStatus, InvoiceStatus, PaymentStatus, PaymentMethod, CustomerType, ParkingStatus } from "@/types";

export const JOB_STATUS_ORDER: JobStatus[] = [
  "not_started",
  "waiting_for_parts",
  "in_progress",
  "complete",
];

export const JOB_STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  waiting_for_parts: "Waiting for Parts",
  in_progress: "In Progress",
  complete: "Complete",
  paid: "Paid", // backwards compat for pre-migration data
};

export const JOB_STATUS_COLORS: Record<
  string,
  { bg: string; text: string }
> = {
  not_started: {
    bg: "bg-red-100 dark:bg-red-900",
    text: "text-red-700 dark:text-red-300",
  },
  waiting_for_parts: {
    bg: "bg-amber-100 dark:bg-amber-900",
    text: "text-amber-700 dark:text-amber-300",
  },
  in_progress: {
    bg: "bg-blue-100 dark:bg-blue-900",
    text: "text-blue-700 dark:text-blue-300",
  },
  complete: {
    bg: "bg-green-100 dark:bg-green-900",
    text: "text-green-700 dark:text-green-300",
  },
  paid: { // backwards compat for pre-migration data
    bg: "bg-green-100 dark:bg-green-900",
    text: "text-green-700 dark:text-green-300",
  },
};

// Payment Status
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  invoiced: "Invoiced",
  paid: "Paid",
  waived: "Waived",
};

export const PAYMENT_STATUS_COLORS: Record<
  PaymentStatus,
  { bg: string; text: string }
> = {
  unpaid: {
    bg: "bg-red-100 dark:bg-red-900",
    text: "text-red-700 dark:text-red-300",
  },
  invoiced: {
    bg: "bg-blue-50 dark:bg-blue-950",
    text: "text-blue-700 dark:text-blue-400",
  },
  paid: {
    bg: "bg-green-50 dark:bg-green-950",
    text: "text-green-700 dark:text-green-400",
  },
  waived: {
    bg: "bg-stone-100 dark:bg-stone-800",
    text: "text-stone-500 dark:text-stone-400",
  },
};

// Payment Method
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  stripe: "Card",
  cash: "Cash",
  check: "Check",
  ach: "ACH",
  terminal: "Terminal",
};

// Customer Type
export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  retail: "Retail",
  fleet: "Fleet",
  parking: "Parking",
};

/** @deprecated Use shop_settings.job_categories from database instead. Kept as fallback in DEFAULT_SETTINGS. */
export const DEFAULT_JOB_CATEGORIES = [
  "Oil Change",
  "Brake Service",
  "Engine Repair",
  "Transmission",
  "Electrical",
  "Suspension",
  "Exhaust",
  "A/C & Heating",
  "Tire Service",
  "Inspection",
  "Diagnostic",
  "Body Work",
  "General Maintenance",
  "Other",
];

/** @deprecated Use shop_settings.tax_rate from database instead. Kept as fallback in DEFAULT_SETTINGS. */
export const MA_SALES_TAX_RATE = 0.0625; // 6.25%

// Estimate Status
export const ESTIMATE_STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  approved: "Approved",
  declined: "Declined",
};

export const ESTIMATE_STATUS_COLORS: Record<
  EstimateStatus,
  { bg: string; text: string }
> = {
  draft: {
    bg: "bg-stone-100 dark:bg-stone-800",
    text: "text-stone-500 dark:text-stone-400",
  },
  sent: {
    bg: "bg-blue-50 dark:bg-blue-950",
    text: "text-blue-700 dark:text-blue-400",
  },
  approved: {
    bg: "bg-green-50 dark:bg-green-950",
    text: "text-green-700 dark:text-green-400",
  },
  declined: {
    bg: "bg-red-50 dark:bg-red-950",
    text: "text-red-700 dark:text-red-400",
  },
};

// Invoice Status
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
};

export const INVOICE_STATUS_COLORS: Record<
  InvoiceStatus,
  { bg: string; text: string }
> = {
  draft: {
    bg: "bg-stone-100 dark:bg-stone-800",
    text: "text-stone-500 dark:text-stone-400",
  },
  sent: {
    bg: "bg-blue-50 dark:bg-blue-950",
    text: "text-blue-700 dark:text-blue-400",
  },
  paid: {
    bg: "bg-green-50 dark:bg-green-950",
    text: "text-green-700 dark:text-green-400",
  },
};

// ── Parking ─────────────────────────────────────────────────────

export const PARKING_STATUS_ORDER: ParkingStatus[] = [
  "reserved",
  "checked_in",
  "checked_out",
  "no_show",
  "cancelled",
];

export const PARKING_STATUS_LABELS: Record<ParkingStatus, string> = {
  reserved: "Reserved",
  checked_in: "Checked In",
  checked_out: "Checked Out",
  no_show: "No Show",
  cancelled: "Cancelled",
};

export const PARKING_STATUS_COLORS: Record<
  ParkingStatus,
  { bg: string; text: string }
> = {
  reserved: {
    bg: "bg-blue-100 dark:bg-blue-900",
    text: "text-blue-700 dark:text-blue-300",
  },
  checked_in: {
    bg: "bg-green-100 dark:bg-green-900",
    text: "text-green-700 dark:text-green-300",
  },
  checked_out: {
    bg: "bg-stone-100 dark:bg-stone-800",
    text: "text-stone-500 dark:text-stone-400",
  },
  no_show: {
    bg: "bg-red-100 dark:bg-red-900",
    text: "text-red-700 dark:text-red-300",
  },
  cancelled: {
    bg: "bg-amber-100 dark:bg-amber-900",
    text: "text-amber-700 dark:text-amber-300",
  },
};

export const PARKING_SERVICES = [
  { value: "oil_change", label: "Oil Change" },
  { value: "detailing", label: "Detailing" },
  { value: "brakes", label: "Brakes" },
  { value: "tire_replacement", label: "Tire Replacement" },
  { value: "wipers", label: "Wipers" },
] as const;

export const PARKING_SERVICE_LABELS: Record<string, string> = {
  oil_change: "Oil Change",
  detailing: "Detailing",
  brakes: "Brakes",
  tire_replacement: "Tire Replacement",
  wipers: "Wipers",
};

export const PARKING_LOTS = [
  "Broadway Motors",
  "Airport Parking Boston 1",
  "Airport Parking Boston 2",
];
