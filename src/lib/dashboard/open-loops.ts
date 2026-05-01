import type { LucideIcon } from "lucide-react";
import { Bell, DollarSign, FileText } from "lucide-react";
import { daysBetween } from "@/lib/utils";

export type OpenLoopCategory =
  | "payment_due"
  | "estimate"
  | "follow_up";

export interface OpenLoop {
  id: string;
  category: OpenLoopCategory;
  customerName: string | null;
  customerId: string | null;
  vehicleLabel: string | null;
  summary: string;
  ageDays: number;
  href: string;
}

interface AgingTier {
  /** Day count at which the badge turns amber. */
  warnAt: number;
  /** Day count at which the badge turns red (overdue). */
  overdueAt: number;
}

interface CategoryConfig extends AgingTier {
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  /** Tailwind dot color for filter chips. */
  dotClass: string;
  /** Tailwind classes for the active filter chip + the row icon tile. */
  activeChipClass: string;
}

export const OPEN_LOOP_CATEGORIES: Record<OpenLoopCategory, CategoryConfig> = {
  payment_due: {
    label: "Payment Due",
    shortLabel: "Payment",
    icon: DollarSign,
    warnAt: 3,
    overdueAt: 7,
    dotClass: "bg-emerald-500",
    activeChipClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  },
  estimate: {
    label: "Estimates",
    shortLabel: "Estimate",
    icon: FileText,
    warnAt: 3,
    overdueAt: 7,
    dotClass: "bg-blue-500",
    activeChipClass:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
  },
  follow_up: {
    label: "Follow-ups",
    shortLabel: "Follow-up",
    icon: Bell,
    warnAt: 2,
    overdueAt: 5,
    dotClass: "bg-indigo-500",
    activeChipClass:
      "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900",
  },
};

export const OPEN_LOOP_CATEGORY_ORDER = [
  "payment_due",
  "estimate",
  "follow_up",
] as const satisfies readonly OpenLoopCategory[];

type CustomerSummary = { id: string; first_name: string; last_name: string };
type VehicleSummary = { year: number | null; make: string | null; model: string | null };

interface BuildOpenLoopsInput {
  today: string;
  unpaidJobs: Array<{
    id: string;
    title: string | null;
    date_finished: string | null;
    customers: CustomerSummary | null;
    vehicles: VehicleSummary | null;
    total: number;
  }>;
  pendingEstimates: Array<{
    id: string;
    sent_at: string | null;
    jobs: {
      id: string;
      title: string | null;
      customers: CustomerSummary | null;
      vehicles: VehicleSummary | null;
    } | null;
    total: number;
  }>;
  newQuoteRequests: Array<{
    id: string;
    first_name: string;
    last_name: string;
    vehicle_year: number | null;
    vehicle_make: string | null;
    vehicle_model: string | null;
    services: string[];
    created_at: string;
  }>;
  parkingLeads: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    customer_id: string | null;
    make: string | null;
    model: string | null;
    services_interested: string[] | null;
    drop_off_date: string | null;
  }>;
}

function shortVehicle(v: VehicleSummary | null): string | null {
  if (!v) return null;
  const yr = v.year ? `'${String(v.year).slice(-2)}` : "";
  return [yr, v.model ?? v.make].filter(Boolean).join(" ").trim() || null;
}

function customerLabel(c: CustomerSummary | null): string | null {
  if (!c) return null;
  return `${c.first_name} ${c.last_name}`.trim() || null;
}

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Compute age in days against `today`. Returns null when the source date is
 * missing — callers MUST log + skip rather than treating null as 0, otherwise
 * loops with broken data silently rank as "fresh" and the manager never
 * sees them.
 */
function ageOrNull(date: string | null, today: string): number | null {
  if (!date) return null;
  const d = date.includes("T") ? date.split("T")[0] : date;
  return daysBetween(d, today);
}

/**
 * SHIM: combines existing dashboard query results into the OpenLoop shape
 * before a dedicated open_loops table exists. When that table lands, this
 * helper goes away and the dashboard reads loops directly.
 */
export function buildOpenLoops(input: BuildOpenLoopsInput): OpenLoop[] {
  const { today } = input;
  const loops: OpenLoop[] = [];

  for (const job of input.unpaidJobs) {
    const ageDays = ageOrNull(job.date_finished, today);
    if (ageDays === null) {
      console.error(`[open-loops] payment_due ${job.id} missing date_finished — skipping`);
      continue;
    }
    loops.push({
      id: `payment-${job.id}`,
      category: "payment_due",
      customerName: customerLabel(job.customers),
      customerId: job.customers?.id ?? null,
      vehicleLabel: shortVehicle(job.vehicles),
      summary: `${formatMoney(job.total)} owed${job.title ? ` — ${job.title}` : ""}`,
      ageDays,
      href: `/jobs/${job.id}`,
    });
  }

  for (const est of input.pendingEstimates) {
    const ageDays = ageOrNull(est.sent_at, today);
    if (ageDays === null) {
      console.error(`[open-loops] estimate ${est.id} missing sent_at — skipping`);
      continue;
    }
    const job = est.jobs;
    loops.push({
      id: `estimate-${est.id}`,
      category: "estimate",
      customerName: customerLabel(job?.customers ?? null),
      customerId: job?.customers?.id ?? null,
      vehicleLabel: shortVehicle(job?.vehicles ?? null),
      summary: `${formatMoney(est.total)} estimate — no reply${ageDays > 0 ? ` ${ageDays} day${ageDays === 1 ? "" : "s"}` : ""}`,
      ageDays,
      href: job?.id ? `/jobs/${job.id}` : `/jobs`,
    });
  }

  for (const qr of input.newQuoteRequests) {
    const ageDays = ageOrNull(qr.created_at, today);
    if (ageDays === null) {
      console.error(`[open-loops] quote_request ${qr.id} missing created_at — skipping`);
      continue;
    }
    const vehicle =
      qr.vehicle_year || qr.vehicle_make || qr.vehicle_model
        ? shortVehicle({
            year: qr.vehicle_year,
            make: qr.vehicle_make,
            model: qr.vehicle_model,
          })
        : null;
    const customerName = `${qr.first_name} ${qr.last_name}`.trim() || null;
    const servicesText = qr.services.length > 0 ? qr.services.join(", ") : "needs review";
    loops.push({
      id: `quote-${qr.id}`,
      category: "estimate",
      customerName,
      customerId: null,
      vehicleLabel: vehicle,
      summary: `Quote request — ${servicesText}`,
      ageDays,
      href: `/quote-requests/${qr.id}`,
    });
  }

  for (const lead of input.parkingLeads) {
    const ageDays = ageOrNull(lead.drop_off_date, today);
    if (ageDays === null) {
      console.error(`[open-loops] parking lead ${lead.id} missing drop_off_date — skipping`);
      continue;
    }
    const services =
      (lead.services_interested ?? []).length > 0
        ? (lead.services_interested ?? []).join(", ")
        : "service interest";
    const vehicle = shortVehicle({ year: null, make: lead.make, model: lead.model });
    loops.push({
      id: `parking-${lead.id}`,
      category: "follow_up",
      customerName:
        [lead.first_name, lead.last_name].filter(Boolean).join(" ") || null,
      customerId: lead.customer_id,
      vehicleLabel: vehicle,
      summary: `Parking lead — interested in ${services}`,
      ageDays,
      href: `/parking/${lead.id}`,
    });
  }

  // Sort by aging severity: overdue first, then aging, then fresh; within each
  // tier, oldest first.
  return loops.sort((a, b) => {
    const tier = (l: OpenLoop) => {
      const cfg = OPEN_LOOP_CATEGORIES[l.category];
      return l.ageDays >= cfg.overdueAt ? 0 : l.ageDays >= cfg.warnAt ? 1 : 2;
    };
    const ta = tier(a);
    const tb = tier(b);
    if (ta !== tb) return ta - tb;
    return b.ageDays - a.ageDays;
  });
}

export function countByCategory(loops: OpenLoop[]): Record<OpenLoopCategory, number> {
  const counts: Record<OpenLoopCategory, number> = {
    payment_due: 0,
    estimate: 0,
    follow_up: 0,
  };
  for (const loop of loops) counts[loop.category]++;
  return counts;
}

export function countOverdue(loops: OpenLoop[]): number {
  return loops.filter((l) => l.ageDays >= OPEN_LOOP_CATEGORIES[l.category].overdueAt).length;
}
