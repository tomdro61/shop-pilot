import type { JobStatus, EstimateStatus, InvoiceStatus } from "@/types";

export const JOB_STATUS_ORDER: JobStatus[] = [
  "not_started",
  "waiting_for_parts",
  "in_progress",
  "complete",
  "paid",
];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  not_started: "Not Started",
  waiting_for_parts: "Waiting for Parts",
  in_progress: "In Progress",
  complete: "Complete",
  paid: "Paid",
};

export const JOB_STATUS_COLORS: Record<
  JobStatus,
  { bg: string; text: string; border: string }
> = {
  not_started: {
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-900",
  },
  waiting_for_parts: {
    bg: "bg-orange-100 dark:bg-orange-950",
    text: "text-orange-700 dark:text-orange-400",
    border: "border-orange-200 dark:border-orange-900",
  },
  in_progress: {
    bg: "bg-blue-100 dark:bg-blue-950",
    text: "text-blue-700 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-900",
  },
  complete: {
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-700 dark:text-green-400",
    border: "border-green-200 dark:border-green-900",
  },
  paid: {
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-700 dark:text-gray-400",
    border: "border-gray-200 dark:border-gray-700",
  },
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
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-700 dark:text-gray-400",
    border: "border-gray-200 dark:border-gray-700",
  },
  sent: {
    bg: "bg-blue-100 dark:bg-blue-950",
    text: "text-blue-700 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-900",
  },
  approved: {
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-700 dark:text-green-400",
    border: "border-green-200 dark:border-green-900",
  },
  declined: {
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-900",
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
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-700 dark:text-gray-400",
    border: "border-gray-200 dark:border-gray-700",
  },
  sent: {
    bg: "bg-blue-100 dark:bg-blue-950",
    text: "text-blue-700 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-900",
  },
  paid: {
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-700 dark:text-green-400",
    border: "border-green-200 dark:border-green-900",
  },
};
