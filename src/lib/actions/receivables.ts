"use server";

import { createClient } from "@/lib/supabase/server";
import { todayET } from "@/lib/utils";
import { isInspectionCategory } from "@/lib/utils/revenue";
import { differenceInDays, parseISO } from "date-fns";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";

// ── Types ────────────────────────────────────────────────────

export interface ReceivablesData {
  totalOutstanding: number;
  aging0to30: number;
  aging31to60: number;
  aging60plus: number;
  jobs: ReceivableJob[];
  fleetAccounts: FleetAccountAging[];
}

export interface ReceivableJob {
  id: string;
  customerId: string;
  customerName: string;
  customerType: string;
  title: string | null;
  roNumber: number | null;
  amount: number;
  dateFinished: string;
  daysOutstanding: number;
  paymentStatus: string;
}

export interface FleetAccountAging {
  account: string;
  current: number;
  days31to60: number;
  days60plus: number;
  total: number;
}

const WALK_IN_ID = "00000000-0000-0000-0000-000000000000";

// Shape of `jobSelect` below — declared once because the select string is built
// dynamically (the customer-type filter adds an !inner join), which defeats
// Supabase's row-type inference.
type ReceivablesJobRow = {
  id: string;
  title: string | null;
  date_finished: string | null;
  payment_status: string;
  ro_number: number | null;
  customer_id: string | null;
  customers: {
    id: string;
    first_name: string;
    last_name: string;
    customer_type: string;
    fleet_account: string | null;
  } | null;
  job_line_items: { total: number | null; category: string | null }[] | null;
};

/** Lightweight summary for the overview dashboard — avoids building full job/fleet arrays. */
export async function getReceivablesSummary(): Promise<{ totalOutstanding: number; aging60plus: number }> {
  const supabase = await createClient();
  const today = todayET();
  const now = parseISO(today);

  // `error` used to be discarded here, so a failed query rendered $0 outstanding —
  // indistinguishable from "everyone has paid", on the screen used to chase
  // non-payers. fetchAllRows throws instead, and pages past the 1000-row cap
  // that the old `.limit(10000)` did nothing about (the cap clamps `.limit()`).
  const data = await fetchAllRows<{
    date_finished: string | null;
    job_line_items: { total: number | null; category: string | null }[] | null;
  }>(
    (from, to) =>
      supabase
        .from("jobs")
        .select("date_finished, job_line_items(total, category)", { count: "exact" })
        .eq("status", "complete")
        .neq("payment_status", "paid")
        .neq("payment_status", "waived")
        .order("id", { ascending: true })
        .range(from, to),
    "outstanding receivables"
  );

  let totalOutstanding = 0;
  let aging60plus = 0;

  type LI = { total: number | null; category: string | null };

  for (const job of data) {
    const amount = ((job.job_line_items as LI[]) || [])
      .filter((li) => !isInspectionCategory(li.category))
      .reduce((s, li) => s + (li.total || 0), 0);
    if (amount <= 0) continue;
    totalOutstanding += amount;
    const days = job.date_finished ? differenceInDays(now, parseISO(job.date_finished)) : 0;
    if (days > 60) aging60plus += amount;
  }

  return { totalOutstanding, aging60plus };
}

// ── Main ─────────────────────────────────────────────────────

export async function getReceivablesData(customerType?: string): Promise<ReceivablesData> {
  const supabase = await createClient();
  const today = todayET();
  const now = parseISO(today);
  const isFiltered = !!(customerType && customerType !== "all");

  const jobSelect: string = isFiltered
    ? "id, title, date_finished, payment_status, ro_number, customer_id, customers!inner(id, first_name, last_name, customer_type, fleet_account), job_line_items(total, category)"
    : "id, title, date_finished, payment_status, ro_number, customer_id, customers(id, first_name, last_name, customer_type, fleet_account), job_line_items(total, category)";
  // Same as the summary above: `error` was discarded, so a failed read showed an
  // empty A/R ledger rather than an error.
  const data = await fetchAllRows<ReceivablesJobRow>((from, to) => {
    let q = supabase
      .from("jobs")
      .select(jobSelect, { count: "exact" })
      .eq("status", "complete")
      .neq("payment_status", "paid")
      .neq("payment_status", "waived")
      .order("id", { ascending: true })
      .range(from, to);
    if (isFiltered) q = q.eq("customers.customer_type", customerType as "retail" | "fleet" | "parking");
    return q as unknown as PromiseLike<{
      data: ReceivablesJobRow[] | null;
      error: { message: string } | null;
    }>;
  }, "receivables");

  const jobs: ReceivableJob[] = [];
  let totalOutstanding = 0;
  let aging0to30 = 0;
  let aging31to60 = 0;
  let aging60plus = 0;

  const fleetMap: Record<string, FleetAccountAging> = {};

  type LineItem = { total: number; category: string | null };

  for (const job of (data || [])) {
    if (!job.customer_id || job.customer_id === WALK_IN_ID) continue;

    const customer = job.customers as {
      id: string;
      first_name: string;
      last_name: string;
      customer_type: string;
      fleet_account: string | null;
    } | null;
    if (!customer) continue;

    const lineItems = ((job.job_line_items as LineItem[]) || []).filter(
      (li) => !isInspectionCategory(li.category)
    );
    const amount = lineItems.reduce((s, li) => s + (li.total || 0), 0);
    if (amount <= 0) continue;

    const daysOutstanding = job.date_finished
      ? differenceInDays(now, parseISO(job.date_finished))
      : 0;

    jobs.push({
      id: job.id,
      customerId: customer.id,
      customerName: `${customer.first_name} ${customer.last_name}`,
      customerType: customer.customer_type,
      title: job.title,
      roNumber: job.ro_number,
      amount,
      dateFinished: job.date_finished || today,
      daysOutstanding,
      paymentStatus: job.payment_status,
    });

    totalOutstanding += amount;
    if (daysOutstanding <= 30) aging0to30 += amount;
    else if (daysOutstanding <= 60) aging31to60 += amount;
    else aging60plus += amount;

    // Fleet aging
    if (customer.customer_type === "fleet") {
      const accountName = customer.fleet_account || `${customer.first_name} ${customer.last_name}`;
      if (!fleetMap[accountName]) {
        fleetMap[accountName] = { account: accountName, current: 0, days31to60: 0, days60plus: 0, total: 0 };
      }
      const fa = fleetMap[accountName];
      if (daysOutstanding <= 30) fa.current += amount;
      else if (daysOutstanding <= 60) fa.days31to60 += amount;
      else fa.days60plus += amount;
      fa.total += amount;
    }
  }

  // Sort jobs by days outstanding descending (oldest first)
  jobs.sort((a, b) => b.daysOutstanding - a.daysOutstanding);

  const fleetAccounts = Object.values(fleetMap).sort((a, b) => b.total - a.total);

  return {
    totalOutstanding,
    aging0to30,
    aging31to60,
    aging60plus,
    jobs,
    fleetAccounts,
  };
}
