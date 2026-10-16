"use server";

import { createClient } from "@/lib/supabase/server";
import { todayET } from "@/lib/utils";
import { differenceInDays, parseISO } from "date-fns";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { WALK_IN_CUSTOMER_ID } from "@/lib/constants";
import { getShopSettings } from "@/lib/actions/settings";
import {
  receivableAmount,
  RECEIVABLE_LINE_ITEMS_SELECT,
  type ReceivableLineItem,
  type ReceivableSettings,
} from "@/lib/receivables/amount";

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
  charge_sales_tax: boolean;
  customers: {
    id: string;
    first_name: string;
    last_name: string;
    customer_type: string;
    fleet_account: string | null;
  } | null;
  job_line_items: ReceivableLineItem[] | null;
};

type ReceivablesSummaryRow = {
  customer_id: string | null;
  date_finished: string | null;
  charge_sales_tax: boolean;
  customers: { id: string } | null;
  job_line_items: ReceivableLineItem[] | null;
};

async function loadReceivableSettings(): Promise<ReceivableSettings> {
  // No fallback to defaults: getShopSettings returns null when its read fails
  // or the row is missing, and a guessed tax rate would print a wrong amount owed.
  const settings = await getShopSettings();
  if (!settings) {
    throw new Error("Failed to load shop settings — refusing to compute receivables with a guessed tax rate.");
  }
  return settings;
}

// Walk-in and customer-less jobs are excluded from A/R: there is no one to
// collect from. Shared by the summary and the ledger so their totals agree.
function isCollectible(customerId: string | null): boolean {
  return !!customerId && customerId !== WALK_IN_CUSTOMER_ID;
}

/** Lightweight summary for the overview dashboard — avoids building full job/fleet arrays. */
export async function getReceivablesSummary(): Promise<{ totalOutstanding: number; aging60plus: number }> {
  const supabase = await createClient();
  const today = todayET();
  const now = parseISO(today);

  // `error` used to be discarded here, so a failed query rendered $0 outstanding —
  // indistinguishable from "everyone has paid", on the screen used to chase
  // non-payers. fetchAllRows throws instead, and pages past the 1000-row cap
  // that the old `.limit(10000)` did nothing about (the cap clamps `.limit()`).
  const summarySelect: string = `customer_id, date_finished, charge_sales_tax, customers(id), ${RECEIVABLE_LINE_ITEMS_SELECT}`;
  const [data, settings] = await Promise.all([
    fetchAllRows<ReceivablesSummaryRow>(
      (from, to) =>
        supabase
          .from("jobs")
          .select(summarySelect, { count: "exact" })
          .eq("status", "complete")
          .neq("payment_status", "paid")
          .neq("payment_status", "waived")
          .order("id", { ascending: true })
          .range(from, to)
          .returns<ReceivablesSummaryRow[]>(),
      "outstanding receivables"
    ),
    loadReceivableSettings(),
  ]);

  let totalOutstanding = 0;
  let aging60plus = 0;

  for (const job of data) {
    if (!isCollectible(job.customer_id) || !job.customers) continue;
    const amount = receivableAmount(job, settings);
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

  const customersSelect = isFiltered
    ? "customers!inner(id, first_name, last_name, customer_type, fleet_account)"
    : "customers(id, first_name, last_name, customer_type, fleet_account)";
  const jobSelect: string = `id, title, date_finished, payment_status, ro_number, customer_id, charge_sales_tax, ${customersSelect}, ${RECEIVABLE_LINE_ITEMS_SELECT}`;
  // Same as the summary above: `error` was discarded, so a failed read showed an
  // empty A/R ledger rather than an error.
  const [data, settings] = await Promise.all([
    fetchAllRows<ReceivablesJobRow>((from, to) => {
      let q = supabase
        .from("jobs")
        .select(jobSelect, { count: "exact" })
        .eq("status", "complete")
        .neq("payment_status", "paid")
        .neq("payment_status", "waived")
        .order("id", { ascending: true })
        .range(from, to);
      if (isFiltered) q = q.eq("customers.customer_type", customerType as "retail" | "fleet" | "parking");
      return q.returns<ReceivablesJobRow[]>();
    }, "receivables"),
    loadReceivableSettings(),
  ]);

  const jobs: ReceivableJob[] = [];
  let totalOutstanding = 0;
  let aging0to30 = 0;
  let aging31to60 = 0;
  let aging60plus = 0;

  const fleetMap: Record<string, FleetAccountAging> = {};

  for (const job of data) {
    if (!isCollectible(job.customer_id)) continue;

    const customer = job.customers;
    if (!customer) continue;

    const amount = receivableAmount(job, settings);
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
