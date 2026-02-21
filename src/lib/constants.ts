import type { JobStatus, EstimateStatus, InvoiceStatus, PaymentStatus, PaymentMethod, CustomerType } from "@/types";

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
  { bg: string; text: string; border: string }
> = {
  not_started: {
    bg: "bg-red-100 dark:bg-red-500/10",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-500/20",
  },
  waiting_for_parts: {
    bg: "bg-amber-100 dark:bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-500/20",
  },
  in_progress: {
    bg: "bg-blue-100 dark:bg-blue-500/10",
    text: "text-blue-700 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-500/20",
  },
  complete: {
    bg: "bg-emerald-100 dark:bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-500/20",
  },
  paid: { // backwards compat for pre-migration data
    bg: "bg-emerald-100 dark:bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-500/20",
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
  { bg: string; text: string; border: string }
> = {
  unpaid: {
    bg: "bg-red-100 dark:bg-red-500/10",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-500/20",
  },
  invoiced: {
    bg: "bg-blue-100 dark:bg-blue-500/10",
    text: "text-blue-700 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-500/20",
  },
  paid: {
    bg: "bg-emerald-100 dark:bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-500/20",
  },
  waived: {
    bg: "bg-gray-100 dark:bg-gray-500/10",
    text: "text-gray-700 dark:text-gray-400",
    border: "border-gray-200 dark:border-gray-500/20",
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
};

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
  { bg: string; text: string; border: string }
> = {
  draft: {
    bg: "bg-gray-100 dark:bg-gray-500/10",
    text: "text-gray-700 dark:text-gray-400",
    border: "border-gray-200 dark:border-gray-500/20",
  },
  sent: {
    bg: "bg-blue-100 dark:bg-blue-500/10",
    text: "text-blue-700 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-500/20",
  },
  approved: {
    bg: "bg-emerald-100 dark:bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-500/20",
  },
  declined: {
    bg: "bg-red-100 dark:bg-red-500/10",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-500/20",
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
  { bg: string; text: string; border: string }
> = {
  draft: {
    bg: "bg-gray-100 dark:bg-gray-500/10",
    text: "text-gray-700 dark:text-gray-400",
    border: "border-gray-200 dark:border-gray-500/20",
  },
  sent: {
    bg: "bg-blue-100 dark:bg-blue-500/10",
    text: "text-blue-700 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-500/20",
  },
  paid: {
    bg: "bg-emerald-100 dark:bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-500/20",
  },
};
