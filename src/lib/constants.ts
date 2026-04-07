import type { JobStatus, EstimateStatus, InvoiceStatus, PaymentStatus, PaymentMethod, CustomerType, ParkingStatus, QuoteRequestStatus, DviStatus, DviCondition } from "@/types";

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
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-700 dark:text-red-400",
  },
  waiting_for_parts: {
    bg: "bg-amber-100 dark:bg-amber-950",
    text: "text-amber-700 dark:text-amber-400",
  },
  in_progress: {
    bg: "bg-blue-100 dark:bg-blue-950",
    text: "text-blue-700 dark:text-blue-400",
  },
  complete: {
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-700 dark:text-green-400",
  },
  paid: { // backwards compat for pre-migration data
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-700 dark:text-green-400",
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
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-700 dark:text-red-400",
  },
  invoiced: {
    bg: "bg-blue-100 dark:bg-blue-950",
    text: "text-blue-700 dark:text-blue-400",
  },
  paid: {
    bg: "bg-green-100 dark:bg-green-950",
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
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-700 dark:text-green-400",
  },
  approved: {
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-700 dark:text-green-400",
  },
  declined: {
    bg: "bg-red-100 dark:bg-red-950",
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
    bg: "bg-blue-100 dark:bg-blue-950",
    text: "text-blue-700 dark:text-blue-400",
  },
  paid: {
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-700 dark:text-green-400",
  },
};

// ── Inspections ─────────────────────────────────────────────────
export const INSPECTION_RATE_STATE = 35;
export const INSPECTION_RATE_TNC = 15;
export const INSPECTION_COST_STATE = 11.5;

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
    bg: "bg-blue-100 dark:bg-blue-950",
    text: "text-blue-700 dark:text-blue-400",
  },
  checked_in: {
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-700 dark:text-green-400",
  },
  checked_out: {
    bg: "bg-stone-100 dark:bg-stone-800",
    text: "text-stone-500 dark:text-stone-400",
  },
  no_show: {
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-700 dark:text-red-400",
  },
  cancelled: {
    bg: "bg-amber-100 dark:bg-amber-950",
    text: "text-amber-700 dark:text-amber-400",
  },
};

export const PARKING_SERVICES = [
  { value: "dvi_inspection", label: "DVI ($20)" },
  { value: "oil_change", label: "Oil Change" },
  { value: "detailing", label: "Detailing" },
  { value: "brakes", label: "Brakes" },
  { value: "tire_replacement", label: "Tire Replacement" },
  { value: "wipers", label: "Wipers" },
] as const;

export const PARKING_SERVICE_LABELS: Record<string, string> = {
  dvi_inspection: "DVI ($20)",
  oil_change: "Oil Change",
  detailing: "Detailing",
  brakes: "Brakes",
  tire_replacement: "Tire Replacement",
  wipers: "Wipers",
};

export const PARKING_SPECIALS = [
  { label: "Digital Vehicle Inspection (50-point photo report)", price: "$20" },
  { label: "Free Diagnostics", price: "Free" },
  { label: "Vehicle Repairs, Brakes, etc.", price: "20% off" },
  { label: "Full Synthetic Oil Change", price: "10% off", note: "for any Vehicle" },
  { label: "Tire Rotation", price: "$40" },
  { label: "Interior Detail all cars", price: "$225", note: "Limited Time Offer!!" },
  { label: "New Windshield Wipers", price: "$35", note: "pair" },
  { label: "Check/Top Off All Fluids + Tire Pressure", price: "$10" },
  { label: "Exterior Wash", price: "$45" },
] as const;

export const PARKING_LOTS = [
  "Broadway Motors",
  "Airport Parking Boston 1",
  "Airport Parking Boston 2",
  "Boston Logan Valet",
];

// ── Quote Requests ──────────────────────────────────────────────

export const QUOTE_REQUEST_STATUS_ORDER: QuoteRequestStatus[] = [
  "new",
  "contacted",
  "converted",
  "closed",
];

export const QUOTE_REQUEST_STATUS_LABELS: Record<QuoteRequestStatus, string> = {
  new: "New",
  contacted: "Contacted",
  converted: "Converted",
  closed: "Closed",
};

export const QUOTE_REQUEST_STATUS_COLORS: Record<
  QuoteRequestStatus,
  { bg: string; text: string }
> = {
  new: {
    bg: "bg-blue-100 dark:bg-blue-950",
    text: "text-blue-700 dark:text-blue-400",
  },
  contacted: {
    bg: "bg-amber-100 dark:bg-amber-950",
    text: "text-amber-700 dark:text-amber-400",
  },
  converted: {
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-700 dark:text-green-400",
  },
  closed: {
    bg: "bg-stone-100 dark:bg-stone-800",
    text: "text-stone-500 dark:text-stone-400",
  },
};

// ── DVI Inspection ─────────────────────────────────────────

export const DVI_STATUS_ORDER: DviStatus[] = [
  "in_progress",
  "completed",
  "sent",
];

export const DVI_STATUS_LABELS: Record<DviStatus, string> = {
  in_progress: "In Progress",
  completed: "Ready to Send",
  sent: "Sent",
};

export const DVI_STATUS_COLORS: Record<DviStatus, { bg: string; text: string }> = {
  in_progress: {
    bg: "bg-blue-100 dark:bg-blue-950",
    text: "text-blue-700 dark:text-blue-400",
  },
  completed: {
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-700 dark:text-green-400",
  },
  sent: {
    bg: "bg-purple-100 dark:bg-purple-950",
    text: "text-purple-700 dark:text-purple-400",
  },
};

export const DVI_CONDITION_LABELS: Record<DviCondition, string> = {
  good: "Good",
  monitor: "Monitor",
  attention: "Needs Attention",
};

export const DVI_CONDITION_COLORS: Record<
  DviCondition,
  { bg: string; text: string; border: string }
> = {
  good: {
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-700 dark:text-green-400",
    border: "border-green-500",
  },
  monitor: {
    bg: "bg-amber-100 dark:bg-amber-950",
    text: "text-amber-700 dark:text-amber-400",
    border: "border-amber-500",
  },
  attention: {
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-500",
  },
};

export const DVI_MAX_PHOTOS_PER_ITEM = 3;
